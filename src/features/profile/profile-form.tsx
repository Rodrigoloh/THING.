"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n/provider";
import { Screen } from "@/components/ui/screen";
import { createProfile, loadProfile } from "./actions";
import { validateProfileInput, type ProfileError } from "./profile";
import { useProfile } from "./profile-provider";
import { AvatarPicker } from "./avatar-picker";
import { type AvatarChoice, type AvatarError } from "./avatar";
import { uploadProfilePhoto } from "./avatar-storage";

export function ProfileForm() {
  const { locale, setLocale, t } = useLocale();
  const { acceptProfile } = useProfile();
  const router = useRouter();
  const [name, setName] = useState("");
  const [choice, setChoice] = useState<AvatarChoice>({ type: null });
  const [error, setError] = useState<ProfileError | AvatarError | null>(null);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const input = validateProfileInput(name, locale);
    if (!input.ok) { setError(input.error); return; }
    pending.current = true;
    setSaving(true);
    setError(null);
    try {
      // Serialize the full read/upload/create sequence across same-origin tabs.
      // Re-check after taking the lock so a losing tab never overwrites a photo.
      const save = async () => {
        const current = await loadProfile();
        if (!current.ok) return current;
        if (current.profile) return { ok: true as const, profile: current.profile, destination: "/things" as const };
        let path: string | null = null;
        if (choice.type === "upload") {
          const uploaded = await uploadProfilePhoto(choice.file);
          if (!uploaded.ok) return uploaded;
          path = uploaded.path;
        }
        const form = new FormData();
        form.set("display_name", input.displayName);
        form.set("locale", input.locale);
        if (choice.type) form.set("avatar_type", choice.type);
        if (choice.type === "preset") form.set("avatar_key", choice.key);
        if (path) form.set("avatar_url", path);
        return createProfile(form);
      };
      const result = navigator.locks
        ? await navigator.locks.request("thing-profile-create", save)
        : await save();
      if (!result.ok) { setError(result.error); return; }
      acceptProfile(result.profile);
      router.replace(result.destination);
      router.refresh();
    } catch {
      setError("connectionFailed");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <Screen title={t.makeYours} description={t.profileIntro}>
      <form onSubmit={submit} noValidate className="space-y-6">
        <AvatarPicker name={name} choice={choice} onChange={setChoice} />
        <div className="space-y-2">
          <label htmlFor="display-name" className="block font-medium">{t.displayName}</label>
          <input id="display-name" name="display_name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="nickname" placeholder={t.nameHint} required aria-invalid={error?.startsWith("name") || undefined} aria-describedby={error ? "profile-error" : undefined} className="min-h-14 w-full rounded-[18px] border border-border bg-surface px-4" />
        </div>
        <div className="space-y-2">
          <label htmlFor="profile-locale" className="block font-medium">{t.language}</label>
          <select id="profile-locale" name="locale" value={locale} onChange={(event) => setLocale(event.target.value === "es" ? "es" : "en")} className="min-h-14 w-full rounded-[18px] border border-border bg-surface px-4">
            <option value="en" lang="en">{t.english}</option>
            <option value="es" lang="es">{t.spanish}</option>
          </select>
        </div>
        {error && <p id="profile-error" role="alert" className="text-sm">{t[error]}</p>}
        <button type="submit" disabled={saving} className="flex min-h-14 w-full items-center justify-center rounded-[18px] bg-accent px-5 py-4 font-semibold text-[#171717] disabled:opacity-60">{saving ? t.saving : t.continue}</button>
      </form>
    </Screen>
  );
}
