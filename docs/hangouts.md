# Hangout foundation

Migration `20260922000500_thing_home_hangouts_foundation.sql` adds the durable entry/setup layer. Migration 006 completes Same Brain, migration 007 guarantees one shared session, migration 008 adds the remaining engines, and migration 009 refines Hot interaction/content plus Know Me discovery.

## Same Brain

`start_same_brain` selects eight distinct active, non-adult prompts on the server and creates numbered rounds once. Every round moves `pending → answering → revealed`. Each participant can submit one `a`/`b` answer; the Hangout row lock and unique `(round_id, user_id)` constraint make simultaneous and repeated requests safe. The second answer reveals both selections atomically. `same_brain_snapshot` returns only the caller's answer until reveal, then returns both answers. Refreshing or reopening rebuilds the UI from this snapshot.

After a revealed round, `advance_same_brain_round` activates the next one. Advancing round eight completes the Hangout, writes `hangout_results`, copies the compact result to the existing `hangouts.result`, and unlocks qualifying souvenirs. The stored result includes raw matches/rounds plus `match_rate` and `best_match_streak`; no winner or compatibility score is calculated.

The client polls every 2.5 seconds while it is waiting/revealing, with an immediate refresh when the tab becomes visible. Realtime is unnecessary for this MVP.

## One shared open Hangout

Migration `20260922000700_shared_hangouts_and_theme.sql` adds a partial unique index on `hangouts(thing_id)` for `setup`, `waiting`, `ready` and `active`. Before creating the index it preserves the oldest existing open session and marks any duplicate open rows abandoned. Completed and abandoned rows never block a new Hangout.

`create_hangout` locks the parent Thing. It creates and joins the caller when no session exists, returns and joins the same session for a matching simultaneous request, and returns a structured conflict pointing at the existing session for a different game. `join_hangout` is explicit and idempotent for the normal incoming CTA. Both functions derive the account, require an active parent Thing and accept only its two members. The creator can initialize Same Brain immediately; eight rounds are created once and the game waits until the second member joins, then becomes active. Refresh and the Thing-page polling resume the same database session.

The shared `HangoutShell` supplies the compact back/title row and Thing theme tokens. Same Brain keeps its existing scoring and reveal behavior while using the shell, whitespace-led layout, large answer targets and themed selection/progress accents.

## Cancel and abandon

Every open Hangout exposes a secondary Cancel/End action. `abandon_hangout` locks the Hangout, accepts either active Thing member, changes only `setup`, `waiting`, `ready` or `active` to `abandoned`, and is idempotent after abandonment. Completed sessions are immutable. Partial rounds and answers remain for audit/debugging, but no `hangout_results` row is created, so abandonment never affects stats, streaks, activity or KitKat unlock.

Both clients poll the authoritative snapshot every 2.5 seconds. When either member abandons, the other returns to the canonical Thing page and the partial unique index immediately permits a new Hangout.

## Shared engine pattern

Know Me and This or That reuse `hangout_rounds`, private `hangout_answers`, the same `pending → answering → revealed` lifecycle and one shared set of eight server-selected prompts. Know Me assigns asymmetric subject/predictor roles and supports a subject-only optional explanation after reveal. Their start and advance operations are idempotent and the final advance writes one durable result before releasing the Thing.

Hot also uses the common rounds/answers tables, with a stored `hangouts.context`, per-round level and private escalation tables. Migration 009 adds subject alternation, durable reveals/reactions, exact approved level pools and lightweight recent-Hangout exclusion. See [Hot](hot.md) and [prompt import](prompts.md).

## Thing Home and lifecycle

`things.color_key` stores one of eight closed palette keys. Either active member can change it through `update_thing_color`; direct table mutation remains blocked. `end_thing` locks the Thing, accepts calls only from members, is idempotent once disconnected, preserves all rows and abandons unfinished Hangouts. A disconnected Thing remains readable under Past Things and cannot create new Hangouts.

Active Home shows the shared Charm/color/names, Start a Hangout, the functional Space entry, up to five real recent Hangouts and a compact settings menu. No sample activity is generated.

## Tables

- `hangouts`: Thing, game type, lifecycle state, Hot context/current level/gate, timestamps and compact result JSON.
- `hangout_members`: the exact two Thing participants plus private-batch readiness.
- `hot_consents`: each member's own maximum level. Raw rows are selectable only by their owner.
- `hot_deck_cards`: private Our Deck cards with deck/drawn/discard state. Direct selection exposes only a member's own cards.
- `hangout_rounds` / `hangout_answers` / `hangout_results`: shared engine rounds, private answers and completed-only results.
- `hangout_level_gates` / `hangout_level_votes`: resolved gates and private per-member Hot votes; clients cannot select either table.
- `hot_reveals` / `hot_reactions`: member-only Hot payoff and use-it state used for resume and callbacks.
- `know_me_explanations`: optional subject-authored, member-only text attached to a revealed Know Me round.

## RPC boundary

- `update_thing_color(thing_id, color_key)`
- `end_thing(thing_id)`
- `hot_setup_snapshot(thing_id)`
- `set_hot_consent(thing_id, level)`
- `create_hangout(thing_id, game_type, hot_mode, context)`
- `join_hangout(hangout_id)` / `abandon_hangout(hangout_id)`
- `hangout_snapshot(hangout_id)`
- engine-specific start, snapshot, submit, advance and complete RPCs documented in the engine pages
- `add_hot_deck_card(hangout_id, content)`
- `ready_hot_batch(hangout_id)`

All mutators derive the account from Supabase Auth, lock the parent Thing/Hangout where state can race, validate closed values in PostgreSQL and require membership. `hangout_snapshot` reports counts/readiness but never card content or `created_by`.

## Hot and legacy Our Deck

The existing private Our Deck batch foundation remains compatible: it still requires the legacy shared Spicy consent, hides card authors/content from the other member and is abandoned if consent drops. New standard Hot sessions use the context/escalation flow in [Hot V1](hot.md); they always start Flirty and never read legacy upfront limits.

Each Our Deck participant can submit exactly three private cards and mark their batch ready. Once both batches are ready the Hangout becomes `ready`. Card drawing, randomization, discard reuse and batch renewal remain deferred.

## Deployment

Apply migration 009 after 008, import the approved master prompt export with the documented script, then deploy the matching application commit. No Realtime publication is required. The service-role key is needed only by the trusted import process and must never be added to Vercel's public environment.
