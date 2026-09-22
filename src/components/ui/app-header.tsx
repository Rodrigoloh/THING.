"use client";
import Link from "next/link";
import { useLocale } from "@/lib/i18n/provider";

export function AppHeader() {
  const { t } = useLocale();
  return <>
    <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:p-4">{t.skip}</a>
    <header className="flex items-center justify-between gap-4 py-6">
      <Link href="/" aria-label={t.home} className="py-3 text-lg font-bold tracking-tight">THING.</Link>
    </header>
  </>;
}
