"use client";

import { useRef, useState } from "react";
import { useLocale } from "@/lib/i18n/provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { sendEmailCode, sendPasswordRecovery, signInWithPassword, signUpWithPassword, verifyEmailCode, type AuthErrorKey } from "./auth";

type Mode = "welcome" | "login" | "signup" | "recovery" | "otp" | "otp-code";
const inputClass = "min-h-16 w-full rounded-2xl border border-border bg-surface px-5 text-base text-foreground placeholder:text-muted";
const primary = "min-h-16 w-full rounded-2xl bg-accent px-5 text-base font-bold text-[#171717] disabled:opacity-50";
const linkButton = "min-h-11 text-sm underline underline-offset-4";

export function AuthScreen({ callbackError = false }: { callbackError?: boolean }) {
  const { t, locale, setLocale } = useLocale();
  const [mode, setMode] = useState<Mode>(callbackError ? "login" : "welcome");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<AuthErrorKey | null>(callbackError ? "authFailed" : null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const lastSent = useRef(0);

  function switchMode(next: Mode) {
    setMode(next); setError(null); setNotice(null); setPassword(""); setConfirmation(""); setCode("");
  }
  async function submit() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      const auth = getSupabaseBrowserClient().auth;
      if (mode === "login") {
        const failure = await signInWithPassword(auth, email, password);
        setError(failure);
        if (!failure) window.location.replace("/");
      } else if (mode === "signup") {
        const result = await signUpWithPassword(auth, email, password, confirmation, window.location.origin);
        if (!result.ok) setError(result.error);
        else if (result.status === "authenticated") window.location.replace("/");
        else setNotice(t.checkEmailVerification);
      } else if (mode === "recovery") {
        const failure = await sendPasswordRecovery(auth, email, window.location.origin);
        setError(failure);
        if (!failure) setNotice(t.recoveryEmailSent);
      } else if (mode === "otp") {
        if (Date.now() - lastSent.current < 60_000) { setError("authRateLimited"); return; }
        const address = email.trim();
        const failure = await sendEmailCode(auth, address);
        setError(failure);
        if (!failure) { setSentTo(address); setMode("otp-code"); lastSent.current = Date.now(); }
      } else {
        const failure = await verifyEmailCode(auth, sentTo ?? "", code);
        setError(failure);
        if (!failure) window.location.replace("/");
      }
    } catch (cause) {
      setError(cause instanceof Error && cause.message.startsWith("THING: ") ? "authNotConfigured" : "connectionFailed");
    } finally { pending.current = false; setBusy(false); }
  }

  const needsPassword = mode === "login" || mode === "signup";
  return <div className="flex min-h-[calc(100dvh-7rem)] flex-col justify-center pb-8 sm:min-h-[calc(100dvh-10rem)]">
    <div className="mb-10 flex items-center justify-end gap-1" aria-label={t.language}>
      <button type="button" aria-label={t.english} aria-pressed={locale === "en"} onClick={() => setLocale("en")} className={`min-h-11 min-w-11 rounded-full text-xs font-bold tracking-widest ${locale === "en" ? "bg-foreground text-background" : "text-muted"}`}>EN</button>
      <button type="button" aria-label={t.spanish} aria-pressed={locale === "es"} onClick={() => setLocale("es")} className={`min-h-11 min-w-11 rounded-full text-xs font-bold tracking-widest ${locale === "es" ? "bg-foreground text-background" : "text-muted"}`}>ES</button>
    </div>
    {mode === "welcome" ? <div className="space-y-12 pb-4">
      <div className="space-y-10"><p className="font-heading text-2xl font-black tracking-tight">THING.</p><h1 className="font-heading max-w-sm text-5xl leading-[.95] font-bold tracking-tight">{t.authTagline}</h1><div className="flex items-center justify-between border-y border-dotted border-border py-5 text-3xl" aria-hidden="true"><span>🍒</span><span>🌙</span><span>✨</span><span>🍀</span></div></div>
      <div className="space-y-4"><p className="font-heading text-2xl font-bold lowercase">{t.startThing}.</p><button className={primary} onClick={() => switchMode("signup")}>{t.createAccount}</button><button className="min-h-16 w-full border border-border bg-surface px-5 font-bold" onClick={() => switchMode("login")}>{t.signIn}</button></div>
    </div> : <>
    <div className="mb-8"><p className="font-heading text-xl font-black tracking-tight">THING.</p><h1 className="mt-5 font-heading text-4xl font-bold tracking-tight">{mode === 'signup' ? t.createAccount.replace(' →', '') : mode === 'recovery' ? t.forgotPassword : mode === 'otp' || mode === 'otp-code' ? t.useCodeInstead : t.signIn.replace(' →', '')}</h1></div>
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      {mode === "otp-code" ? <>
        <p role="status" className="break-words text-sm text-muted">{t.codeSent} <strong className="text-foreground">{sentTo}</strong></p>
        <label className="block space-y-2"><span className="text-sm font-semibold">{t.emailCode}</span><input className={`${inputClass} text-center text-2xl tracking-[.2em]`} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" minLength={6} maxLength={10} required disabled={busy} autoFocus /></label>
      </> : <label className="block space-y-2"><span className="text-sm font-semibold">{t.email}</span><input className={inputClass} type="email" autoComplete="email" placeholder="you@example.com" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} /></label>}
      {needsPassword && <label className="block space-y-2"><span className="text-sm font-semibold">{t.password}</span><input className={inputClass} type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={mode === "signup" ? 8 : undefined} required value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} /></label>}
      {mode === "signup" && <label className="block space-y-2"><span className="text-sm font-semibold">{t.confirmPassword}</span><input className={inputClass} type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={busy} /></label>}
      {error && <p role="alert" className="text-sm text-accent">{t[error]}</p>}
      {notice && <p role="status" className="text-sm leading-relaxed">{notice}</p>}
      <button className={primary} disabled={busy}>{busy ? t.loading : mode === "login" ? t.signIn : mode === "signup" ? t.createAccount : mode === "recovery" ? t.sendRecovery : mode === "otp" ? t.sendCode : t.verifyCode}</button>
    </form>
    <div className="mt-4 flex flex-col items-start">
      {mode === "login" && <><button className={linkButton} onClick={() => switchMode("recovery")}>{t.forgotPassword}</button><button className={linkButton} onClick={() => switchMode("signup")}>{t.newHere} {t.createAccount}</button><button className={linkButton} onClick={() => switchMode("otp")}>{t.useCodeInstead}</button></>}
      {mode === "otp-code" && <><button className={linkButton} disabled={busy} onClick={() => { setMode("otp"); setError(null); }}>{t.resendCode}</button><button className={linkButton} onClick={() => { setSentTo(null); switchMode("otp"); }}>{t.changeEmail}</button></>}
      {mode !== "login" && mode !== "otp-code" && <button className={linkButton} onClick={() => switchMode("login")}>{t.backToSignIn}</button>}
    </div></>}
  </div>;
}
