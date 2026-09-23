import Link from 'next/link';
import { ThingTheme } from '@/components/thing/thing-theme';
import { CharmIcon, thingDisplayName } from '@/components/thing/charm-icon';
import type { ThingSnapshot } from '@/features/things/model';
import { getSouvenir } from '@/lib/souvenirs';
import type { SpaceSnapshot } from './model';

export function SpaceScreen({ thing, space }: { thing: ThingSnapshot; space: SpaceSnapshot }) {
  const stats = [
    [String(space.current_streak), 'day streak'],
    [String(space.total_completed_hangouts), 'hangouts'],
    [`${Math.round(space.same_brain.lifetime_match_rate * 100)}%`, 'Same Brain'],
    [String(space.hot.hangouts), 'Hot nights'],
  ];
  return <ThingTheme color={thing.color_key} className="mx-auto min-h-dvh w-full max-w-3xl pb-12">
    <header className="flex items-center justify-between py-5"><Link href={`/thing/${thing.id}`} className="min-h-11 content-center">← THING.</Link><CharmIcon charm={thing.charm_key} size={48} /></header>
    <main className="space-y-10">
      <section><p className="text-xs font-bold uppercase tracking-[.2em] text-muted">{thingDisplayName(thing)} · space</p><h1 className="font-heading text-5xl font-black tracking-tight">what you’ve made.</h1></section>
      <section aria-label="Shared stats" className="grid grid-cols-2 border-y border-border sm:grid-cols-4">{stats.map(([value,label]) => <div key={label} className="py-5"><strong className="thing-accent-text block font-heading text-3xl">{value}</strong><span className="text-xs text-muted">{label}</span></div>)}</section>
      <section className="space-y-5">
        <div><p className="text-xs font-bold uppercase tracking-[.2em] text-muted">souvenirs</p><h2 className="font-heading text-3xl font-bold">the shelf</h2></div>
        {space.souvenirs.length ? <div className="grid grid-cols-2 items-start gap-x-5 gap-y-10 sm:grid-cols-3">{space.souvenirs.map((souvenir,index) => {
          const copy=getSouvenir(souvenir.key);
          return <figure key={souvenir.key} className="text-center" style={{ transform:`rotate(${index%3===0?-1:index%3===2?1:0}deg)`, scale:index%4===1?'.94':'1' }}>
            <object data={copy.assetPath} type="image/svg+xml" aria-label={copy.title} className="mx-auto block h-40 w-full object-contain">
              <span className="mx-auto flex h-32 w-32 rotate-[-2deg] items-center justify-center rounded-[42%_58%_46%_54%] border-2 border-[var(--thing-accent-border)] bg-[var(--thing-primary-soft)] p-4 font-heading text-lg font-black leading-tight">{copy.fallbackLabel}</span>
            </object>
            <figcaption className="mx-auto mt-3 max-w-44"><h3 className="font-heading text-lg font-black">{copy.title}</h3><p className="mt-1 text-xs text-muted">{copy.description}</p><time className="mt-2 block text-[10px] font-bold uppercase tracking-[.12em] text-muted">{copy.engine === 'same_brain' ? 'Same Brain' : 'Hot'} · {new Date(souvenir.unlocked_at).toLocaleDateString()}</time></figcaption>
          </figure>;
        })}</div> : <p className="border-y border-dashed border-border py-12 text-muted">Play together and the shelf will fill up.</p>}
      </section>
      <section className="grid grid-cols-3 gap-4 border-t border-border pt-6 text-sm"><div><strong>{space.know_me.correct}/{space.know_me.predictions}</strong><span className="block text-muted">Know Me</span></div><div><strong>{space.this_or_that.agreements}/{space.this_or_that.rounds}</strong><span className="block text-muted">agreed</span></div><div><strong>{space.hot.highest_level ?? '—'}</strong><span className="block text-muted">highest heat</span></div></section>
    </main>
  </ThingTheme>;
}
