"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "@/lib/i18n/provider";

export function ThingNav({ thingId }: { thingId: string }) {
  const { t } = useLocale();
  const pathname = usePathname();
  const base = `/thing/${encodeURIComponent(thingId)}`;
  return (
    <nav aria-label={t.navAreas} className="grid grid-cols-3 gap-1 rounded-[18px] border border-border bg-surface p-1">
      {[ [t.navHome, ""], [t.chat, "/chat"], [t.moments, "/moments"] ].map(([label, suffix]) => (
        <Link key={label} href={`${base}${suffix}`} aria-current={pathname === `${base}${suffix}` ? "page" : undefined} className="flex min-h-11 items-center justify-center rounded-[14px] text-[13px] text-muted aria-[current=page]:bg-background aria-[current=page]:font-semibold aria-[current=page]:text-foreground">{label}</Link>
      ))}
    </nav>
  );
}
