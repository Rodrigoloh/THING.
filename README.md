# THING

Mobile-first social game for two people per Thing. The current foundation provides Google / email-code authentication, a required profile, preset or uploaded avatars, English/Spanish UI, and an empty Things dashboard. Social features remain placeholders.

## Setup

Requires Node.js 20.9+ for Next.js; use Node.js 22.15+ or 24+ for the test module hooks.

1. `npm install`.
2. Copy `.env.example` to `.env.local`. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` using Supabase Connect. The supplied project API URL is `https://waziecvsylrcovrqavco.supabase.co`. The public key is already saved locally in the ignored `.env.local`.
3. Configure providers, email templates and redirect URLs below.
4. Apply the files in `supabase/migrations/` in timestamp order through the project's SQL Editor or established migration workflow. The first creates profiles/avatar storage; the second creates the Things relational foundation. Migrations intentionally fail on conflicting existing objects.
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
| Site URL | The actual production origin, `https://<your-production-domain>` |
| Redirect URL for local development | `http://localhost:3000/auth/callback` |
| Redirect URL for production | `https://<your-production-domain>/auth/callback` |
| Optional preview/test URLs | Add each preview origin followed by `/auth/callback` if you test OAuth there |

The production hostname was not found in repository metadata or environment variables. Replace the placeholders with the real Vercel/custom domain; do not paste placeholders into Supabase. If using another local port or `127.0.0.1`, allow that exact callback too. Until deployment is configured, Site URL can temporarily be `http://localhost:3000`.

The browser supplies its actual origin to `signInWithOAuth`. The callback sends a fixed relative redirect, so it retains the public origin without trusting forwarded host headers or accepting a user-controlled `next` destination. See [redirect URL documentation](https://supabase.com/docs/guides/auth/redirect-urls).

### Email code

In Authentication > Sign In / Providers > Email, keep Email and email confirmation enabled; allow new users to sign up. Keep Anonymous Sign-Ins disabled. Configure the Email OTP length to **6 digits** and review expiration/rate limits (the UI expects six numeric digits).

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
/ -> Google OAuth or email code -> verified Supabase account
   -> profile lookup -> missing: /profile/create -> /things
                     -> exists: /things
/profile/settings -> signOut (current browser) -> /
```

- `src/lib/supabase/{env,client,server,proxy}.ts` retain environment validation, the SDK browser singleton, per-request server clients and cookie refresh. Only `@supabase/supabase-js` and `@supabase/ssr` were added; no deprecated auth helpers.
- `src/features/auth/auth.ts` contains SDK-based session reading, Google/code operations, safe error mapping and logout. Opening the app creates no account. `identity-provider.tsx` subscribes to SDK events for presentation only; it neither persists credentials nor manages a second session store.
- `src/features/auth/auth-screen.tsx` renders the localized entry/code form. Language survives the provider redirect in tab-local storage; a saved profile locale wins after login. Locale never changes theme.
- `src/app/auth/callback/route.ts` exchanges Google's PKCE code using the server client and writes the SDK session cookies. Success redirects to `/` for the verified profile gate; cancellation/invalid callback returns a safe localized error. No token or raw provider error is rendered.
- `src/features/profile/{server,profile,actions}.ts` verify `getUser()` before reading/writing, reject legacy guest identities and derive the profile ID from Auth. Server route guards redirect signed-out users; the client gate handles auth events, profile loading/errors and navigation.
- `src/app/profile/settings/page.tsx` and `src/features/auth/account-settings.tsx` provide minimal logout; the empty dashboard links to settings. No complete settings screen was added.
- `/dev` remains development-only: status, ID, provider, email, profile/name/locale/avatar type, plus temporary theme selector. Production returns 404. No tokens are shown.

Existing `/things`, `/things/new`, `/join`, `/join/[code]` and `/thing/[thingId]` area routes remain in place and protected. The dashboard has no sample data. Theme defaults to system, with existing light/dark preference persistence; its selector only appears in `/dev`.

## Things data foundation

`20260922000200_create_things.sql` adds `things`, `thing_members`, and `thing_invites`. It defines UUID keys, Auth foreign keys, lifecycle checks, indexes, a single creator per Thing, and a concurrency-safe maximum of two memberships. A pending Thing has no activation timestamp; active or disconnected Things retain one. Invite codes are unique uppercase alphanumeric values of 6-32 characters, and their expiry must follow creation.

RLS allows verified accounts to see only Things where they are active members (or the creator during initial setup). Only the creator can create and configure a Thing or manage its invites. A client can insert only its own initial active creator membership; the future invite-acceptance operation must add the second member transactionally. Invite codes are not publicly searchable, and no invitation redemption/UI behavior is implemented yet.

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

Run `supabase/tests/profiles_rls.sql`, `avatars_rls.sql`, `account_access.sql`, and `things_rls.sql` in a development SQL Editor after the migrations. Each rolls back fixtures. They test ownership, cross-user denial, column grants, guest-account denial, avatar consistency, two-member enforcement, invitation visibility, and creator-only mutations. The SQL suite can also run against isolated PostgreSQL with Auth/Storage metadata shims; that does not substitute for hosted API verification.

### Manual end-to-end verification after configuration

No browser automation surface is connected in this environment. Complete these checks locally and on the actual Vercel deployment:

1. Clear site data in a test browser. `/` shows Google, Email and EN/ES; `/things`, `/profile/create`, `/join`, and `/thing/test/chat` return to `/`. Merely opening `/` creates no Auth user.
2. Toggle EN/ES; submit an invalid email. Request a code for an address you control. Enter a wrong/expired code: remain on the form with an error. Enter the valid six-digit code: reach `/profile/create` for a new account.
3. Choose a name, preset avatar and language, submit, and reach empty `/things`. Refresh and reopen the browser: the same account/profile should remain while the Supabase session is valid.
4. Use Account settings > Sign out. Verify return to `/`, then try a protected URL and browser Back. Sign back into the same account: skip profile creation and retain name/avatar/locale.
5. In an independent browser, continue with Google. Check consent and the callback on localhost and production. New account goes to profile creation; existing account goes to `/things`. Cancel consent and test `/auth/callback` without a code: return to auth with a safe error.
6. Test a second distinct account with a photo upload. Refresh and confirm the photo loads. Check JPEG/PNG/WebP, rejection of GIF/invalid bytes/over-5-MiB files, preset/photo switching before submit, and initials fallback. Signing into the same account in two browsers should yield the SAME ID; distinct accounts yield different IDs.
7. Run the SQL policy tests in a development project, including cross-user replacement/deletion denial. Hosted upload/download behavior still requires this live acceptance run.
8. Confirm all existing placeholders remain accessible after profile creation, `/dev` is 404 in production, and no normal screen shows theme/developer controls. In development, `/dev` should show only safe account/profile information.

## Current verification status

Local tests (26), TypeScript, lint, production build, unauthenticated HTTP route checks and SQL policy checks pass. The project owner reports completing Supabase configuration. The latest read-only probe still reports Google disabled and Email enabled; the profiles endpoint now returns HTTP 401 to an unauthenticated request, rather than the earlier missing-table response. Authenticated profile access, email templates, SMTP delivery and Google credentials still require end-to-end verification.

No emails or Auth users were created during automated verification. Use the manual steps above to verify the deployed application after provider configuration. The local environment file remains excluded from Git.
