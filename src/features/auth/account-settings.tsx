"use client";
import { useRef, useState } from "react";
import { Screen } from "@/components/ui/screen";
import { useLocale } from "@/lib/i18n/provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { logout, type AuthErrorKey } from "./auth";
import { PasswordForm } from "./password-form";

export function AccountSettings() {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthErrorKey | null>(null);
  const pending = useRef(false);
  async function signOut() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try { setError(await logout(getSupabaseBrowserClient().auth, (path) => window.location.assign(path))); }
    catch { setError("authFailed"); }
    finally { pending.current = false; setBusy(false); }
  }
  return <Screen title={t.accountSettings} backHref="/things">
    <div className="rounded-[20px] border border-border bg-surface p-6"><PasswordForm /></div>
    <button type="button" disabled={busy} onClick={() => void signOut()} className="min-h-14 w-full rounded-[18px] border border-border bg-surface px-5 py-4 font-semibold disabled:opacity-50">{busy ? t.loading : t.signOut}</button>
    {error && <p role="alert">{t[error]}</p>}
  </Screen>;
}
