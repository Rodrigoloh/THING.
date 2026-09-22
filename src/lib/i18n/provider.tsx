"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { messages, resolveLocale, type Locale, type Messages } from "./messages";

const LocaleContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void; t: Messages } | null>(null);

export function LocaleProvider({ children, initialLocale }: { children: React.ReactNode; initialLocale?: Locale }) {
  const [locale, updateLocale] = useState<Locale>(initialLocale ?? "en");
  const setLocale = useCallback((value: Locale) => {
    updateLocale(value);
    try { sessionStorage.setItem("thing-locale", value); } catch { /* Storage is optional. */ }
  }, []);
  useEffect(() => {
    if (initialLocale) return;
    // Browser language is only a default before the stored profile is loaded.
    let stored: string | null = null;
    try { stored = sessionStorage.getItem("thing-locale"); } catch { /* Storage is optional. */ }
    const initial = resolveLocale(stored, navigator.language);
    // Apply asynchronously to keep the server/client first render identical.
    queueMicrotask(() => setLocale(initial));
  }, [initialLocale, setLocale]);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  return <LocaleContext.Provider value={{ locale, setLocale, t: messages[locale] }}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used within LocaleProvider.");
  return value;
}
