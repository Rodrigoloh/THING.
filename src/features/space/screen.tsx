import Link from 'next/link';
import type { ChatMessage } from '@/features/chat/model';
import type { Moment } from '@/features/moments/model';
import type { ThingSnapshot } from '@/features/things/model';
import { getSouvenir } from '@/lib/souvenirs';
import type { SpaceSnapshot } from './model';

export function StatStrip({ space }: { space: SpaceSnapshot }) {
  const sameBrain = Math.round(space.same_brain.lifetime_match_rate * 100);
  return <section aria-label="Shared stats" className="grid grid-cols-3 border-y border-[var(--thing-accent-border)] py-4 text-center">
    <div><strong className="thing-accent-text block font-heading text-2xl font-black">{space.current_streak}</strong><span className="text-[10px] font-bold uppercase tracking-[.13em] text-muted">day streak</span></div>
    <div><strong className="thing-accent-text block font-heading text-2xl font-black">{space.total_completed_hangouts}</strong><span className="text-[10px] font-bold uppercase tracking-[.13em] text-muted">hangouts</span></div>
    <div><strong className="thing-accent-text block font-heading text-2xl font-black">{sameBrain}%</strong><span className="text-[10px] font-bold uppercase tracking-[.13em] text-muted">same brain</span></div>
  </section>;
}

export function SouvenirShelf({ space }: { space: SpaceSnapshot }) {
  return <section className="space-y-5" aria-labelledby="souvenir-shelf-title">
    <div className="flex items-end justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[.22em] text-muted">things you found</p><h2 id="souvenir-shelf-title" className="font-heading text-3xl font-black">souvenir shelf</h2></div><span aria-hidden="true" className="thing-accent-text rotate-12 text-3xl">✦</span></div>
    {space.souvenirs.length ? <div className="grid grid-cols-2 items-start gap-x-5 gap-y-9 sm:grid-cols-3">{space.souvenirs.map((souvenir,index) => {
      const copy=getSouvenir(souvenir.key);
      return <figure key={souvenir.key} className="text-center" style={{ transform:`rotate(${index%3===0?-1.5:index%3===2?1.5:0}deg)`, scale:index%4===1?'.93':'1' }}>
        <object data={copy.assetPath} type="image/svg+xml" aria-label={copy.title} className="mx-auto block h-36 w-full object-contain">
          <span className="mx-auto flex h-28 w-28 rotate-[-2deg] items-center justify-center rounded-[42%_58%_46%_54%] border-2 border-[var(--thing-accent-border)] bg-[var(--thing-primary-soft)] p-4 font-heading text-base font-black leading-tight">{copy.fallbackLabel}</span>
        </object>
        <figcaption className="mx-auto mt-2 max-w-40"><h3 className="font-heading text-base font-black">{copy.title}</h3><p className="mt-1 text-xs text-muted">{copy.description}</p></figcaption>
      </figure>;
    })}</div> : <p className="border-y border-dashed border-border py-7 text-sm text-muted">Your keepsakes will collect here as you play.</p>}
  </section>;
}

export function MomentsPreview({ thingId, moments }: { thingId: string; moments: Moment[] }) {
  return <section className="space-y-4" aria-labelledby="moments-preview-title">
    <div className="flex items-end justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[.22em] text-muted">camera roll</p><h2 id="moments-preview-title" className="font-heading text-3xl font-black">little moments</h2></div><Link href={`/thing/${thingId}/moments`} className="min-h-11 content-center text-sm font-bold underline decoration-[var(--thing-primary)] decoration-2 underline-offset-4">open all</Link></div>
    {moments.length ? <div className="grid grid-cols-3 gap-2">{moments.slice(0,3).map((moment,index) => <Link key={moment.id} href={`/thing/${thingId}/moments`} className={`relative overflow-hidden bg-[var(--thing-primary-soft)] ${index===0?'col-span-2 aspect-[4/3] rotate-[-1deg]':'aspect-square rotate-1'}`}>
      {/* Signed URLs are short-lived and already transformed by Supabase Storage. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {moment.image_url ? <img src={moment.image_url} alt={moment.caption || 'Shared moment'} className="absolute inset-0 h-full w-full object-cover" /> : <span className="grid h-full place-items-center font-heading text-xs font-bold">moment</span>}
    </Link>)}</div> : <Link href={`/thing/${thingId}/moments`} className="block border-y border-dashed border-border py-7 text-sm text-muted">The first photo will land here. <span className="thing-accent-text font-bold">Add a moment →</span></Link>}
  </section>;
}

export function ChatFragments({ thing, messages }: { thing: ThingSnapshot; messages: ChatMessage[] }) {
  const names=new Map(thing.members.map((member)=>[member.user_id,member.display_name]));
  return <section className="space-y-4" aria-labelledby="chat-fragments-title">
    <div className="flex items-end justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[.22em] text-muted">between you</p><h2 id="chat-fragments-title" className="font-heading text-3xl font-black">tiny notes</h2></div><Link href={`/thing/${thing.id}/chat`} className="min-h-11 content-center text-sm font-bold underline decoration-[var(--thing-primary)] decoration-2 underline-offset-4">open chat</Link></div>
    {messages.length ? <div className="space-y-3">{messages.map((message,index)=><blockquote key={message.id} className={`max-w-[88%] px-4 py-3 text-sm ${index%2?'ml-auto rotate-[.5deg] bg-[var(--thing-primary-soft)]':'rotate-[-.5deg] border-l-2 border-[var(--thing-accent-border)]'}`}><p>“{message.body}”</p><footer className="mt-1 text-[10px] font-bold uppercase tracking-[.12em] text-muted">{names.get(message.author_id) ?? 'you two'}</footer></blockquote>)}</div> : <Link href={`/thing/${thing.id}/chat`} className="block border-y border-dashed border-border py-7 text-sm text-muted">Small words can live here. <span className="thing-accent-text font-bold">Write one →</span></Link>}
  </section>;
}

export function Milestones({ space }: { space: SpaceSnapshot }) {
  const items=[
    `${space.same_brain.matches} Same Brain matches`,
    `${space.know_me.correct}/${space.know_me.predictions} Know Me`,
    `${space.this_or_that.agreements} shared picks`,
    space.hot.highest_level ? `Hot reached ${space.hot.highest_level}` : 'Hot is still a mystery',
    space.hot.highest_level === 'kitkat' ? 'KitKat found' : `${space.hot.kitkat_progress}/3 toward KitKat`,
  ];
  return <section className="space-y-4" aria-labelledby="milestones-title"><div><p className="text-[10px] font-bold uppercase tracking-[.22em] text-muted">the ongoing bit</p><h2 id="milestones-title" className="font-heading text-3xl font-black">made together</h2></div><div className="flex flex-wrap gap-2">{items.map((item,index)=><span key={item} className={`rounded-full px-3 py-2 text-xs font-semibold ${index%2?'border border-[var(--thing-accent-border)]':'bg-[var(--thing-primary-soft)]'}`}>{item}</span>)}</div></section>;
}
