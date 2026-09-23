# Moments V1

`/thing/[thingId]/moments` is a private shared camera roll with optional 140-character captions. JPEG, PNG and WebP files up to 5 MiB are accepted after MIME, size and magic-byte validation.

The private `thing-moments` bucket stores objects at `{thing_id}/{author_id}/{uuid}.{ext}`. Storage policies read the Thing ID from the first segment and permit reads only to active members; writes and deletion additionally require the authenticated author segment. Metadata in `moments` has matching RLS. The server returns one-hour signed URLs and removes an uploaded object if metadata insertion fails.

V1 has no likes, comments, public links, albums or filters.
