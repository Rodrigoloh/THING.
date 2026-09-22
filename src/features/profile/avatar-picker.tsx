"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n/provider";
import { AvatarRenderer } from "./avatar-renderer";
import { avatarKeys, checkAvatarFile, type AvatarChoice, type AvatarError, type AvatarKey } from "./avatar";

const labels: Record<AvatarKey, "presetBlobRed" | "presetBlobBlue" | "presetStarYellow" | "presetMoonPurple" | "presetAlienGreen" | "presetSmileOrange" | "presetCloudBlue" | "presetSparkRed"> = {
  blob_red: "presetBlobRed", blob_blue: "presetBlobBlue", star_yellow: "presetStarYellow", moon_purple: "presetMoonPurple",
  alien_green: "presetAlienGreen", smile_orange: "presetSmileOrange", cloud_blue: "presetCloudBlue", spark_red: "presetSparkRed",
};

export function AvatarPicker({ name, choice, onChange }: { name: string; choice: AvatarChoice; onChange: (choice: AvatarChoice) => void }) {
  const { t } = useLocale();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<AvatarError | null>(null);
  const selection = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (choice.type !== "upload") return;
    const url = URL.createObjectURL(choice.file);
    queueMicrotask(() => setPreviewUrl(url));
    return () => URL.revokeObjectURL(url);
  }, [choice]);

  function select(choice: AvatarChoice) {
    selection.current += 1;
    setError(null);
    if (choice.type !== "upload") setPreviewUrl(null);
    onChange(choice);
  }

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    const current = ++selection.current;
    const invalid = await checkAvatarFile(file);
    if (current !== selection.current) return;
    if (invalid) { setError(invalid); return; }
    setError(null);
    onChange({ type: "upload", file });
  }

  const type = choice.type;
  const keyName = type === "preset" ? choice.key : null;
  return <div className="space-y-4">
    <div className="flex items-center gap-4">
      <AvatarRenderer name={name} type={type} keyName={keyName} previewUrl={type === "upload" ? previewUrl : null} />
      <div className="space-y-2">
        <p className="text-[13px] text-muted">{t.avatarHint}</p>
        {type !== null && <button type="button" onClick={() => select({ type: null })} className="min-h-11 text-sm underline underline-offset-4">{t.removeAvatar}</button>}
      </div>
    </div>
    <fieldset className="space-y-3">
      <legend className="font-medium">{t.chooseAvatar}</legend>
      <div className="grid grid-cols-4 gap-3">
        {avatarKeys.map((key) => <button key={key} type="button" onClick={() => select({ type: "preset", key })} aria-label={t[labels[key]]} aria-pressed={type === "preset" && choice.key === key} className="aspect-square min-w-0 rounded-[18px] border-2 border-transparent focus-visible:outline-offset-2 aria-pressed:border-foreground">
          {/* Local SVG files can use the browser's native image layout. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/avatars/${key}.svg`} alt="" className="size-full rounded-[16px] object-cover" />
        </button>)}
      </div>
    </fieldset>
    <div>
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label={t.uploadPhoto} onChange={(event) => { void chooseFile(event.target.files?.[0]); event.target.value = ""; }} />
      <button type="button" onClick={() => fileInput.current?.click()} className="min-h-11 rounded-[16px] border border-border bg-surface px-4 font-medium">{t.uploadPhoto}</button>
      {type === "upload" && <p className="mt-2 text-[13px] text-muted">{t.photoSelected}: {choice.file.name}</p>}
      {error && <p role="alert" className="mt-2 text-sm">{t[error]}</p>}
    </div>
  </div>;
}
