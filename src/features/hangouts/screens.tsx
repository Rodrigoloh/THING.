'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Screen } from '@/components/ui/screen';
import { useLocale } from '@/lib/i18n/provider';
import { type FlowError, type Result, type ThingSnapshot } from '@/features/things/model';
import { flowCopy } from '@/features/things/copy';
import {
  addHotCard, advanceChoiceEngine, advanceHot, advanceSameBrain, completeHot, createHangout, loadChoiceEngine, loadHot, loadSameBrain, readyHotBatch,
  skipHotPrompt, startChoiceEngine, startHot, startSameBrain, submitChoiceAnswer, submitHotEscalation, submitHotReaction, submitHotRound, submitKnowMeExplanation, submitSameBrainAnswer,
} from './actions';
import { hangoutCopy } from './copy';
import type { ChoiceSnapshot, GameType, HangoutSnapshot, HotContext, HotSnapshot, KnowMeResult, SameBrainSnapshot, ThisOrThatResult } from './model';
import { ThingTheme } from '@/components/thing/thing-theme';
import { HangoutShell } from '@/components/thing/hangout-shell';
import { ActionLink } from '@/components/ui/action-link';

const primary = 'thing-primary-button min-h-14 w-full px-5 py-4 font-semibold disabled:opacity-50';
const secondary = 'min-h-12 border border-border px-5 py-3 disabled:opacity-50';
const panel = 'space-y-4 rounded-[20px] border border-border bg-surface p-5';
const openStates = ['setup', 'waiting', 'ready', 'active'];

function ErrorLine({ error }: { error: FlowError | null }) {
  const { locale } = useLocale();
  return error ? <p role="alert" className="text-sm">{flowCopy[locale][error]}</p> : null;
}

export function HangoutSelectorScreen({ thingResult }: { thingResult: Result<ThingSnapshot> }) {
  const { locale } = useLocale();
  const c = hangoutCopy[locale];
  const router = useRouter();
  const [hotOpen, setHotOpen] = useState(false);
  const [error, setError] = useState<FlowError | null>(null);
  const [pending, transition] = useTransition();
  if (!thingResult.ok) return <Screen title={c.title} backHref="/things"><ErrorLine error={thingResult.error} /></Screen>;
  const thing = thingResult.data;
  if (thing.status !== 'active') return <Screen title={c.title} backHref={`/thing/${thing.id}`}><ErrorLine error="thing_unavailable" /></Screen>;
  if (thing.active_hangout) return <ThingTheme color={thing.color_key}><Screen title={c[thing.active_hangout.game_type]} backHref={`/thing/${thing.id}`}><p>{flowCopy[locale].hangout_in_progress}</p><ActionLink href={`/thing/${thing.id}`} themed>{flowCopy[locale].openHangout}</ActionLink></Screen></ThingTheme>;
  const descriptions: Record<GameType, string> = { same_brain: c.sameBrainDescription, know_me: c.knowMeDescription, this_or_that: c.thisOrThatDescription, hot: c.hotDescription };
  function start(game: GameType, context: HotContext | null = null) {
    transition(async () => {
      setError(null);
      const result = await createHangout(thing.id, game, null, context);
      if (!result.ok) setError(result.error);
      else if (result.data.conflict) { setError('hangout_in_progress'); router.refresh(); }
      else router.push(`/thing/${thing.id}/hangout/${result.data.id}`);
    });
  }
  return <ThingTheme color={thing.color_key}><Screen title={c.title} backHref={`/thing/${thing.id}`}>
    <div className="h-1 bg-[var(--thing-primary)]" />
    <div className="space-y-3">{(['same_brain', 'know_me', 'this_or_that', 'hot'] as GameType[]).map((game, index) => <button key={game} type="button" disabled={pending} onClick={() => game === 'hot' ? setHotOpen(true) : start(game)} className={`${panel} block w-full text-left transition-transform active:scale-[.99]`}>
      <span className="thing-accent-text text-xs font-bold">0{index + 1}</span><h2 className="font-heading text-2xl font-bold">{c[game]}</h2><p className="text-sm text-muted">{descriptions[game]}</p>
    </button>)}</div>
    {hotOpen && <section className="space-y-5 border-y border-[var(--thing-accent-border)] py-6"><div><h2 className="font-heading text-2xl font-bold">{c.togetherQuestion}</h2><p className="mt-2 text-sm text-muted">{c.contextFixed}</p></div><div className="grid gap-3"><button className={primary} disabled={pending} onClick={() => start('hot', 'same_place')}>{c.together}</button><button className={secondary} disabled={pending} onClick={() => start('hot', 'apart')}>{c.apart}</button></div><ErrorLine error={error} /></section>}
    {!hotOpen && <ErrorLine error={error} />}
  </Screen></ThingTheme>;
}

