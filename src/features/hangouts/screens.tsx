'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Screen } from '@/components/ui/screen';
import { useLocale } from '@/lib/i18n/provider';
import { type FlowError, type Result, type ThingSnapshot } from '@/features/things/model';
import { flowCopy } from '@/features/things/copy';
import { addHotCard, advanceSameBrain, createHangout, loadSameBrain, readyHotBatch, setHotConsent, startSameBrain, submitSameBrainAnswer } from './actions';
import { hangoutCopy } from './copy';
import type { GameType, HangoutSnapshot, HotLevel, HotMode, HotSetup, SameBrainSnapshot } from './model';
import { ThingTheme } from '@/components/thing/thing-theme';
import { HangoutShell } from '@/components/thing/hangout-shell';
import { ActionLink } from '@/components/ui/action-link';

const primary = 'thing-primary-button min-h-14 w-full px-5 py-4 font-semibold disabled:opacity-50';
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
  if (thing.active_hangout) return <ThingTheme color={thing.color_key}><Screen title={c[thing.active_hangout.game_type]} backHref={`/thing/${thing.id}`}><p>{flowCopy[locale].hangout_in_progress}</p><ActionLink href={`/thing/${thing.id}`} themed>{flowCopy[locale].openHangout}</ActionLink></Screen></ThingTheme>;
  const descriptions: Record<GameType, string> = {
    same_brain: c.sameBrainDescription, know_me: c.knowMeDescription, this_or_that: c.thisOrThatDescription, hot: c.hotDescription,
  };
  function start(game: GameType, mode: HotMode | null = null) {
    transition(async () => {
      setError(null);
      const result = await createHangout(thing.id, game, mode);
      if (!result.ok) setError(result.error);
      else if (result.data.conflict) { setError('hangout_in_progress'); router.refresh(); }
      else router.push(`/thing/${thing.id}/hangout/${result.data.id}`);
    });
  }
  function choose(level: HotLevel) {
    transition(async () => {
      setError(null);
      const result = await setHotConsent(thing.id, level);
      if (!result.ok) setError(result.error); else setHot(result.data);
    });
  }
  return <ThingTheme color={thing.color_key}><Screen title={c.title} backHref={`/thing/${thing.id}`}>
    <div className="h-1 bg-[var(--thing-primary)]" />
    <div className="space-y-3">{(['same_brain', 'know_me', 'this_or_that', 'hot'] as GameType[]).map((game, index) => <button key={game} type="button" disabled={pending} onClick={() => game === 'hot' ? setHotOpen(true) : start(game)} className={`${panel} block w-full text-left transition-transform active:scale-[.99]`}>
      <span className="thing-accent-text text-xs font-bold">0{index + 1}</span><h2 className="font-heading text-2xl font-bold">{c[game]}</h2><p className="text-sm text-muted">{descriptions[game]}</p>
    </button>)}</div>
    {hotOpen && <section className={`${panel} border-2`}>
      <h2 className="text-2xl font-bold">{c.chooseLevel}</h2><p className="text-sm text-muted">{c.privateChoice}</p>
      <div className="grid grid-cols-3 gap-2">{(['flirty', 'bold', 'spicy'] as HotLevel[]).map((level) => <button key={level} type="button" disabled={pending} aria-pressed={hot?.own_level === level} onClick={() => choose(level)} className={`${secondary} thing-option px-2`}>{c[level]}</button>)}</div>
      {hot?.both_ready ? <><p><span className="text-sm text-muted">{c.sharedLevel}: </span><strong>{hot.shared_level ? c[hot.shared_level] : ''}</strong></p><button className={primary} disabled={pending} onClick={() => start('hot', 'standard')}>{c.hot} · {c.start}</button></> : <p role="status" className="text-sm text-muted">{c.waitingConsent}</p>}
      {hot?.our_deck_available && <button className={`${secondary} w-full text-left`} disabled={pending} onClick={() => start('hot', 'our_deck')}><strong className="block text-lg">{c.ourDeck}</strong><span className="block text-sm text-muted">{c.ourDeckDescription}</span><span className="text-xs text-muted">{c.anonymous}</span></button>}
      <ErrorLine error={error} />
    </section>}
  </Screen></ThingTheme>;
}

