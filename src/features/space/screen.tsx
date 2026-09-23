'use client';

import { Screen } from '@/components/ui/screen';
import { charms, thingColors, type Result } from '@/features/things/model';
import { flowCopy } from '@/features/things/copy';
import { useLocale } from '@/lib/i18n/provider';
import type { SpaceSnapshot } from './model';

const card = 'rounded-[22px] border border-border bg-surface p-5';
const souvenirLabels = { FIRST_THOUGHT: 'FIRST THOUGHT', SAME_BRAIN: '★ SAME BRAIN', LOCKED_IN: '★★ LOCKED IN', PERFECT_SYNC: '100%' } as const;

const copy = {
  en: { title: 'your Space.', hangouts: 'completed Hangouts', streak: 'day streak', best: 'best', lifetime: 'lifetime match', matches: 'matches', bestStreak: 'best streak', empty: '—', souvenirs: 'souvenirs', nothing: 'Play a Hangout and something will land here.', rounds: 'rounds', bestSession: 'best session' },
  es: { title: 'su Space.', hangouts: 'Hangouts completados', streak: 'días de racha', best: 'mejor', lifetime: 'coincidencia histórica', matches: 'coincidencias', bestStreak: 'mejor racha', empty: '—', souvenirs: 'recuerdos', nothing: 'Jueguen un Hangout y algo aparecerá aquí.', rounds: 'rondas', bestSession: 'mejor sesión' },
} as const;

export function SpaceScreen({ result }: { result: Result<SpaceSnapshot> }) {
  const { locale } = useLocale();
  const c = copy[locale];
  if (!result.ok) return <Screen title="Space" backHref="/things"><p role="alert">{flowCopy[locale][result.error]}</p></Screen>;
  const space = result.data;
  const same = space.same_brain;
  const percent = (value: number) => `${Math.round(value * 100)}%`;
  return <Screen title={c.title} backHref={`/thing/${space.thing_id}`}>
    <section className={`${card} overflow-hidden p-0`}><div className="h-3" style={{ backgroundColor: thingColors[space.color_key] }} /><div className="space-y-3 p-6 text-center"><p className="text-6xl">{charms[space.charm_key]}</p><p className="text-2xl font-bold">{space.members.map((member) => member.display_name).join(' + ')}</p></div></section>
    <section className="grid grid-cols-2 gap-3"><div className={card}><strong className="block text-4xl">{space.total_completed_hangouts}</strong><span className="text-sm text-muted">{c.hangouts}</span></div><div className={card}><strong className="block text-4xl">{space.current_streak}</strong><span className="text-sm text-muted">{c.streak}</span>{space.best_streak > space.current_streak && <small className="mt-2 block text-muted">{c.best}: {space.best_streak}</small>}</div></section>
    <section className={`${card} rotate-[-.4deg] space-y-4 border-2`}><div className="flex items-end justify-between"><h2 className="text-2xl font-black">SAME BRAIN</h2><span className="text-sm text-muted">{same.hangouts} Hangouts</span></div>{same.hangouts ? <><strong className="block text-6xl">{percent(same.lifetime_match_rate)}</strong><p className="text-sm text-muted">{c.lifetime}</p><div className="grid grid-cols-3 gap-2 border-t border-border pt-4 text-sm"><p><strong className="block text-xl">{same.matches}</strong>{c.matches}</p><p><strong className="block text-xl">{same.rounds}</strong>{c.rounds}</p><p><strong className="block text-xl">{same.best_match_streak}</strong>{c.bestStreak}</p></div><p className="text-xs text-muted">{c.bestSession}: {percent(same.best_session_match_rate)}</p></> : <p className="text-4xl text-muted">{c.empty}</p>}</section>
    <section className="grid gap-3 sm:grid-cols-3">{['KNOW ME', 'THIS OR THAT', 'HOT'].map((game) => <div className={card} key={game}><h2 className="font-black">{game}</h2><p className="mt-5 text-3xl text-muted">{c.empty}</p></div>)}</section>
    <section className="space-y-3"><h2 className="text-sm font-bold uppercase tracking-[.18em]">{c.souvenirs}</h2>{space.souvenirs.length ? <div className="flex flex-wrap gap-3">{space.souvenirs.map((souvenir, index) => <span key={souvenir.key} className="rotate-[-2deg] rounded-sm border-2 border-foreground bg-surface px-4 py-3 text-sm font-black shadow-[3px_3px_0_var(--foreground)]" style={{ transform: `rotate(${index % 2 ? 2 : -2}deg)` }}>{souvenirLabels[souvenir.key]}</span>)}</div> : <p className={`${card} text-sm text-muted`}>{c.nothing}</p>}</section>
  </Screen>;
}
