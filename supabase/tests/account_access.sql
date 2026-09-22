-- Run after the migration on a development project. All fixtures roll back.
begin;
insert into auth.users (id) values ('44444444-4444-4444-8444-444444444444');
insert into public.profiles (id, display_name) values ('44444444-4444-4444-8444-444444444444', 'Legacy fixture');
insert into storage.objects (bucket_id, name) values ('avatars', '44444444-4444-4444-8444-444444444444/profile');

set local role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated","is_anonymous":true}', true);
do $$
declare affected integer;
begin
  if exists (select 1 from public.profiles) then raise exception 'Guest read a profile'; end if;
  update public.profiles set display_name = 'Forbidden';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Guest updated a profile'; end if;
  begin
    insert into public.profiles (id, display_name) values (auth.uid(), 'Forbidden');
    raise exception 'Guest inserted a profile';
  exception when insufficient_privilege then null;
  end;
  if exists (select 1 from storage.objects where bucket_id = 'avatars') then raise exception 'Guest read private object metadata'; end if;
  update storage.objects set name = name where bucket_id = 'avatars';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Guest replaced an avatar'; end if;
  delete from storage.objects where bucket_id = 'avatars';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Guest deleted an avatar'; end if;
  begin
    insert into storage.objects (bucket_id, name) values ('avatars', auth.uid()::text || '/profile');
    raise exception 'Guest uploaded an avatar';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated","is_anonymous":false}', true);
do $$
begin
  if (select count(*) from public.profiles) <> 1 then raise exception 'Verified account cannot read its profile'; end if;
  if (select count(*) from storage.objects where bucket_id = 'avatars') <> 1 then raise exception 'Verified account cannot read its avatar'; end if;
  begin
    update public.profiles set avatar_type = 'upload', avatar_url = null;
    raise exception 'Incomplete upload passed the constraint';
  exception when check_violation then null;
  end;
  begin
    update public.profiles set avatar_type = 'preset', avatar_key = null;
    raise exception 'Incomplete preset passed the constraint';
  exception when check_violation then null;
  end;
  begin
    update public.profiles set avatar_type = null, avatar_url = auth.uid()::text || '/profile';
    raise exception 'Missing avatar type passed the constraint';
  exception when check_violation then null;
  end;
end;
$$;
reset role;
rollback;
