begin;

-- Thing-level photo library. Moments remain unchanged until a later migration
-- links curated memories to one or more records from this table.
create table public.thing_photos (
  id uuid primary key default gen_random_uuid(),
  thing_id uuid not null references public.things(id) on delete cascade,
  uploaded_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  storage_path text not null unique,
  original_filename text,
  mime_type text not null,
  width integer,
  height integer,
  file_size_bytes bigint,
  content_hash text,
  uploaded_at timestamptz not null default now(),
  taken_at timestamptz,
  latitude double precision,
  longitude double precision,
  exif_available boolean not null default false,
  created_at timestamptz not null default now(),
  constraint thing_photos_storage_path_check check (
    storage_path ~ ('^' || thing_id::text || '/' || id::text || '/original\.(jpg|jpeg|png|webp)$')
  ),
  constraint thing_photos_original_filename_check check (
    original_filename is null or (
      original_filename = btrim(original_filename)
      and char_length(original_filename) between 1 and 255
      and original_filename !~ '[[:cntrl:]]'
    )
  ),
  constraint thing_photos_mime_type_check check (
    (mime_type = 'image/jpeg' and storage_path ~* '\.(jpg|jpeg)$')
    or (mime_type = 'image/png' and storage_path ~* '\.png$')
    or (mime_type = 'image/webp' and storage_path ~* '\.webp$')
  ),
  constraint thing_photos_width_check check (width is null or width > 0),
  constraint thing_photos_height_check check (height is null or height > 0),
  constraint thing_photos_file_size_check check (file_size_bytes is null or file_size_bytes > 0),
  constraint thing_photos_content_hash_check check (
    content_hash is null or (content_hash = btrim(content_hash) and char_length(content_hash) > 0)
  ),
  constraint thing_photos_latitude_check check (latitude is null or latitude between -90 and 90),
  constraint thing_photos_longitude_check check (longitude is null or longitude between -180 and 180)
);

create index thing_photos_thing_uploaded_at
  on public.thing_photos(thing_id, uploaded_at desc, id);

create unique index thing_photos_thing_content_hash_unique
  on public.thing_photos(thing_id, content_hash)
  where content_hash is not null;

alter table public.thing_photos enable row level security;
revoke all on public.thing_photos from public, anon, authenticated;
grant select, insert, delete on public.thing_photos to authenticated;

create policy thing_photos_select_members
  on public.thing_photos for select to authenticated
  using (public.is_active_thing_member(thing_id));

create policy thing_photos_insert_members
  on public.thing_photos for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and public.is_active_thing_member(thing_id)
    and exists (
      select 1 from public.things t
      where t.id = thing_id and t.status = 'active'
    )
  );

create policy thing_photos_delete_uploader
  on public.thing_photos for delete to authenticated
  using (uploaded_by = auth.uid() and public.is_active_thing_member(thing_id));

-- Reuse the existing private bucket. The original Moments policies continue
-- serving {thing_id}/{author_id}/{uuid}.ext without modification.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values('thing-moments', 'thing-moments', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;

-- The legacy policies identify a Moment author by path segment two. In the
-- new format that segment is a photo ID, so keep those policies strictly on
-- legacy objects and let the metadata-backed policies below own original.ext.
drop policy if exists thing_moments_storage_insert on storage.objects;
create policy thing_moments_storage_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'thing-moments'
    and split_part(name, '/', 2) = auth.uid()::text
    and split_part(name, '/', 3) !~* '^original\.(jpg|jpeg|png|webp)$'
    and exists (
      select 1
      from public.thing_members m
      join public.things t on t.id = m.thing_id
      where m.thing_id::text = split_part(name, '/', 1)
        and m.user_id = auth.uid()
        and m.status = 'active'
        and t.status = 'active'
    )
  );

drop policy if exists thing_moments_storage_delete on storage.objects;
create policy thing_moments_storage_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'thing-moments'
    and split_part(name, '/', 2) = auth.uid()::text
    and split_part(name, '/', 3) !~* '^original\.(jpg|jpeg|png|webp)$'
    and exists (
      select 1
      from public.thing_members m
      where m.thing_id::text = split_part(name, '/', 1)
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );

-- A photo row is created first. Storage then accepts only its exact path from
-- its uploader. This prevents arbitrary member-owned objects in a Thing path.
create policy thing_photos_storage_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'thing-moments'
    and exists (
      select 1
      from public.thing_photos p
      join public.things t on t.id = p.thing_id
      where p.storage_path = name
        and p.uploaded_by = auth.uid()
        and t.status = 'active'
        and public.is_active_thing_member(p.thing_id)
    )
  );

-- Delete the Storage object before deleting its metadata row. Only the user
-- recorded as uploaded_by can remove the new-format object in V1.
create policy thing_photos_storage_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'thing-moments'
    and exists (
      select 1
      from public.thing_photos p
      where p.storage_path = name
        and p.uploaded_by = auth.uid()
        and public.is_active_thing_member(p.thing_id)
    )
  );

commit;
