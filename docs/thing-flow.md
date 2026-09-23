# Thing flow

## Base and scope

This implementation extends the existing Start / Join / Thing flow with short invitations, proposal-based Charm agreement, a useful Home and the Hangout entry/setup foundation. Email/password is primary and the existing OTP flow remains an explicit fallback.

## Supabase deployment

Apply migrations in order, once each, using the Supabase SQL Editor or your usual migration tooling:

1. `20260922000100_create_profiles.sql` — existing profiles and avatar bucket. Do not rerun if already applied.
2. `20260922000200_create_things.sql` — original Things/members/invites schema. Skip only if this exact migration is already applied.
3. `20260922000300_thing_flow.sql` — original state transitions, membership seats, private Charm choices, RPC-only writes, invite privacy and RPCs.
4. `20260922000400_invites_password_charm_refine.sql` — six-character invite generation, account lookup throttling, current Charm proposals and proposal RPCs.
5. `20260922000500_thing_home_hangouts_foundation.sql` — shared Thing colors, soft ending, Hangouts, Hot consent and private Our Deck batches.
6. `20260922000600_same_brain_results_space.sql` — Same Brain prompts/rounds/private answers/results, souvenirs and Space snapshot.
7. `20260922000700_shared_hangouts_and_theme.sql` — one open Hangout, idempotent joining, safe active summary and shared theme source.

Migration 004 preserves active/disconnected Things and legacy choice history. For a pending Charm Thing with an unresolved legacy choice, it promotes one current-round choice into the initial proposal. Existing invite codes remain valid; only newly generated and renewed codes use the short alphabet.

Do not deploy the updated UI before migrations 005–007. Keep the existing Supabase URL/publishable-key settings; no service-role key or Realtime publication is required. Password signup/recovery requires the Auth configuration described in the README. Hosted migrations are not applied by tests.

## Data and concurrency

`pending_invite → pending_charm → active` is server-owned. Each Thing has at most two unique seats (`1`, `2`), plus the original membership-limit trigger. Every join, Charm choice, cancellation and renewal locks the parent Thing first. Concurrent operations serialize; the seat constraint independently prevents a third row. Create uses a per-account advisory lock and a unique request ID to make a client retry idempotent. Accounts may have multiple Things, with a limit of ten pending invitations per creator.

New invites use six cryptographically random uppercase characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, avoiding `O/0`, `I/1` and `L`. The unique constraint remains authoritative and generation retries collisions. Input is trimmed and uppercased; legacy 6-to-32-character alphanumeric codes remain valid. Preview and acceptance use authenticated v2 RPCs and an account-scoped 30-attempt/10-minute limit. Invite rows remain private and acceptance remains one-time and atomic.

Each pending Thing has at most one current Charm proposal: cherry, moon, spark or clover. A member may replace the current proposal using its version; only the other member may accept that exact version. Parent-row locking serializes replacement and acceptance, so stale requests fail. Acceptance atomically sets `things.charm_key`, `activated_at` and `status = 'active'`. The old choice table remains private history and is no longer used by the app.

Expired invites can be renewed; old codes stay invalid. A creator can cancel a Thing only before the partner joins. Cancellation deletes the pending Thing and cascades its invite/membership; it cannot erase an accepted Thing.

## Policies and RPCs

Existing member/creator read policies and account-only restrictions remain on Things and memberships. Invites now have creator-only reads. `thing_charm_choices` has RLS with own-choice/member/account checks. Direct table and column write grants from the initial migration are explicitly revoked. Profile RLS remains own-profile-only; the authorized snapshot returns only both members' IDs and display names.

All security-definer functions pin an empty search path, derive identity from `auth.uid()`, and reject anonymous/guest sessions and missing profiles. PUBLIC and anon execute are revoked. `thing_account()` is internal and cannot be called by authenticated clients.

| RPC | Purpose |
| --- | --- |
| `create_thing(request_id)` | Atomically creates pending Thing, creator and invite; safe retry |
| `preview_thing_invite_v2(code)` | Throttled inviter preview with a committed safe result envelope |
| `accept_thing_invite_v2(code)` | Throttled atomic acceptance with a committed safe result envelope |
| `propose_thing_charm(thing_id, expected_version, charm)` | Creates or atomically replaces the one current proposal |
| `accept_thing_charm(thing_id, expected_version)` | Lets the other member accept the current proposal exactly once |
| `thing_snapshot(thing_id)` | Authorized complete screen state |
| `list_my_things()` | Real Things for the current account |
| `renew_thing_invite(thing_id)` | Replaces expired/revoked invite under lock |
| `cancel_pending_thing(thing_id)` | Creator-only cancellation before join |

