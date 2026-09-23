begin;

alter table public.things add column color_source text not null default 'charm'
  check (color_source in ('charm', 'manual'));

-- Existing active Things may already have been recolored through migration 005.
-- Preserve their current appearance rather than guessing user intent.
update public.things set color_source = 'manual' where status in ('active', 'disconnected');

with ranked as (
  select id, row_number() over(partition by thing_id order by created_at, id) position
  from public.hangouts where state in ('setup', 'waiting', 'ready', 'active')
)
update public.hangouts h set state = 'abandoned', completed_at = coalesce(h.completed_at, now())
from ranked r where r.id = h.id and r.position > 1;

create unique index hangouts_one_open_per_thing
  on public.hangouts(thing_id)
  where state in ('setup', 'waiting', 'ready', 'active');

create or replace function public.accept_thing_charm(p_thing_id uuid, p_expected_version integer)
returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); target public.things; proposal public.current_charm_proposals; derived_color text;
begin
  select * into target from public.things where id = p_thing_id for update;
  if not found or not public.is_active_thing_member(p_thing_id) then raise exception 'thing_unavailable'; end if;
  if target.status <> 'pending_charm' then raise exception 'proposal_changed'; end if;
  select * into proposal from public.current_charm_proposals where thing_id = p_thing_id;
  if not found or p_expected_version is distinct from proposal.proposal_version then raise exception 'proposal_changed'; end if;
  if proposal.proposed_by = actor then raise exception 'own_proposal'; end if;
  if (select count(*) from public.thing_members where thing_id = p_thing_id and status = 'active') <> 2 then raise exception 'thing_unavailable'; end if;
  derived_color := case proposal.charm_key
    when 'cherry' then 'cherry' when 'moon' then 'electric_blue'
    when 'spark' then 'butter' when 'clover' then 'acid' end;
  update public.things set status = 'active', charm_key = proposal.charm_key,
    color_key = case when color_source = 'charm' then derived_color else color_key end,
    activated_at = now()
    where id = p_thing_id and status = 'pending_charm';
  if not found then raise exception 'proposal_changed'; end if;
end;
$$;

create or replace function public.update_thing_color(p_thing_id uuid, p_color_key text) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); target public.things;
begin
  if p_color_key is null or p_color_key not in ('cherry', 'butter', 'electric_blue', 'acid', 'tangerine', 'purple', 'paper', 'ink') then
    raise exception 'invalid_color';
  end if;
  select * into target from public.things where id = p_thing_id for update;
  if not found or target.status <> 'active' or not public.is_active_thing_member(p_thing_id) then raise exception 'thing_unavailable'; end if;
  update public.things set color_key = p_color_key, color_source = 'manual' where id = p_thing_id;
end;
$$;

drop function public.create_hangout(uuid, text, text);
create function public.create_hangout(p_thing_id uuid, p_game_type text, p_hot_mode text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); target public.things; existing public.hangouts; target_id uuid; setup jsonb; chosen_mode text;
begin
  if p_game_type is null or p_game_type not in ('same_brain', 'know_me', 'this_or_that', 'hot') then raise exception 'invalid_game_type'; end if;
  select * into target from public.things where id = p_thing_id for update;
  if not found or target.status <> 'active' or not public.is_active_thing_member(p_thing_id) then raise exception 'thing_unavailable'; end if;
  if (select count(*) from public.thing_members where thing_id = p_thing_id and status = 'active') <> 2 then raise exception 'thing_unavailable'; end if;

  select * into existing from public.hangouts
    where thing_id = p_thing_id and state in ('setup', 'waiting', 'ready', 'active')
    order by created_at, id limit 1 for update;
  if found then
    if existing.game_type = p_game_type then
      insert into public.hangout_members(hangout_id, user_id)
        values(existing.id, actor) on conflict(hangout_id, user_id) do nothing;
      if existing.game_type = 'same_brain' and existing.state = 'waiting'
        and (select count(*) from public.hangout_members where hangout_id = existing.id) = 2 then
        update public.hangouts set state = 'active' where id = existing.id;
      end if;
      return jsonb_build_object('id', existing.id, 'game_type', existing.game_type, 'created', false, 'joined', true, 'conflict', false);
    end if;
    return jsonb_build_object('id', existing.id, 'game_type', existing.game_type, 'created', false,
      'joined', exists(select 1 from public.hangout_members where hangout_id = existing.id and user_id = actor), 'conflict', true);
  end if;

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
  insert into public.hangout_members(hangout_id, user_id) values(target_id, actor);
  return jsonb_build_object('id', target_id, 'game_type', p_game_type, 'created', true, 'joined', true, 'conflict', false);
end;
$$;

