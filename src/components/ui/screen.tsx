"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useLocale } from "@/lib/i18n/provider";

export function Screen({ title, description, backHref, children, wide = false }: { title: string; description?: string; backHref?: string; children?: ReactNode; wide?: boolean }) {
  const { t } = useLocale();
  return (
    <div className={`${wide ? "max-w-5xl" : "max-w-lg"} mx-auto space-y-8`}>
      {backHref && <Link href={backHref} className="inline-flex min-h-11 items-center text-sm text-muted hover:text-foreground">{t.back}</Link>}
      <div className="space-y-3">
        <h1 className={`font-heading leading-[.9] font-black tracking-[-.045em] ${wide ? "text-5xl sm:text-7xl" : "text-4xl"}`}>{title}</h1>
        {description && <p className="leading-relaxed text-muted">{description}</p>}
      </div>
      {children}
    </div>
  );
}
