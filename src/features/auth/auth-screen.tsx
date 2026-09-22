"use client";

import { useRef, useState } from "react";
import { Screen } from "@/components/ui/screen";
import { useLocale } from "@/lib/i18n/provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { sendEmailCode, startGoogle, verifyEmailCode, type AuthErrorKey } from "./auth";

export function AuthScreen({ callbackError = false }: { callbackError?: boolean }) {
  const { t, locale, setLocale } = useLocale();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<AuthErrorKey | null>(callbackError ? "authFailed" : null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const lastSent = useRef(0);
  const button = "min-h-14 w-full rounded-[18px] bg-accent px-5 py-4 font-semibold text-[#171717] disabled:opacity-50";
  const input = "min-h-14 w-full rounded-[16px] border border-border bg-surface px-4 text-foreground";

  async function run(action: "google" | "send" | "verify") {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const auth = getSupabaseBrowserClient().auth;
      if (action === "google") {
        setError(await startGoogle(auth, window.location.origin));
      } else if (action === "send") {
        if (Date.now() - lastSent.current < 60_000) { setError("authRateLimited"); return; }
        const address = (sentTo ?? email).trim();
        const failure = await sendEmailCode(auth, address);
        setError(failure);
        if (!failure) { setSentTo(address); setCode(""); lastSent.current = Date.now(); }
      } else {
        const failure = await verifyEmailCode(auth, sentTo ?? "", code);
        setError(failure);
        // A full request reads the newly written SDK cookies before routing.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Discard prefetched routes from before sign-in.
        if (!failure) window.location.assign("/");
      }
    } catch { setError("authFailed"); }
    finally { pending.current = false; setBusy(false); }
  }

  return <Screen title="THING." description={t.authTagline}>
    <div className="space-y-5">
      <button type="button" disabled={busy} onClick={() => void run("google")} className={button}>{t.googleContinue}</button>
      <p className="text-center text-sm text-muted">{t.or}</p>
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void run(sentTo ? "verify" : "send"); }}>
        {sentTo ? <>
          <p role="status" className="break-words text-sm text-muted">{t.codeSent} {sentTo}</p>
          <label className="block space-y-2"><span>{t.emailCode}</span><input className={input} name="code" value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required disabled={busy} autoFocus /></label>
        </> : <label className="block space-y-2"><span>{t.email}</span><input className={input} name="email" type="email" autoComplete="email" placeholder="you@example.com" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} /></label>}
        {error && <p role="alert" className="text-sm">{t[error]}</p>}
        <button className={button} disabled={busy}>{busy ? t.loading : sentTo ? t.verifyCode : t.continue}</button>
      </form>
      {sentTo && <div className="flex flex-wrap justify-between gap-3 text-sm">
        <button type="button" disabled={busy} onClick={() => void run("send")} className="min-h-11 underline">{t.resendCode}</button>
        <button type="button" disabled={busy} onClick={() => { setSentTo(null); setCode(""); setError(null); }} className="min-h-11 underline">{t.changeEmail}</button>
      </div>}
      <label className="flex min-h-11 items-center justify-center gap-3 text-sm"><span>{t.language}</span><select aria-label={t.language} value={locale} onChange={(event) => setLocale(event.target.value === "es" ? "es" : "en")} className="min-h-11 rounded-lg border border-border bg-surface px-3"><option value="en">EN</option><option value="es">ES</option></select></label>
    </div>
  </Screen>;
}