create function public.join_hangout(p_hangout_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); thing_id uuid; target public.things; target_hangout public.hangouts;
begin
  select h.thing_id into thing_id from public.hangouts h where h.id = p_hangout_id;
  if thing_id is null then raise exception 'hangout_unavailable'; end if;
  select * into target from public.things where id = thing_id for update;
  select * into target_hangout from public.hangouts where id = p_hangout_id for update;
  if not found or target.status <> 'active' or target_hangout.state not in ('setup','waiting','ready','active')
    or not public.is_active_thing_member(target.id) then raise exception 'hangout_unavailable'; end if;
  insert into public.hangout_members(hangout_id, user_id) values(target_hangout.id, actor)
    on conflict(hangout_id, user_id) do nothing;
  if (select count(*) from public.hangout_members where hangout_id = target_hangout.id) > 2 then raise exception 'hangout_unavailable'; end if;
  if target_hangout.game_type = 'same_brain' and target_hangout.state = 'waiting'
    and (select count(*) from public.hangout_members where hangout_id = target_hangout.id) = 2 then
    update public.hangouts set state = 'active' where id = target_hangout.id;
  end if;
end;
$$;

create or replace function public.start_same_brain(p_hangout_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); target public.hangouts; available integer; member_count integer;
begin
  select * into target from public.hangouts where id = p_hangout_id for update;
  if not found or target.game_type <> 'same_brain' or target.state not in ('setup','waiting','active')
    or not exists(select 1 from public.hangout_members where hangout_id = target.id and user_id = actor)
    or not exists(select 1 from public.things where id = target.thing_id and status = 'active')
    then raise exception 'hangout_unavailable'; end if;
  if target.state in ('waiting','active') then return; end if;
  select count(*) into available from public.game_prompts where game_type = 'same_brain' and active and not adult;
  if available < 8 then raise exception 'prompt_pack_unavailable'; end if;
  insert into public.hangout_rounds(hangout_id, round_number, prompt_id, state)
    select target.id, row_number() over (), id, case when row_number() over () = 1 then 'answering' else 'pending' end
    from (select id from public.game_prompts where game_type = 'same_brain' and active and not adult order by random() limit 8) chosen
    on conflict (hangout_id, round_number) do nothing;
  if (select count(*) from public.hangout_rounds where hangout_id = target.id) <> 8 then raise exception 'hangout_unavailable'; end if;
  select count(*) into member_count from public.hangout_members where hangout_id = target.id;
  update public.hangouts set state = case when member_count = 2 then 'active' else 'waiting' end,
    started_at = coalesce(started_at, now()) where id = target.id;
end;
$$;

create or replace function public.hangout_snapshot(p_hangout_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); target public.hangouts; result jsonb; color text;
begin
  select * into target from public.hangouts where id = p_hangout_id;
  if not found or not exists(select 1 from public.hangout_members where hangout_id = p_hangout_id and user_id = actor) then raise exception 'hangout_unavailable'; end if;
  select color_key into color from public.things where id = target.thing_id;
  select jsonb_build_object(
    'id', target.id, 'thing_id', target.thing_id, 'game_type', target.game_type, 'state', target.state, 'color_key', color,
    'hot_level', target.hot_level, 'hot_mode', target.hot_mode, 'created_at', target.created_at,
    'started_at', target.started_at, 'completed_at', target.completed_at,
    'members', (select coalesce(jsonb_agg(jsonb_build_object('display_name', p.display_name) order by tm.seat), '[]'::jsonb)
      from public.hangout_members hm join public.thing_members tm on tm.thing_id = target.thing_id and tm.user_id = hm.user_id
      join public.profiles p on p.id = hm.user_id where hm.hangout_id = target.id),
    'own_card_count', (select count(*) from public.hot_deck_cards where hangout_id = target.id and created_by = actor),
    'partner_card_count', (select count(*) from public.hot_deck_cards where hangout_id = target.id and created_by <> actor),
    'own_batch_ready', coalesce((select batch_ready from public.hangout_members where hangout_id = target.id and user_id = actor), false),
    'both_batches_ready', (select count(*) = 2 from public.hangout_members where hangout_id = target.id and batch_ready)
  ) into result;
  return result;
end;
$$;

