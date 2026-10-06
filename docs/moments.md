# Moments V1

`/thing/[thingId]/moments` is a private shared camera roll with optional 140-character captions. JPEG, PNG and WebP files up to 5 MiB are accepted after MIME, size and magic-byte validation.

The private `thing-moments` bucket stores objects at `{thing_id}/{author_id}/{uuid}.{ext}`. Storage policies read the Thing ID from the first segment and permit reads only to active members; writes and deletion additionally require the authenticated author segment. Metadata in `moments` has matching RLS. The server returns one-hour signed URLs and removes an uploaded object if metadata insertion fails.

V1 has no likes, comments, public links, albums or filters.

## Thing photo foundation

Migration 012 adds `thing_photos` as the Thing-level Gallery source without changing this V1 Moments flow. New Gallery objects use the same private bucket with the distinct path `{thing_id}/{photo_id}/original.ext`; their metadata includes dimensions, file size, optional capture/location data and an optional content hash for per-Thing duplicate detection.

For future Gallery uploads, generate the photo UUID first, insert the matching `thing_photos` row, then upload its object. Storage accepts only an exact metadata-backed path owned by the current account. Deletion uses the reverse order: remove the object first, then delete its metadata row.

The current batch control lives on the Moments route without redesigning the Gallery. It accepts up to 50 JPEG, PNG or WebP files, validates a 20 MiB per-file limit and image signatures in the browser, hashes each accepted file with SHA-256, and uploads files one at a time. Failures remain isolated and retryable. The server validates and hashes each file again before creating metadata and uploading its object.

JPEG uploads also attempt server-side EXIF extraction with `exifr`. When present and valid, `DateTimeOriginal`, GPS latitude/longitude and orientation are stored alongside dimensions read from the image. PNG and WebP retain dimensions without inventing EXIF. Missing or malformed metadata leaves `taken_at`, coordinates and orientation null and `exif_available = false`; parsing errors never fail the photo upload. `taken_at` is the capture time and remains independent from the database-generated `uploaded_at`.

EXIF and raw coordinates inherit `thing_photos` member-only RLS. They are not copied into activity, public discovery or unauthenticated responses, and this task performs no reverse geocoding.

## Shared Gallery

`/thing/[thingId]/moments` now separates curated Moments from the complete shared Gallery. The Gallery queries every `thing_photos` row for the current Thing in pages, signs the private objects in bounded batches, and renders one dense camera roll for both members. It never divides photos by uploader. Rows are ordered by the effective photo date (`taken_at`, falling back to `uploaded_at`) and grouped by that date's UTC month and year.

Selection mode keeps a set of stable photo IDs and exposes a selection-change hook for later Moment creation or download work. ZIP download and multi-photo Moment creation remain deferred.

Gallery images currently use one-hour signed URLs for the original private objects with browser lazy loading. This preserves access control but can download a 10–20 MiB original when a cell enters the viewport. A later thumbnail pipeline should create small derivatives and store or resolve their private paths; the grid can then switch URLs without changing the `thing_photos` source model.

Tapping a grid image outside selection mode opens a mobile-first fullscreen viewer. It preserves Gallery order, supports onscreen previous/next controls, horizontal swipe, desktop arrow keys and Escape/close. The main image uses the same signed private original with `object-contain`, so portrait and landscape files are not cropped. Metadata prefers `taken_at`; otherwise it identifies the displayed date as the upload date. Uploader IDs resolve against the authorized Thing member snapshot. The server converts an available GPS pair into a neutral `location saved` boolean and does not send raw coordinates to the viewer.

The viewer exposes an original download and an `onMakeMoment` hook. Download does not reuse the display URL: every request revalidates the Supabase user, their active Thing membership and the photo's matching `thing_id`, then signs the exact `storage_path` for two minutes with a download disposition. Safe original filenames are preserved; unsafe characters are replaced and a missing name becomes `thing-photo-{photoId}.{ext}`. Browser navigation to that private URL uses the device's normal download handling on Android, iOS and desktop. Any authorization or Storage failure returns only the generic retry message. Until Gallery photos can be linked into curated Moments, the default make-a-Moment action displays a deferred-state message rather than copying or rewriting photo data.

Photo activity is deferred. Existing activity is derived from completed Hangouts and has no generic grouped-event model, so this foundation does not create one event per photo or introduce an unrelated activity table.

Existing `moments.storage_path` values and `{thing_id}/{author_id}/{uuid}.ext` objects remain valid and are not copied or rewritten. A later migration can introduce a Moment-to-photo join table, migrate existing Moment images into `thing_photos`, and allow one curated Moment to reference multiple Gallery photos. Until then, Moments and Thing photos are intentionally separate models.
