'use client';

import { useEffect } from 'react';
import type { Moment } from './model';

export function formatMomentDate(value: string, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
}

export function MomentViewer({ moment, onClose }: { moment: Moment; onClose: () => void }) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) { if (event.key === 'Escape') onClose(); }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return <div role="dialog" aria-modal="true" aria-label="Moment photo" className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/80 p-4 sm:p-8">
    <button type="button" aria-label="Close moment backdrop" onClick={onClose} className="absolute inset-0 cursor-default" />
    <article className="relative z-10 w-full max-w-lg rotate-[-1deg] bg-[#fffdf8] p-3 pb-6 text-[#171717] shadow-2xl sm:p-5 sm:pb-8">
      <button type="button" aria-label="Close moment" onClick={onClose} className="absolute right-4 top-4 z-20 grid size-11 place-items-center rounded-full bg-black/70 text-2xl font-light text-white">×</button>
      {/* Moment photos intentionally keep their original square instant-photo crop. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={moment.image_url} alt={moment.caption || 'Shared moment'} className="aspect-square w-full bg-black/5 object-cover" />
      <div className="px-2 pt-5">
        <span className="inline-flex rounded-full border border-black/15 px-3 py-1 text-[10px] font-black uppercase tracking-[.18em]">moment</span>
        {moment.caption && <p className="mt-3 font-heading text-2xl font-bold leading-tight">{moment.caption}</p>}
        <time dateTime={moment.created_at} className="mt-2 block text-xs font-semibold uppercase tracking-[.12em] text-black/55">{formatMomentDate(moment.created_at)}</time>
      </div>
    </article>
  </div>;
}
