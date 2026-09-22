import type { Profile } from "@/types/database";

export const avatarKeys = [
  "blob_red", "blob_blue", "star_yellow", "moon_purple",
  "alien_green", "smile_orange", "cloud_blue", "spark_red",
] as const;
export type AvatarKey = (typeof avatarKeys)[number];
export type AvatarChoice =
  | { type: null }
  | { type: "preset"; key: AvatarKey }
  | { type: "upload"; file: File };

export type AvatarFields = Pick<Profile, "avatar_type" | "avatar_key" | "avatar_url">;
export type AvatarError = "invalidPhotoType" | "photoTooLarge" | "invalidPhotoData" | "photoUploadFailed" | "avatarInvalid";
export const avatarBucket = "avatars";
export const maxAvatarBytes = 5 * 1024 * 1024;
const allowedTypes = ["image/jpeg", "image/png", "image/webp"] as const;

export function isAvatarKey(value: unknown): value is AvatarKey {
  return typeof value === "string" && (avatarKeys as readonly string[]).includes(value);
}

export function avatarObjectPath(userId: string): string {
  return `${userId}/profile`;
}

export function resolveAvatarFields(userId: string, type: unknown, key: unknown, path: unknown):
  | { ok: true; fields: AvatarFields }
  | { ok: false; error: "avatarInvalid" } {
  if (type === null || type === "") {
    if (key || path) return { ok: false, error: "avatarInvalid" };
    return { ok: true, fields: { avatar_type: null, avatar_key: null, avatar_url: null } };
  }
  if (type === "preset" && isAvatarKey(key) && !path) {
    return { ok: true, fields: { avatar_type: "preset", avatar_key: key, avatar_url: null } };
  }
  if (type === "upload" && !key && path === avatarObjectPath(userId)) {
    return { ok: true, fields: { avatar_type: "upload", avatar_key: null, avatar_url: path } };
  }
  return { ok: false, error: "avatarInvalid" };
}

export function initialsFor(name: string, locale: "en" | "es"): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0] ?? "").join("").toLocaleUpperCase(locale);
}

export function validateAvatarFile(file: Pick<File, "size" | "type">): AvatarError | null {
  if (!allowedTypes.includes(file.type as (typeof allowedTypes)[number])) return "invalidPhotoType";
  if (file.size > maxAvatarBytes) return "photoTooLarge";
  if (file.size === 0) return "invalidPhotoData";
  return null;
}

export function hasImageSignature(bytes: Uint8Array, type: string): boolean {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value);
  if (type === "image/webp") return [82, 73, 70, 70].every((value, i) => bytes[i] === value) && [87, 69, 66, 80].every((value, i) => bytes[i + 8] === value);
  return false;
}

export async function checkAvatarFile(file: File): Promise<AvatarError | null> {
  const initial = validateAvatarFile(file);
  if (initial) return initial;
  try {
    const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    return hasImageSignature(header, file.type) ? null : "invalidPhotoData";
  } catch {
    return "invalidPhotoData";
  }
}
