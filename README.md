# THING

Mobile-first app for two people per Thing. Email OTP, required profiles, preset/uploaded avatars and English/Spanish UI are joined by real Start / Join / Charm agreement / Thing Home. Games, Hangouts, chat, Moments, Space persistence, streaks and Discover are outside this implementation.

See [Thing flow implementation and deployment](docs/thing-flow.md) for migrations, RPCs, security, tests and hosted acceptance steps. The branch starts at `d64a5e1` and retains the existing OTP improvements through `9a3775a`, profile and avatar behavior.

## Setup

Requires Node.js 20.9+ for Next.js; use Node.js 22.15+ or 24+ for the test module hooks.

1. `npm install`.
2. Copy `.env.example` to `.env.local`. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` using Supabase Connect. The supplied project API URL is `https://waziecvsylrcovrqavco.supabase.co`. Keep local credentials in the ignored `.env.local`.
3. Configure providers, email templates and redirect URLs below.
4. Apply missing files in `supabase/migrations/` in timestamp order: profiles (001), original Things foundation (002), then functional Start/Join/Charm upgrade (003). Do not rerun already applied migrations. See `docs/thing-flow.md` for rollout and test ordering.
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

### Email code

In Authentication > Sign In / Providers > Email, keep Email and email confirmation enabled; allow new users to sign up. Keep Anonymous Sign-Ins disabled. The UI retains support for configured OTP lengths from 6 to 10 digits. Review expiration and rate limits in your project.

In Authentication > Email Templates, change **Magic Link** to show the numeric token rather than a clickable login link. Also use the same code content for **Confirm signup**, covering the initial-account email. For example:

```html
<h2>THING sign-in code / Código de acceso</h2>
<p>Enter this code in THING / Ingresa este código en THING:</p>
<p><strong>{{ .Token }}</strong></p>
<p>If you did not request it, ignore this email.</p>
```

Keep the template variable exactly `{{ .Token }}`. The app calls `signInWithOtp` then `verifyOtp({ email, token, type: 'email' })`; requesting a code alone does not unlock the product. No passwords or magic-link route are needed. See [Supabase passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless).

Configure custom SMTP to send to actual users. Supabase's built-in sender is limited to project-team addresses and currently two messages/hour, so Email being enabled does not prove general delivery works. The UI prevents duplicate submissions and immediate resends; Supabase remains responsible for authoritative limits. See [SMTP configuration](https://supabase.com/docs/guides/auth/auth-smtp).

## Architecture and flow

```text
/ -> email code -> verified Supabase account
   -> profile lookup -> missing: /profile/create -> /things
                     -> exists: /things
/profile/settings -> signOut (current browser) -> /
```

- `src/lib/supabase/{env,client,server,proxy}.ts` retain environment validation, the SDK browser singleton, per-request server clients and cookie refresh. Only `@supabase/supabase-js` and `@supabase/ssr` were added; no deprecated auth helpers.
- `src/features/auth/auth.ts` contains SDK-based session reading, Google/code operations, safe error mapping and logout. Opening the app creates no account. `identity-provider.tsx` subscribes to SDK events for presentation only; it neither persists credentials nor manages a second session store.
- `src/features/auth/auth-screen.tsx` renders the localized email/code form. Google code remains for later provider setup, but is hidden from the first screen while the provider is disabled. Language selection stays in tab-local storage; a saved profile locale wins after login. Locale never changes theme. Send failures, configuration failures, rate limits, and connection errors have distinct user-facing copy.
- `src/app/auth/callback/route.ts` exchanges Google's PKCE code using the server client and writes the SDK session cookies. Success redirects to `/` for the verified profile gate; cancellation/invalid callback returns a safe localized error. No token or raw provider error is rendered.
- `src/features/profile/{server,profile,actions}.ts` verify `getUser()` before reading/writing, reject legacy guest identities and derive the profile ID from Auth. Server route guards redirect signed-out users; the client gate handles auth events, profile loading/errors and navigation.
- `src/app/profile/settings/page.tsx` and `src/features/auth/account-settings.tsx` provide minimal logout; the empty dashboard links to settings. No complete settings screen was added.
- `/dev` remains development-only: status, ID, provider, email, profile/name/locale/avatar type, plus temporary theme selector. Production returns 404. No tokens are shown.

