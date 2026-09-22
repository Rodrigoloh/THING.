# Thing flow

## Base and scope

This branch starts explicitly at `d64a5e1` on `origin/main` from the configured repository `Rodrigoloh/THING.` (the repository name has a trailing dot). Before editing, its migration blob was compared with the existing local draft: both are `75d248d25c3d6f8d42790d872f1685335cda2e2c`. The original migration and `supabase/tests/things_rls.sql` are unchanged. The existing OTP improvements through `9a3775a` and uncommitted functional work were integrated by comparison into this new worktree; the source checkout was not reset or overwritten.

## Supabase deployment

Apply migrations in order, once each, using the Supabase SQL Editor or your usual migration tooling:

1. `20260922000100_create_profiles.sql` — existing profiles and avatar bucket. Do not rerun if already applied.
2. `20260922000200_create_things.sql` — original Things/members/invites schema. Skip only if this exact migration is already applied.
3. `20260922000300_thing_flow.sql` — state transitions, membership seats, private Charm choices, RPC-only writes, invite privacy and RPCs.

The third migration converts existing `pending` Things to `pending_invite` or `pending_charm` according to active membership count. It retains existing active/disconnected rows. Review any legacy manually-created active rows before rollout: new RPCs only activate one of the four supported Charms after two choices match.

Do not deploy the UI before the migrations. Keep existing Supabase URL/publishable-key settings. No service-role key, Realtime publication, SMTP change or new Auth redirect URL is required. Hosted migrations are not applied by tests.

## Data and concurrency

`pending_invite → pending_charm → active` is server-owned. Each Thing has at most two unique seats (`1`, `2`), plus the original membership-limit trigger. Every join, Charm choice, cancellation and renewal locks the parent Thing first. Concurrent operations serialize; the seat constraint independently prevents a third row. Create uses a per-account advisory lock and a unique request ID to make a client retry idempotent. Accounts may have multiple Things, with a limit of ten pending invitations per creator.

Invites use random UUID-derived 32-character codes (122 random bits), expire after seven days, and are consumed atomically on acceptance. Codes are case-insensitive and whitespace-trimmed. Existing invitations are retained with their original code, expiry and status. All newly generated invitations use 122 random bits. Only the creator may read invite rows; a profiled, authenticated bearer can preview only the inviter's display name and expiry. No auto-accept on preview or login.

Each Charm round accepts one immutable choice per member: cherries, moon, spark or clover. A member can see their own choice and whether the other has chosen, never the other choice. A mismatch increments the round and clears the current selection for both; stale requests cannot vote in the next round. A match atomically sets the Charm, activation timestamp and active state. Prior choices remain private history in the table.

Expired invites can be renewed; old codes stay invalid. A creator can cancel a Thing only before the partner joins. Cancellation deletes the pending Thing and cascades its invite/membership; it cannot erase an accepted Thing.

## Policies and RPCs

Existing member/creator read policies and account-only restrictions remain on Things and memberships. Invites now have creator-only reads. `thing_charm_choices` has RLS with own-choice/member/account checks. Direct table and column write grants from the initial migration are explicitly revoked. Profile RLS remains own-profile-only; the authorized snapshot returns only both members' IDs and display names.

All security-definer functions pin an empty search path, derive identity from `auth.uid()`, and reject anonymous/guest sessions and missing profiles. PUBLIC and anon execute are revoked. `thing_account()` is internal and cannot be called by authenticated clients.

| RPC | Purpose |
| --- | --- |
| `create_thing(request_id)` | Atomically creates pending Thing, creator and invite; safe retry |
| `preview_thing_invite(code)` | Inviter preview without accepting |
| `accept_thing_invite(code)` | Locks, validates, adds second member, consumes invite |
| `choose_thing_charm(thing_id, round, charm)` | Stores hidden choice, resolves match/mismatch |
| `thing_snapshot(thing_id)` | Authorized complete screen state |
| `list_my_things()` | Real Things for the current account |
| `renew_thing_invite(thing_id)` | Replaces expired/revoked invite under lock |
| `cancel_pending_thing(thing_id)` | Creator-only cancellation before join |

## Routes and components

`/things` renders real records or the existing empty state, with an explicit retry error on read failure. `/things/new` creates only after a button press. `/join` accepts a code or full HTTP(S) invite link and extracts only its code for a local navigation; `/join/[code]` previews the inviter and requires an explicit Join. `/thing/[thingId]` displays invite waiting, Charm agreement or the real active home with both names. The old future-feature navigation is removed from this flow; no new future-feature behavior was implemented.

