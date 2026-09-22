"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { avatarBucket, avatarObjectPath, checkAvatarFile, type AvatarError } from "./avatar";

export async function uploadProfilePhoto(file: File): Promise<
  | { ok: true; path: string }
  | { ok: false; error: AvatarError }
> {
  const invalid = await checkAvatarFile(file);
  if (invalid) return { ok: false, error: invalid };
  const client = getSupabaseBrowserClient();
  try {
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user || user.is_anonymous) return { ok: false, error: "photoUploadFailed" };
    const path = avatarObjectPath(user.id);
    const { error } = await client.storage.from(avatarBucket).upload(path, file, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: true,
    });
    if (error) return { ok: false, error: "photoUploadFailed" };
    return { ok: true, path };
  } catch {
    return { ok: false, error: "photoUploadFailed" };
  }
}

export function publicAvatarUrl(path: string): string {
  return getSupabaseBrowserClient().storage.from(avatarBucket).getPublicUrl(path).data.publicUrl;
}
