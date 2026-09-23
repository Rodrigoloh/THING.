# Space V1

Space is the growing shared content of the canonical `/thing/[thingId]` page. Migration `20260922000600_same_brain_results_space.sql` supplies its member-only stats/souvenir snapshot; migration 007 folds that content into the Thing instead of maintaining a duplicate dashboard route. `/thing/[thingId]/space` remains as a compatibility redirect to the canonical page.

The page flows vertically: minimal `THING. / •••` bar, medium shared Charm and names, up to four real quick stats, the strongest current Hangout action, result-aware recent activity, then persistent souvenirs. Settings, color swatches and destructive ending live only in the `•••` sheet. The layout leaves room below for future shared objects without implementing them now.

## Results and stats

`hangout_results` is the durable generic result source. Same Brain stores `rounds_played` plus raw `matches` and `rounds` inside `result_json`, so lifetime percentages are calculated from summed numerators and denominators rather than averaged percentages. `space_snapshot` counts only Hangouts in `complete` state and derives:

- completed Hangouts;
- total Same Brain rounds and matches;
- lifetime match rate;
- best session match rate;
- best consecutive match streak.

No compatibility or relationship-health score exists.

## Shared streak

A streak is a run of UTC calendar dates with at least one completed Hangout. Multiple completions on one UTC date count once. Consecutive dates extend a run; a skipped date starts the next completion at one. The current streak remains current when its last date is today or yesterday UTC, then displays zero until another completion. `best_streak` preserves the longest historical run. UTC is the documented MVP behavior until profiles gain a shared timezone.

## Souvenirs

Souvenirs are unique per `(thing_id, souvenir_key)` and keep the source Hangout, unlock time and result metadata. Inserts use conflict-safe one-time unlocks:

- `FIRST_THOUGHT`: first completed Same Brain Hangout.
- `SAME_BRAIN`: at least three consecutive matches in one session.
- `LOCKED_IN`: at least five consecutive matches.
- `PERFECT_SYNC`: eight matches out of eight.

They are quiet persistent objects in Space, not competitive rewards.

## Security and deferred work

All mutations run through locked security-definer RPCs that derive the Supabase account. RLS lets Hangout participants read rounds/results, hides the other answer until reveal and blocks direct client writes. Outsiders cannot read the Space snapshot, results or souvenirs.

Deferred work includes the remaining three game engines, Realtime, full prompt-library import, freeform draggable Space, advanced analytics, public discovery and rewards.

## Thing theme

The accepted Charm initially maps cherry → cherry, moon → electric blue, spark → butter and clover → acid. `things.color_source` records `charm` or `manual`; `update_thing_color` sets it to manual so later Charm work cannot replace an explicit shared choice. Existing active Things are conservatively marked manual during migration 007 to preserve their current appearance.

`ThingTheme` publishes `--thing-primary`, readable `--thing-on-primary` and derived soft/text/border/active tokens. The unified page, Hangout selector and Hangout shell consume those tokens while the base page remains neutral. Light accents use dark CTA text and darker accents use light CTA text.
