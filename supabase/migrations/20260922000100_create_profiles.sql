begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (
    char_length(display_name) between 1 and 50
    and display_name = btrim(display_name)
    and display_name ~ '[^[:space:]]'
    and display_name !~ '[[:cntrl:]]'
  ),
  avatar_url text,
  avatar_type text check (avatar_type in ('preset', 'upload')),
  avatar_key text,
  locale text not null default 'en' check (locale in ('en', 'es')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_avatar_consistent check (
    coalesce((avatar_type is null and avatar_url is null and avatar_key is null)
    or (avatar_type = 'preset' and avatar_url is null and avatar_key ~ '^[a-z0-9_]+$')
    or (avatar_type = 'upload' and avatar_url = id::text || '/profile' and avatar_key is null), false)
  )
);

alter table public.profiles enable row level security;

-- The public API role gets no profile access. Legacy guest sessions are also
-- denied below, even though Supabase assigns them the authenticated role.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant insert (id, display_name, avatar_url, avatar_type, avatar_key, locale) on public.profiles to authenticated;
grant update (display_name, avatar_url, avatar_type, avatar_key, locale) on public.profiles to authenticated;

create policy profiles_select_own on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

create policy profiles_insert_own on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy profiles_require_account on public.profiles
  as restrictive for all to authenticated
  using (coalesce((select auth.jwt())->>'is_anonymous', 'false') = 'false')
  with check (coalesce((select auth.jwt())->>'is_anonymous', 'false') = 'false');

create function public.set_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_profile_updated_at() from public;

create trigger profiles_updated_at
before update on public.profiles
for each row execute function public.set_profile_updated_at();

-- Intentionally no signup trigger: a profile requires explicit form submission.

-- Public reads let the other person see the chosen photo later. Object writes
-- are restricted to one normalized path per authenticated user; upsert replaces
-- the same object rather than accumulating filenames.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy avatars_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and name = (select auth.uid())::text || '/profile');

create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and name = (select auth.uid())::text || '/profile');

create policy avatars_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and name = (select auth.uid())::text || '/profile')
  with check (bucket_id = 'avatars' and name = (select auth.uid())::text || '/profile');

create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and name = (select auth.uid())::text || '/profile');

create policy avatars_require_account on storage.objects
  as restrictive for all to authenticated
  using (bucket_id <> 'avatars' or coalesce((select auth.jwt())->>'is_anonymous', 'false') = 'false')
  with check (bucket_id <> 'avatars' or coalesce((select auth.jwt())->>'is_anonymous', 'false') = 'false');

commit;
