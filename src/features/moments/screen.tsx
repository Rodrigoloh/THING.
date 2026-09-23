'use client';

import Link from 'next/link';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ThingTheme } from '@/components/thing/thing-theme';
import type { Result, ThingSnapshot } from '@/features/things/model';
import type { Moment } from './model';
import { addMoment } from './actions';

export function MomentsScreen({ thing, moments }: { thing: ThingSnapshot; moments: Result<Moment[]> }) {
  const router = useRouter(); const form = useRef<HTMLFormElement>(null); const [error, setError] = useState(''); const [pending, startTransition] = useTransition();
  return <ThingTheme color={thing.color_key} className="mx-auto min-h-dvh w-full max-w-3xl pb-10"><header className="flex items-center justify-between py-5"><Link href={`/thing/${thing.id}`} className="min-h-11 content-center">← THING.</Link><span className="text-sm text-muted">shared camera roll</span></header><main className="space-y-8"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-muted">moments</p><h1 className="font-heading text-4xl font-bold">little things to keep.</h1></div>
    {thing.status === 'active' && <form ref={form} className="space-y-3 border-y border-dashed border-border py-5" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); startTransition(async () => { const result = await addMoment(thing.id, data); if (!result.ok) setError(result.error); else { setError(''); form.current?.reset(); router.refresh(); } }); }}><label className="block text-sm font-semibold">add a photo<input required name="image" type="file" accept="image/jpeg,image/png,image/webp" className="mt-2 block w-full text-sm" /></label><input name="caption" maxLength={140} placeholder="a small caption (optional)" className="min-h-12 w-full rounded-[16px] border border-border bg-surface px-4" /><button disabled={pending} className="thing-primary-button min-h-12 rounded-[16px] px-5 font-bold">{pending ? 'saving…' : 'keep this moment'}</button>{error && <p role="alert" className="text-sm">Use a JPEG, PNG or WebP under 5 MB and a caption under 140 characters.</p>}</form>}
    {moments.ok ? moments.data.length ? <section className="columns-2 gap-3 sm:columns-3">{moments.data.map((moment, index) => <article key={moment.id} className="mb-3 break-inside-avoid border border-border bg-surface p-2" style={{ transform: `rotate(${index % 3 - 1}deg)` }}><div role="img" aria-label={moment.caption || 'Shared moment'} className="aspect-square bg-cover bg-center" style={{ backgroundImage: `url(${JSON.stringify(moment.image_url)})` }} />{moment.caption && <p className="px-1 pt-2 font-heading text-sm font-semibold">{moment.caption}</p>}<time className="px-1 text-[11px] text-muted">{new Date(moment.created_at).toLocaleDateString()}</time></article>)}</section> : <p className="border-y border-dashed border-border py-16 text-center text-muted">Your shared camera roll starts here.</p> : <p role="alert">Could not load moments.</p>}
  </main></ThingTheme>;
}
