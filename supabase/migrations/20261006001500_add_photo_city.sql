begin;

alter table public.thing_photos
  add column if not exists location_city text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.thing_photos'::regclass
      and conname = 'thing_photos_location_city_check'
  ) then
    alter table public.thing_photos
      add constraint thing_photos_location_city_check
      check (
        location_city is null or (
          location_city = btrim(location_city)
          and char_length(location_city) between 1 and 80
          and location_city !~ '[[:cntrl:]]'
        )
      );
  end if;
end
$$;

comment on column public.thing_photos.location_city is
  'Private cached city label derived server-side from coarse EXIF coordinates.';

commit;
