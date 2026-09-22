begin;

-- Six characters from this 31-symbol alphabet provide roughly 30 bits of
-- entropy while avoiding O/0, I/1 and L. Existing 6-32 character codes remain
-- valid; only newly created codes use this format.
create function public.generate_short_thing_invite_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := uuid_send(gen_random_uuid());
  result text := '';
  position integer;
begin
  for position in 0..5 loop
    result := result || substr(alphabet, (get_byte(bytes, position) % length(alphabet)) + 1, 1);
  end loop;
  return result;
end;
$$;

create function public.insert_thing_invite(p_thing_id uuid, p_created_by uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  attempt integer;
begin
  for attempt in 1..20 loop
    begin
      insert into public.thing_invites(thing_id, created_by, code, expires_at)
      values(p_thing_id, p_created_by, public.generate_short_thing_invite_code(), now() + interval '7 days');
      return;
    exception when unique_violation then
      -- Secure random codes can collide. Retry inside the same transaction.
    end;
  end loop;
  raise exception 'invite_code_collision';
end;
$$;

create table public.thing_invite_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started timestamptz not null,
  attempts integer not null check (attempts > 0)
);
alter table public.thing_invite_attempts enable row level security;
revoke all on public.thing_invite_attempts from public, anon, authenticated;

create function public.consume_thing_invite_attempt(p_user_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_attempts integer;
begin
  insert into public.thing_invite_attempts(user_id, window_started, attempts)
  values(p_user_id, clock_timestamp(), 1)
  on conflict(user_id) do update set
    window_started = case
      when public.thing_invite_attempts.window_started <= clock_timestamp() - interval '10 minutes'
        then excluded.window_started
      else public.thing_invite_attempts.window_started
    end,
    attempts = case
      when public.thing_invite_attempts.window_started <= clock_timestamp() - interval '10 minutes'
        then 1
      else public.thing_invite_attempts.attempts + 1
    end
  returning attempts into current_attempts;
  return current_attempts <= 30;
end;
$$;

-- Replace creation/renewal without changing their public signatures.
create or replace function public.create_thing(p_request_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); target uuid;
begin
  if p_request_id is null then raise exception 'invalid_request'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text, 0));
  select id into target from public.things where created_by = actor and request_id = p_request_id;
  if target is not null then return target; end if;
  if (select count(*) from public.things where created_by = actor and status = 'pending_invite') >= 10 then
    raise exception 'too_many_pending';
  end if;
  insert into public.things(created_by, request_id) values(actor, p_request_id) returning id into target;
  insert into public.thing_members(thing_id, user_id, role, status, joined_at, seat)
    values(target, actor, 'creator', 'active', now(), 1);
  perform public.insert_thing_invite(target, actor);
  return target;
end;
$$;

create or replace function public.renew_thing_invite(p_thing_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); target public.things;
begin
  select * into target from public.things where id = p_thing_id for update;
  if not found or target.created_by <> actor or target.status <> 'pending_invite' then raise exception 'thing_unavailable'; end if;
  if exists(select 1 from public.thing_invites where thing_id = p_thing_id and status = 'active' and expires_at > clock_timestamp()) then return; end if;
  update public.thing_invites set status = 'expired' where thing_id = p_thing_id and status = 'active';
  perform public.insert_thing_invite(p_thing_id, actor);
end;
$$;

-- Result envelopes let failed lookups commit the per-account attempt counter.
-- The old exception-based endpoints are revoked below so they cannot bypass it.
create function public.preview_thing_invite_v2(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); inv public.thing_invites; title text;
begin
  if not public.consume_thing_invite_attempt(actor) then
    return jsonb_build_object('ok', false, 'error', 'invite_rate_limited');
  end if;
  select * into inv from public.thing_invites where code = upper(btrim(p_code));
  if not found then return jsonb_build_object('ok', false, 'error', 'invite_unavailable'); end if;
  if inv.status = 'accepted' then return jsonb_build_object('ok', false, 'error', 'invite_used'); end if;
  if inv.status = 'revoked' then return jsonb_build_object('ok', false, 'error', 'invite_revoked'); end if;
  if inv.status = 'expired' or inv.expires_at <= clock_timestamp() then
    return jsonb_build_object('ok', false, 'error', 'invite_expired');
  end if;
  if inv.created_by = actor then return jsonb_build_object('ok', false, 'error', 'own_invite'); end if;
  if not exists(select 1 from public.things where id = inv.thing_id and status = 'pending_invite') then
    return jsonb_build_object('ok', false, 'error', 'invite_unavailable');
  end if;
  select display_name into title from public.profiles where id = inv.created_by;
  if title is null then return jsonb_build_object('ok', false, 'error', 'invite_unavailable'); end if;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object('inviter_name', title, 'expires_at', inv.expires_at));
