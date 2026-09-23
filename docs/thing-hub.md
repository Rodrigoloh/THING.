# Thing Hub

`/thing/[thingId]` is the shared home for exactly two members. It centers the accepted Charm and optional nickname, shows member names, exposes the current Hangout action and links to Play, Chat, Moments and Space. It shows only result summaries; Hot prompt content never appears in activity.

The `•••` sheet contains the shared nickname, Charm proposal, color and end controls. `update_thing_nickname` trims the value, converts blank input to `NULL`, enforces 30 characters and authorizes from the current Supabase account. The lobby uses the nickname first and falls back to the two display names.

An open Hangout remains unique per Thing. Its second member joins the configured session rather than creating another one. The Play screen is a progressive engine → situation → duration ritual; duration is presentation-only in this release, so existing engine behavior and result semantics remain unchanged.