function SameBrainGame({ initial }: { initial: SameBrainSnapshot }) {
  const { locale } = useLocale();
  const c = hangoutCopy[locale];
  const [snapshot, setSnapshot] = useState(initial);
  const [error, setError] = useState<FlowError | null>(null);
  const [pending, transition] = useTransition();
  const round = snapshot.round;

  useEffect(() => {
    if (!['waiting', 'active'].includes(snapshot.state) || (snapshot.state === 'active' && round?.state === 'answering' && !round.own_answer)) return;
    const refresh = async () => {
      const result = await loadSameBrain(snapshot.id);
      if (result.ok) { setSnapshot(result.data); setError(null); }
    };
    const timer = window.setInterval(refresh, 2500);
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [snapshot.id, snapshot.state, round?.id, round?.state, round?.own_answer]);

  function run(action: () => Promise<Result<SameBrainSnapshot>>) {
    transition(async () => {
      setError(null);
      const result = await action();
      if (result.ok) setSnapshot(result.data); else setError(result.error);
    });
  }
  if (snapshot.state === 'setup') return <div className={`${panel} text-center`}>
    <p className="text-6xl" aria-hidden="true">◎</p><h2 className="text-3xl font-bold">same brain.</h2><p className="text-muted">{c.sameBrainIntro}</p>
    <button className={primary} disabled={pending} onClick={() => run(() => startSameBrain(snapshot.id))}>{pending ? c.busy : c.begin}</button><ErrorLine error={error} />
  </div>;
  if (snapshot.state === 'waiting') return <div className="space-y-6 py-14 text-center"><span className="inline-block h-3 w-3 rounded-full bg-[var(--thing-primary)]" /><h2 className="font-heading text-3xl font-bold">same brain.</h2><p role="status" className="text-muted">{c.waitingPartner}</p><ErrorLine error={error} /></div>;
  if (snapshot.state === 'abandoned') return <div className={panel}><ErrorLine error="hangout_unavailable" /></div>;
  if (snapshot.state === 'complete' && snapshot.result) {
    const result = snapshot.result;
    return <div className="space-y-6 text-center">
      <div className="space-y-3 border-y border-[var(--thing-accent-border)] py-10"><p className="text-sm font-bold uppercase tracking-[.18em]">{c.finalLine}</p><p className="font-heading text-7xl font-black thing-accent-text">{result.matches} / {result.rounds}</p><h2 className="text-3xl font-bold">same brain.</h2><p>{Math.round(result.match_rate * 100)}% {c.matched}</p><p className="text-sm text-muted">{c.bestStreak}: {result.best_match_streak}</p></div>
      <Link className="thing-primary-button flex min-h-14 items-center justify-center px-5 py-4 font-semibold" href={`/thing/${snapshot.thing_id}`}>{c.backThing}</Link>
    </div>;
  }
  if (!round) return <div className={panel}><p role="status">{c.busy}</p><ErrorLine error={error} /></div>;
  const prompt = locale === 'es' ? round.prompt_es : round.prompt_en;
  const optionA = locale === 'es' ? round.option_a_es : round.option_a_en;
  const optionB = locale === 'es' ? round.option_b_es : round.option_b_en;
  const option = (key: 'a' | 'b') => key === 'a' ? optionA : optionB;
  if (round.state === 'revealed') {
    const own = round.answers.find((answer) => answer.is_self);
    const other = round.answers.find((answer) => !answer.is_self);
    const matched = own?.answer_key === other?.answer_key;
    return <div className="space-y-5 text-center">
      <p className="text-sm font-bold uppercase tracking-[.18em] text-muted">{c.round} {round.number} / 8</p>
      <div className="space-y-5 border-y border-border py-9"><p className="text-lg">{prompt}</p><p className={`font-heading text-5xl font-black ${matched ? 'thing-accent-text' : ''}`}>{matched ? c.match : c.notThisTime}</p>{matched && <p className="text-xl font-semibold">{c.sameBrain}</p>}</div>
      <div className="grid grid-cols-2 gap-3 text-left"><div className={panel}><span className="text-xs text-muted">{c.youPicked}</span><strong className="block">{own ? option(own.answer_key) : '—'}</strong></div><div className={panel}><span className="text-xs text-muted">{c.theyPicked}</span><strong className="block">{other ? option(other.answer_key) : '—'}</strong></div></div>
      <button className="thing-primary-button min-h-14 w-full px-5 py-4 font-semibold disabled:opacity-50" disabled={pending} onClick={() => run(() => advanceSameBrain(snapshot.id))}>{pending ? c.busy : c.next}</button><ErrorLine error={error} />
    </div>;
  }
  return <div className="space-y-5">
    <div className="flex items-center justify-between text-sm font-bold uppercase tracking-[.14em] text-muted"><span>{c.round} {round.number} / 8</span><span>same brain.</span></div>
    <h2 className="text-center text-3xl font-bold leading-tight">{prompt}</h2>
    <div className="grid gap-4"><button aria-pressed={round.own_answer === 'a'} className="thing-option min-h-28 border-2 border-border bg-surface p-6 text-left text-xl font-bold disabled:opacity-70" disabled={pending || !!round.own_answer} onClick={() => run(() => submitSameBrainAnswer(snapshot.id, round.id, 'a'))}>{optionA}</button><button aria-pressed={round.own_answer === 'b'} className="thing-option min-h-28 border-2 border-border bg-surface p-6 text-left text-xl font-bold disabled:opacity-70" disabled={pending || !!round.own_answer} onClick={() => run(() => submitSameBrainAnswer(snapshot.id, round.id, 'b'))}>{optionB}</button></div>
    {round.own_answer && <div className={`${panel} text-center`} role="status"><strong>{c.answerLocked}</strong><p className="text-sm text-muted">{c.waitingPartner}</p></div>}<ErrorLine error={error} />
  </div>;
}

export function HangoutDetailScreen({ result, sameBrainResult }: { result: Result<HangoutSnapshot>; sameBrainResult?: Result<SameBrainSnapshot> }) {
  const { locale } = useLocale();
  const c = hangoutCopy[locale];
  const router = useRouter();
  const [content, setContent] = useState('');
  const [error, setError] = useState<FlowError | null>(null);
  const [pending, transition] = useTransition();
  if (!result.ok) return <Screen title="Hangout" backHref="/things"><ErrorLine error={result.error} /></Screen>;
  const hangout = result.data;
  if (hangout.game_type === 'same_brain') return sameBrainResult?.ok ? <HangoutShell thingId={hangout.thing_id} title={c.same_brain} color={sameBrainResult.data.color_key}>
    <SameBrainGame initial={sameBrainResult.data} />
  </HangoutShell> : <Screen title={c.same_brain} backHref={`/thing/${hangout.thing_id}`}>
    <ErrorLine error={sameBrainResult?.error ?? 'connection_failed'} />
  </Screen>;
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
  return <HangoutShell thingId={hangout.thing_id} title={c[hangout.game_type]} color={hangout.color_key}>
    <p className="text-lg font-semibold">{hangout.members.map((member) => member.display_name).join(' + ')}</p>
    {hangout.hot_mode === 'our_deck' ? <div className={panel}>
      <h2 className="text-3xl font-bold">{c.makeBatch}</h2><p>{c.cardsEach}<br />{c.mixed}<br />{c.anonymous}</p>
      <div className="flex justify-between text-sm"><span>{c.yourCards}: {hangout.own_card_count}/3</span><span>{c.theirCards}: {hangout.partner_card_count}/3</span></div>
      {!hangout.own_batch_ready && hangout.own_card_count < 3 && <><textarea aria-label={c.addCard} maxLength={240} value={content} onChange={(event) => setContent(event.target.value)} className="min-h-28 w-full rounded-[18px] border border-border bg-background p-4" /><button className={primary} disabled={pending || !content.trim()} onClick={add}>{c.addCard}</button></>}
      {!hangout.own_batch_ready && hangout.own_card_count === 3 && <button className={primary} disabled={pending} onClick={ready}>{c.finishBatch}</button>}
      {hangout.own_batch_ready && <p role="status">{hangout.both_batches_ready ? c.batchReady : c.waitingBatch}</p>}
      <ErrorLine error={error} />
    </div> : <div className={panel}><p>{c.foundation}</p><p className="text-sm text-muted">{c.state}: {hangout.state}</p></div>}
  </HangoutShell>;
}
