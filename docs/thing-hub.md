# Thing Space

`/thing/[thingId]` is the Space: the canonical shared universe for exactly two members. It centers the accepted Charm and optional nickname, keeps the current Hangout action prominent, and grows through activity, souvenirs, moment previews, chat fragments and compact milestones. Hot prompt content never appears in activity.

Chat and Moments remain focused destinations at `/thing/[thingId]/chat` and `/thing/[thingId]/moments`, with small member-authorized previews inside the Space. The legacy `/thing/[thingId]/space` deep link redirects to the canonical Thing route.

The `•••` sheet contains the shared nickname, Charm proposal, color and end controls. `update_thing_nickname` trims the value, converts blank input to `NULL`, enforces 30 characters and authorizes from the current Supabase account. The lobby uses the nickname first and falls back to the two display names.

An open Hangout remains unique per Thing. Its second member joins the configured session rather than creating another one. The Play screen is a progressive engine → situation → duration ritual; duration is presentation-only in this release, so existing engine behavior and result semantics remain unchanged.
