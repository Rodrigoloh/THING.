-- Run against a development database after the migration. All fixtures roll back.
begin;

insert into auth.users (id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222'),
  ('33333333-3333-4333-8333-333333333333');

do $$
begin
  if exists (select 1 from public.profiles where id in (
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333'
  )) then raise exception 'Profiles must not be created automatically'; end if;
end;
$$;

insert into public.profiles (id, display_name, locale)
values ('22222222-2222-4222-8222-222222222222', 'Other test user', 'en');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

do $$
declare affected integer;
begin
  if current_user <> 'authenticated' then raise exception 'Test must run as authenticated'; end if;
  if exists (select 1 from public.profiles) then raise exception 'Read leaked another profile'; end if;

  insert into public.profiles (id, display_name, locale)
  values (auth.uid(), 'Own test user', 'es');

  if not exists (select 1 from public.profiles where id = auth.uid() and locale = 'es') then
    raise exception 'Own insert/read failed';
  end if;

  update public.profiles set display_name = 'Updated test user', locale = 'en' where id = auth.uid();
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Own update failed'; end if;

  update public.profiles set display_name = 'Forbidden change'
  where id = '22222222-2222-4222-8222-222222222222';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Updated another profile'; end if;

  begin
    insert into public.profiles (id, display_name)
    values ('33333333-3333-4333-8333-333333333333', 'Forbidden insert');
    raise exception 'Inserted another profile';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.profiles set id = '33333333-3333-4333-8333-333333333333' where id = auth.uid();
    raise exception 'Changed profile ownership';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.profiles set created_at = now() where id = auth.uid();
    raise exception 'Changed managed timestamps';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.profiles set display_name = '   ' where id = auth.uid();
    raise exception 'Accepted whitespace name';
  exception when check_violation then null;
  end;

  begin
    update public.profiles set locale = 'fr' where id = auth.uid();
    raise exception 'Accepted unsupported locale';
  exception when check_violation then null;
  end;

  begin
    delete from public.profiles where id = auth.uid();
    raise exception 'Client deleted a profile';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
do $$
begin
  if (select count(*) from public.profiles) <> 1 then raise exception 'Second user isolation failed'; end if;
  if not exists (select 1 from public.profiles where display_name = 'Other test user') then
    raise exception 'Other profile was modified';
  end if;
end;
$$;

set local role anon;
do $$
begin
  begin
    perform 1 from public.profiles;
    raise exception 'Unauthenticated read was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.profiles (id, display_name)
    values ('33333333-3333-4333-8333-333333333333', 'Unauthenticated');
    raise exception 'Unauthenticated insert was allowed';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
rollback;