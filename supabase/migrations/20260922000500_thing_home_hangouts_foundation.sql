begin;

alter table public.things add column color_key text not null default 'cherry'
  check (color_key in ('cherry', 'butter', 'electric_blue', 'acid', 'tangerine', 'purple', 'paper', 'ink'));

create table public.hot_consents (
  thing_id uuid not null references public.things(id) on delete cascade,
  user_id uuid not null,
  accepted_level text not null check (accepted_level in ('flirty', 'bold', 'spicy')),
  updated_at timestamptz not null default now(),
  primary key (thing_id, user_id),
  foreign key (thing_id, user_id) references public.thing_members(thing_id, user_id) on delete cascade
);

create table public.hangouts (
  id uuid primary key default gen_random_uuid(),
  thing_id uuid not null references public.things(id) on delete restrict,
  game_type text not null check (game_type in ('same_brain', 'know_me', 'this_or_that', 'hot')),
  state text not null default 'setup' check (state in ('setup', 'waiting', 'ready', 'active', 'complete', 'abandoned')),
  hot_level text check (hot_level is null or hot_level in ('flirty', 'bold', 'spicy')),
  hot_mode text check (hot_mode is null or hot_mode in ('standard', 'our_deck')),
  result jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  check ((game_type = 'hot' and hot_level is not null and hot_mode is not null)
    or (game_type <> 'hot' and hot_level is null and hot_mode is null))
);
create index hangouts_thing_created on public.hangouts(thing_id, created_at desc);

create table public.hangout_members (
  hangout_id uuid not null references public.hangouts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  batch_ready boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (hangout_id, user_id)
);

create table public.hot_deck_cards (
  id uuid primary key default gen_random_uuid(),
  hangout_id uuid not null references public.hangouts(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 240),
  card_state text not null default 'deck' check (card_state in ('deck', 'drawn', 'discard')),
  created_at timestamptz not null default now(),
  drawn_at timestamptz,
  foreign key (hangout_id, created_by) references public.hangout_members(hangout_id, user_id) on delete cascade
);
create index hot_deck_cards_hangout_state on public.hot_deck_cards(hangout_id, card_state);

alter table public.hot_consents enable row level security;
alter table public.hangouts enable row level security;
alter table public.hangout_members enable row level security;
alter table public.hot_deck_cards enable row level security;

revoke all on public.hot_consents, public.hangouts, public.hangout_members, public.hot_deck_cards from public, anon, authenticated;
grant select on public.hot_consents, public.hangouts, public.hangout_members, public.hot_deck_cards to authenticated;

create policy hot_consents_select_own on public.hot_consents for select to authenticated
  using (user_id = (select auth.uid()) and public.is_active_thing_member(thing_id)
    and coalesce((select auth.jwt())->>'is_anonymous', 'false') = 'false');
create policy hangouts_select_members on public.hangouts for select to authenticated
  using (public.is_active_thing_member(thing_id)
    and coalesce((select auth.jwt())->>'is_anonymous', 'false') = 'false');
create policy hangout_members_select_participants on public.hangout_members for select to authenticated
  using (exists (
    select 1 from public.hangouts h
    where h.id = hangout_members.hangout_id and public.is_active_thing_member(h.thing_id)
  ) and coalesce((select auth.jwt())->>'is_anonymous', 'false') = 'false');
create policy hot_deck_cards_select_own on public.hot_deck_cards for select to authenticated
  using (created_by = (select auth.uid())
    and coalesce((select auth.jwt())->>'is_anonymous', 'false') = 'false');

create function public.update_thing_color(p_thing_id uuid, p_color_key text) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); target public.things;
begin
  if p_color_key is null or p_color_key not in ('cherry', 'butter', 'electric_blue', 'acid', 'tangerine', 'purple', 'paper', 'ink') then
    raise exception 'invalid_color';
  end if;
  select * into target from public.things where id = p_thing_id for update;
  if not found or target.status <> 'active' or not public.is_active_thing_member(p_thing_id) then raise exception 'thing_unavailable'; end if;
  update public.things set color_key = p_color_key where id = p_thing_id;
end;
$$;

create function public.end_thing(p_thing_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); target public.things;
begin
  select * into target from public.things where id = p_thing_id for update;
  if not found or not public.is_active_thing_member(p_thing_id) then raise exception 'thing_unavailable'; end if;
  if target.status = 'disconnected' then return; end if;
  if target.status <> 'active' then raise exception 'thing_unavailable'; end if;
  update public.things set status = 'disconnected' where id = p_thing_id;
  update public.hangouts set state = 'abandoned', completed_at = coalesce(completed_at, now())
    where thing_id = p_thing_id and state in ('setup', 'waiting', 'ready', 'active');
end;
$$;

