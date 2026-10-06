begin;

alter table public.thing_photos
  add column orientation smallint
  constraint thing_photos_orientation_check
  check (orientation is null or orientation between 1 and 8);

commit;
