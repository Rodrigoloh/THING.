"use client";

import { useLocale } from "@/lib/i18n/provider";

export function Placeholder({ children }: { children: React.ReactNode }) {
  const { t } = useLocale();
  return <div className="rounded-[20px] border border-border bg-surface p-6"><p className="mb-3 text-[13px] font-medium text-muted">{t.comingLater}</p><p className="leading-relaxed">{children}</p></div>;
}