function SameBrainGame({ initial }: { initial: SameBrainSnapshot }) {
  const { locale } = useLocale(); const c = hangoutCopy[locale]; const router = useRouter();
  const [snapshot, setSnapshot] = useState(initial); const [error, setError] = useState<FlowError | null>(null); const [pending, transition] = useTransition();
  const round = snapshot.round;
  useEffect(() => {
    if (!openStates.includes(snapshot.state)) return;
    const refresh = async () => { const result = await loadSameBrain(snapshot.id); if (result.ok) { setSnapshot(result.data); setError(null); if (result.data.state === 'abandoned') router.replace(`/thing/${snapshot.thing_id}`); } };
    const timer = window.setInterval(refresh, 2500); return () => window.clearInterval(timer);
  }, [router, snapshot.id, snapshot.state, snapshot.thing_id]);
  function run(action: () => Promise<Result<SameBrainSnapshot>>) { transition(async () => { setError(null); const result = await action(); if (result.ok) setSnapshot(result.data); else setError(result.error); }); }
  if (snapshot.state === 'setup') return <div className={`${panel} text-center`}><p className="text-6xl">◎</p><h2 className="text-3xl font-bold">same brain.</h2><p className="text-muted">{c.sameBrainIntro}</p><button className={primary} disabled={pending} onClick={() => run(() => startSameBrain(snapshot.id))}>{pending ? c.busy : c.begin}</button><ErrorLine error={error} /></div>;
  if (snapshot.state === 'waiting') return <Waiting title="same brain." copy={c.waitingPartner} />;
  if (snapshot.state === 'complete' && snapshot.result) return <ResultCard score={`${snapshot.result.matches} / ${snapshot.result.rounds}`} title="same brain." detail={`${Math.round(snapshot.result.match_rate * 100)}% ${c.matched} · ${c.bestStreak}: ${snapshot.result.best_match_streak}`} thingId={snapshot.thing_id} />;
  if (!round) return <div className={panel}><p role="status">{c.busy}</p><ErrorLine error={error} /></div>;
  const prompt = locale === 'es' ? round.prompt_es : round.prompt_en; const optionA = locale === 'es' ? round.option_a_es : round.option_a_en; const optionB = locale === 'es' ? round.option_b_es : round.option_b_en; const option = (key: 'a' | 'b') => key === 'a' ? optionA : optionB;
  if (round.state === 'revealed') { const own = round.answers.find((a) => a.is_self); const other = round.answers.find((a) => !a.is_self); const matched = own?.answer_key === other?.answer_key; return <div className="space-y-5 text-center"><RoundLabel number={round.number} /><div className="space-y-5 border-y border-border py-9"><p>{prompt}</p><p className={`font-heading text-5xl font-black ${matched ? 'thing-accent-text' : ''}`}>{matched ? c.match : c.notThisTime}</p>{matched && <p className="text-xl font-semibold">{c.sameBrain}</p>}</div><div className="grid grid-cols-2 gap-3 text-left"><Pick label={c.youPicked} value={own ? option(own.answer_key) : '—'} /><Pick label={c.theyPicked} value={other ? option(other.answer_key) : '—'} /></div><button className={primary} disabled={pending} onClick={() => run(() => advanceSameBrain(snapshot.id))}>{c.next}</button><ErrorLine error={error} /></div>; }
  return <AnswerRound number={round.number} prompt={prompt} optionA={optionA} optionB={optionB} ownAnswer={round.own_answer} pending={pending} waiting={c.waitingPartner} onAnswer={(key) => run(() => submitSameBrainAnswer(snapshot.id, round.id, key))} error={error} />;
}