UI: `src/features/things/screens.tsx`, `copy.ts` (EN/ES), `model.ts`, `actions.ts`. Existing page routes delegate to these components. Data comes from authorized Supabase RPCs, using the session client and public key.

The proxy saves a validated invite code in a seven-day SameSite=Lax cookie on actual GET navigation to `/join/[code]`. Prefetch and Server Action requests do not save it. Auth/profile server and client gates use only a validated local `/join/CODE` path. It survives OTP reloads, OAuth redirects, and profile creation. Accept or Not now removes the cookie. Links use a no-referrer policy. The cookie is a continuation hint, not authentication or acceptance authority.

Pending detail and list screens refresh every three seconds while visible; reconnect/focus refreshes immediately. Active home stops polling. Server renders reauthorize every read. Offline and load/action errors are visible. Native sharing has a clipboard fallback, with a selectable full URL if clipboard permission fails.

## Automated verification

`npm test` runs the existing unit tests, invite validation tests and a real temporary PostgreSQL cluster using `embedded-postgres`. No hosted credentials or production data are used. Dependencies need install scripts enabled. On Windows an execution sandbox may block `initdb`; run the test command in a normal terminal in that case. The runner exits after all tests complete (`--test-force-exit`) because the embedded cluster library can retain Windows process/IPC handles after shutdown. The suite first awaits all connections closing, cluster stop, and deletion of its temporary directory; this flag does not skip assertions or cleanup.

The database suite applies all three migrations, creates minimal Supabase Auth/Storage metadata and JWT-role shims, and exercises the actual SQL functions/RLS. Two separate TCP connections are forced to wait on a locked row before releasing the race barrier. The unchanged original `things_rls.sql` is run after migration 002 and before migration 003, because it tests the former direct-write API. Coverage after migration 003 includes creation rollback, expiry while waiting for a lock, atomic/idempotent creation, expiry, preview, explicit acceptance, own/reused/unknown/revoked invite rejection, two acceptors racing, third-member denial, table/column write denial, outsider privacy, hidden/immutable choices, mismatch reset, stale rounds, simultaneous matching choices, activation, guest and missing-profile rejection. Fixtures and the local database are removed after tests.

Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. `node scripts/check-routes.mjs` checks the running production server's unauthenticated routes and invite continuation cookie. Auth/Storage service behavior and browser end-to-end login still require the hosted acceptance below; the database shims are not the hosted Supabase services.

## Hosted acceptance (two browser sessions)

1. Apply missing migrations and deploy this code. A signs in and creates a profile if needed. Confirm a genuinely empty list.
2. A starts a Thing. Verify pending list entry, copy code/link, native share or fallback, and seven-day expiry.
3. B opens the invite while signed out. Sign in through the existing OTP flow, create a profile if needed, and verify return to the same inviter preview. Merely opening it must not join.
4. B explicitly joins. A should see Charm agreement within about three seconds, without refreshing manually. Both names must be the saved profile names.
5. Choose different Charms. Both must get a fresh round and cannot see the other's current choice. Submit stale/repeated requests to confirm they do not silently select in a new round.
6. Choose the same Charm. Both reach Home with that Charm and the two actual names; reload and reopen `/things` to verify persistence.
7. Open A's own invite as A, reuse the accepted code as B/C, and try an expired/cancelled code. All must be rejected. Test renewing an expired invitation and confirm its old link stays invalid.
8. In a fresh pending Thing, have B and C accept concurrently. Only one may become the second member. Attempt direct REST writes and an unrelated Thing URL: no unauthorized data or mutation.
9. Disconnect/reconnect one browser during waiting and Charm. Verify visible connection status, safe retries and eventual synchronization. Verify EN/ES, keyboard/radio selection and narrow mobile width.

Review this branch against `d64a5e1`. No production migration is executed by these tests.

UI presentation tests render the actual screens in both languages with server actions disabled at the test boundary. They verify empty/pending/active lists, explicit acceptance, mismatch and waiting states, real supplied names/Charm, and distinct invite errors. Separate continuation tests cover code/link parsing and auth/profile destinations. These are not a substitute for a two-browser hosted Auth/Storage acceptance run.
