"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useLocale } from "@/lib/i18n/provider";

export function Screen({ title, description, backHref, children }: { title: string; description?: string; backHref?: string; children?: ReactNode }) {
  const { t } = useLocale();
  return (
    <div className="space-y-8">
      {backHref && <Link href={backHref} className="inline-flex min-h-11 items-center text-sm text-muted hover:text-foreground">{t.back}</Link>}
      <div className="space-y-3">
        <h1 className="text-4xl leading-tight font-semibold tracking-tight">{title}</h1>
        {description && <p className="leading-relaxed text-muted">{description}</p>}
      </div>
      {children}
    </div>
  );
}
