# THING

Mobile-first app for two people per Thing. Email/password authentication with email OTP fallback, required profiles, shared identity, one shared open Hangout, four playable game engines, private Chat, shared Moments and a persistent Space are implemented. Public discovery and social feeds remain outside this implementation.

See [Thing flow implementation and deployment](docs/thing-flow.md) for migrations, RPCs, security, tests and hosted acceptance steps.

## Setup

Requires Node.js 20.9+ for Next.js; use Node.js 22.15+ or 24+ for the test module hooks.

1. `npm install`.
2. Copy `.env.example` to `.env.local`. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` using Supabase Connect. The supplied project API URL is `https://waziecvsylrcovrqavco.supabase.co`. Keep local credentials in the ignored `.env.local`.
3. Configure providers, email templates and redirect URLs below.
4. Apply missing files in `supabase/migrations/` in timestamp order through the social Hub migration (010). Do not rerun already applied migrations. See `docs/thing-flow.md` for rollout and test ordering.
5. `npm run dev`, then open `http://localhost:3000`.

On PowerShell use `npm.cmd` if `npm.ps1` is blocked. Set the same two public variables in Vercel's relevant environments and redeploy; Next.js embeds public values at build time. No Google client secret or Supabase service key belongs in the app environment. Missing/invalid environment values fail clearly without echoing values. `.env.local` remains ignored.

## Dashboard configuration

### Google

In Google Cloud / Google Auth Platform create an OAuth client of type **Web application**, configure the consent screen and add your test users if the consent screen is in Testing mode.

- Authorized redirect URI: `https://waziecvsylrcovrqavco.supabase.co/auth/v1/callback`.
- Authorized JavaScript origins: `http://localhost:3000` and the actual Vercel production origin (no path). The implementation uses the redirect OAuth flow, not Google One Tap.
- In Supabase Authentication > Sign In / Providers > Google, enable Google and enter this client's **Client ID** and **Client Secret**. Leave nonce checking enabled. These credentials stay in Supabase.

