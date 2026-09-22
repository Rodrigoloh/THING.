"use client";

import { useSyncExternalStore } from "react";

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
  const theme = useSyncExternalStore(subscribe, getTheme, () => "system" as Theme);
  return (
    <label className="flex items-center gap-2 text-[13px] text-muted">
      Theme
      <select value={theme} onChange={(event) => {
        const value = event.target.value;
        document.documentElement.dataset.theme = value;
        try { localStorage.setItem("thing-theme", value); } catch { /* Theme still works when storage is unavailable. */ }
        window.dispatchEvent(new Event(eventName));
      }} className="min-h-11 rounded-xl border border-border bg-surface px-2 text-foreground">
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
