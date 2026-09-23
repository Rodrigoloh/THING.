'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Screen } from '@/components/ui/screen';
import { useLocale } from '@/lib/i18n/provider';
import { thingColors, type FlowError, type Result, type ThingSnapshot } from '@/features/things/model';
import { flowCopy } from '@/features/things/copy';
import { addHotCard, createHangout, readyHotBatch, setHotConsent } from './actions';
import { hangoutCopy } from './copy';
import type { GameType, HangoutSnapshot, HotLevel, HotMode, HotSetup } from './model';

const primary = 'min-h-14 w-full rounded-[18px] bg-accent px-5 py-4 font-semibold text-[#171717] disabled:opacity-50';
const secondary = 'min-h-12 rounded-[18px] border border-border px-5 py-3 disabled:opacity-50';
const panel = 'space-y-4 rounded-[20px] border border-border bg-surface p-5';

function ErrorLine({ error }: { error: FlowError | null }) {
  const { locale } = useLocale();
  return error ? <p role="alert" className="text-sm">{flowCopy[locale][error]}</p> : null;
}

export function HangoutSelectorScreen({ thingResult, hotResult }: { thingResult: Result<ThingSnapshot>; hotResult: Result<HotSetup> }) {
  const { locale } = useLocale();
  const c = hangoutCopy[locale];
  const router = useRouter();
  const [hotOpen, setHotOpen] = useState(hotResult.ok && hotResult.data.own_level !== null);
  const [hot, setHot] = useState(hotResult.ok ? hotResult.data : null);
  const [error, setError] = useState<FlowError | null>(hotResult.ok ? null : hotResult.error);
  const [pending, transition] = useTransition();
  if (!thingResult.ok) return <Screen title={c.title} backHref="/things"><ErrorLine error={thingResult.error} /></Screen>;
  const thing = thingResult.data;
  if (thing.status !== 'active') return <Screen title={c.title} backHref={`/thing/${thing.id}`}><ErrorLine error="thing_unavailable" /></Screen>;
  const descriptions: Record<GameType, string> = {
    same_brain: c.sameBrainDescription, know_me: c.knowMeDescription, this_or_that: c.thisOrThatDescription, hot: c.hotDescription,
  };
  function start(game: GameType, mode: HotMode | null = null) {
    transition(async () => {
      setError(null);
      const result = await createHangout(thing.id, game, mode);
      if (!result.ok) setError(result.error);
      else router.push(`/thing/${thing.id}/hangout/${result.data}`);
    });
  }
  function choose(level: HotLevel) {
    transition(async () => {
      setError(null);
      const result = await setHotConsent(thing.id, level);
      if (!result.ok) setError(result.error); else setHot(result.data);
    });
  }
  return <Screen title={c.title} backHref={`/thing/${thing.id}`}>
    <div className="h-2 rounded-full" style={{ backgroundColor: thingColors[thing.color_key] }} />
    <div className="space-y-3">{(['same_brain', 'know_me', 'this_or_that', 'hot'] as GameType[]).map((game, index) => <button key={game} type="button" disabled={pending} onClick={() => game === 'hot' ? setHotOpen(true) : start(game)} className={`${panel} block w-full text-left transition-transform active:scale-[.99]`}>
      <span className="text-xs font-bold text-muted">0{index + 1}</span><h2 className="text-2xl font-bold">{c[game]}</h2><p className="text-sm text-muted">{descriptions[game]}</p>
    </button>)}</div>
    {hotOpen && <section className={`${panel} border-2`}>
      <h2 className="text-2xl font-bold">{c.chooseLevel}</h2><p className="text-sm text-muted">{c.privateChoice}</p>
      <div className="grid grid-cols-3 gap-2">{(['flirty', 'bold', 'spicy'] as HotLevel[]).map((level) => <button key={level} type="button" disabled={pending} aria-pressed={hot?.own_level === level} onClick={() => choose(level)} className={`${secondary} px-2 aria-pressed:border-foreground aria-pressed:bg-background`}>{c[level]}</button>)}</div>
      {hot?.both_ready ? <><p><span className="text-sm text-muted">{c.sharedLevel}: </span><strong>{hot.shared_level ? c[hot.shared_level] : ''}</strong></p><button className={primary} disabled={pending} onClick={() => start('hot', 'standard')}>{c.hot} · {c.start}</button></> : <p role="status" className="text-sm text-muted">{c.waitingConsent}</p>}
      {hot?.our_deck_available && <button className={`${secondary} w-full text-left`} disabled={pending} onClick={() => start('hot', 'our_deck')}><strong className="block text-lg">{c.ourDeck}</strong><span className="block text-sm text-muted">{c.ourDeckDescription}</span><span className="text-xs text-muted">{c.anonymous}</span></button>}
      <ErrorLine error={error} />
    </section>}
  </Screen>;
}

export function HangoutDetailScreen({ result }: { result: Result<HangoutSnapshot> }) {
  const { locale } = useLocale();
  const c = hangoutCopy[locale];
  const router = useRouter();
  const [content, setContent] = useState('');
  const [error, setError] = useState<FlowError | null>(null);
  const [pending, transition] = useTransition();
  if (!result.ok) return <Screen title="Hangout" backHref="/things"><ErrorLine error={result.error} /></Screen>;
  const hangout = result.data;
  function add() {
    transition(async () => {
      const response = await addHotCard(hangout.id, content);
      if (!response.ok) setError(response.error); else { setContent(''); router.refresh(); }
    });
  }
  function ready() {
    transition(async () => {
      const response = await readyHotBatch(hangout.id);
      if (!response.ok) setError(response.error); else router.refresh();
    });
  }
  return <Screen title={c[hangout.game_type]} backHref={`/thing/${hangout.thing_id}`}>
    <p className="text-lg font-semibold">{hangout.members.map((member) => member.display_name).join(' + ')}</p>
    {hangout.hot_mode === 'our_deck' ? <div className={panel}>
      <h2 className="text-3xl font-bold">{c.makeBatch}</h2><p>{c.cardsEach}<br />{c.mixed}<br />{c.anonymous}</p>
      <div className="flex justify-between text-sm"><span>{c.yourCards}: {hangout.own_card_count}/3</span><span>{c.theirCards}: {hangout.partner_card_count}/3</span></div>
      {!hangout.own_batch_ready && hangout.own_card_count < 3 && <><textarea aria-label={c.addCard} maxLength={240} value={content} onChange={(event) => setContent(event.target.value)} className="min-h-28 w-full rounded-[18px] border border-border bg-background p-4" /><button className={primary} disabled={pending || !content.trim()} onClick={add}>{c.addCard}</button></>}
      {!hangout.own_batch_ready && hangout.own_card_count === 3 && <button className={primary} disabled={pending} onClick={ready}>{c.finishBatch}</button>}
      {hangout.own_batch_ready && <p role="status">{hangout.both_batches_ready ? c.batchReady : c.waitingBatch}</p>}
      <ErrorLine error={error} />
    </div> : <div className={panel}><p>{c.foundation}</p><p className="text-sm text-muted">{c.state}: {hangout.state}</p></div>}
  </Screen>;
}
