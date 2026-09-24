'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Screen } from '@/components/ui/screen';
import { ActionLink } from '@/components/ui/action-link';
import { useLocale } from '@/lib/i18n/provider';
import { EmptyThings } from './empty-things';
import { flowCopy } from './copy';
import { acceptCharm, acceptInvite, declineCharm, forgetInvite, manageInvite, proposeCharm, startThing, updateThingNickname } from './actions';
import { charms, parseInviteInput, type Charm, type FlowError, type InvitePreview, type Result, type ThingSnapshot } from './model';
import { buildInviteUrl } from './invite-url';
import { InviteQr } from './invite-qr';
import { endThing, updateThingColor } from './actions';
import { thingColors, type ThingColor } from './model';
import { hangoutCopy } from '@/features/hangouts/copy';
import { joinHangout } from '@/features/hangouts/actions';
import { ThingTheme } from '@/components/thing/thing-theme';
import type { SpaceSnapshot } from '@/features/space/model';
import type { ChatMessage } from '@/features/chat/model';
import type { Moment } from '@/features/moments/model';
import { SpaceCollage } from '@/features/space/screen';
import { CharmIcon, thingDisplayName } from '@/components/thing/charm-icon';
import { getSouvenir } from '@/lib/souvenirs';

const button = 'min-h-14 w-full rounded-[18px] bg-accent px-5 py-4 font-semibold text-[#171717] disabled:opacity-50';
const secondary = 'min-h-12 rounded-[18px] border border-border px-5 py-3 disabled:opacity-50';
const panel = 'space-y-4 rounded-[20px] border border-border bg-surface p-6';
function useCopy() { return flowCopy[useLocale().locale]; }

