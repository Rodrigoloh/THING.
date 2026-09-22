import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readIdentity, toIdentity, startGoogle, sendEmailCode, verifyEmailCode, signInWithPassword, signUpWithPassword, sendPasswordRecovery, updateAccountPassword, logout } from "../src/features/auth/auth.ts";
import { AuthScreen } from "../src/features/auth/auth-screen.tsx";
import { LocaleProvider } from "../src/lib/i18n/provider.tsx";
import { readOwnProfile, submitOwnProfile } from "../src/features/profile/profile.ts";

test("first visit reads the session without creating an account", async () => {
  assert.equal(await readIdentity({ getSession: async () => ({ data: { session: null }, error: null }) }), null);
});

test("returning visits reuse the verified SDK account and project only safe fields", async () => {
  const user = { id: "user-a", email: "test@example.com", app_metadata: { provider: "google" }, is_anonymous: false, access_token: "secret" };
  const auth = { getSession: async () => ({ data: { session: { user } }, error: null }), getUser: async () => ({ data: { user }, error: null }) };
  const first = await readIdentity(auth);
  assert.deepEqual(first, { id: "user-a", email: "test@example.com", provider: "google" });
  assert.deepEqual(await readIdentity(auth), first);
  assert.equal(toIdentity({ ...user, is_anonymous: true }), null);
  auth.getUser = async () => ({ data: { user: null }, error: { status: 401 } });
  assert.equal(await readIdentity(auth), null);
  auth.getUser = async () => ({ data: { user: null }, error: new Error("offline") });
  await assert.rejects(readIdentity(auth), /offline/);
});

test("legacy guest identities cannot read or create a profile", async () => {
  const client = { auth: { getUser: async () => ({ data: { user: { id: "old-user", is_anonymous: true } }, error: null }) }, from() { assert.fail("Database must not be accessed"); } };
  assert.equal((await readOwnProfile(client)).error, "sessionRequired");
  assert.equal((await submitOwnProfile(client, "Name", "en")).error, "sessionRequired");
});

test("Google uses official OAuth with the current localhost or deployed origin", async () => {
  for (const origin of ["http://localhost:3000", "https://test-deployment.vercel.app"]) {
    let request;
    const auth = { signInWithOAuth: async (value) => { request = value; return { error: null }; } };
    assert.equal(await startGoogle(auth, origin), null);
    assert.deepEqual(request, { provider: "google", options: { redirectTo: origin + "/auth/callback" } });
  }
  assert.equal(await startGoogle({ signInWithOAuth: async () => ({ error: { message: "private" } }) }, "http://localhost:3000"), "authFailed");
});

test("email validation prevents requests and valid email starts passwordless account flow", async () => {
  let calls = [];
  const auth = { signInWithOtp: async (value) => { calls.push(value); return { error: null }; } };
  for (const email of ["", "bad", "a@b", "a b@example.com"]) assert.equal(await sendEmailCode(auth, email), "emailInvalid");
  assert.equal(calls.length, 0);
  assert.equal(await sendEmailCode(auth, " test@example.com "), null);
  assert.deepEqual(calls, [{ email: "test@example.com", options: { shouldCreateUser: true } }]);
  assert.equal(await sendEmailCode({ signInWithOtp: async () => ({ error: { code: "over_email_send_rate_limit" } }) }, "test@example.com"), "authRateLimited");
  assert.equal(await sendEmailCode({ signInWithOtp: async () => ({ error: { code: "email_provider_disabled" } }) }, "test@example.com"), "authNotConfigured");
  assert.equal(await sendEmailCode({ signInWithOtp: async () => ({ error: { code: "unexpected_failure" } }) }, "test@example.com"), "emailSendFailed");
});

test("OTP accepts Supabase's configurable 6–10 digits, handles expiry and requires a verified session", async () => {
  const auth = { verifyOtp: async (value) => { assert.equal(value.email, "test@example.com"); assert.equal(value.type, "email"); assert.match(value.token, /^\d{6,10}$/); return { data: { user: { is_anonymous: false }, session: {} }, error: null }; } };
  for (const code of ["", "12345", "12345678901", "abcdef"]) assert.equal(await verifyEmailCode(auth, "test@example.com", code), "codeInvalid");
  for (const code of ["012345", "01234567", "0123456789"]) assert.equal(await verifyEmailCode(auth, "test@example.com", code), null);
  assert.equal(await verifyEmailCode({ verifyOtp: async () => ({ data: {}, error: { code: "otp_expired" } }) }, "test@example.com", "012345"), "codeInvalid");
  assert.equal(await verifyEmailCode({ verifyOtp: async () => ({ data: { session: null }, error: null }) }, "test@example.com", "012345"), "authFailed");
});

