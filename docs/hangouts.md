# Hangout foundation

Migration `20260922000500_thing_home_hangouts_foundation.sql` adds the durable entry/setup layer for Hangouts without pretending the four game engines are complete.

## Thing Home and lifecycle

`things.color_key` stores one of eight closed palette keys. Either active member can change it through `update_thing_color`; direct table mutation remains blocked. `end_thing` locks the Thing, accepts calls only from members, is idempotent once disconnected, preserves all rows and abandons unfinished Hangouts. A disconnected Thing remains readable under Past Things and cannot create new Hangouts.

Active Home shows the shared Charm/color/names, Start a Hangout, the existing Space placeholder, up to five real recent Hangouts and a compact settings menu. No sample activity is generated.

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

Each Our Deck participant can submit exactly three private cards and mark their batch ready. Once both batches are ready the Hangout becomes `ready`. Card drawing, randomization, discard reuse, batch renewal, keep-going/skip/stop controls and the four full play/result engines are intentionally deferred; the stored card-state and lifecycle fields support that next step.

## Deployment

Apply migration 005 once after migration 004, then deploy the matching application commit. It adds no environment variables, Auth redirects, email-template changes, service key or Realtime publication.
