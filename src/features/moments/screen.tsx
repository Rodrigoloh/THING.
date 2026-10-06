'use client';

import Link from 'next/link';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ThingTheme } from '@/components/thing/thing-theme';
import type { Result, ThingSnapshot } from '@/features/things/model';
import { PhotoBatchUpload } from '@/features/photos/batch-upload';
import { ThingGallery } from '@/features/photos/gallery';
import type { ThingGalleryPhoto } from '@/features/photos/model';
import { addMoment } from './actions';
import type { Moment } from './model';
import { MomentViewer } from './viewer';

type PhotoView = 'moments' | 'gallery';

export function MomentsScreen({ thing, moments, gallery, initialView = 'moments' }: { thing: ThingSnapshot; moments: Result<Moment[]>; gallery: Result<ThingGalleryPhoto[]>; initialView?: PhotoView }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<PhotoView>(initialView);
  const [error, setError] = useState('');
  const [selectedFile, setSelectedFile] = useState('');
  const [selectedMoment, setSelectedMoment] = useState<Moment | null>(null);
  const [pending, startTransition] = useTransition();

  return <ThingTheme color={thing.color_key} className="mx-auto min-h-dvh w-full max-w-3xl pb-10">
    <header className="flex items-center justify-between py-5"><Link href={`/thing/${thing.id}`} className="min-h-11 content-center">← THING.</Link><span className="text-sm text-muted">shared photos</span></header>
    <main className="space-y-7">
      <div><p className="text-xs font-bold uppercase tracking-[.2em] text-muted">together</p><h1 className="font-heading text-4xl font-bold">little things to keep.</h1></div>
      <nav aria-label="Photo views" className="grid grid-cols-2 border-y border-border">
        {(['moments', 'gallery'] as const).map((tab) => <button key={tab} type="button" aria-pressed={view === tab} onClick={() => setView(tab)} className={`min-h-12 text-sm font-black uppercase tracking-[.14em] ${view === tab ? 'bg-ink text-paper' : 'text-muted'}`}>{tab}</button>)}
      </nav>
      {view === 'gallery' ? <>
        {thing.status === 'active' && <PhotoBatchUpload thingId={thing.id} />}
        {gallery.ok ? <ThingGallery photos={gallery.data} members={thing.members} /> : <p role="alert" className="border-y border-dashed border-border py-12 text-center">Could not load the gallery.</p>}
      </> : <>
        {thing.status === 'active' && <form ref={form} className="space-y-3 border-y border-dashed border-border py-5" onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          startTransition(async () => {
            const result = await addMoment(thing.id, data);
            if (!result.ok) setError(result.error);
            else {
              setError('');
              setSelectedFile('');
              form.current?.reset();
              router.refresh();
            }
          });
        }}>
          <input ref={photoInput} required name="image" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setSelectedFile(event.target.files?.[0]?.name ?? '')} className="sr-only" />
          <button type="button" disabled={pending} onClick={() => photoInput.current?.click()} className="thing-primary-button flex min-h-14 w-full items-center justify-center gap-3 rounded-[18px] px-6 py-4 font-black disabled:opacity-50">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6 fill-none stroke-current stroke-2"><path d="M4 7.5h3l1.5-2h7l1.5 2h3v11H4z"/><circle cx="12" cy="13" r="3"/><path d="M19 2v4M17 4h4"/></svg>
            {selectedFile ? 'choose a different photo' : 'add a photo'}
          </button>
          <p className="text-center text-xs text-muted">{selectedFile || 'JPEG, PNG or WebP · up to 5 MB'}</p>
          <input name="caption" maxLength={140} placeholder="a small caption (optional)" className="min-h-12 w-full rounded-[16px] border border-border bg-surface px-4" />
          <button disabled={pending || !selectedFile} className="min-h-12 w-full rounded-[16px] border border-border bg-surface px-5 font-bold disabled:opacity-45">{pending ? 'saving…' : 'keep this moment'}</button>
          {error && <p role="alert" className="text-sm">Use a JPEG, PNG or WebP under 5 MB and a caption under 140 characters.</p>}
        </form>}
        {moments.ok ? moments.data.length ? <section className="columns-2 gap-3 sm:columns-3">{moments.data.map((moment, index) => <article key={moment.id} className="mb-3 break-inside-avoid" style={{ transform: `rotate(${index % 3 - 1}deg)` }}>
          <button type="button" onClick={() => setSelectedMoment(moment)} aria-label={`Open moment${moment.caption ? `: ${moment.caption}` : ''}`} className="w-full border border-border bg-surface p-2 text-left shadow-sm transition-transform hover:scale-[1.02] focus-visible:scale-[1.02]">
            <div role="img" aria-label={moment.caption || 'Shared moment'} className="aspect-square bg-cover bg-center" style={{ backgroundImage: `url(${JSON.stringify(moment.image_url)})` }}/>
            {moment.caption && <p className="px-1 pt-2 font-heading text-sm font-semibold">{moment.caption}</p>}
            <time className="px-1 text-[11px] text-muted">{new Date(moment.created_at).toLocaleDateString()}</time>
          </button>
        </article>)}</section> : <p className="border-y border-dashed border-border py-16 text-center text-muted">Your shared moments start here.</p> : <p role="alert">Could not load moments.</p>}
      </>}
    </main>
    {selectedMoment && <MomentViewer moment={selectedMoment} onClose={() => setSelectedMoment(null)} />}
  </ThingTheme>;
}
