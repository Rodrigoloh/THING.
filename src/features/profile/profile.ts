import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Profile } from "@/types/database";
import { resolveAvatarFields } from "./avatar";

export type ProfileError = "nameRequired" | "nameTooLong" | "nameInvalid" | "localeInvalid" | "avatarInvalid" | "profileLoadFailed" | "profileSaveFailed" | "connectionFailed" | "sessionRequired";
export type ProfileResult =
  | { ok: true; profile: Profile | null }
  | { ok: false; error: ProfileError };
export type SaveProfileResult =
  | { ok: true; profile: Profile; destination: "/things" }
  | { ok: false; error: ProfileError };
const fields = "id, display_name, avatar_url, avatar_type, avatar_key, locale";

export function validateProfileInput(name: unknown, locale: unknown):
  | { ok: true; displayName: string; locale: "en" | "es" }
  | { ok: false; error: ProfileError } {
  if (typeof name !== "string" || !name.trim()) return { ok: false, error: "nameRequired" };
  const displayName = name.trim();
  if (Array.from(displayName).length > 50) return { ok: false, error: "nameTooLong" };
  if (/[\p{Cc}\p{Cf}]/u.test(displayName)) return { ok: false, error: "nameInvalid" };
  if (locale !== "en" && locale !== "es") return { ok: false, error: "localeInvalid" };
  return { ok: true, displayName, locale };
}

export function profileDestination(pathname: string, hasProfile: boolean): string | null {
  if (pathname === "/dev" || pathname === "/profile/settings" || pathname === "/auth/update-password") return null;
  if (!hasProfile) return pathname === "/profile/create" ? null : "/profile/create";
  return pathname === "/" || pathname === "/profile/create" ? "/things" : null;
}

export async function readOwnProfile(client: SupabaseClient<Database>): Promise<ProfileResult> {
  try {
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user || user.is_anonymous) return { ok: false, error: "sessionRequired" };
    const { data, error } = await client.from("profiles").select(fields).eq("id", user.id).maybeSingle();
    if (error) return { ok: false, error: "profileLoadFailed" };
    return { ok: true, profile: data };
  } catch {
    return { ok: false, error: "connectionFailed" };
  }
}

export async function submitOwnProfile(client: SupabaseClient<Database>, name: unknown, locale: unknown, avatarType: unknown = null, avatarKey: unknown = null, avatarPath: unknown = null): Promise<SaveProfileResult> {
  const input = validateProfileInput(name, locale);
  if (!input.ok) return input;
  try {
    // Never accept a profile ID from the form. Derive it from verified Auth.
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user || user.is_anonymous) return { ok: false, error: "sessionRequired" };
    const avatar = resolveAvatarFields(user.id, avatarType, avatarKey, avatarPath);
    if (!avatar.ok) return avatar;
    const { data, error } = await client.from("profiles").insert({
      id: user.id, display_name: input.displayName, locale: input.locale, ...avatar.fields,
    }).select(fields).single();
    if (!error && data) return { ok: true, profile: data, destination: "/things" };
    if (error?.code === "23505") {
      // A second tab may have won. Read the saved row; do not overwrite its name
      // or language with stale form data from the losing tab.
      const existing = await readOwnProfile(client);
      if (existing.ok && existing.profile) return { ok: true, profile: existing.profile, destination: "/things" };
    }
    return { ok: false, error: "profileSaveFailed" };
  } catch {
    return { ok: false, error: "connectionFailed" };
  }
}
