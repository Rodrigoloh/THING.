begin;

create table public.things (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'active', 'disconnected')),
  charm_key text check (charm_key is null or charm_key ~ '^[a-z0-9_]{1,50}$'),
  accent_color text check (accent_color is null or accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  constraint things_activation_consistent check (
    (status = 'pending' and activated_at is null)
    or (status in ('active', 'disconnected') and activated_at is not null)
  )
);

create table public.thing_members (
  thing_id uuid not null references public.things(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('creator', 'member')),
  status text not null default 'pending' check (status in ('pending', 'active', 'left')),
  joined_at timestamptz,
  primary key (thing_id, user_id),
  constraint thing_members_join_consistent check (
    (status = 'pending' and joined_at is null)
    or (status in ('active', 'left') and joined_at is not null)
  )
);

create unique index thing_members_one_creator
  on public.thing_members (thing_id)
  where role = 'creator';
create index thing_members_user_status
  on public.thing_members (user_id, status);

create table public.thing_invites (
  id uuid primary key default gen_random_uuid(),
  thing_id uuid not null references public.things(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{6,32}$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint thing_invites_expiry_after_creation check (expires_at > created_at)
);

create index thing_invites_thing_status
  on public.thing_invites (thing_id, status);
create index thing_invites_active_expiry
  on public.thing_invites (expires_at)
  where status = 'active';

-- Security-definer membership checks avoid recursive thing_members RLS. They
-- expose only booleans, pin their search path and never accept a user ID.
create function public.is_active_thing_member(target_thing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.thing_members
    where thing_id = target_thing_id
      and user_id = (select auth.uid())
      and status = 'active'
  );
$$;

create function public.is_thing_creator(target_thing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.things
    where id = target_thing_id
      and created_by = (select auth.uid())
  );
$$;

revoke all on function public.is_active_thing_member(uuid) from public;
revoke all on function public.is_thing_creator(uuid) from public;
grant execute on function public.is_active_thing_member(uuid) to authenticated;
grant execute on function public.is_thing_creator(uuid) to authenticated;

-- THING is one-to-one. Lock the parent row before counting so concurrent
-- membership inserts cannot both become a third participant.
create function public.enforce_thing_member_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_count integer;
begin
  perform 1 from public.things where id = new.thing_id for update;
  select count(*) into member_count
  from public.thing_members
  where thing_id = new.thing_id;
  if member_count >= 2 then
    raise exception 'A Thing can have at most two members' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_thing_member_limit() from public;

create trigger thing_members_limit
before insert on public.thing_members
for each row execute function public.enforce_thing_member_limit();

alter table public.things enable row level security;
alter table public.thing_members enable row level security;
alter table public.thing_invites enable row level security;

revoke all on public.things, public.thing_members, public.thing_invites from anon, authenticated;

grant select on public.things, public.thing_members, public.thing_invites to authenticated;
grant insert (created_by) on public.things to authenticated;
grant update (status, charm_key, accent_color, activated_at) on public.things to authenticated;
grant insert (thing_id, user_id, role, status, joined_at) on public.thing_members to authenticated;
grant update (status, joined_at) on public.thing_members to authenticated;
grant insert (thing_id, code, created_by, expires_at) on public.thing_invites to authenticated;
grant update (status) on public.thing_invites to authenticated;

create policy things_select_member on public.things
  for select to authenticated
  using (created_by = (select auth.uid()) or public.is_active_thing_member(id));

create policy things_insert_creator on public.things
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and status = 'pending'
    and charm_key is null
    and accent_color is null
    and activated_at is null
  );

create policy things_update_creator on public.things
  for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy thing_members_select_related on public.thing_members
  for select to authenticated
  using (public.is_thing_creator(thing_id) or public.is_active_thing_member(thing_id));

-- Only the creator's own initial row can be inserted directly. Adding the
-- second person will be done by the future invite-acceptance transaction.
create policy thing_members_insert_creator_self on public.thing_members
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and role = 'creator'
    and status = 'active'
    and joined_at is not null
    and public.is_thing_creator(thing_id)
  );

create policy thing_members_update_self on public.thing_members
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy thing_invites_select_related on public.thing_invites
  for select to authenticated
  using (public.is_thing_creator(thing_id) or public.is_active_thing_member(thing_id));

create policy thing_invites_insert_creator on public.thing_invites
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and public.is_thing_creator(thing_id)
    and status = 'active'
    and expires_at > now()
  );

create policy thing_invites_update_creator on public.thing_invites
  for update to authenticated
  using (created_by = (select auth.uid()) and public.is_thing_creator(thing_id))
  with check (created_by = (select auth.uid()) and public.is_thing_creator(thing_id));

-- Supabase guest sessions use the authenticated database role, so every table
-- also gets an account-only restrictive policy.
create policy things_require_account on public.things
  as restrictive for all to authenticated
  using (coalesce((select auth.jwt())->>'is_anonymous', 'false') = 'false')
  with check (coalesce((select auth.jwt())->>'is_anonymous', 'false') = 'false');

create policy thing_members_require_account on public.thing_members
  as restrictive for all to authenticated
  using (coalesce((select auth.jwt())->>'is_anonymous', 'false') = 'false')
  with check (coalesce((select auth.jwt())->>'is_anonymous', 'false') = 'false');

create policy thing_invites_require_account on public.thing_invites
  as restrictive for all to authenticated
  using (coalesce((select auth.jwt())->>'is_anonymous', 'false') = 'false')
  with check (coalesce((select auth.jwt())->>'is_anonymous', 'false') = 'false');

commit;