test("email and password sign-in succeeds safely and hides wrong-password details", async () => {
  let credentials;
  const auth = { signInWithPassword: async (value) => { credentials = value; return { data: { user: { id: "same-user", is_anonymous: false }, session: {} }, error: null }; } };
  assert.equal(await signInWithPassword(auth, " person@example.com ", "password123"), null);
  assert.deepEqual(credentials, { email: "person@example.com", password: "password123" });
  assert.equal(await signInWithPassword({ signInWithPassword: async () => ({ data: {}, error: { code: "invalid_credentials", message: "private" } }) }, "person@example.com", "wrong"), "invalidCredentials");
});

test("password signup validates once and respects email verification", async () => {
  let calls = 0, payload;
  const auth = { signUp: async (value) => { calls++; payload = value; return { data: { user: { id: "new-user" }, session: null }, error: null }; } };
  assert.deepEqual(await signUpWithPassword(auth, "bad", "12345678", "12345678", "https://thing.example"), { ok: false, error: "emailInvalid" });
  assert.deepEqual(await signUpWithPassword(auth, "person@example.com", "short", "short", "https://thing.example"), { ok: false, error: "passwordTooShort" });
  assert.deepEqual(await signUpWithPassword(auth, "person@example.com", "password1", "password2", "https://thing.example"), { ok: false, error: "passwordMismatch" });
  assert.equal(calls, 0);
  assert.deepEqual(await signUpWithPassword(auth, "person@example.com", "password1", "password1", "https://thing.example"), { ok: true, status: "verification_required", userId: "new-user" });
  assert.equal(calls, 1);
  assert.equal(payload.options.emailRedirectTo, "https://thing.example/auth/callback");
});

test("OTP user sets or changes a password on the same Auth ID without touching profile or Things", async () => {
  const calls = [];
  const auth = {
    getUser: async () => ({ data: { user: { id: "existing-otp-user", is_anonymous: false } }, error: null }),
    updateUser: async (value) => { calls.push(value); return { data: { user: { id: "existing-otp-user" } }, error: null }; },
  };
  assert.equal(await updateAccountPassword(auth, "new-password", "new-password"), null);
  assert.deepEqual(calls, [{ password: "new-password" }]);
  assert.equal(await updateAccountPassword(auth, "new-password", "different"), "passwordMismatch");
  assert.equal(calls.length, 1);
});

test("recovery targets the dedicated same-origin password page and preserves the account", async () => {
  let request;
  const auth = { resetPasswordForEmail: async (...args) => { request = args; return { data: {}, error: null }; } };
  assert.equal(await sendPasswordRecovery(auth, "person@example.com", "https://thing.example"), null);
  assert.deepEqual(request, ["person@example.com", { redirectTo: "https://thing.example/auth/callback?next=/auth/update-password" }]);
  const callback = readFileSync("src/app/auth/callback/route.ts", "utf8");
  assert.match(callback, /next === "\/auth\/update-password"/);
  assert.doesNotMatch(callback, /destination\s*=\s*next\s*[;?]/);
});

test("logout clears this browser session before returning to root; errors do not redirect", async () => {
  const calls = [];
  assert.equal(await logout({ signOut: async (options) => { calls.push(options); return { error: null }; } }, (path) => calls.push(path)), null);
  assert.deepEqual(calls, [{ scope: "local" }, "/"]);
  assert.equal(await logout({ signOut: async () => ({ error: { message: "private" } }) }, () => assert.fail()), "authFailed");
});

test("auth entry makes password primary in English and Spanish while OTP remains a fallback", () => {
  for (const [locale, action, email, fallback] of [["en", "Sign in", "Email address", "Use a code instead"], ["es", "Iniciar sesión", "Correo electrónico", "Usar un código"]]) {
    const html = renderToStaticMarkup(React.createElement(LocaleProvider, { initialLocale: locale }, React.createElement(AuthScreen)));
    assert.ok(html.includes(action)); assert.ok(html.includes(email)); assert.ok(html.includes(fallback));
    assert.match(html, /type="email"/); assert.match(html, /type="password"/); assert.match(html, /aria-pressed="true"/);
    assert.doesNotMatch(html, /Google|anonymous|anónimo|Theme|Tema|demo/i);
  }
});

test("production source has no automatic guest signup or guest-facing copy; dev is guarded", () => {
  const files = readdirSync("src", { recursive: true }).filter((path) => /\.(ts|tsx)$/.test(path));
  const source = files.map((path) => readFileSync("src/" + path, "utf8")).join("\n");
  assert.doesNotMatch(source, /signInAnonymously|Anonymous Sign-Ins|identity-bootstrap/);
  const dev = readFileSync("src/app/dev/page.tsx", "utf8");
  assert.match(dev, /NODE_ENV !== "development"/); assert.match(dev, /notFound\(\)/);
});
