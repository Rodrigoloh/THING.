# Hangout foundation

Migration `20260922000500_thing_home_hangouts_foundation.sql` adds the durable entry/setup layer. Additive migration `20260922000600_same_brain_results_space.sql` completes Same Brain while leaving the other three engines at their existing foundation states.

## Same Brain

`start_same_brain` selects eight distinct active, non-adult prompts on the server and creates numbered rounds once. Every round moves `pending → answering → revealed`. Each participant can submit one `a`/`b` answer; the Hangout row lock and unique `(round_id, user_id)` constraint make simultaneous and repeated requests safe. The second answer reveals both selections atomically. `same_brain_snapshot` returns only the caller's answer until reveal, then returns both answers. Refreshing or reopening rebuilds the UI from this snapshot.

After a revealed round, `advance_same_brain_round` activates the next one. Advancing round eight completes the Hangout, writes `hangout_results`, copies the compact result to the existing `hangouts.result`, and unlocks qualifying souvenirs. The stored result includes raw matches/rounds plus `match_rate` and `best_match_streak`; no winner or compatibility score is calculated.

The client polls every 2.5 seconds only while it is waiting/revealing, with an immediate refresh when the tab becomes visible. Realtime is unnecessary for this MVP.

## Thing Home and lifecycle

`things.color_key` stores one of eight closed palette keys. Either active member can change it through `update_thing_color`; direct table mutation remains blocked. `end_thing` locks the Thing, accepts calls only from members, is idempotent once disconnected, preserves all rows and abandons unfinished Hangouts. A disconnected Thing remains readable under Past Things and cannot create new Hangouts.

Active Home shows the shared Charm/color/names, Start a Hangout, the functional Space entry, up to five real recent Hangouts and a compact settings menu. No sample activity is generated.

## Tables

- `hangouts`: Thing, game type, lifecycle state, optional shared Hot level/mode, timestamps and reserved result JSON.
- `hangout_members`: the exact two Thing participants plus private-batch readiness.
- `hot_consents`: each member's own maximum level. Raw rows are selectable only by their owner.
- `hot_deck_cards`: private Our Deck cards with deck/drawn/discard state. Direct selection exposes only a member's own cards.

## RPC boundary

- `update_thing_color(thing_id, color_key)`
- `end_thing(thing_id)`
- `hot_setup_snapshot(thing_id)`
- `set_hot_consent(thing_id, level)`
- `create_hangout(thing_id, game_type, hot_mode)`
- `hangout_snapshot(hangout_id)`
- `add_hot_deck_card(hangout_id, content)`
- `ready_hot_batch(hangout_id)`

All mutators derive the account from Supabase Auth, lock the parent Thing/Hangout where state can race, validate closed values in PostgreSQL and require membership. `hangout_snapshot` reports counts/readiness but never card content or `created_by`.

## Hot and Our Deck

Flirty, Bold and Spicy map to an ordered server-side level. The shared level exists only after both people choose and is the lower choice. The snapshot does not name whose choice established it. Our Deck can be created only while the shared level is Spicy. Lowering consent abandons unfinished Our Deck setups immediately.

Each Our Deck participant can submit exactly three private cards and mark their batch ready. Once both batches are ready the Hangout becomes `ready`. Card drawing, randomization, discard reuse, batch renewal, keep-going/skip/stop controls, Know Me, This or That and full Hot gameplay are intentionally deferred; the stored card-state and lifecycle fields support that next step.

## Deployment

Apply migration 005 once after migration 004 and migration 006 once after 005, then deploy the matching application commit. They add no environment variables, Auth redirects, email-template changes, service key or Realtime publication.
