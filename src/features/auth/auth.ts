import type { SupabaseClient, User } from "@supabase/supabase-js";

export type Identity = { id: string; provider: string; email: string | null };
type Auth = SupabaseClient["auth"];
export type AuthErrorKey = "authFailed" | "authRateLimited" | "emailInvalid" | "codeInvalid" | "emailSendFailed" | "authNotConfigured" | "connectionFailed" | "passwordTooShort" | "passwordMismatch" | "invalidCredentials" | "emailNotConfirmed" | "signupFailed" | "passwordUpdateFailed" | "recoverySendFailed";
export type SignupResult = { ok: true; status: "authenticated" | "verification_required"; userId: string | null } | { ok: false; error: AuthErrorKey };

export function toIdentity(user: User): Identity | null {
  if (user.is_anonymous) return null;
  return { id: user.id, provider: user.app_metadata.provider ?? "email", email: user.email ?? null };
}

// Reads the SDK session only; visiting the app never creates an account.
export async function readIdentity(auth: Pick<Auth, "getSession" | "getUser">): Promise<Identity | null> {
  const { data, error } = await auth.getSession();
  if (error) throw error;
  if (!data.session) return null;
  const { data: verified, error: verifyError } = await auth.getUser();
  if (verifyError) {
    if (verifyError.status === 401 || verifyError.status === 403) return null;
    throw verifyError;
  }
  return verified.user ? toIdentity(verified.user) : null;
}

export function identityErrorKey(error: unknown): AuthErrorKey {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || code === "over_ip_request_rate_limit") return "authRateLimited";
  return "authFailed";
}

export function emailSendErrorKey(error: unknown): AuthErrorKey {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || code === "over_ip_request_rate_limit") return "authRateLimited";
  if (code === "email_address_invalid" || code === "validation_failed") return "emailInvalid";
  if (code === "email_provider_disabled" || code === "signup_disabled" || code === "invalid_api_key") return "authNotConfigured";
  return "emailSendFailed";
}

export function validEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function passwordError(password: string, confirmation?: string): AuthErrorKey | null {
  if (password.length < 8) return "passwordTooShort";
  if (confirmation !== undefined && password !== confirmation) return "passwordMismatch";
  return null;
}

function passwordAuthError(error: unknown, fallback: AuthErrorKey): AuthErrorKey {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  if (code === "invalid_credentials" || code === "user_not_found") return "invalidCredentials";
  if (code === "email_not_confirmed") return "emailNotConfirmed";
  if (code === "weak_password") return "passwordTooShort";
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || code === "over_ip_request_rate_limit") return "authRateLimited";
  return fallback;
}

export async function signInWithPassword(auth: Pick<Auth, "signInWithPassword">, inputEmail: string, password: string): Promise<AuthErrorKey | null> {
  const email = inputEmail.trim();
  if (!validEmail(email)) return "emailInvalid";
  if (!password) return "invalidCredentials";
  const { data, error } = await auth.signInWithPassword({ email, password });
  if (error) return passwordAuthError(error, "invalidCredentials");
  return data.session && data.user && !data.user.is_anonymous ? null : "authFailed";
}

export async function signUpWithPassword(auth: Pick<Auth, "signUp">, inputEmail: string, password: string, confirmation: string, origin: string): Promise<SignupResult> {
  const email = inputEmail.trim();
  if (!validEmail(email)) return { ok: false, error: "emailInvalid" };
  const invalid = passwordError(password, confirmation);
  if (invalid) return { ok: false, error: invalid };
  const { data, error } = await auth.signUp({ email, password, options: { emailRedirectTo: new URL("/auth/callback", origin).href } });
  if (error) return { ok: false, error: passwordAuthError(error, "signupFailed") };
  if (!data.user) return { ok: false, error: "signupFailed" };
  return { ok: true, status: data.session ? "authenticated" : "verification_required", userId: data.user.id ?? null };
}

export async function sendPasswordRecovery(auth: Pick<Auth, "resetPasswordForEmail">, inputEmail: string, origin: string): Promise<AuthErrorKey | null> {
  const email = inputEmail.trim();
  if (!validEmail(email)) return "emailInvalid";
  const redirectTo = new URL("/auth/callback?next=/auth/update-password", origin).href;
  const { error } = await auth.resetPasswordForEmail(email, { redirectTo });
  return error ? passwordAuthError(error, "recoverySendFailed") : null;
}

export async function updateAccountPassword(auth: Pick<Auth, "getUser" | "updateUser">, password: string, confirmation: string): Promise<AuthErrorKey | null> {
  const invalid = passwordError(password, confirmation);
  if (invalid) return invalid;
  const { data: before, error: readError } = await auth.getUser();
  if (readError || !before.user || before.user.is_anonymous) return "authFailed";
  const { data, error } = await auth.updateUser({ password });
  if (error) return passwordAuthError(error, "passwordUpdateFailed");
  return data.user?.id === before.user.id ? null : "passwordUpdateFailed";
}

export async function startGoogle(auth: Pick<Auth, "signInWithOAuth">, origin: string) {
  const { error } = await auth.signInWithOAuth({ provider: "google", options: { redirectTo: new URL("/auth/callback", origin).href } });
  return error ? identityErrorKey(error) : null;
}

export async function sendEmailCode(auth: Pick<Auth, "signInWithOtp">, input: string): Promise<AuthErrorKey | null> {
  const email = input.trim();
  if (!validEmail(email)) return "emailInvalid";
  const { error } = await auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  return error ? emailSendErrorKey(error) : null;
}

export async function verifyEmailCode(auth: Pick<Auth, "verifyOtp">, email: string, input: string): Promise<AuthErrorKey | null> {
  if (!validEmail(email.trim())) return "emailInvalid";
  const token = input.trim();
  if (!/^\d{6,10}$/.test(token)) return "codeInvalid";
  const { data, error } = await auth.verifyOtp({ email: email.trim(), token, type: "email" });
  if (error) return error.code === "otp_expired" ? "codeInvalid" : identityErrorKey(error);
  return data.session && data.user && !data.user.is_anonymous ? null : "authFailed";
}

export async function logout(auth: Pick<Auth, "signOut">, navigate: (path: string) => void) {
  const { error } = await auth.signOut({ scope: "local" });
  if (error) return identityErrorKey(error);
  navigate("/");
  return null;
}