end;
$$;

create function public.accept_thing_invite_v2(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); inv public.thing_invites; target public.things;
begin
  if not public.consume_thing_invite_attempt(actor) then
    return jsonb_build_object('ok', false, 'error', 'invite_rate_limited');
  end if;
  select * into inv from public.thing_invites where code = upper(btrim(p_code));
  if not found then return jsonb_build_object('ok', false, 'error', 'invite_unavailable'); end if;
  select * into target from public.things where id = inv.thing_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'invite_unavailable'); end if;
  select * into inv from public.thing_invites where id = inv.id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'invite_unavailable'); end if;
  if inv.created_by = actor then return jsonb_build_object('ok', false, 'error', 'own_invite'); end if;
  if inv.status = 'accepted' then return jsonb_build_object('ok', false, 'error', 'invite_used'); end if;
  if inv.status = 'revoked' then return jsonb_build_object('ok', false, 'error', 'invite_revoked'); end if;
  if inv.status = 'expired' or inv.expires_at <= clock_timestamp() then
    return jsonb_build_object('ok', false, 'error', 'invite_expired');
  end if;
  if (select count(*) from public.thing_members where thing_id = target.id) >= 2 then
    return jsonb_build_object('ok', false, 'error', 'thing_full');
  end if;
  if inv.status <> 'active' or target.status <> 'pending_invite' then
    return jsonb_build_object('ok', false, 'error', 'invite_unavailable');
  end if;
  if (select count(*) from public.thing_members where thing_id = target.id) <> 1
    or exists(select 1 from public.thing_members where thing_id = target.id and user_id = actor) then
    return jsonb_build_object('ok', false, 'error', 'invite_unavailable');
  end if;
  insert into public.thing_members(thing_id, user_id, role, status, joined_at, seat)
    values(target.id, actor, 'member', 'active', now(), 2);
  update public.thing_invites set status = case when id = inv.id then 'accepted' else 'revoked' end
    where thing_id = target.id and status = 'active';
  update public.things set status = 'pending_charm' where id = target.id;
  return jsonb_build_object('ok', true, 'data', target.id);
end;
$$;

create table public.current_charm_proposals (
  thing_id uuid primary key references public.things(id) on delete cascade,
  charm_key text not null check (charm_key in ('cherry', 'moon', 'spark', 'clover')),
  proposed_by uuid not null,
  proposal_version integer not null check (proposal_version > 0),
  updated_at timestamptz not null default now(),
  foreign key (thing_id, proposed_by) references public.thing_members(thing_id, user_id) on delete cascade
);

-- Preserve any unresolved choice in a pending legacy round as the first
-- proposal. Historical choice rows remain untouched for audit/migration.
insert into public.current_charm_proposals(thing_id, charm_key, proposed_by, proposal_version)
select distinct on (c.thing_id) c.thing_id, c.charm_key, c.user_id, 1
from public.thing_charm_choices c
join public.things t on t.id = c.thing_id and t.status = 'pending_charm' and t.charm_round = c.round
join public.thing_members m on m.thing_id = c.thing_id and m.user_id = c.user_id and m.status = 'active'
order by c.thing_id, m.seat desc;

alter table public.current_charm_proposals enable row level security;
revoke all on public.current_charm_proposals from public, anon, authenticated;
grant select on public.current_charm_proposals to authenticated;
create policy current_charm_proposals_select_members on public.current_charm_proposals
  for select to authenticated
  using (public.is_active_thing_member(thing_id)
    and coalesce((select auth.jwt())->>'is_anonymous', 'false') = 'false');

