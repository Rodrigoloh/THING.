begin;

-- Retain the previous migration: this also upgrades databases that applied it.
alter table public.things drop constraint things_status_check;
alter table public.things drop constraint things_activation_consistent;
alter table public.things add column charm_round integer not null default 1 check (charm_round > 0);
alter table public.things add column request_id uuid;
update public.things t set status = case when
  (select count(*) from public.thing_members m where m.thing_id = t.id and m.status = 'active') = 2
  then 'pending_charm' else 'pending_invite' end where status = 'pending';
alter table public.things alter column status set default 'pending_invite';
alter table public.things add check (status in ('pending_invite', 'pending_charm', 'active', 'disconnected'));
alter table public.things add check (
  (status in ('pending_invite', 'pending_charm') and activated_at is null)
  or (status in ('active', 'disconnected') and activated_at is not null));
create unique index things_create_request on public.things(created_by, request_id);

-- Preserve existing invitations; new invitations use random bearer codes.

-- A unique seat is the final database-level defense, including concurrent
-- inserts and updates. RPCs additionally serialize on the parent Thing row.
alter table public.thing_members add column seat smallint;
with seats as (select thing_id, user_id, row_number() over
  (partition by thing_id order by role, user_id) as seat from public.thing_members)
update public.thing_members m set seat = s.seat from seats s
where m.thing_id = s.thing_id and m.user_id = s.user_id;
alter table public.thing_members alter column seat set not null;
alter table public.thing_members add check (seat in (1, 2));
alter table public.thing_members add unique(thing_id, seat);

create table public.thing_charm_choices (
  thing_id uuid not null,
  user_id uuid not null,
  round integer not null check (round > 0),
  charm_key text not null check (charm_key in ('cherry', 'moon', 'spark', 'clover')),
  primary key (thing_id, user_id, round),
  foreign key (thing_id, user_id) references public.thing_members(thing_id, user_id) on delete cascade
);
alter table public.thing_charm_choices enable row level security;

-- All state changes go through the RPCs. Old permissive policies alone cannot
-- restore write access; remove them as well to make the boundary explicit.
revoke all on public.things, public.thing_members, public.thing_invites, public.thing_charm_choices from anon, authenticated;
revoke insert(created_by), update(status, charm_key, accent_color, activated_at) on public.things from authenticated;
revoke insert(thing_id, user_id, role, status, joined_at), update(status, joined_at) on public.thing_members from authenticated;
revoke insert(thing_id, code, created_by, expires_at), update(status) on public.thing_invites from authenticated;
grant select on public.things, public.thing_members, public.thing_invites, public.thing_charm_choices to authenticated;
drop policy things_insert_creator on public.things;
drop policy things_update_creator on public.things;
drop policy thing_members_insert_creator_self on public.thing_members;
drop policy thing_members_update_self on public.thing_members;
drop policy thing_invites_insert_creator on public.thing_invites;
drop policy thing_invites_update_creator on public.thing_invites;
drop policy thing_invites_select_related on public.thing_invites;
create policy thing_invites_select_creator on public.thing_invites for select to authenticated
  using (created_by = (select auth.uid()));
create policy charm_choices_select_own on public.thing_charm_choices for select to authenticated
  using (user_id = (select auth.uid()) and public.is_active_thing_member(thing_id)
    and coalesce((select auth.jwt())->>'is_anonymous', 'false') = 'false');

create function public.thing_account() returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null or coalesce(auth.jwt()->>'is_anonymous', 'false') <> 'false' then
    raise exception 'session_required';
  end if;
  if not exists(select 1 from public.profiles where id = actor) then raise exception 'profile_required'; end if;
  return actor;
end;
$$;

create function public.create_thing(p_request_id uuid) returns uuid
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
  insert into public.thing_invites(thing_id, created_by, code, expires_at)
    values(target, actor, upper(replace(gen_random_uuid()::text, '-', '')), now() + interval '7 days');
  return target;
end;
$$;

-- Preview exposes only the inviter's display name to a signed-in, profiled
-- holder of a 122-bit random bearer code. It never consumes the invitation.
create function public.preview_thing_invite(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); inv public.thing_invites; title text;
begin
  select * into inv from public.thing_invites where code = upper(btrim(p_code));
  if not found then raise exception 'invite_unavailable'; end if;
  if inv.status = 'accepted' then raise exception 'invite_used'; end if;
  if inv.status = 'revoked' then raise exception 'invite_revoked'; end if;
  if inv.status = 'expired' or inv.expires_at <= clock_timestamp() then raise exception 'invite_expired'; end if;
  if inv.created_by = actor then raise exception 'own_invite'; end if;
  if not exists(select 1 from public.things where id = inv.thing_id and status = 'pending_invite') then raise exception 'invite_unavailable'; end if;
  select display_name into title from public.profiles where id = inv.created_by;
  if title is null then raise exception 'invite_unavailable'; end if;
  return jsonb_build_object('inviter_name', title, 'expires_at', inv.expires_at);
end;
$$;

