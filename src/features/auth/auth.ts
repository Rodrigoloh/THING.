import type { SupabaseClient, User } from "@supabase/supabase-js";

export type Identity = { id: string; provider: string; email: string | null };
type Auth = SupabaseClient["auth"];
export type AuthErrorKey = "authFailed" | "authRateLimited" | "emailInvalid" | "codeInvalid";

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

export function validEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function startGoogle(auth: Pick<Auth, "signInWithOAuth">, origin: string) {
  const { error } = await auth.signInWithOAuth({ provider: "google", options: { redirectTo: new URL("/auth/callback", origin).href } });
  return error ? identityErrorKey(error) : null;
}

export async function sendEmailCode(auth: Pick<Auth, "signInWithOtp">, input: string): Promise<AuthErrorKey | null> {
  const email = input.trim();
  if (!validEmail(email)) return "emailInvalid";
  const { error } = await auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  return error ? identityErrorKey(error) : null;
}

export async function verifyEmailCode(auth: Pick<Auth, "verifyOtp">, email: string, input: string): Promise<AuthErrorKey | null> {
  if (!validEmail(email.trim())) return "emailInvalid";
  const token = input.trim();
  if (!/^\d{6}$/.test(token)) return "codeInvalid";
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