create function public.propose_thing_charm(p_thing_id uuid, p_expected_version integer, p_charm text)
returns integer
language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); target public.things; proposal public.current_charm_proposals; next_version integer;
begin
  select * into target from public.things where id = p_thing_id for update;
  if not found or not public.is_active_thing_member(p_thing_id) then raise exception 'thing_unavailable'; end if;
  if target.status <> 'pending_charm' then raise exception 'proposal_changed'; end if;
  if p_charm is null or p_charm not in ('cherry', 'moon', 'spark', 'clover') then raise exception 'invalid_charm'; end if;
  if (select count(*) from public.thing_members where thing_id = p_thing_id and status = 'active') <> 2 then raise exception 'thing_unavailable'; end if;
  select * into proposal from public.current_charm_proposals where thing_id = p_thing_id;
  if found then
    if p_expected_version is distinct from proposal.proposal_version then raise exception 'proposal_changed'; end if;
    if proposal.proposed_by = actor then raise exception 'own_proposal'; end if;
    next_version := proposal.proposal_version + 1;
    update public.current_charm_proposals
      set charm_key = p_charm, proposed_by = actor, proposal_version = next_version, updated_at = now()
      where thing_id = p_thing_id;
  else
    if p_expected_version is distinct from 0 then raise exception 'proposal_changed'; end if;
    next_version := 1;
    insert into public.current_charm_proposals(thing_id, charm_key, proposed_by, proposal_version)
      values(p_thing_id, p_charm, actor, next_version);
  end if;
  return next_version;
end;
$$;

create function public.accept_thing_charm(p_thing_id uuid, p_expected_version integer)
returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); target public.things; proposal public.current_charm_proposals;
begin
  select * into target from public.things where id = p_thing_id for update;
  if not found or not public.is_active_thing_member(p_thing_id) then raise exception 'thing_unavailable'; end if;
  if target.status <> 'pending_charm' then raise exception 'proposal_changed'; end if;
  select * into proposal from public.current_charm_proposals where thing_id = p_thing_id;
  if not found or p_expected_version is distinct from proposal.proposal_version then raise exception 'proposal_changed'; end if;
  if proposal.proposed_by = actor then raise exception 'own_proposal'; end if;
  if (select count(*) from public.thing_members where thing_id = p_thing_id and status = 'active') <> 2 then raise exception 'thing_unavailable'; end if;
  update public.things
    set status = 'active', charm_key = proposal.charm_key, activated_at = now()
    where id = p_thing_id and status = 'pending_charm';
  if not found then raise exception 'proposal_changed'; end if;
end;
$$;

create or replace function public.thing_snapshot(p_thing_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); target public.things; result jsonb;
begin
  select * into target from public.things where id = p_thing_id;
  if not found or not public.is_active_thing_member(p_thing_id) then raise exception 'thing_unavailable'; end if;
  select jsonb_build_object(
    'id', target.id, 'status', target.status, 'charm_key', target.charm_key,
    'created_by', target.created_by, 'viewer_id', actor,
    'members', (select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'display_name', p.display_name) order by m.seat), '[]'::jsonb)
      from public.thing_members m join public.profiles p on p.id = m.user_id where m.thing_id = target.id and m.status = 'active'),
    'proposal', (select jsonb_build_object(
        'charm_key', cp.charm_key,
        'proposed_by', cp.proposed_by,
        'proposer_name', p.display_name,
        'version', cp.proposal_version)
      from public.current_charm_proposals cp
      join public.profiles p on p.id = cp.proposed_by
      where cp.thing_id = target.id),
    'invite', (select jsonb_build_object('code', code, 'expires_at', expires_at, 'expired', expires_at <= now())
      from public.thing_invites where thing_id = target.id and created_by = actor and status = 'active' order by created_at desc limit 1)
  ) into result;
  return result;
end;
$$;

revoke all on function public.generate_short_thing_invite_code(), public.insert_thing_invite(uuid, uuid),
  public.consume_thing_invite_attempt(uuid) from public, anon, authenticated;
revoke all on function public.preview_thing_invite(text), public.accept_thing_invite(text),
  public.choose_thing_charm(uuid, integer, text) from authenticated;
revoke all on function public.preview_thing_invite_v2(text), public.accept_thing_invite_v2(text),
  public.propose_thing_charm(uuid, integer, text), public.accept_thing_charm(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.preview_thing_invite_v2(text), public.accept_thing_invite_v2(text),
  public.propose_thing_charm(uuid, integer, text), public.accept_thing_charm(uuid, integer)
  to authenticated;

commit;
