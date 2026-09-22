-- Run after both migrations on a development project. All fixtures roll back.
begin;

insert into auth.users (id) values
  ('51111111-1111-4111-8111-111111111111'),
  ('52222222-2222-4222-8222-222222222222'),
  ('53333333-3333-4333-8333-333333333333');

set local role authenticated;
select set_config('request.jwt.claim.sub', '51111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"51111111-1111-4111-8111-111111111111","role":"authenticated","is_anonymous":false}', true);

insert into public.things (created_by)
values (auth.uid());

do $$
declare
  own_thing_id uuid;
  affected integer;
begin
  select id into own_thing_id from public.things where created_by = auth.uid();
  if own_thing_id is null then raise exception 'Creator cannot read the new Thing'; end if;

  insert into public.thing_members (thing_id, user_id, role, status, joined_at)
  values (own_thing_id, auth.uid(), 'creator', 'active', now());

  insert into public.thing_invites (thing_id, code, created_by, expires_at)
  values (own_thing_id, 'ABC123', auth.uid(), now() + interval '1 day');

  if (select count(*) from public.thing_members where thing_id = own_thing_id) <> 1 then
    raise exception 'Creator membership is not visible';
  end if;
  if (select count(*) from public.thing_invites where thing_id = own_thing_id) <> 1 then
    raise exception 'Creator invite is not visible';
  end if;

  update public.things
  set status = 'active', activated_at = now(), charm_key = 'star_yellow', accent_color = '#AABBCC'
  where id = own_thing_id;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Creator could not activate the Thing'; end if;

  begin
    insert into public.thing_invites (thing_id, code, created_by, expires_at)
    values (own_thing_id, 'TOOSOON', auth.uid(), now() - interval '1 minute');
    raise exception 'Accepted an already-expired invite';
  exception when check_violation or insufficient_privilege then null;
  end;

  begin
    update public.things set created_by = '52222222-2222-4222-8222-222222222222' where id = own_thing_id;
    raise exception 'Changed Thing ownership';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;

-- Simulate the future trusted invite-acceptance transaction adding member two.
insert into public.thing_members (thing_id, user_id, role, status, joined_at)
select id, '52222222-2222-4222-8222-222222222222', 'member', 'active', now()
from public.things
where created_by = '51111111-1111-4111-8111-111111111111';

do $$
declare own_thing_id uuid;
begin
  select id into own_thing_id from public.things where created_by = '51111111-1111-4111-8111-111111111111';
  begin
    insert into public.thing_members (thing_id, user_id, role, status, joined_at)
    values (own_thing_id, '53333333-3333-4333-8333-333333333333', 'member', 'active', now());
    raise exception 'Added a third Thing member';
  exception when check_violation then null;
  end;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '52222222-2222-4222-8222-222222222222', true);
select set_config('request.jwt.claims', '{"sub":"52222222-2222-4222-8222-222222222222","role":"authenticated","is_anonymous":false}', true);

do $$
declare
  shared_thing_id uuid;
begin
  select id into shared_thing_id from public.things;
  if shared_thing_id is null then raise exception 'Active member cannot read the shared Thing'; end if;
  if (select count(*) from public.thing_members where thing_id = shared_thing_id) <> 2 then
    raise exception 'Active member cannot see both memberships';
  end if;
  if (select count(*) from public.thing_invites where thing_id = shared_thing_id) <> 1 then
    raise exception 'Active member cannot see Thing invites';
  end if;

  begin
    insert into public.thing_invites (thing_id, code, created_by, expires_at)
    values (shared_thing_id, 'MEMBER1', auth.uid(), now() + interval '1 day');
    raise exception 'Non-creator created an invite';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.things set charm_key = 'moon_purple' where id = shared_thing_id;
    if found then raise exception 'Non-creator updated the Thing'; end if;
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '53333333-3333-4333-8333-333333333333', true);
select set_config('request.jwt.claims', '{"sub":"53333333-3333-4333-8333-333333333333","role":"authenticated","is_anonymous":false}', true);

do $$
begin
  if exists (select 1 from public.things) then raise exception 'Unrelated user read a Thing'; end if;
  if exists (select 1 from public.thing_members) then raise exception 'Unrelated user read memberships'; end if;
  if exists (select 1 from public.thing_invites) then raise exception 'Unrelated user read invite codes'; end if;
end;
$$;

select set_config('request.jwt.claim.sub', '51111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"51111111-1111-4111-8111-111111111111","role":"authenticated","is_anonymous":true}', true);

do $$
begin
  if exists (select 1 from public.things) then raise exception 'Guest session read a Thing'; end if;
  if exists (select 1 from public.thing_members) then raise exception 'Guest session read memberships'; end if;
  if exists (select 1 from public.thing_invites) then raise exception 'Guest session read invites'; end if;
  begin
    insert into public.things (created_by) values (auth.uid());
    raise exception 'Guest session created a Thing';
  exception when insufficient_privilege then null;
  end;
end;
$$;

set local role anon;
do $$
begin
  begin
    perform 1 from public.things;
    raise exception 'Unauthenticated role read Things';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
rollback;