create or replace function public.same_brain_snapshot(p_hangout_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); target public.hangouts; current_round public.hangout_rounds; prompt public.game_prompts; payload jsonb; color text;
begin
  select * into target from public.hangouts where id = p_hangout_id;
  if not found or target.game_type <> 'same_brain' or not exists(
    select 1 from public.hangout_members where hangout_id = target.id and user_id = actor
  ) then raise exception 'hangout_unavailable'; end if;
  select color_key into color from public.things where id = target.thing_id;
  select * into current_round from public.hangout_rounds where hangout_id = target.id and state = 'answering' order by round_number limit 1;
  if not found then select * into current_round from public.hangout_rounds where hangout_id = target.id and state = 'revealed' order by round_number desc limit 1; end if;
  if current_round.id is not null then select * into prompt from public.game_prompts where id = current_round.prompt_id; end if;
  select jsonb_build_object(
    'id', target.id, 'thing_id', target.thing_id, 'state', target.state, 'color_key', color,
    'members', (select coalesce(jsonb_agg(jsonb_build_object('display_name', p.display_name) order by tm.seat), '[]'::jsonb)
      from public.hangout_members hm join public.thing_members tm on tm.thing_id = target.thing_id and tm.user_id = hm.user_id
      join public.profiles p on p.id = hm.user_id where hm.hangout_id = target.id),
    'round', case when current_round.id is null then null else jsonb_build_object(
      'id', current_round.id, 'number', current_round.round_number, 'state', current_round.state,
      'prompt_en', prompt.prompt_en, 'prompt_es', prompt.prompt_es,
      'option_a_en', prompt.option_a_en, 'option_a_es', prompt.option_a_es,
      'option_b_en', prompt.option_b_en, 'option_b_es', prompt.option_b_es,
      'answer_count', (select count(*) from public.hangout_answers where round_id = current_round.id),
      'own_answer', (select answer_key from public.hangout_answers where round_id = current_round.id and user_id = actor),
      'answers', case when current_round.state = 'revealed' then (select coalesce(jsonb_agg(
        jsonb_build_object('answer_key', a.answer_key, 'is_self', a.user_id = actor, 'display_name', p.display_name)
        order by (a.user_id = actor) desc), '[]'::jsonb)
        from public.hangout_answers a join public.profiles p on p.id = a.user_id where a.round_id = current_round.id) else '[]'::jsonb end
    ) end,
    'result', (select result_json from public.hangout_results where hangout_id = target.id)
  ) into payload;
  return payload;
end;
$$;

create or replace function public.thing_snapshot(p_thing_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); target public.things; result jsonb;
begin
  select * into target from public.things where id = p_thing_id;
  if not found or not public.is_active_thing_member(p_thing_id) then raise exception 'thing_unavailable'; end if;
  select jsonb_build_object(
    'id', target.id, 'status', target.status, 'charm_key', target.charm_key, 'color_key', target.color_key, 'color_source', target.color_source,
    'created_by', target.created_by, 'viewer_id', actor,
    'members', (select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'display_name', p.display_name) order by m.seat), '[]'::jsonb)
      from public.thing_members m join public.profiles p on p.id = m.user_id where m.thing_id = target.id and m.status = 'active'),
    'proposal', (select jsonb_build_object('charm_key', cp.charm_key, 'proposed_by', cp.proposed_by, 'proposer_name', p.display_name, 'version', cp.proposal_version)
      from public.current_charm_proposals cp join public.profiles p on p.id = cp.proposed_by where cp.thing_id = target.id),
    'invite', (select jsonb_build_object('code', code, 'expires_at', expires_at, 'expired', expires_at <= now())
      from public.thing_invites where thing_id = target.id and created_by = actor and status = 'active' order by created_at desc limit 1),
    'active_hangout', (select jsonb_build_object('id', h.id, 'game_type', h.game_type, 'state', h.state, 'created_at', h.created_at,
      'current_user_joined', exists(select 1 from public.hangout_members hm where hm.hangout_id = h.id and hm.user_id = actor),
      'other_user_joined', exists(select 1 from public.hangout_members hm where hm.hangout_id = h.id and hm.user_id <> actor))
      from public.hangouts h where h.thing_id = target.id and h.state in ('setup','waiting','ready','active') order by h.created_at limit 1),
    'recent_hangouts', (select coalesce(jsonb_agg(item order by item->>'completed_at' desc), '[]'::jsonb) from (
      select jsonb_build_object('id', h.id, 'game_type', h.game_type, 'state', h.state, 'created_at', h.created_at,
        'completed_at', h.completed_at, 'result', r.result_json,
        'souvenir_keys', coalesce((select jsonb_agg(s.souvenir_key order by s.unlocked_at) from public.thing_souvenirs s where s.source_hangout_id = h.id), '[]'::jsonb)) item
      from public.hangouts h left join public.hangout_results r on r.hangout_id = h.id
      where h.thing_id = target.id and h.state in ('complete','abandoned') order by h.completed_at desc nulls last limit 4
    ) recent)
  ) into result;
  return result;
end;
$$;

revoke all on function public.create_hangout(uuid, text, text), public.join_hangout(uuid) from public, anon, authenticated;
grant execute on function public.create_hangout(uuid, text, text), public.join_hangout(uuid) to authenticated;

commit;