function ChoiceGame({ initial }: { initial: ChoiceSnapshot }) {
  const { locale } = useLocale(); const c = hangoutCopy[locale]; const router = useRouter(); const game = initial.game_type;
  const [snapshot, setSnapshot] = useState(initial); const [error, setError] = useState<FlowError | null>(null); const [explanation, setExplanation] = useState(''); const [pending, transition] = useTransition(); const round = snapshot.round;
  useEffect(() => { if (!openStates.includes(snapshot.state)) return; const refresh = async () => { const result = await loadChoiceEngine(snapshot.id, game); if (result.ok) { setSnapshot(result.data); if (result.data.state === 'abandoned') router.replace(`/thing/${snapshot.thing_id}`); } }; const timer = window.setInterval(refresh, 2500); return () => window.clearInterval(timer); }, [game, router, snapshot.id, snapshot.state, snapshot.thing_id]);
  function run(action: () => Promise<Result<ChoiceSnapshot>>) { transition(async () => { setError(null); const result = await action(); if (result.ok) setSnapshot(result.data); else setError(result.error); }); }
  if (snapshot.state === 'setup') return <div className={`${panel} text-center`}><p className="text-5xl">{game === 'know_me' ? '◒' : '↔'}</p><h2 className="font-heading text-3xl font-bold">{c[game]}</h2><p className="text-muted">{game === 'know_me' ? c.knowMeIntro : c.thisOrThatIntro}</p><button className={primary} disabled={pending} onClick={() => run(() => startChoiceEngine(snapshot.id, game))}>{c.start}</button><ErrorLine error={error} /></div>;
  if (snapshot.state === 'waiting') return <Waiting title={c[game]} copy={c.waitingPartner} />;
  if (snapshot.state === 'complete' && snapshot.result) { const result = snapshot.result; const score = game === 'know_me' ? `${(result as KnowMeResult).correct_predictions} / 8` : `${(result as ThisOrThatResult).agreements} / 8`; return <ResultCard score={score} title={c[game]} detail={game === 'know_me' ? c.predictions : c.agreements} thingId={snapshot.thing_id} />; }
  if (!round) return <div className={panel}>{c.busy}</div>;
  const prompt = locale === 'es' ? round.prompt_es : round.prompt_en;
  const optionA = game === 'this_or_that' ? snapshot.members[0]?.display_name : locale === 'es' ? round.option_a_es : round.option_a_en;
  const optionB = game === 'this_or_that' ? snapshot.members[1]?.display_name : locale === 'es' ? round.option_b_es : round.option_b_en;
  const option = (key: 'a' | 'b') => key === 'a' ? optionA : optionB;
  if (round.state === 'revealed') {
    const subject = round.answers.find((a) => a.is_subject); const predictor = round.answers.find((a) => !a.is_subject); const agreed = game === 'know_me' ? subject?.answer_key === predictor?.answer_key : round.answers[0]?.answer_key === round.answers[1]?.answer_key;
    return <div className="space-y-5 text-center"><RoundLabel number={round.number} /><p className="text-xl">{prompt}</p><p className={`font-heading text-5xl font-black ${agreed ? 'thing-accent-text' : ''}`}>{game === 'know_me' ? (agreed ? c.gotIt : c.missedIt) : (agreed ? c.agreed : c.split)}</p>
      <div className="grid grid-cols-2 gap-3 text-left">{game === 'know_me' ? <><Pick label={`${round.subject_name} ${c.said}`} value={subject ? option(subject.answer_key) : '—'} /><Pick label={c.youGuessed} value={predictor ? option(predictor.answer_key) : '—'} /></> : round.answers.map((a) => <Pick key={a.display_name} label={a.display_name} value={option(a.answer_key)} />)}</div>
      {game === 'know_me' && round.explanation && <div className={panel}><p className="text-xs font-bold uppercase tracking-[.12em] text-muted">{round.subject_name}</p><p className="text-left">{round.explanation}</p></div>}
      {game === 'know_me' && round.can_explain && !round.explanation && <div className="space-y-3 text-left"><label className="text-sm font-semibold" htmlFor={`explain-${round.id}`}>{c.wannaExplain}</label><textarea id={`explain-${round.id}`} maxLength={140} value={explanation} onChange={(event) => setExplanation(event.target.value)} className="min-h-24 w-full border border-border bg-background p-4" /><button className={secondary} disabled={pending || !explanation.trim()} onClick={() => run(() => submitKnowMeExplanation(snapshot.id, round.id, explanation))}>{c.addThought}</button></div>}
      <button className={primary} disabled={pending} onClick={() => run(() => advanceChoiceEngine(snapshot.id, game))}>{c.keepGoing}</button><ErrorLine error={error} /></div>;
  }
  const instruction = game === 'this_or_that' ? c.votePrompt : round.role === 'subject' ? c.subjectPrompt : c.predictorPrompt;
  return <div className="space-y-5"><RoundLabel number={round.number} /><p className="text-center text-sm font-bold uppercase tracking-[.12em] thing-accent-text">{instruction}</p><AnswerRound number={round.number} hideLabel prompt={prompt} optionA={optionA} optionB={optionB} ownAnswer={round.own_answer} pending={pending} waiting={c.waitingPartner} onAnswer={(key) => run(() => submitChoiceAnswer(snapshot.id, round.id, key, game))} error={error} /></div>;
}