create function public.accept_thing_invite(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); inv public.thing_invites; target public.things;
begin
  select * into inv from public.thing_invites where code = upper(btrim(p_code));
  if not found then raise exception 'invite_unavailable'; end if;
  -- Every mutator locks the Thing first (one consistent lock order).
  select * into target from public.things where id = inv.thing_id for update;
  if not found then raise exception 'invite_unavailable'; end if;
  select * into inv from public.thing_invites where id = inv.id for update;
  if not found then raise exception 'invite_unavailable'; end if;
  if inv.created_by = actor then raise exception 'own_invite'; end if;
  if inv.status = 'accepted' then raise exception 'invite_used'; end if;
  if inv.status = 'revoked' then raise exception 'invite_revoked'; end if;
  if inv.status = 'expired' or inv.expires_at <= clock_timestamp() then raise exception 'invite_expired'; end if;
  if (select count(*) from public.thing_members where thing_id = target.id) >= 2 then raise exception 'thing_full'; end if;
  if inv.status <> 'active' or target.status <> 'pending_invite' then
    raise exception 'invite_unavailable';
  end if;
  if (select count(*) from public.thing_members where thing_id = target.id) <> 1
    or exists(select 1 from public.thing_members where thing_id = target.id and user_id = actor) then
    raise exception 'invite_unavailable';
  end if;
  insert into public.thing_members(thing_id, user_id, role, status, joined_at, seat)
    values(target.id, actor, 'member', 'active', now(), 2);
  update public.thing_invites set status = case when id = inv.id then 'accepted' else 'revoked' end
    where thing_id = target.id and status = 'active';
  update public.things set status = 'pending_charm' where id = target.id;
  return target.id;
end;
$$;

create function public.choose_thing_charm(p_thing_id uuid, p_round integer, p_charm text) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); target public.things; choices integer; matches integer;
begin
  select * into target from public.things where id = p_thing_id for update;
  if not found or not public.is_active_thing_member(p_thing_id) then raise exception 'thing_unavailable'; end if;
  if target.status <> 'pending_charm' or p_round is distinct from target.charm_round then raise exception 'round_changed'; end if;
  if p_charm is null or p_charm not in ('cherry', 'moon', 'spark', 'clover') then raise exception 'invalid_charm'; end if;
  if (select count(*) from public.thing_members where thing_id = p_thing_id and status = 'active') <> 2 then raise exception 'thing_unavailable'; end if;
  -- A submitted vote is immutable; retries of the same vote are harmless.
  if exists(select 1 from public.thing_charm_choices where thing_id = p_thing_id and user_id = actor and round = p_round and charm_key <> p_charm) then
    raise exception 'already_chosen';
  end if;
  insert into public.thing_charm_choices values(p_thing_id, actor, p_round, p_charm) on conflict do nothing;
  select count(*), count(distinct charm_key) into choices, matches from public.thing_charm_choices
    where thing_id = p_thing_id and round = p_round;
  if choices = 2 then
    if matches = 1 then
      update public.things set status = 'active', charm_key = p_charm, activated_at = now() where id = p_thing_id;
    else
      update public.things set charm_round = charm_round + 1 where id = p_thing_id;
    end if;
  end if;
end;
$$;

create function public.thing_snapshot(p_thing_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); target public.things; result jsonb;
begin
  select * into target from public.things where id = p_thing_id;
  if not found or not public.is_active_thing_member(p_thing_id) then raise exception 'thing_unavailable'; end if;
  select jsonb_build_object(
    'id', target.id, 'status', target.status, 'charm_key', target.charm_key,
    'round', target.charm_round, 'created_by', target.created_by,
    'members', (select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'display_name', p.display_name) order by m.seat), '[]'::jsonb)
      from public.thing_members m join public.profiles p on p.id = m.user_id where m.thing_id = target.id and m.status = 'active'),
    'own_choice', (select charm_key from public.thing_charm_choices where thing_id = target.id and user_id = actor and round = target.charm_round),
    'partner_ready', exists(select 1 from public.thing_charm_choices where thing_id = target.id and user_id <> actor and round = target.charm_round),
    'invite', (select jsonb_build_object('code', code, 'expires_at', expires_at, 'expired', expires_at <= now())
      from public.thing_invites where thing_id = target.id and created_by = actor and status = 'active' order by created_at desc limit 1)
  ) into result;
  return result;
end;
$$;

create function public.list_my_things() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); result jsonb;
begin
  select coalesce(jsonb_agg(public.thing_snapshot(t.id) order by t.created_at desc), '[]'::jsonb) into result
    from public.things t join public.thing_members m on m.thing_id = t.id where m.user_id = actor and m.status = 'active';
  return result;
end;
$$;

create function public.renew_thing_invite(p_thing_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); target public.things;
begin
  select * into target from public.things where id = p_thing_id for update;
  if not found or target.created_by <> actor or target.status <> 'pending_invite' then raise exception 'thing_unavailable'; end if;
  if exists(select 1 from public.thing_invites where thing_id = p_thing_id and status = 'active' and expires_at > clock_timestamp()) then return; end if;
  update public.thing_invites set status = 'expired' where thing_id = p_thing_id and status = 'active';
  insert into public.thing_invites(thing_id, created_by, code, expires_at)
    values(p_thing_id, actor, upper(replace(gen_random_uuid()::text, '-', '')), now() + interval '7 days');
end;
$$;

create function public.cancel_pending_thing(p_thing_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); target public.things;
begin
  select * into target from public.things where id = p_thing_id for update;
  if not found or target.created_by <> actor or target.status <> 'pending_invite' then raise exception 'thing_unavailable'; end if;
  delete from public.things where id = p_thing_id;
end;
$$;

-- Functions default to PUBLIC execute in PostgreSQL; explicitly close all of them.
revoke all on function public.thing_account() from public, anon, authenticated;
revoke all on function public.create_thing(uuid), public.preview_thing_invite(text), public.accept_thing_invite(text),
  public.choose_thing_charm(uuid, integer, text), public.thing_snapshot(uuid), public.list_my_things(),
  public.renew_thing_invite(uuid), public.cancel_pending_thing(uuid) from public, anon, authenticated;
grant execute on function public.create_thing(uuid), public.preview_thing_invite(text), public.accept_thing_invite(text),
  public.choose_thing_charm(uuid, integer, text), public.thing_snapshot(uuid), public.list_my_things(),
  public.renew_thing_invite(uuid), public.cancel_pending_thing(uuid) to authenticated;

commit;
