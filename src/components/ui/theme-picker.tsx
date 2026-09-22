"use client";

import { useSyncExternalStore } from "react";
import { useLocale } from "@/lib/i18n/provider";

type Theme = "system" | "light" | "dark";
const eventName = "thing-theme-change";

function getTheme(): Theme {
  const value = document.documentElement.dataset.theme;
  return value === "light" || value === "dark" ? value : "system";
}

function subscribe(callback: () => void) {
  window.addEventListener(eventName, callback);
  return () => window.removeEventListener(eventName, callback);
}

export function ThemePicker() {
  const { t } = useLocale();
  const theme = useSyncExternalStore(subscribe, getTheme, () => "system" as Theme);
  return (
    <label className="flex items-center gap-2 text-[13px] text-muted">
      {t.theme}
      <select value={theme} onChange={(event) => {
        const value = event.target.value;
        document.documentElement.dataset.theme = value;
        try { localStorage.setItem("thing-theme", value); } catch { /* Theme still works when storage is unavailable. */ }
        window.dispatchEvent(new Event(eventName));
      }} className="min-h-11 rounded-xl border border-border bg-surface px-2 text-foreground">
        <option value="system">{t.system}</option>
        <option value="light">{t.light}</option>
        <option value="dark">{t.dark}</option>
      </select>
    </label>
  );
}