function HotGame({ initial }: { initial: HotSnapshot }) {
  const { locale } = useLocale(); const c = hangoutCopy[locale]; const router = useRouter(); const [snapshot, setSnapshot] = useState(initial); const [error, setError] = useState<FlowError | null>(null); const [pending, transition] = useTransition(); const round = snapshot.round;
  useEffect(() => { if (!openStates.includes(snapshot.state)) return; const refresh = async () => { const result = await loadHot(snapshot.id); if (result.ok) { setSnapshot(result.data); if (result.data.state === 'abandoned') router.replace(`/thing/${snapshot.thing_id}`); } }; const timer = window.setInterval(refresh, 2500); return () => window.clearInterval(timer); }, [router, snapshot.id, snapshot.state, snapshot.thing_id]);
  function run(action: () => Promise<Result<HotSnapshot>>) { transition(async () => { setError(null); const result = await action(); if (result.ok) setSnapshot(result.data); else setError(result.error); }); }
  if (snapshot.state === 'setup') return <div className={`${panel} text-center`}><p className="text-5xl">♡</p><h2 className="font-heading text-3xl font-bold">Hot</h2><p className="text-muted">{c.hotIntro}</p><button className={primary} disabled={pending} onClick={() => run(() => startHot(snapshot.id))}>{c.start}</button><ErrorLine error={error} /></div>;
  if (snapshot.state === 'waiting') return <Waiting title="Hot" copy={c.waitingPartner} />;
  if (snapshot.state === 'complete' && snapshot.result) return <ResultCard score={`${snapshot.result.prompts_completed} ${c.prompts}`} title="Hot" detail={`${c.reached} ${c[snapshot.result.highest_level]}`} thingId={snapshot.thing_id} />;
  if (snapshot.gate) { const kitkat = snapshot.gate.target_level === 'kitkat'; const heading = kitkat ? c.kitkatWait : snapshot.gate.target_level === 'bold' ? c.wannaBold : c.wannaSpicy; const detail = kitkat ? c.kitkatMore : ''; const stay = snapshot.gate.target_level === 'bold' ? c.stayFlirty : snapshot.gate.target_level === 'spicy' ? c.stayBold : c.maybeNot; const go = snapshot.gate.target_level === 'bold' ? c.goBold : snapshot.gate.target_level === 'spicy' ? c.goSpicy : c.openKitkat; return <div className="space-y-6 py-10 text-center">{kitkat && <p className="text-6xl">🍫</p>}<p className="font-heading text-4xl font-bold">{heading}</p>{detail && <p className="text-xl">{detail}</p>}{snapshot.gate.own_vote === null ? <div className="grid gap-3"><button className={secondary} disabled={pending} onClick={() => run(() => submitHotEscalation(snapshot.id, false))}>{stay}</button><button className={primary} disabled={pending} onClick={() => run(() => submitHotEscalation(snapshot.id, true))}>{go}</button></div> : <p role="status" className="text-muted">{c.waitingVote}</p>}<ErrorLine error={error} /></div>; }
  if (!round) return <div className={panel}>{c.busy}</div>;
  const prompt = locale === 'es' ? round.prompt_es : round.prompt_en; const optionA = locale === 'es' ? round.option_a_es : round.option_a_en; const optionB = locale === 'es' ? round.option_b_es : round.option_b_en; const option = (key: 'a' | 'b') => key === 'a' ? optionA : optionB;
  if (round.state === 'revealed') {
    const subject = round.answers.find((answer) => answer.is_subject); const guess = round.answers.find((answer) => !answer.is_subject);
    return <div className="space-y-6 text-center"><p className="thing-accent-text text-sm font-bold uppercase tracking-[.16em]">{c[snapshot.current_level]}</p>
      {snapshot.current_level === 'kitkat' && snapshot.notice === 'level_up' && <div className="space-y-2 py-5"><p className="text-6xl">🍫</p><p className="font-heading text-5xl font-black">KITKAT</p><p>{snapshot.kitkat_first_discovery ? c.youFoundIt : c.oneMoreDoor}</p></div>}
      {snapshot.notice && snapshot.current_level !== 'kitkat' && <p className="font-heading text-2xl font-bold">{snapshot.notice === 'level_up' ? c.levelUp : c.stayingHere}</p>}
      {round.callback && <div className={panel}><p className="text-xs font-bold uppercase tracking-[.12em] text-muted">{c.rememberThis}</p><p>{round.callback.subject_name} {c.picked} <strong>{locale === 'es' ? round.callback.option_es : round.callback.option_en}</strong></p></div>}
      <p className="text-lg text-muted">{prompt}</p><p className="text-sm font-bold uppercase tracking-[.16em]">{round.subject_name} {c.picked}</p><p className="font-heading text-5xl font-black thing-accent-text">{subject ? option(subject.answer_key) : '—'}</p><p className="text-muted">{c.noted}</p>
      {round.round_type === 'guess' && guess && <Pick label={c.youGuessed} value={option(guess.answer_key)} />}
      {round.needs_reaction ? round.can_react ? <div className="grid gap-3"><p className="font-heading text-2xl font-bold">{c.yourMove}</p><button className={primary} disabled={pending} onClick={() => run(() => submitHotReaction(snapshot.id, round.id, round.reaction_type === 'move' ? 'use_it' : 'respond'))}>{round.reaction_type === 'move' ? c.useIt : c.answerBack}</button><button className={secondary} disabled={pending} onClick={() => run(() => submitHotReaction(snapshot.id, round.id, 'skip'))}>{c.skip}</button></div> : <p role="status" className="text-muted">{c.waitingMove.replace('{name}', round.reactor_name)}</p> : <button className={primary} disabled={pending} onClick={() => run(() => advanceHot(snapshot.id))}>{c.theirTurn}</button>}
      <button className="min-h-11 text-sm underline" disabled={pending} onClick={() => run(() => completeHot(snapshot.id))}>{c.finishHere}</button><ErrorLine error={error} /></div>;
  }
  if (!round.can_answer) return <div className="space-y-6 py-12 text-center"><p className="thing-accent-text text-sm font-bold uppercase tracking-[.16em]">{c[snapshot.current_level]}</p><h2 className="font-heading text-3xl font-bold">{round.round_type === 'guess' && round.role === 'reactor' ? c.howWell.replace('{name}', round.subject_name) : c.choosing.replace('{name}', round.subject_name)}</h2><p role="status" className="text-muted">{c.waitingPartner}</p><button className="min-h-11 w-full text-sm underline underline-offset-4" disabled={pending} onClick={() => run(() => skipHotPrompt(snapshot.id, round.id))}>{c.skip}</button></div>;
  const heading = round.role === 'subject' ? c.turn.replace('{name}', round.subject_name) : c.howWell.replace('{name}', round.subject_name);
  return <div className="space-y-5"><p className="thing-accent-text text-sm font-bold uppercase tracking-[.16em]">{c[snapshot.current_level]}</p><p className="text-center text-sm font-bold uppercase tracking-[.12em]">{heading}</p><AnswerRound hideLabel number={round.number} prompt={round.role === 'reactor' ? c.whatPicked : prompt} optionA={optionA} optionB={optionB} ownAnswer={round.own_answer} pending={pending} waiting={c.waitingPartner} onAnswer={(key) => run(() => submitHotRound(snapshot.id, round.id, key))} error={error} /><button className="min-h-11 w-full text-sm underline underline-offset-4" disabled={pending} onClick={() => run(() => skipHotPrompt(snapshot.id, round.id))}>{c.skip}</button></div>;
}