Execute permission is revoked from the former `preview_thing_invite`, `accept_thing_invite` and `choose_thing_charm` RPCs so clients cannot bypass throttling or the proposal model.

## Routes and components

`/things` renders real records or the existing empty state, with an explicit retry error on read failure. `/things/new` creates only after a button press. `/join` accepts a code or full HTTP(S) invite link and extracts only its code for a local navigation; `/join/[code]` previews the inviter and requires an explicit Join. `/thing/[thingId]` displays invite waiting, the current Charm proposal or the real active home with both names. The invite view renders a client-side QR containing only the current-origin full `/join/CODE` URL. No new future-feature behavior was implemented.

UI: `src/features/things/screens.tsx`, `copy.ts` (EN/ES), `model.ts`, `actions.ts`. Existing page routes delegate to these components. Data comes from authorized Supabase RPCs, using the session client and public key.

The proxy saves a validated invite code in a seven-day SameSite=Lax cookie on actual GET navigation to `/join/[code]`. Prefetch and Server Action requests do not save it. Auth/profile server and client gates use only a validated local `/join/CODE` path. It survives OTP reloads, OAuth redirects, and profile creation. Accept or Not now removes the cookie. Links use a no-referrer policy. The cookie is a continuation hint, not authentication or acceptance authority.

Pending detail and list screens refresh every three seconds while visible; reconnect/focus refreshes immediately. Active home stops polling. Server renders reauthorize every read. Offline and load/action errors are visible. Native sharing has a clipboard fallback, with a selectable full URL if clipboard permission fails.

## Automated verification

`npm test` runs the existing unit tests, invite validation tests and a real temporary PostgreSQL cluster using `embedded-postgres`. No hosted credentials or production data are used. Dependencies need install scripts enabled. On Windows an execution sandbox may block `initdb`; run the test command in a normal terminal in that case. The runner exits after all tests complete (`--test-force-exit`) because the embedded cluster library can retain Windows process/IPC handles after shutdown. The suite first awaits all connections closing, cluster stop, and deletion of its temporary directory; this flag does not skip assertions or cleanup.

The database suite applies all seven migrations, creates minimal Supabase Auth/Storage metadata and JWT-role shims, and exercises the actual SQL functions/RLS. Coverage includes invitations, Charm/theme acceptance, shared-session races and joining, member-only soft ending, Hot consent, Our Deck privacy/batches, Same Brain privacy/results, unified Thing aggregation, guest and missing-profile rejection.

Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. `node scripts/check-routes.mjs` checks the running production server's unauthenticated routes and invite continuation cookie. Auth/Storage service behavior and browser end-to-end login still require the hosted acceptance below; the database shims are not the hosted Supabase services.

## Hosted acceptance (two browser sessions)

1. Apply migrations 004–007 if missing, configure password email redirects/templates, then deploy the code.
2. Create and confirm a new password account, create its profile, sign out, and sign in again. Wrong credentials must show safe copy. Verify the OTP fallback separately.
3. For an account originally created through OTP, set a password in Account settings. Sign in with it and confirm the same Auth ID, profile, avatar, Things and memberships remain.
4. Request password recovery. The email must return through `/auth/callback` to `/auth/update-password`; after changing it, the same account data must remain.
5. A starts a Thing. Verify a six-character readable code, current-origin QR, copy/share actions and seven-day expiry. Scan the QR from B's phone and verify the inviter preview without auto-joining.
6. B explicitly joins. A should see Charm selection within about three seconds. A proposes one Charm; B replaces it; A accepts B's proposal. Confirm stale acceptance fails and both reach Home with the final Charm and real profile names.
7. Open A's own invite as A, reuse the accepted code as B/C, and try an expired/cancelled code. All must be rejected. Test renewal and confirm the old link stays invalid.
8. In a fresh pending Thing, have B and C accept concurrently. Only one may become the second member. Attempt direct REST writes and an unrelated Thing URL: no unauthorized data or mutation.
9. Disconnect/reconnect one browser during waiting and Charm. Verify visible connection status, safe retries and eventual synchronization. Verify EN/ES, keyboard/radio selection and narrow mobile width.

No production migration is executed by these tests.

UI presentation tests render the actual screens in both languages with server actions disabled at the test boundary. They verify invite QR/code actions, empty/pending/active lists, current proposer copy, member-specific accept/replace controls, waiting state, final names/Charm and distinct invite errors. Separate continuation tests cover code/link parsing and auth/profile destinations. These are not a substitute for a two-browser hosted Auth/Storage acceptance run.
