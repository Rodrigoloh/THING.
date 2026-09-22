"use client";

import type { Profile } from "@/types/database";
import { useLocale } from "@/lib/i18n/provider";
import { initialsFor, isAvatarKey } from "./avatar";
import { publicAvatarUrl } from "./avatar-storage";

type AvatarProps = {
  name: string;
  type: Profile["avatar_type"];
  keyName?: Profile["avatar_key"];
  path?: Profile["avatar_url"];
  previewUrl?: string | null;
  size?: "small" | "large";
};

export function AvatarRenderer({ name, type, keyName, path, previewUrl, size = "large" }: AvatarProps) {
  const { locale, t } = useLocale();
  const image = previewUrl || (type === "preset" && isAvatarKey(keyName) ? `/avatars/${keyName}.svg` : type === "upload" && path ? publicAvatarUrl(path) : null);
  return <span role="img" aria-label={name ? `${name} ${t.avatarType}` : t.initials} className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[20px] border border-border bg-surface font-semibold ${size === "small" ? "size-12 text-base" : "size-20 text-2xl"}`}>
    {image ? (
      // Dynamic Storage origins and local blob previews cannot use a fixed Next image allowlist.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image} alt="" className="size-full object-cover" />
    ) : <span aria-hidden="true">{initialsFor(name, locale) || "·"}</span>}
  </span>;
}
