'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ThingTheme } from './thing-theme';
import type { ThingColor } from '@/features/things/model';

export function HangoutShell({ thingId, title, progress, color, children }: { thingId: string; title: string; progress?: string; color: ThingColor; children: ReactNode }) {
  return <ThingTheme color={color} className="space-y-10 pb-8">
    <header className="flex min-h-12 items-center justify-between gap-4 border-b border-border py-3 text-sm">
      <Link href={`/thing/${thingId}`} className="font-semibold lowercase">← {title}</Link>
      {progress && <span className="font-heading font-bold text-[var(--thing-accent-text)]">{progress}</span>}
    </header>
    {children}
  </ThingTheme>;
}
