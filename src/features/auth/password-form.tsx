"use client";

import { useRef, useState } from "react";
import { useLocale } from "@/lib/i18n/provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { updateAccountPassword, type AuthErrorKey } from "./auth";

export function PasswordForm({ recovery = false }: { recovery?: boolean }) {
  const { t } = useLocale();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<AuthErrorKey | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(null); setSaved(false);
    try {
      const failure = await updateAccountPassword(getSupabaseBrowserClient().auth, password, confirmation);
      setError(failure);
      if (!failure) {
        setSaved(true); setPassword(""); setConfirmation("");
        if (recovery) window.location.replace("/");
      }
    } catch { setError("connectionFailed"); }
    finally { pending.current = false; setBusy(false); }
  }
  const input = "min-h-14 w-full rounded-[18px] border border-border bg-surface px-4";
  return <form onSubmit={submit} className="space-y-4">
    <h2 className="text-xl font-semibold">{recovery ? t.chooseNewPassword : t.setOrChangePassword}</h2>
    <p className="text-sm text-muted">{t.passwordHint}</p>
    <label className="block space-y-2"><span>{t.newPassword}</span><input className={input} type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} /></label>
    <label className="block space-y-2"><span>{t.confirmPassword}</span><input className={input} type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={busy} /></label>
    {error && <p role="alert" className="text-sm">{t[error]}</p>}
    {saved && <p role="status" className="text-sm">{t.passwordUpdated}</p>}
    <button className="min-h-14 w-full rounded-[18px] bg-accent px-5 font-semibold text-[#171717] disabled:opacity-50" disabled={busy}>{busy ? t.loading : t.savePassword}</button>
  </form>;
}