create function public.set_hot_consent(p_thing_id uuid, p_level text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); target public.things; setup jsonb;
begin
  if p_level is null or p_level not in ('flirty', 'bold', 'spicy') then raise exception 'invalid_hot_level'; end if;
  select * into target from public.things where id = p_thing_id for update;
  if not found or target.status <> 'active' or not public.is_active_thing_member(p_thing_id) then raise exception 'thing_unavailable'; end if;
  insert into public.hot_consents(thing_id, user_id, accepted_level)
    values(p_thing_id, actor, p_level)
    on conflict(thing_id, user_id) do update set accepted_level = excluded.accepted_level, updated_at = now();
  setup := public.hot_setup_snapshot(p_thing_id);
  if coalesce((setup->>'our_deck_available')::boolean, false) = false then
    update public.hangouts set state = 'abandoned', completed_at = coalesce(completed_at, now())
      where thing_id = p_thing_id and game_type = 'hot' and hot_mode = 'our_deck'
        and state in ('setup', 'waiting', 'ready', 'active');
  end if;
  return setup;
end;
$$;

create function public.hot_setup_snapshot(p_thing_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); target public.things; own_level text; shared_level text; consent_count integer;
begin
  select * into target from public.things where id = p_thing_id;
  if not found or not public.is_active_thing_member(p_thing_id) then raise exception 'thing_unavailable'; end if;
  select count(*),
    case min(case accepted_level when 'flirty' then 1 when 'bold' then 2 when 'spicy' then 3 end)
      when 1 then 'flirty' when 2 then 'bold' when 3 then 'spicy' end,
    max(accepted_level) filter (where user_id = actor)
    into consent_count, shared_level, own_level
    from public.hot_consents where thing_id = p_thing_id;
  if consent_count <> 2 then shared_level := null; end if;
  return jsonb_build_object(
    'own_level', own_level,
    'shared_level', shared_level,
    'both_ready', consent_count = 2,
    'our_deck_available', consent_count = 2 and shared_level = 'spicy'
  );
end;
$$;

create function public.create_hangout(p_thing_id uuid, p_game_type text, p_hot_mode text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); target public.things; target_id uuid; setup jsonb; chosen_mode text;
begin
  if p_game_type is null or p_game_type not in ('same_brain', 'know_me', 'this_or_that', 'hot') then raise exception 'invalid_game_type'; end if;
  select * into target from public.things where id = p_thing_id for update;
  if not found or target.status <> 'active' or not public.is_active_thing_member(p_thing_id) then raise exception 'thing_unavailable'; end if;
  if (select count(*) from public.thing_members where thing_id = p_thing_id and status = 'active') <> 2 then raise exception 'thing_unavailable'; end if;
  if p_game_type = 'hot' then
    setup := public.hot_setup_snapshot(p_thing_id);
    if coalesce((setup->>'both_ready')::boolean, false) = false then raise exception 'hot_consent_required'; end if;
    chosen_mode := coalesce(p_hot_mode, 'standard');
    if chosen_mode not in ('standard', 'our_deck') then raise exception 'invalid_hot_mode'; end if;
    if chosen_mode = 'our_deck' and coalesce((setup->>'our_deck_available')::boolean, false) = false then raise exception 'our_deck_unavailable'; end if;
    insert into public.hangouts(thing_id, game_type, hot_level, hot_mode)
      values(p_thing_id, p_game_type, setup->>'shared_level', chosen_mode) returning id into target_id;
  else
    if p_hot_mode is not null then raise exception 'invalid_hot_mode'; end if;
    insert into public.hangouts(thing_id, game_type) values(p_thing_id, p_game_type) returning id into target_id;
  end if;
  insert into public.hangout_members(hangout_id, user_id)
    select target_id, user_id from public.thing_members where thing_id = p_thing_id and status = 'active' order by seat;
  return target_id;
end;
$$;

create function public.add_hot_deck_card(p_hangout_id uuid, p_content text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); target public.hangouts; card_id uuid;
begin
  select * into target from public.hangouts where id = p_hangout_id for update;
  if not found or target.game_type <> 'hot' or target.hot_mode <> 'our_deck' or target.hot_level <> 'spicy' or target.state <> 'setup'
    or not exists(select 1 from public.hangout_members where hangout_id = p_hangout_id and user_id = actor and batch_ready = false)
    then raise exception 'hangout_unavailable'; end if;
  if p_content is null or char_length(btrim(p_content)) not between 1 and 240 then raise exception 'invalid_card'; end if;
  if (select count(*) from public.hot_deck_cards where hangout_id = p_hangout_id and created_by = actor) >= 3 then raise exception 'batch_full'; end if;
  insert into public.hot_deck_cards(hangout_id, created_by, content) values(p_hangout_id, actor, btrim(p_content)) returning id into card_id;
  return card_id;
end;
$$;