function OurDeckSetup({ hangout }: { hangout: HangoutSnapshot }) {
  const { locale } = useLocale(); const c = hangoutCopy[locale]; const router = useRouter(); const [content, setContent] = useState(''); const [error, setError] = useState<FlowError | null>(null); const [pending, transition] = useTransition();
  function add() { transition(async () => { const result = await addHotCard(hangout.id, content); if (!result.ok) setError(result.error); else { setContent(''); router.refresh(); } }); }
  function ready() { transition(async () => { const result = await readyHotBatch(hangout.id); if (!result.ok) setError(result.error); else router.refresh(); }); }
  return <div className={panel}><h2 className="text-3xl font-bold">{c.makeBatch}</h2><p>{c.cardsEach}<br />{c.mixed}<br />{c.anonymous}</p><div className="flex justify-between text-sm"><span>{c.yourCards}: {hangout.own_card_count}/3</span><span>{c.theirCards}: {hangout.partner_card_count}/3</span></div>{!hangout.own_batch_ready && hangout.own_card_count < 3 && <><textarea aria-label={c.addCard} maxLength={240} value={content} onChange={(event) => setContent(event.target.value)} className="min-h-28 w-full border border-border bg-background p-4" /><button className={primary} disabled={pending || !content.trim()} onClick={add}>{c.addCard}</button></>}{!hangout.own_batch_ready && hangout.own_card_count === 3 && <button className={primary} disabled={pending} onClick={ready}>{c.finishBatch}</button>}{hangout.own_batch_ready && <p role="status">{hangout.both_batches_ready ? c.batchReady : c.waitingBatch}</p>}<ErrorLine error={error} /></div>;
}

