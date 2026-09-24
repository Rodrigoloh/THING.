"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "@/lib/i18n/provider";

export function AppHeader() {
  const { t } = useLocale();
  const pathname = usePathname();
  const isThingHome = /^\/thing\/[^/]+(?:\/.*)?$/.test(pathname);
  return <>
    <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:p-4">{t.skip}</a>
    {pathname !== "/" && !isThingHome && <header className={`${pathname === "/things" ? "max-w-5xl" : "max-w-lg"} mx-auto flex items-center justify-between gap-4 py-6`}>
      <Link href="/" aria-label={t.home} className="font-heading py-3 text-2xl font-black tracking-[-.06em]">THING.</Link>
      {pathname === "/things" && <Link href="/profile/settings" className="min-h-11 content-center text-xs font-bold uppercase tracking-[.12em] text-muted">account</Link>}
    </header>}
  </>;
}
