begin;

-- Gallery photos allow 20 MiB. The private bucket and MIME allowlist remain
-- shared with legacy Moments, whose UI continues enforcing its 5 MiB limit.
update storage.buckets
set file_size_limit = 20971520,
    allowed_mime_types = array['image/jpeg','image/png','image/webp']
where id = 'thing-moments';

commit;