create function public.ready_hot_batch(p_hangout_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); target public.hangouts;
begin
  select * into target from public.hangouts where id = p_hangout_id for update;
  if not found or target.game_type <> 'hot' or target.hot_mode <> 'our_deck' or target.hot_level <> 'spicy' or target.state not in ('setup', 'ready')
    or not exists(select 1 from public.hangout_members where hangout_id = p_hangout_id and user_id = actor)
    then raise exception 'hangout_unavailable'; end if;
  if (select count(*) from public.hot_deck_cards where hangout_id = p_hangout_id and created_by = actor) <> 3 then raise exception 'batch_incomplete'; end if;
  update public.hangout_members set batch_ready = true where hangout_id = p_hangout_id and user_id = actor;
  if (select count(*) from public.hangout_members where hangout_id = p_hangout_id and batch_ready) = 2 then
    update public.hangouts set state = 'ready' where id = p_hangout_id and state = 'setup';
  end if;
end;
$$;

create function public.hangout_snapshot(p_hangout_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); target public.hangouts; result jsonb;
begin
  select * into target from public.hangouts where id = p_hangout_id;
  if not found or not exists(select 1 from public.hangout_members where hangout_id = p_hangout_id and user_id = actor) then raise exception 'hangout_unavailable'; end if;
  select jsonb_build_object(
    'id', target.id, 'thing_id', target.thing_id, 'game_type', target.game_type, 'state', target.state,
    'hot_level', target.hot_level, 'hot_mode', target.hot_mode, 'created_at', target.created_at,
    'started_at', target.started_at, 'completed_at', target.completed_at,
    'members', (select jsonb_agg(jsonb_build_object('display_name', p.display_name) order by tm.seat)
      from public.hangout_members hm
      join public.thing_members tm on tm.thing_id = target.thing_id and tm.user_id = hm.user_id
      join public.profiles p on p.id = hm.user_id where hm.hangout_id = target.id),
    'own_card_count', (select count(*) from public.hot_deck_cards where hangout_id = target.id and created_by = actor),
    'partner_card_count', (select count(*) from public.hot_deck_cards where hangout_id = target.id and created_by <> actor),
    'own_batch_ready', coalesce((select batch_ready from public.hangout_members where hangout_id = target.id and user_id = actor), false),
    'both_batches_ready', (select count(*) = 2 from public.hangout_members where hangout_id = target.id and batch_ready)
  ) into result;
  return result;
end;
$$;

create or replace function public.thing_snapshot(p_thing_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); target public.things; result jsonb;
begin
  select * into target from public.things where id = p_thing_id;
  if not found or not public.is_active_thing_member(p_thing_id) then raise exception 'thing_unavailable'; end if;
  select jsonb_build_object(
    'id', target.id, 'status', target.status, 'charm_key', target.charm_key, 'color_key', target.color_key,
    'created_by', target.created_by, 'viewer_id', actor,
    'members', (select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'display_name', p.display_name) order by m.seat), '[]'::jsonb)
      from public.thing_members m join public.profiles p on p.id = m.user_id where m.thing_id = target.id and m.status = 'active'),
    'proposal', (select jsonb_build_object('charm_key', cp.charm_key, 'proposed_by', cp.proposed_by, 'proposer_name', p.display_name, 'version', cp.proposal_version)
      from public.current_charm_proposals cp join public.profiles p on p.id = cp.proposed_by where cp.thing_id = target.id),
    'invite', (select jsonb_build_object('code', code, 'expires_at', expires_at, 'expired', expires_at <= now())
      from public.thing_invites where thing_id = target.id and created_by = actor and status = 'active' order by created_at desc limit 1),
    'recent_hangouts', (select coalesce(jsonb_agg(item order by item->>'created_at' desc), '[]'::jsonb) from (
      select jsonb_build_object('id', h.id, 'game_type', h.game_type, 'state', h.state, 'created_at', h.created_at) item
      from public.hangouts h where h.thing_id = target.id order by h.created_at desc limit 5
    ) recent)
  ) into result;
  return result;
end;
$$;

revoke all on function public.update_thing_color(uuid, text), public.end_thing(uuid),
  public.set_hot_consent(uuid, text), public.hot_setup_snapshot(uuid),
  public.create_hangout(uuid, text, text), public.add_hot_deck_card(uuid, text),
  public.ready_hot_batch(uuid), public.hangout_snapshot(uuid)
  from public, anon, authenticated;
grant execute on function public.update_thing_color(uuid, text), public.end_thing(uuid),
  public.set_hot_consent(uuid, text), public.hot_setup_snapshot(uuid),
  public.create_hangout(uuid, text, text), public.add_hot_deck_card(uuid, text),
  public.ready_hot_batch(uuid), public.hangout_snapshot(uuid)
  to authenticated;

commit;