Existing `/things`, `/things/new`, `/join`, `/join/[code]` and `/thing/[thingId]` area routes remain in place and protected. The dashboard has no sample data. Theme defaults to system, with existing light/dark preference persistence; its selector only appears in `/dev`.

## Things data foundation

The unchanged `20260922000200_create_things.sql` from `d64a5e1` defines `things`, `thing_members`, `thing_invites`, UUID/Auth keys, lifecycle constraints, indexes, one creator and a maximum of two members. Existing invite codes and expiry constraints remain intact.

The additive `20260922000300_thing_flow.sql` supplies the functional API. It keeps RLS and the member-limit trigger, adds unique membership seats and private Charm rounds, and restricts writes to authorized transactional RPCs. States are `pending_invite → pending_charm → active`. Direct creator activation is replaced by two matching choices. All existing rows are retained; pending rows are mapped by active member count. See the flow document for every RPC and policy adjustment.

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

`CHECK_ORIGIN` can point the route check to another local test port. It performs only unauthenticated HTTP reads. Auth tests mock SDK boundaries: Google redirect configuration, email/code validation and failure paths, session reuse, safe identity projection, legacy guest rejection, logout, EN/ES auth UI and absence of guest signup/demo copy. Existing profile, avatar, locale, empty-dashboard and environment tests remain.

The existing SQL files in `supabase/tests/` are preserved. `npm test` executes the original `things_rls.sql` against migration 002 before applying 003, then checks the new RPC-only API, RLS, transactions and races. Do not run the original direct-write Things test against an upgraded database; it intentionally describes the old API. Other profile/avatar policy tests remain available for development use.

### Manual end-to-end verification after configuration

Complete these hosted acceptance checks with two browser sessions on the actual deployment:

1. Clear site data in a test browser. `/` shows Email and EN/ES; `/things`, `/profile/create`, `/join`, and `/thing/test/chat` return to `/`. Merely opening `/` creates no Auth user.
2. Toggle EN/ES; submit an invalid email. Request a code for an address you control. Enter a wrong/expired code: remain on the form with an error. Enter the valid code: reach `/profile/create` for a new account.
3. Choose a name, preset avatar and language, submit, and reach empty `/things`. Refresh and reopen the browser: the same account/profile should remain while the Supabase session is valid.
4. Use Account settings > Sign out. Verify return to `/`, then try a protected URL and browser Back. Sign back into the same account: skip profile creation and retain name/avatar/locale.
5. After Google is enabled and restored to the entry screen, check consent and the callback on localhost and production. New account goes to profile creation; existing account goes to `/things`. Cancel consent and test `/auth/callback` without a code: return to auth with a safe error.
6. Test a second distinct account with a photo upload. Refresh and confirm the photo loads. Check JPEG/PNG/WebP, rejection of GIF/invalid bytes/over-5-MiB files, preset/photo switching before submit, and initials fallback. Signing into the same account in two browsers should yield the SAME ID; distinct accounts yield different IDs.
7. Run the SQL policy tests in a development project, including cross-user replacement/deletion denial. Hosted upload/download behavior still requires this live acceptance run.
8. Confirm all existing placeholders remain accessible after profile creation, `/dev` is 404 in production, and no normal screen shows theme/developer controls. In development, `/dev` should show only safe account/profile information.

## Verification scope

The automated suite uses temporary local PostgreSQL with Auth/Storage metadata shims, SDK boundary tests and rendered UI tests. It sends no email and changes no hosted Supabase data. Build and route probes may use local placeholder public environment values; deploy with the actual project public URL/key. Hosted email delivery, OAuth and the final two-browser acceptance must be verified in the target environment.
