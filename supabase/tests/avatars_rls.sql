-- Run on a development database after the migration; all fixture objects roll back.
begin;

insert into auth.users (id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'avatars' and public and file_size_limit = 5242880) then
    raise exception 'avatars bucket must be public with a 5 MB limit';
  end if;
  if not exists (select 1 from storage.buckets where id = 'avatars' and allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp']) then
    raise exception 'avatars bucket MIME allowlist is incomplete';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

do $$
declare affected integer;
begin
  if current_user <> 'authenticated' then raise exception 'Test must run as authenticated'; end if;

  insert into storage.objects (bucket_id, name)
  values ('avatars', '11111111-1111-4111-8111-111111111111/profile');

  if not exists (select 1 from storage.objects where bucket_id = 'avatars' and name = '11111111-1111-4111-8111-111111111111/profile') then
    raise exception 'Own avatar upload/read failed';
  end if;

  update storage.objects set name = name
  where bucket_id = 'avatars' and name = '11111111-1111-4111-8111-111111111111/profile';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Own avatar replacement failed'; end if;

  begin
    insert into storage.objects (bucket_id, name)
    values ('avatars', '22222222-2222-4222-8222-222222222222/profile');
    raise exception 'Inserted into another user folder';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into storage.objects (bucket_id, name)
    values ('avatars', '11111111-1111-4111-8111-111111111111/another-file');
    raise exception 'Inserted an arbitrary file in own folder';
  exception when insufficient_privilege then null;
  end;

  begin
    update storage.objects set name = '22222222-2222-4222-8222-222222222222/profile'
    where bucket_id = 'avatars' and name = '11111111-1111-4111-8111-111111111111/profile';
    raise exception 'Moved avatar into another folder';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);

do $$
declare affected integer;
begin
  if exists (select 1 from storage.objects where bucket_id = 'avatars') then
    raise exception 'Object metadata leaked to another user';
  end if;
  update storage.objects set name = name
  where bucket_id = 'avatars' and name = '11111111-1111-4111-8111-111111111111/profile';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Other user replaced avatar'; end if;
  delete from storage.objects
  where bucket_id = 'avatars' and name = '11111111-1111-4111-8111-111111111111/profile';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Other user deleted avatar'; end if;
end;
$$;

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
delete from storage.objects
where bucket_id = 'avatars' and name = '11111111-1111-4111-8111-111111111111/profile';

do $$
begin
  if exists (select 1 from storage.objects where bucket_id = 'avatars') then raise exception 'Own avatar deletion failed'; end if;
end;
$$;

reset role;
rollback;