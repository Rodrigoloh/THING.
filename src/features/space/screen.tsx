import Link from 'next/link';
import { ThingTheme } from '@/components/thing/thing-theme';
import { CharmIcon, thingDisplayName } from '@/components/thing/charm-icon';
import type { ThingSnapshot } from '@/features/things/model';
import type { SouvenirKey, SpaceSnapshot } from './model';

const souvenirCopy: Record<SouvenirKey, { title: string; mode: string; description: string }> = {
  FIRST_THOUGHT: { title: 'FIRST THOUGHT', mode: 'Same Brain', description: 'First completed Same Brain' },
  SAME_BRAIN: { title: 'SAME BRAIN', mode: 'Same Brain', description: 'Three matches in a row' },
  LOCKED_IN: { title: 'LOCKED IN', mode: 'Same Brain', description: 'Five matches in a row' },
  PERFECT_SYNC: { title: '100%', mode: 'Same Brain', description: 'Matched all the way through' },
  HEAT_CHECK: { title: 'HEAT CHECK', mode: 'Hot', description: 'First completed Hot' },
  TURNED_UP: { title: 'TURNED UP', mode: 'Hot', description: 'First mutual step into Bold' },
  AFTER_HOURS: { title: 'AFTER HOURS', mode: 'Hot', description: 'First time you reached Spicy' },
  KITKAT: { title: 'KITKAT', mode: 'Hot', description: 'Secret level found' },
};

export function SpaceScreen({ thing, space }: { thing: ThingSnapshot; space: SpaceSnapshot }) {
  const stats = [
    [String(space.current_streak), 'day streak'], [String(space.total_completed_hangouts), 'hangouts'],
    [`${Math.round(space.same_brain.lifetime_match_rate * 100)}%`, 'Same Brain'], [String(space.hot.hangouts), 'Hot nights'],
  ];
  return <ThingTheme color={thing.color_key} className="mx-auto min-h-dvh w-full max-w-3xl pb-12"><header className="flex items-center justify-between py-5"><Link href={`/thing/${thing.id}`} className="min-h-11 content-center">← THING.</Link><CharmIcon charm={thing.charm_key} size={48} /></header><main className="space-y-10"><section><p className="text-xs font-bold uppercase tracking-[.2em] text-muted">{thingDisplayName(thing)} · space</p><h1 className="font-heading text-5xl font-black tracking-tight">what you’ve made.</h1></section><section aria-label="Shared stats" className="grid grid-cols-2 border-y border-border sm:grid-cols-4">{stats.map(([value,label]) => <div key={label} className="py-5"><strong className="thing-accent-text block font-heading text-3xl">{value}</strong><span className="text-xs text-muted">{label}</span></div>)}</section><section className="space-y-5"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-muted">souvenirs</p><h2 className="font-heading text-3xl font-bold">the shelf</h2></div>{space.souvenirs.length ? <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">{space.souvenirs.map((souvenir,index) => { const copy=souvenirCopy[souvenir.key]; return <article key={souvenir.key} className="border-2 border-[var(--thing-accent-border)] bg-[var(--thing-primary-soft)] p-4 shadow-[4px_4px_0_var(--thing-primary)]" style={{ transform:`rotate(${index%2?1:-1}deg)` }}><p className="text-[10px] font-bold uppercase tracking-[.16em]">{copy.mode}</p><h3 className="mt-3 font-heading text-xl font-black">{copy.title}</h3><p className="mt-2 text-sm">{copy.description}</p><time className="mt-4 block text-[11px] text-muted">{new Date(souvenir.unlocked_at).toLocaleDateString()}</time></article>; })}</div> : <p className="border-y border-dashed border-border py-12 text-muted">Play together and the shelf will fill up.</p>}</section><section className="grid grid-cols-3 gap-4 border-t border-border pt-6 text-sm"><div><strong>{space.know_me.correct}/{space.know_me.predictions}</strong><span className="block text-muted">Know Me</span></div><div><strong>{space.this_or_that.agreements}/{space.this_or_that.rounds}</strong><span className="block text-muted">agreed</span></div><div><strong>{space.hot.highest_level ?? '—'}</strong><span className="block text-muted">highest heat</span></div></section></main></ThingTheme>;
}
