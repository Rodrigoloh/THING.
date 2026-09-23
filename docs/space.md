# Space V1

Space is the shared scrapbook/stat surface for a Thing. Migration `20260922000600_same_brain_results_space.sql` replaces the placeholder with a member-only snapshot containing the shared Charm, names and color; completed-Hangout summary; Same Brain lifetime stats; and persistent souvenirs. Know Me, This or That and Hot intentionally show empty cards until their engines produce durable results.

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