The Google-to-Supabase callback above differs from the Supabase-to-THING callback `/auth/callback` below. See [Supabase Google setup](https://supabase.com/docs/guides/auth/social-login/auth-google).

### URL configuration

In Supabase Authentication > URL Configuration:

| Setting | Value |
| --- | --- |
| Site URL | `https://thing-lake.vercel.app` |
| Redirect URL for local development | `http://localhost:3000/auth/callback` |
| Redirect URL for production | `https://thing-lake.vercel.app/auth/callback` |
| Optional preview/test URLs | Add each preview origin followed by `/auth/callback` if you test OAuth there |

The current production origin is `https://thing-lake.vercel.app`. Use it as Site URL and add `https://thing-lake.vercel.app/auth/callback` to Redirect URLs before enabling Google. If using another local port or `127.0.0.1`, allow that exact callback too. The typed email-code flow calls `verifyOtp` on the same page; it does not use `/auth/callback` to verify a code.

The browser supplies its actual origin to `signInWithOAuth`. The callback sends a fixed relative redirect, so it retains the public origin without trusting forwarded host headers or accepting a user-controlled `next` destination. See [redirect URL documentation](https://supabase.com/docs/guides/auth/redirect-urls).

### Email and password

In Authentication > Sign In / Providers > Email, keep Email and email/password sign-in enabled, require email confirmation, and allow new users to sign up. Keep Anonymous Sign-Ins disabled. Set the project's minimum password length to at least 8 characters to match the app. The same provider also powers the optional 6-to-10-digit OTP fallback.

The primary Create account form calls `auth.signUp({ email, password, options: { emailRedirectTo } })`. It never calls `signInWithOtp`; that SDK method is reachable only after the user explicitly chooses **Use a code instead**. A code-style password-registration email means the Supabase **Confirm signup** template below needs correction.

Keep the **Confirm signup** and **Reset password / Recovery** templates' `{{ .ConfirmationURL }}` links intact so password signup and recovery return through `/auth/callback`. Add both exact callback URLs under Authentication > URL Configuration:

- `http://localhost:3000/auth/callback`
- `https://thing-lake.vercel.app/auth/callback` (replace the origin if production changes)

The recovery link uses the same callback with a safe internal `next=/auth/update-password` query. No separate recovery URL is required. To retain the OTP fallback, configure the **Magic Link** template to display the numeric token, for example:

```html
<h2>THING sign-in code / Código de acceso</h2>
<p>Enter this code in THING / Ingresa este código en THING:</p>
<p><strong>{{ .Token }}</strong></p>
<p>If you did not request it, ignore this email.</p>
```

Keep `{{ .Token }}` in the Magic Link template and `{{ .ConfirmationURL }}` in the signup/recovery templates. The app calls `signInWithOtp` then `verifyOtp({ email, token, type: 'email' })` only for the fallback flow. Password recovery exchanges the emailed PKCE code and then updates the existing account; it does not create another user or profile.

Configure custom SMTP to send to actual users. Supabase's built-in sender is limited to project-team addresses and currently two messages/hour, so Email being enabled does not prove general delivery works. The UI prevents duplicate submissions and immediate resends; Supabase remains responsible for authoritative limits. See [SMTP configuration](https://supabase.com/docs/guides/auth/auth-smtp).

## Architecture and flow

```text
/ -> email/password (or email-code fallback) -> verified Supabase account
   -> profile lookup -> missing: /profile/create -> /things
                     -> exists: /things
/profile/settings -> set/change password or sign out
/auth/update-password -> choose a password after recovery callback
```

- `src/lib/supabase/{env,client,server,proxy}.ts` retain environment validation, the SDK browser singleton, per-request server clients and cookie refresh. Only `@supabase/supabase-js` and `@supabase/ssr` were added; no deprecated auth helpers.
- `src/features/auth/auth.ts` contains SDK-based session reading, password sign-in/signup/update/recovery, Google/code operations, safe error mapping and logout. Password updates target the already-authenticated user, so their Auth ID, profile and memberships stay attached.
- `src/features/auth/auth-screen.tsx` renders localized email/password sign-in first, with signup, recovery and email-code fallback. Language selection stays in tab-local storage; a saved profile locale wins after login. Locale never changes theme.
- `src/app/auth/callback/route.ts` exchanges PKCE codes using the server client and writes the SDK session cookies. It permits only the fixed recovery destination `/auth/update-password`; cancellation, invalid callbacks and arbitrary `next` values cannot create an open redirect or expose raw provider errors.
- `src/features/profile/{server,profile,actions}.ts` verify `getUser()` before reading/writing, reject legacy guest identities and derive the profile ID from Auth. Server route guards redirect signed-out users; the client gate handles auth events, profile loading/errors and navigation.
- `src/app/profile/settings/page.tsx` and `src/features/auth/account-settings.tsx` let the current account set/change its password and sign out; the empty dashboard links to settings.
- `/dev` remains development-only: status, ID, provider, email, profile/name/locale/avatar type, plus temporary theme selector. Production returns 404. No tokens are shown.

Existing `/things`, `/things/new`, `/join`, `/join/[code]` and `/thing/[thingId]` area routes remain in place and protected. The dashboard has no sample data. Theme defaults to system, with existing light/dark preference persistence; its selector only appears in `/dev`.

## Things data foundation

The unchanged `20260922000200_create_things.sql` from `d64a5e1` defines `things`, `thing_members`, `thing_invites`, UUID/Auth keys, lifecycle constraints, indexes, one creator and a maximum of two members. Existing invite codes and expiry constraints remain intact.

The additive `20260922000300_thing_flow.sql` supplies the original functional API. The new `20260922000400_invites_password_charm_refine.sql` keeps existing data while changing new invites to six readable characters, adding account-scoped lookup throttling and replacing active Charm rounds with one current proposal. Either member can replace the proposal; only the other member can accept its current version. Acceptance atomically sets the final Charm, activation timestamp and `active` state. Legacy choices remain as history, and one unresolved legacy choice is promoted into a proposal where possible.

`20260922000500_thing_home_hangouts_foundation.sql` adds a closed shared color palette, member-only soft ending, Hangouts/participants, private Hot consent and private Our Deck batches. Active Home now shows identity, Start a Hangout, Space, real recent activity and compact settings. Disconnected Things are preserved under Past Things. See [Hangout foundation](docs/hangouts.md) for schema, privacy and deferred game-engine work.

`20260922000600_same_brain_results_space.sql` adds the first complete game engine: eight private Same Brain rounds with simultaneous reveal, durable raw results, four quiet souvenirs and a computed Space snapshot. Space aggregates only completed results and uses UTC calendar dates for the shared streak. See [Space](docs/space.md).

`20260922000700_shared_hangouts_and_theme.sql` enforces one open Hangout per Thing, adds explicit/idempotent joining and exposes only a safe open-session summary. The canonical Thing page now includes its previous Space content. Shared color defaults from the accepted Charm and becomes manual after either member changes it.

`20260922000800_remaining_hangout_engines.sql` adds member-authorized abandonment, completed Know Me and This or That loops, and Hot V1 with fixed context, private mutual escalation and the hidden Thing-level KitKat unlock. All engines reuse the shared Hangout, rounds, private answers, polling and result infrastructure. See [Know Me](docs/know-me.md), [This or That](docs/this-or-that.md) and [Hot V1](docs/hot.md).

## Profiles and avatars

`profiles.id` references `auth.users.id`. A profile requires explicit submission of a trimmed 1-50-character display name and `en`/`es` locale. Avatars can be one of eight bundled SVG presets, initials, or JPEG/PNG/WebP up to 5 MiB. Upload happens only after form submission. Switching back to a preset before submitting does not upload the discarded photo.

`avatar_url` stores the object path rather than an absolute URL. The normalized path is `{user_id}/profile`; the actual MIME type is stored with the object, so no misleading file extension is needed. One path supports replacement without accumulating files. The public URL is generated centrally by the SDK. The `avatars` bucket is public for display; writing/replacing/deleting and authenticated metadata access are restricted to the owner's exact path.

The pending migration was amended to add restrictive account-only policies on profiles and avatar writes/metadata, preserving `auth.uid() = id` and scoped storage policies. It also rejects incomplete avatar field combinations even when SQL NULL semantics would otherwise allow them. Anonymous-role profile access and cross-user writes are denied; clients cannot change IDs or timestamps. Existing guest accounts are not deleted or migrated.

## Validation

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm start
node scripts/check-routes.mjs
```

`CHECK_ORIGIN` can point the route check to another local test port. It performs only unauthenticated HTTP reads. Auth tests mock password sign-in/signup/update/recovery and OTP fallback, including safe failures, same-user updates, exact callback URLs, session reuse, identity projection, guest rejection, logout and EN/ES UI. Existing profile, avatar, locale, empty-dashboard and environment tests remain.

The existing SQL files in `supabase/tests/` are preserved. `npm test` executes the original `things_rls.sql` against migration 002, then applies 003–008 and checks the RPC-only API, RLS, transactions and races. It covers shared sessions and abandonment, every engine's privacy/results, Hot context/escalation/KitKat, legacy Our Deck batches and unified Thing aggregation. Do not run the original direct-write Things test against an upgraded database; it intentionally describes the old API.

### Manual end-to-end verification after configuration

Complete these hosted acceptance checks with two browser sessions on the actual deployment:

1. Clear site data in a test browser. `/` shows Email and EN/ES; `/things`, `/profile/create`, `/join`, and `/thing/test/chat` return to `/`. Merely opening `/` creates no Auth user.
2. Toggle EN/ES; create an account with an 8+ character password, confirm the email and reach `/profile/create`. Sign out and confirm email/password login returns to the same profile. Verify wrong credentials show a safe error. Also exercise **Use a code instead** with wrong/expired and valid codes.
3. Choose a name, preset avatar and language, submit, and reach empty `/things`. Refresh and reopen the browser: the same account/profile should remain while the Supabase session is valid.
4. In Account settings, set/change the password for an existing OTP-created account. Sign out and sign in with that email/password; confirm the same Supabase user ID, profile, avatar and Things remain. Then request password recovery, follow the email link through `/auth/callback` to `/auth/update-password`, set a new password and repeat the same identity checks.
5. Test `/auth/callback` without a code and with an external `next`: both return to auth safely. If Google is enabled later, its localhost and production callbacks use the same route.
6. Test a second distinct account with a photo upload. Refresh and confirm the photo loads. Check JPEG/PNG/WebP, rejection of GIF/invalid bytes/over-5-MiB files, preset/photo switching before submit, and initials fallback. Signing into the same account in two browsers should yield the SAME ID; distinct accounts yield different IDs.
7. Run the SQL policy tests in a development project, including cross-user replacement/deletion denial. Hosted upload/download behavior still requires this live acceptance run.
8. Start a Thing and confirm the invite is exactly six uppercase characters from the readable alphabet, accepts lowercase/whitespace input, and the QR opens the full current-origin `/join/CODE` URL on a second phone. Verify copy, native share, renewal, expiry and one-time acceptance.
9. In Charm selection, have A propose, B replace it, then A accept B's current proposal. Confirm the proposer only sees the waiting state, the other member sees keep/pick-another controls, stale acceptance fails, and both reach the active home with the final Charm.
10. Confirm all existing placeholders remain accessible after profile creation, `/dev` is 404 in production, and no normal screen shows theme/developer controls. In development, `/dev` should show only safe account/profile information.

## Verification scope

The automated suite uses temporary local PostgreSQL with Auth/Storage metadata shims, SDK boundary tests and rendered UI tests. It sends no email and changes no hosted Supabase data. Build and route probes may use local placeholder public environment values; deploy with the actual project public URL/key. Hosted email delivery, OAuth and the final two-browser acceptance must be verified in the target environment.