// Refresh only visible, pending screens. No Realtime publication or service key
// is required. The server reauthorizes every refresh and never caches user data.
function Sync({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const c = useCopy();
  const [online, setOnline] = useState(true);
  const [pending, transition] = useTransition();
  useEffect(() => {
    function sync() {
      setOnline(navigator.onLine);
      if (document.visibilityState === 'visible' && navigator.onLine && !pending) transition(() => router.refresh());
    }
    if (!enabled) return;
    const timer = window.setInterval(sync, 3000);
    window.addEventListener('focus', sync);
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', sync);
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [enabled, pending, router]);
  return !online ? <p role="status">{c.offline}</p> : null;
}
function ErrorMessage({ error }: { error: FlowError | null }) {
  const c = useCopy();
  return error ? <p role="alert" className="text-sm leading-relaxed">{c[error]}</p> : null;
}
function LoadError({ error }: { error: FlowError }) {
  const c = useCopy();
  const router = useRouter();
  return <Screen title={c.title} backHref="/things"><ErrorMessage error={error} /><button className={secondary} onClick={() => router.refresh()}>{c.retry}</button><ActionLink href="/join" secondary>{c.join}</ActionLink></Screen>;
}

export function ThingsScreen({ result }: { result: Result<ThingSnapshot[]> }) {
  const c = useCopy();
  const { locale } = useLocale();
  if (!result.ok) return <LoadError error={result.error} />;
  if (!result.data.length) return <EmptyThings />;
  const current = result.data.filter((thing) => thing.status !== 'disconnected');
  const past = result.data.filter((thing) => thing.status === 'disconnected');
  const cards = (things: ThingSnapshot[], featured = false) => <ul className={`${featured && things.length > 1 ? 'grid gap-x-8 gap-y-12 md:grid-cols-2' : 'space-y-10'}`}>{things.map((thing,index) => {
    const recent=thing.recent_hangouts[0];
    const active=thing.active_hangout;
    const signal=active ? (!active.current_user_joined ? c.waitingForYou : active.other_user_joined ? `${hangoutCopy[locale][active.game_type]} · ${c.inProgress}` : c.waiting) : recent ? recent.game_type==='hot' ? `${hangoutCopy[locale].hot} · reached ${recent.result?.highest_level ?? 'warm'}` : `${hangoutCopy[locale][recent.game_type]} · ${recent.result?.matches ?? recent.result?.agreements ?? recent.result?.correct_predictions ?? recent.result?.prompts_completed ?? ''}${recent.result?.rounds ? `/${recent.result.rounds}` : ''}` : c[thing.status];
    const isSolo = featured && things.length === 1;
    return <li key={thing.id} className={isSolo ? 'md:max-w-3xl' : ''}>
      <ThingTheme color={thing.color_key}><Link href={`/thing/${thing.id}`} className={`thing-poster relative grid overflow-hidden border-y border-[var(--thing-accent-border)] bg-surface px-5 py-6 ${isSolo ? 'min-h-[22rem] grid-cols-[minmax(0,1fr)_9rem] sm:grid-cols-[minmax(0,1fr)_15rem] sm:px-9 sm:py-8' : 'grid-cols-[minmax(0,1fr)_7rem]'}`}>
        <span className="absolute -left-2 top-3 font-heading text-[5.5rem] font-black leading-none text-[var(--thing-primary-soft)]" aria-hidden="true">{String(index+1).padStart(2,'0')}</span>
        <span className="absolute right-4 top-3 rotate-6 font-heading text-xs font-black uppercase tracking-[.2em] thing-accent-text" aria-hidden="true">{index%2 ? 'made together' : 'you two'}</span>
        <div className="relative z-10 flex min-w-0 flex-col justify-end self-stretch pt-14">
          <p className={`${isSolo ? 'text-4xl sm:text-6xl' : 'text-3xl'} break-words font-heading font-black leading-[.9] tracking-[-.04em]`}>{thingDisplayName(thing)}</p>
          {thing.nickname && <p className="mt-3 truncate text-sm font-semibold text-muted">{thing.members.map((member) => member.display_name).join(' + ')}</p>}
          <p className="thing-accent-text mt-7 max-w-xs text-[11px] font-black uppercase tracking-[.14em]">{signal}</p>
        </div>
        <div className="relative z-10 grid place-items-center self-center">
          <span className="absolute h-24 w-24 rounded-full border border-dashed border-[var(--thing-accent-border)] sm:h-36 sm:w-36" aria-hidden="true" />
          <CharmIcon charm={thing.charm_key} size={isSolo ? 168 : 108} className="relative -rotate-2 drop-shadow-[3px_5px_0_rgba(0,0,0,.12)]" />
        </div>
        <span className="absolute bottom-5 right-5 thing-accent-text text-2xl" aria-hidden="true">↗</span>
      </Link></ThingTheme>
    </li>;
  })}</ul>;
  return <Screen title={c.title} wide>
    <Sync enabled={result.data.some((thing) => thing.status.startsWith('pending_'))} />
    {cards(current, true)}
    <div className="flex flex-wrap gap-x-7 gap-y-2 border-t border-dashed border-border pt-7"><Link href="/things/new" className="inline-flex min-h-14 items-center bg-accent px-6 font-heading text-sm font-black text-[#171717]">+ {c.start.replace('→','')}</Link><Link href="/join" className="min-h-14 content-center font-heading text-sm font-bold underline decoration-2 underline-offset-8">{c.join} ↗</Link></div>
    {!!past.length && <details className="pt-5"><summary className="min-h-11 cursor-pointer font-heading text-sm font-black uppercase tracking-[.16em] text-muted">{c.pastThings} · {past.length}</summary><div className="mt-7 opacity-70">{cards(past)}</div></details>}
  </Screen>;
}

function RecentActivity({ thing }: { thing: ThingSnapshot }) {
  const { locale } = useLocale();
  const c = useCopy();
  const h = hangoutCopy[locale];
  return <section className="space-y-5">
    <div><p className="text-[10px] font-bold uppercase tracking-[.22em] text-muted">what you’ve been up to</p><h2 className="font-heading text-3xl font-black">{c.recentActivity}</h2></div>
    {thing.recent_hangouts.length ? <ul className="space-y-3">{thing.recent_hangouts.map((item,index) => <li key={item.id} className="relative grid grid-cols-[1fr_auto] gap-4 py-2 pl-5">
      <span className={`absolute left-0 top-3 h-2.5 w-2.5 rounded-full ${index===0?'bg-[var(--thing-primary)]':'border border-[var(--thing-accent-border)]'}`} aria-hidden="true" />
      <div><span className="font-heading text-sm font-bold tracking-wide">{h[item.game_type].toUpperCase()}</span>
        {item.result?.matches !== undefined && item.result.rounds !== undefined && <p className="mt-1 text-lg font-semibold">{item.result.matches} / {item.result.rounds} {c.matchedShort}</p>}
        {item.result?.correct_predictions !== undefined && <p className="mt-1 text-lg font-semibold">{item.result.correct_predictions} / {item.result.rounds ?? 8} predictions</p>}
        {item.result?.agreements !== undefined && <p className="mt-1 text-lg font-semibold">{item.result.agreements} / {item.result.rounds ?? 8} agreed</p>}
        {item.result?.prompts_completed !== undefined && <p className="mt-1 text-lg font-semibold">{item.result.prompts_completed} prompts · reached {item.result.highest_level}</p>}
        {item.souvenir_keys.map((key) => <span key={key} className="mt-2 inline-block rotate-[-1deg] border border-[var(--thing-accent-border)] bg-[var(--thing-primary-soft)] px-2 py-1 text-xs font-bold">{getSouvenir(key)?.fallbackLabel ?? key}</span>)}</div>
      <div className="text-right">{item.result?.match_rate !== undefined && <strong className="thing-accent-text block text-2xl">{Math.round(item.result.match_rate * 100)}%</strong>}{item.result?.agreement_rate !== undefined && <strong className="thing-accent-text block text-2xl">{Math.round(item.result.agreement_rate * 100)}%</strong>}<span className="text-xs text-muted">{new Date(item.completed_at ?? item.created_at).toLocaleDateString(locale)}</span></div>
    </li>)}</ul> : <div className="border-y border-dashed border-border py-6"><p className="font-semibold">{c.nothingYet}</p><p className="text-sm text-muted">{c.makeSomething}</p></div>}
  </section>;
}

function ThingSettings({ thing, open, onClose }: { thing: ThingSnapshot; open: boolean; onClose: () => void }) {
  const c = useCopy();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [nickname, setNickname] = useState(thing.nickname ?? '');
  const [selectedCharm, setSelectedCharm] = useState<Charm | null>(null);
  const [pending, transition] = useTransition();
  const [error, setError] = useState<FlowError | null>(null);
  const labels: Record<ThingColor, string> = {
    cherry: c.colorCherry, butter: c.colorButter, electric_blue: c.colorElectricBlue, acid: c.colorAcid,
    tangerine: c.colorTangerine, purple: c.colorPurple, paper: c.colorPaper, ink: c.colorInk,
  };
  function changeColor(color: ThingColor) {
    transition(async () => {
      const result = await updateThingColor(thing.id, color);
      if (!result.ok) setError(result.error); else router.refresh();
    });
  }
  function finish() {
    transition(async () => {
      const result = await endThing(thing.id);
      if (!result.ok) setError(result.error);
      else { setConfirming(false); onClose(); router.refresh(); }
    });
  }
  function saveNickname() { transition(async () => { const result=await updateThingNickname(thing.id,nickname); if(!result.ok)setError(result.error); else router.refresh(); }); }
  function suggestCharm() { if(!selectedCharm)return; transition(async()=>{const result=await proposeCharm(thing.id,thing.proposal?.version??0,selectedCharm); if(!result.ok)setError(result.error); else {setSelectedCharm(null);router.refresh();}}); }
  function resolveCharm(accept: boolean) { if(!thing.proposal)return; transition(async()=>{const result=accept?await acceptCharm(thing.id,thing.proposal!.version):await declineCharm(thing.id,thing.proposal!.version); if(!result.ok)setError(result.error); else router.refresh();}); }
  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex items-end bg-black/45 p-4 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-labelledby="thing-settings-title" onClick={onClose}>
    <div className="w-full max-w-md space-y-6 rounded-t-[28px] bg-background p-6 shadow-2xl sm:rounded-[24px]" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between"><h2 id="thing-settings-title" className="font-heading text-2xl font-bold">{c.settings}</h2><button className="min-h-11 min-w-11 text-xl" aria-label={c.close} onClick={onClose}>×</button></div>
        <section className="space-y-2"><label htmlFor="thing-nickname" className="text-sm font-semibold">Name / nickname</label><div className="flex gap-2"><input id="thing-nickname" value={nickname} maxLength={30} onChange={(event)=>setNickname(event.target.value)} placeholder={thing.members.map((member)=>member.display_name).join(' + ')} className="min-h-12 min-w-0 flex-1 rounded-[16px] border border-border bg-surface px-4"/><button disabled={pending||nickname.trim()===(thing.nickname??'')} onClick={saveNickname} className={secondary}>save</button></div><p className="text-xs text-muted">Shared immediately · 30 characters max</p></section>
        <section className="space-y-3"><h3 className="text-sm font-semibold">Charm</h3>{thing.proposal ? <div className="rounded-[18px] border border-border p-4"><div className="flex items-center gap-3"><CharmIcon charm={thing.proposal.charm_key} size={64}/><p>{thing.proposal.proposed_by===thing.viewer_id?'Waiting for them…':`${thing.proposal.proposer_name} suggested a new charm`}</p></div>{thing.proposal.proposed_by!==thing.viewer_id&&<div className="mt-3 grid grid-cols-2 gap-2"><button className={secondary} disabled={pending} onClick={()=>resolveCharm(false)}>keep current</button><button className="thing-primary-button min-h-12 rounded-[18px] px-3 font-semibold" disabled={pending} onClick={()=>resolveCharm(true)}>use new charm</button></div>}</div> : <><div className="grid grid-cols-6 gap-2">{(Object.keys(charms) as Charm[]).map((key)=><button type="button" key={key} aria-label={charms[key].label} aria-pressed={selectedCharm===key} onClick={()=>setSelectedCharm(key)} className="rounded-xl border border-border p-1 aria-pressed:border-foreground aria-pressed:bg-[var(--thing-primary-soft)]"><CharmIcon charm={key} size={44}/></button>)}</div><button className={`${secondary} w-full`} disabled={pending||!selectedCharm} onClick={suggestCharm}>suggest new charm</button></>}</section>
        <fieldset disabled={pending}><legend className="mb-3 text-sm font-semibold">{c.changeColor}</legend><div className="grid grid-cols-4 gap-3">
          {(Object.keys(thingColors) as ThingColor[]).map((color) => <button key={color} type="button" aria-label={labels[color]} aria-pressed={thing.color_key === color} onClick={() => changeColor(color)} className="aspect-square min-h-11 rounded-full border-4 border-surface outline outline-1 outline-border aria-pressed:outline-foreground" style={{ backgroundColor: thingColors[color] }} />)}
        </div></fieldset>
        <button type="button" className="min-h-11 text-sm underline underline-offset-4" onClick={() => setConfirming(true)}>{c.endThing}</button>
        <ErrorMessage error={error} />
    </div>
    {confirming && <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-4 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-labelledby="end-thing-title">
      <div className="w-full max-w-md space-y-5 rounded-[24px] bg-background p-6 shadow-2xl"><h2 id="end-thing-title" className="text-3xl font-bold">{c.endTitle}</h2><p>{c.endBody}</p>
        <div className="grid grid-cols-2 gap-3"><button className={secondary} disabled={pending} onClick={() => setConfirming(false)}>{c.close}</button><button className="min-h-12 rounded-[18px] bg-foreground px-4 text-background" disabled={pending} onClick={finish}>{c.endConfirm}</button></div>
      </div>
    </div>}
  </div>;
}

function ActiveThingHome({ thing, spaceResult, chatPreview, momentsPreview }: { thing: ThingSnapshot; spaceResult?: Result<SpaceSnapshot>; chatPreview?: Result<ChatMessage[]>; momentsPreview?: Result<Moment[]> }) {
  const c = useCopy();
  const router = useRouter();
  const { locale } = useLocale();
  const h = hangoutCopy[locale];
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [joining, transition] = useTransition();
  const [joinError, setJoinError] = useState<FlowError | null>(null);
  const active = thing.active_hangout;
  const space = spaceResult?.ok ? spaceResult.data : null;
  const messages = chatPreview?.ok ? chatPreview.data : [];
  const moments = momentsPreview?.ok ? momentsPreview.data : [];
  function join() {
    if (!active) return;
    transition(async () => {
      const result = await joinHangout(thing.id, active.id);
      if (!result.ok) setJoinError(result.error); else router.push(`/thing/${thing.id}/hangout/${active.id}`);
    });
  }
  return <ThingTheme color={thing.color_key} className="mx-auto max-w-5xl space-y-14 pb-16">
    <Sync enabled={thing.status === 'active' && !!active} />
    <header className="flex items-center justify-between py-5"><Link href="/things" className="font-heading text-2xl font-black tracking-[-.06em]">THING.</Link>{thing.status === 'active' && <button className="min-h-11 min-w-11 text-xl font-bold" aria-label={c.settings} onClick={() => setSettingsOpen(true)}>•••</button>}</header>
    <section className="relative min-h-[21rem] text-center sm:min-h-[25rem]" aria-labelledby="space-title">
      <span className="absolute left-[5%] top-28 rotate-[-12deg] text-4xl thing-accent-text" aria-hidden="true">✦</span><span className="absolute right-[6%] top-36 rotate-12 text-3xl thing-accent-text" aria-hidden="true">○</span><span className="absolute right-[15%] top-3 rotate-6 font-heading text-xs font-black uppercase tracking-[.2em] thing-accent-text" aria-hidden="true">ours</span>
      <h1 id="space-title" className="mx-auto max-w-3xl font-heading break-words text-5xl font-black leading-[.9] tracking-[-.05em] sm:text-7xl">{thingDisplayName(thing)}</h1>{thing.nickname&&<p className="mt-3 text-sm font-semibold text-muted">{thing.members.map((member)=>member.display_name).join(' + ')}</p>}
      <div className="relative mx-auto mt-7 grid h-52 w-52 place-items-center sm:h-60 sm:w-60"><span className="absolute h-40 w-64 -rotate-6 rounded-[50%] border border-dashed border-[var(--thing-accent-border)] sm:h-44 sm:w-80" aria-hidden="true"/><span className="absolute h-64 w-36 rotate-12 rounded-[50%] border border-[var(--thing-accent-border)] opacity-60" aria-hidden="true"/><CharmIcon charm={thing.charm_key} size={190} className="relative -rotate-2 drop-shadow-[4px_7px_0_rgba(0,0,0,.13)] sm:scale-110" /></div>
    </section>
    <div className="space-y-4">
      {thing.status === 'active' ? <section className="mx-auto max-w-md space-y-3" aria-label="Current Hangout">
        {active && <div className="flex items-center justify-between gap-3 px-1"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-muted">current hangout</p><p className="font-heading text-xl font-black">{h[active.game_type]}</p></div><span className="rounded-full bg-[var(--thing-primary-soft)] px-3 py-2 text-xs font-bold">{!active.current_user_joined ? c.waitingForYou : !active.other_user_joined ? c.waiting : c.inProgress}</span></div>}
        {!active ? <ActionLink href={`/thing/${thing.id}/hangout/new`} themed>{c.startHangout}</ActionLink> : active.current_user_joined ? <ActionLink href={`/thing/${thing.id}/hangout/${active.id}`} themed>{active.other_user_joined ? c.continueHangout : c.openHangout}</ActionLink> : <button className="thing-primary-button min-h-14 w-full px-5 py-4 font-semibold disabled:opacity-50" disabled={joining} onClick={join}>{joining ? c.busy : c.joinHangout}</button>}
        <ErrorMessage error={joinError} />
      </section> : <p className="border-y border-border py-5 text-center font-semibold">{c.ended}</p>}
      <nav aria-label="Thing tools" className="mx-auto flex max-w-md justify-center gap-8 border-b border-dashed border-[var(--thing-accent-border)] pb-5"><Link className="min-h-11 content-center font-heading text-sm font-black underline decoration-[var(--thing-primary)] decoration-2 underline-offset-8" href={`/thing/${thing.id}/chat`}>chat <span aria-hidden="true">↗</span></Link><Link className="min-h-11 content-center font-heading text-sm font-black underline decoration-[var(--thing-primary)] decoration-2 underline-offset-8" href={`/thing/${thing.id}/moments`}>moments <span aria-hidden="true">↗</span></Link></nav>
    </div>
    <SpaceCollage thing={thing} space={space} moments={moments} messages={messages} activity={<RecentActivity thing={thing} />} />
    {thing.status === 'active' && <ThingSettings thing={thing} open={settingsOpen} onClose={() => setSettingsOpen(false)} />}
  </ThingTheme>;
}

export function StartScreen() {
  const c = useCopy();
  const router = useRouter();
  const request = useRef<string | null>(null);
  const [pending, transition] = useTransition();
  const [error, setError] = useState<FlowError | null>(null);
  return <Screen title={c.invite} description={c.startHint} backHref="/things">
    <button className={button} disabled={pending} onClick={() => transition(async () => {
      request.current ??= crypto.randomUUID();
      setError(null);
      try {
        const result = await startThing(request.current);
        if (!result.ok) { setError(result.error); return; }
        router.replace(`/thing/${result.data}`);
      } catch { setError('connection_failed'); }
    })}>{pending ? c.busy : c.create}</button><ErrorMessage error={error} />
  </Screen>;
}

export function JoinScreen({ code, preview }: { code?: string; preview?: Result<InvitePreview> }) {
  const c = useCopy();
  const router = useRouter();
  const [input, setInput] = useState(code ?? '');
  const [error, setError] = useState<FlowError | null>(null);
  const [pending, transition] = useTransition();
  return <Screen title={c.join} backHref="/things">
    {!code ? <form className="space-y-4" onSubmit={(event) => {
      event.preventDefault();
      const normalized = parseInviteInput(input);
      if (!normalized) { setError('invite_unavailable'); return; }
      // Full navigation ensures the invite cookie is set before auth/profile gates.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/join/${normalized}`);
    }}>
      <label className="block space-y-2"><span>{c.codeOrLink}</span><input className={`${secondary} w-full font-mono`} autoComplete="off" autoCapitalize="none" spellCheck={false} value={input} maxLength={2048} required onChange={(e) => setInput(e.target.value)} /></label>
      <button className={button}>{c.continue}</button>
    </form> : preview?.ok ? <div className={panel}>
      <p className="break-words text-2xl"><strong>{preview.data.inviter_name}</strong> {c.invited}</p>
      <button className={button} disabled={pending} onClick={() => transition(async () => {
        setError(null);
        try {
          const result = await acceptInvite(code);
          if (!result.ok) { setError(result.error); return; }
          router.replace(`/thing/${result.data}`);
          router.refresh();
        } catch { setError('connection_failed'); }
      })}>{pending ? c.busy : c.accept}</button>
    </div> : <><ErrorMessage error={preview && !preview.ok ? preview.error : 'invite_unavailable'} /><button className={secondary} onClick={() => router.refresh()}>{c.retry}</button></>}
    <ErrorMessage error={error} />
    <button className="min-h-11 underline" disabled={pending} onClick={() => transition(async () => {
      try { await forgetInvite(); router.replace('/things'); } catch { setError('connection_failed'); }
    })}>{c.notNow}</button>
  </Screen>;
}

function InvitePanel({ thing }: { thing: ThingSnapshot }) {
  const c = useCopy();
  const { locale } = useLocale();
  const router = useRouter();
  const [pending, transition] = useTransition();
  const [error, setError] = useState<FlowError | null>(null);
  const [notice, setNotice] = useState('');
  const [link, setLink] = useState('');
  const invite = thing.invite;
  useEffect(() => {
    if (invite) {
      const url = buildInviteUrl(window.location.origin, invite.code) ?? '';
      // Browser origin is needed only for the shareable absolute URL.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLink(url);
    }
  }, [invite]);
  async function share(kind: 'code' | 'link' | 'share') {
    if (!invite) return;
    setNotice('');
    try {
      if (kind === 'share' && navigator.share) await navigator.share({ title: 'THING', url: link });
      else { await navigator.clipboard.writeText(kind === 'code' ? invite.code : link); setNotice(c.copied); }
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) setNotice(c.copyFailed);
    }
  }
  function manage(action: 'renew' | 'cancel') {
    transition(async () => {
      setError(null);
      try {
        const result = await manageInvite(thing.id, action);
        if (!result.ok) { setError(result.error); router.refresh(); return; }
        if (action === 'cancel') router.replace('/things');
        router.refresh();
      } catch { setError('connection_failed'); }
    });
  }
  return <div className={panel}>
    {invite && !invite.expired ? <>
      <InviteQr url={link} label={c.qrLabel} />
      <p className="text-center font-mono text-3xl font-bold tracking-[.22em]">{invite.code}</p>
      <div className="flex flex-wrap gap-2"><button className={secondary} onClick={() => void share('code')}>{c.copyCode}</button><button className={secondary} disabled={!link} onClick={() => void share('link')}>{c.copyLink}</button></div>
      <button className={button} disabled={!link} onClick={() => void share('share')}>{c.share}</button>
      <input aria-label={c.copyLink} className="w-full min-w-0 text-sm text-muted" readOnly value={link} onFocus={(event) => event.target.select()} />
      <p className="text-sm text-muted">{c.expires}: {new Date(invite.expires_at).toLocaleString(locale)}</p>
    </> : <><p>{c.expired}</p><button className={button} disabled={pending} onClick={() => manage('renew')}>{c.renew}</button></>}
    <p role="status" className="text-sm">{notice}</p><ErrorMessage error={error} />
    <button className="min-h-11 text-sm underline" disabled={pending} onClick={() => manage('cancel')}>{c.cancel}</button>
  </div>;
}

function CharmPanel({ thing }: { thing: ThingSnapshot }) {
  const c = useCopy();
  const router = useRouter();
  const [selected, setSelected] = useState<Charm | null>(null);
  const [choosing, setChoosing] = useState(!thing.proposal);
  const [pending, transition] = useTransition();
  const [error, setError] = useState<FlowError | null>(null);
  const ownProposal = thing.proposal?.proposed_by === thing.viewer_id;
  const version = thing.proposal?.version ?? 0;
  function submitProposal() {
    if (!selected) return;
    transition(async () => {
      setError(null);
      try {
        const result = await proposeCharm(thing.id, version, selected);
        if (!result.ok) setError(result.error);
        router.refresh();
      } catch { setError('connection_failed'); }
    });
  }
  function keepProposal() {
    if (!thing.proposal) return;
    transition(async () => {
      setError(null);
      try {
        const result = await acceptCharm(thing.id, thing.proposal!.version);
        if (!result.ok) setError(result.error);
        router.refresh();
      } catch { setError('connection_failed'); }
    });
  }
  return <div className={panel}>
    {thing.proposal && !choosing ? <div className="space-y-5 text-center">
      <p className="text-sm text-muted">{ownProposal ? c.youProposed : c.personProposed.replace('{name}', thing.proposal.proposer_name)}</p>
      <CharmIcon charm={thing.proposal.charm_key} size={128} className="mx-auto" />
      {ownProposal ? <p role="status">{c.waiting}</p> : <>
        <p>{c.keepQuestion}</p>
        <button className={button} disabled={pending} onClick={keepProposal}>{pending ? c.busy : c.keepCharm}</button>
        <button className={`${secondary} w-full`} disabled={pending} onClick={() => setChoosing(true)}>{c.pickAnother}</button>
      </>}
    </div> : <>
      <p>{thing.proposal ? c.pickAnother : c.pick}</p>
      <fieldset disabled={pending} className="grid grid-cols-2 gap-3"><legend className="sr-only">Charm</legend>
        {(Object.entries(charms) as [Charm, (typeof charms)[Charm]][]).map(([key, charm]) => <label key={key} className={`cursor-pointer rounded-2xl border p-4 text-center ${selected === key ? 'border-foreground bg-background' : 'border-border'}`}>
          <input type="radio" name="charm" value={key} checked={selected === key} onChange={() => setSelected(key)} className="mr-2" /><CharmIcon charm={key} size={64} className="mx-auto" /><span className="mt-2 block text-sm">{charm.label}</span>
        </label>)}
      </fieldset>
      <button className={button} disabled={pending || !selected} onClick={submitProposal}>{pending ? c.busy : c.propose}</button>
      {thing.proposal && <button className={`${secondary} w-full`} disabled={pending} onClick={() => setChoosing(false)}>{c.backProposal}</button>}
    </>}<ErrorMessage error={error} />
  </div>;
}

export function ThingScreen({ result, spaceResult, chatPreview, momentsPreview }: { result: Result<ThingSnapshot>; spaceResult?: Result<SpaceSnapshot>; chatPreview?: Result<ChatMessage[]>; momentsPreview?: Result<Moment[]> }) {
  const c = useCopy();
  if (!result.ok) return <LoadError error={result.error} />;
  const thing = result.data;
  if (thing.status === 'active' || thing.status === 'disconnected') return <ActiveThingHome thing={thing} spaceResult={spaceResult} chatPreview={chatPreview} momentsPreview={momentsPreview} />;
  return <><header className="flex items-center justify-between py-5"><Link href="/things" className="font-heading text-lg font-black tracking-tight">THING.</Link></header><Screen title={c[thing.status]} backHref="/things">
    <Sync enabled={thing.status.startsWith('pending_')} />
    {thing.status.startsWith('pending_') && <p className="break-words text-xl font-semibold">{thing.members.map((member) => member.display_name).join(' + ')}</p>}
    {thing.status === 'pending_invite' && <><p className="text-muted">{c.invite}</p><InvitePanel thing={thing} /></>}
    {thing.status === 'pending_charm' && <CharmPanel key={`${thing.id}:${thing.proposal?.version ?? 0}`} thing={thing} />}
  </Screen></>;
}