function Waiting({ title, copy }: { title: string; copy: string }) { return <div className="space-y-6 py-14 text-center"><span className="inline-block h-3 w-3 rounded-full bg-[var(--thing-primary)]" /><h2 className="font-heading text-3xl font-bold">{title}</h2><p role="status" className="text-muted">{copy}</p></div>; }
function RoundLabel({ number }: { number: number }) { const { locale } = useLocale(); return <p className="text-sm font-bold uppercase tracking-[.18em] text-muted">{hangoutCopy[locale].round} {number} / 8</p>; }
function Pick({ label, value }: { label: string; value: string }) { return <div className={panel}><span className="text-xs text-muted">{label}</span><strong className="block">{value}</strong></div>; }
function ResultCard({ score, title, detail, thingId }: { score: string; title: string; detail: string; thingId: string }) { const { locale } = useLocale(); const c = hangoutCopy[locale]; return <div className="space-y-6 text-center"><div className="space-y-3 border-y border-[var(--thing-accent-border)] py-10"><p className="font-heading text-6xl font-black thing-accent-text">{score}</p><h2 className="text-3xl font-bold">{title}</h2><p>{detail}</p></div><Link className="thing-primary-button flex min-h-14 items-center justify-center px-5 py-4 font-semibold" href={`/thing/${thingId}`}>{c.backThing}</Link></div>; }
function AnswerRound({ number, hideLabel = false, prompt, optionA, optionB, ownAnswer, pending, waiting, onAnswer, error }: { number: number; hideLabel?: boolean; prompt: string; optionA: string; optionB: string; ownAnswer: 'a' | 'b' | null; pending: boolean; waiting: string; onAnswer: (key: 'a' | 'b') => void; error: FlowError | null }) { return <div className="space-y-5">{!hideLabel && <RoundLabel number={number} />}<h2 className="text-center text-3xl font-bold leading-tight">{prompt}</h2><div className="grid gap-4"><button aria-pressed={ownAnswer === 'a'} className="thing-option min-h-28 border-2 border-border bg-surface p-6 text-left text-xl font-bold disabled:opacity-70" disabled={pending || !!ownAnswer} onClick={() => onAnswer('a')}>{optionA}</button><button aria-pressed={ownAnswer === 'b'} className="thing-option min-h-28 border-2 border-border bg-surface p-6 text-left text-xl font-bold disabled:opacity-70" disabled={pending || !!ownAnswer} onClick={() => onAnswer('b')}>{optionB}</button></div>{ownAnswer && <p role="status" className="text-center text-sm text-muted">{waiting}</p>}<ErrorLine error={error} /></div>; }

