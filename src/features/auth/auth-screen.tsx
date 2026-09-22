"use client";

import { useRef, useState } from "react";
import { useLocale } from "@/lib/i18n/provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { sendEmailCode, verifyEmailCode, type AuthErrorKey } from "./auth";

export function AuthScreen({ callbackError = false }: { callbackError?: boolean }) {
  const { t, locale, setLocale } = useLocale();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<AuthErrorKey | null>(callbackError ? "authFailed" : null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const lastSent = useRef(0);

  async function run(action: "send" | "verify") {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const auth = getSupabaseBrowserClient().auth;
      if (action === "send") {
        if (Date.now() - lastSent.current < 60_000) { setError("authRateLimited"); return; }
        const address = (sentTo ?? email).trim();
        const failure = await sendEmailCode(auth, address);
        setError(failure);
        if (!failure) { setSentTo(address); setCode(""); lastSent.current = Date.now(); }
      } else {
        const failure = await verifyEmailCode(auth, sentTo ?? "", code);
        setError(failure);
        // Reload after the SDK saves the session so server routes see its cookies.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Discard prefetched routes from before sign-in.
        if (!failure) window.location.assign("/");
      }
    } catch (cause) {
      setError(cause instanceof Error && cause.message.startsWith("THING: ") ? "authNotConfigured" : "connectionFailed");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <div className="flex min-h-[calc(100dvh-7rem)] flex-col justify-center pb-8 sm:min-h-[calc(100dvh-10rem)]">
    <div className="mb-14 flex items-center justify-end gap-1" aria-label={t.language}>
      <button type="button" aria-label={t.english} aria-pressed={locale === "en"} onClick={() => setLocale("en")} className={`min-h-11 min-w-11 rounded-full text-xs font-bold tracking-widest ${locale === "en" ? "bg-foreground text-background" : "text-muted"}`}>EN</button>
      <button type="button" aria-label={t.spanish} aria-pressed={locale === "es"} onClick={() => setLocale("es")} className={`min-h-11 min-w-11 rounded-full text-xs font-bold tracking-widest ${locale === "es" ? "bg-foreground text-background" : "text-muted"}`}>ES</button>
    </div>

    <div className="mb-12">
      <div className="mb-10 flex h-20 items-center" aria-hidden="true">
        <span className="block h-17 w-17 rounded-full bg-accent" />
        <span className="-ml-4 block h-17 w-17 rounded-full border-[3px] border-foreground bg-background" />
      </div>
      <h1 className="text-[clamp(4rem,18vw,6.5rem)] leading-[.85] font-black tracking-[-.085em]">THING<span className="text-accent">.</span></h1>
      <p className="mt-5 text-lg leading-snug text-muted">{t.authTagline}</p>
    </div>

    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void run(sentTo ? "verify" : "send"); }}>
      {sentTo ? <>
        <p role="status" className="break-words text-sm leading-relaxed text-muted">{t.codeSent} <strong className="font-semibold text-foreground">{sentTo}</strong></p>
        <label className="block space-y-2"><span className="text-sm font-semibold">{t.emailCode}</span><input className="min-h-16 w-full rounded-2xl border border-border bg-surface px-5 text-center text-2xl tracking-[.4em] text-foreground" name="code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required disabled={busy} autoFocus /></label>
      </> : <label className="block space-y-2"><span className="text-sm font-semibold">{t.email}</span><input className="min-h-16 w-full rounded-2xl border border-border bg-surface px-5 text-base text-foreground placeholder:text-muted" name="email" type="email" autoComplete="email" placeholder="you@example.com" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} /></label>}
      {error && <p role="alert" className="text-sm leading-relaxed text-accent">{t[error]}</p>}
      <button className="min-h-16 w-full rounded-2xl bg-accent px-5 text-base font-bold text-[#171717] disabled:opacity-50" disabled={busy}>{busy ? t.loading : sentTo ? t.verifyCode : t.sendCode}</button>
    </form>
    {sentTo && <div className="mt-3 flex flex-wrap justify-between gap-3 text-sm">
      <button type="button" disabled={busy} onClick={() => void run("send")} className="min-h-11 underline underline-offset-4">{t.resendCode}</button>
      <button type="button" disabled={busy} onClick={() => { setSentTo(null); setCode(""); setError(null); }} className="min-h-11 underline underline-offset-4">{t.changeEmail}</button>
    </div>}
  </div>;
}