export function HangoutDetailScreen({ result, sameBrainResult, choiceResult, hotResult }: { result: Result<HangoutSnapshot>; sameBrainResult?: Result<SameBrainSnapshot>; choiceResult?: Result<ChoiceSnapshot>; hotResult?: Result<HotSnapshot> }) {
  const { locale } = useLocale(); const c = hangoutCopy[locale];
  if (!result.ok) return <Screen title="Hangout" backHref="/things"><ErrorLine error={result.error} /></Screen>;
  const hangout = result.data;
  const body = hangout.game_type === 'same_brain' ? (sameBrainResult?.ok ? <SameBrainGame initial={sameBrainResult.data} /> : <ErrorLine error={sameBrainResult?.error ?? 'connection_failed'} />)
    : hangout.game_type === 'hot' ? (hangout.hot_mode === 'our_deck' ? <OurDeckSetup hangout={hangout} /> : hotResult?.ok ? <HotGame initial={hotResult.data} /> : <ErrorLine error={hotResult?.error ?? 'connection_failed'} />)
      : choiceResult?.ok ? <ChoiceGame initial={choiceResult.data} /> : <ErrorLine error={choiceResult?.error ?? 'connection_failed'} />;
  const progress = sameBrainResult?.ok && sameBrainResult.data.round ? `${sameBrainResult.data.round.number} / 8` : choiceResult?.ok && choiceResult.data.round ? `${choiceResult.data.round.number} / 8` : hotResult?.ok ? c[hotResult.data.current_level] : undefined;
  return <HangoutShell thingId={hangout.thing_id} hangoutId={hangout.id} state={hangout.state} title={c[hangout.game_type]} progress={progress} color={hangout.color_key}>{body}</HangoutShell>;
}
