'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Screen } from '@/components/ui/screen';
import { ActionLink } from '@/components/ui/action-link';
import { useLocale } from '@/lib/i18n/provider';
import { EmptyThings } from './empty-things';
import { flowCopy } from './copy';
import { acceptCharm, acceptInvite, forgetInvite, manageInvite, proposeCharm, startThing } from './actions';
import { charms, parseInviteInput, type Charm, type FlowError, type InvitePreview, type Result, type ThingSnapshot } from './model';
import { buildInviteUrl } from './invite-url';
import { InviteQr } from './invite-qr';
import { endThing, updateThingColor } from './actions';
import { thingColors, type ThingColor } from './model';
import { hangoutCopy } from '@/features/hangouts/copy';
import { joinHangout } from '@/features/hangouts/actions';
import { ThingTheme } from '@/components/thing/thing-theme';
import type { SpaceSnapshot } from '@/features/space/model';

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
  if (!result.ok) return <LoadError error={result.error} />;
  if (!result.data.length) return <EmptyThings />;
  const current = result.data.filter((thing) => thing.status !== 'disconnected');
  const past = result.data.filter((thing) => thing.status === 'disconnected');
  const cards = (things: ThingSnapshot[]) => <ul className="space-y-4">{things.map((thing) => <li key={thing.id}>
    <Link href={`/thing/${thing.id}`} className={`${panel} block border-l-8`} style={{ borderLeftColor: thingColors[thing.color_key] }}>
      <span className="text-4xl" aria-hidden="true">{thing.charm_key ? charms[thing.charm_key] : '◌'}</span>
      <p className="break-words text-xl font-semibold">{thing.members.map((member) => member.display_name).join(' + ')}</p>
      <p className="text-muted">{c[thing.status]}</p>
    </Link>
  </li>)}</ul>;
  return <Screen title={c.title}>
    <Sync enabled={result.data.some((thing) => thing.status.startsWith('pending_'))} />
    {cards(current)}
    <ActionLink href="/things/new">{c.start}</ActionLink><ActionLink href="/join" secondary>{c.join}</ActionLink>
    {!!past.length && <section className="space-y-3"><h2 className="text-sm font-semibold uppercase tracking-[.16em] text-muted">{c.pastThings}</h2>{cards(past)}</section>}
    <Link href="/profile/settings" className="inline-flex min-h-11 items-center underline">{c === flowCopy.es ? 'tu cuenta' : 'your account'}</Link>
  </Screen>;
}

const souvenirLabels: Record<string, string> = { FIRST_THOUGHT: 'FIRST THOUGHT', SAME_BRAIN: '★ SAME BRAIN', LOCKED_IN: '★★ LOCKED IN', PERFECT_SYNC: '100%' };

function RecentActivity({ thing }: { thing: ThingSnapshot }) {
  const { locale } = useLocale();
  const c = useCopy();
  const h = hangoutCopy[locale];
  return <section className="space-y-3">
    <h2 className="text-sm font-semibold uppercase tracking-[.16em] text-muted">{c.recentActivity}</h2>
    {thing.recent_hangouts.length ? <ul className="divide-y divide-border border-y border-border">{thing.recent_hangouts.map((item) => <li key={item.id} className="grid grid-cols-[1fr_auto] gap-4 py-5">
      <div><span className="font-heading text-sm font-bold tracking-wide">{h[item.game_type].toUpperCase()}</span>{item.result?.matches !== undefined && item.result.rounds !== undefined && <p className="mt-1 text-lg font-semibold">{item.result.matches} / {item.result.rounds} {c.matchedShort}</p>}{item.souvenir_keys.map((key) => <span key={key} className="mt-2 inline-block rotate-[-1deg] border border-[var(--thing-accent-border)] bg-[var(--thing-primary-soft)] px-2 py-1 text-xs font-bold">{souvenirLabels[key] ?? key}</span>)}</div>
      <div className="text-right">{item.result?.match_rate !== undefined && <strong className="thing-accent-text block text-2xl">{Math.round(item.result.match_rate * 100)}%</strong>}<span className="text-xs text-muted">{new Date(item.completed_at ?? item.created_at).toLocaleDateString(locale)}</span></div>
    </li>)}</ul> : <div className="border-y border-dashed border-border py-6"><p className="font-semibold">{c.nothingYet}</p><p className="text-sm text-muted">{c.makeSomething}</p></div>}
  </section>;
}

function ThingSettings({ thing, open, onClose }: { thing: ThingSnapshot; open: boolean; onClose: () => void }) {
  const c = useCopy();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
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
  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex items-end bg-black/45 p-4 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-labelledby="thing-settings-title" onClick={onClose}>
    <div className="w-full max-w-md space-y-6 rounded-t-[28px] bg-background p-6 shadow-2xl sm:rounded-[24px]" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between"><h2 id="thing-settings-title" className="font-heading text-2xl font-bold">{c.settings}</h2><button className="min-h-11 min-w-11 text-xl" aria-label={c.close} onClick={onClose}>×</button></div>
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

function ActiveThingHome({ thing, spaceResult }: { thing: ThingSnapshot; spaceResult?: Result<SpaceSnapshot> }) {
  const c = useCopy();
  const router = useRouter();
  const { locale } = useLocale();
  const h = hangoutCopy[locale];
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [joining, transition] = useTransition();
  const [joinError, setJoinError] = useState<FlowError | null>(null);
  const active = thing.active_hangout;
  const space = spaceResult?.ok ? spaceResult.data : null;
  const stats = space ? [
    space.total_completed_hangouts > 0 ? `${space.total_completed_hangouts} ${c.hangoutsShort}` : null,
    space.current_streak > 0 ? `${space.current_streak} ${c.dayStreak}` : null,
    space.same_brain.hangouts > 0 ? `${Math.round(space.same_brain.lifetime_match_rate * 100)}% Same Brain` : null,
    space.same_brain.matches > 0 ? `${space.same_brain.matches} ${c.matchesShort}` : null,
  ].filter(Boolean) : [];
  function join() {
    if (!active) return;
    transition(async () => {
      const result = await joinHangout(thing.id, active.id);
      if (!result.ok) setJoinError(result.error); else router.push(`/thing/${thing.id}/hangout/${active.id}`);
    });
  }
  return <ThingTheme color={thing.color_key} className="space-y-10 pb-8">
    <Sync enabled={thing.status === 'active' && !!active} />
    <header className="flex items-center justify-between py-5"><Link href="/things" className="font-heading text-lg font-black tracking-tight">THING.</Link>{thing.status === 'active' && <button className="min-h-11 min-w-11 text-xl font-bold" aria-label={c.settings} onClick={() => setSettingsOpen(true)}>•••</button>}</header>
    <section className="space-y-2"><p className="text-5xl" aria-label={thing.charm_key ? c[thing.charm_key] : undefined}>{thing.charm_key ? charms[thing.charm_key] : '◌'}</p><h1 className="font-heading break-words text-3xl font-bold tracking-tight">{thing.members.map((member) => member.display_name).join(' + ')}</h1></section>
    {!!stats.length && <section aria-label={c.quickStats} className="flex flex-wrap gap-x-5 gap-y-2 border-y border-dotted border-border py-4">{stats.map((stat) => <span key={stat} className="text-sm font-semibold">{stat}</span>)}</section>}
    {thing.status === 'active' ? <section className="space-y-3 border-l-4 border-[var(--thing-primary)] pl-4">
      {!active ? <ActionLink href={`/thing/${thing.id}/hangout/new`} themed>{c.startHangout}</ActionLink> : <><p className="font-heading text-2xl font-bold">{h[active.game_type]}</p><p className="text-sm text-muted">{!active.current_user_joined ? c.waitingForYou : !active.other_user_joined ? c.waiting : c.inProgress}</p>{active.current_user_joined ? <ActionLink href={`/thing/${thing.id}/hangout/${active.id}`} themed>{active.other_user_joined ? c.continueHangout : c.openHangout}</ActionLink> : <button className="thing-primary-button min-h-14 w-full px-5 py-4 font-semibold disabled:opacity-50" disabled={joining} onClick={join}>{joining ? c.busy : c.joinHangout}</button>}</>}
      <ErrorMessage error={joinError} />
    </section> : <p className="border-y border-border py-5 font-semibold">{c.ended}</p>}
    <RecentActivity thing={thing} />
    <section className="space-y-4"><h2 className="font-heading text-sm font-bold uppercase tracking-[.16em]">{c.sharedThings}</h2>{space?.souvenirs.length ? <div className="flex flex-wrap gap-3">{space.souvenirs.map((souvenir, index) => <span key={souvenir.key} className="border-2 border-[var(--thing-accent-border)] bg-[var(--thing-primary-soft)] px-4 py-3 text-sm font-black shadow-[3px_3px_0_var(--thing-primary)]" style={{ transform: `rotate(${index % 2 ? 1.5 : -1.5}deg)` }}>{souvenirLabels[souvenir.key]}</span>)}</div> : <p className="border-y border-dashed border-border py-6 text-sm text-muted">{c.sharedThingsEmpty}</p>}</section>
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
      <p className="text-7xl" aria-label={c[thing.proposal.charm_key]}>{charms[thing.proposal.charm_key]}</p>
      {ownProposal ? <p role="status">{c.waiting}</p> : <>
        <p>{c.keepQuestion}</p>
        <button className={button} disabled={pending} onClick={keepProposal}>{pending ? c.busy : c.keepCharm}</button>
        <button className={`${secondary} w-full`} disabled={pending} onClick={() => setChoosing(true)}>{c.pickAnother}</button>
      </>}
    </div> : <>
      <p>{thing.proposal ? c.pickAnother : c.pick}</p>
      <fieldset disabled={pending} className="grid grid-cols-2 gap-3"><legend className="sr-only">Charm</legend>
        {(Object.entries(charms) as [Charm, string][]).map(([key, emoji]) => <label key={key} className={`cursor-pointer rounded-2xl border p-4 text-center ${selected === key ? 'border-foreground bg-background' : 'border-border'}`}>
          <input type="radio" name="charm" value={key} checked={selected === key} onChange={() => setSelected(key)} className="mr-2" /><span className="text-4xl" aria-hidden="true">{emoji}</span><span className="mt-2 block text-sm">{c[key]}</span>
        </label>)}
      </fieldset>
      <button className={button} disabled={pending || !selected} onClick={submitProposal}>{pending ? c.busy : c.propose}</button>
      {thing.proposal && <button className={`${secondary} w-full`} disabled={pending} onClick={() => setChoosing(false)}>{c.backProposal}</button>}
    </>}<ErrorMessage error={error} />
  </div>;
}

export function ThingScreen({ result, spaceResult }: { result: Result<ThingSnapshot>; spaceResult?: Result<SpaceSnapshot> }) {
  const c = useCopy();
  if (!result.ok) return <LoadError error={result.error} />;
  const thing = result.data;
  if (thing.status === 'active' || thing.status === 'disconnected') return <ActiveThingHome thing={thing} spaceResult={spaceResult} />;
  return <><header className="flex items-center justify-between py-5"><Link href="/things" className="font-heading text-lg font-black tracking-tight">THING.</Link></header><Screen title={c[thing.status]} backHref="/things">
    <Sync enabled={thing.status.startsWith('pending_')} />
    {thing.status.startsWith('pending_') && <p className="break-words text-xl font-semibold">{thing.members.map((member) => member.display_name).join(' + ')}</p>}
    {thing.status === 'pending_invite' && <><p className="text-muted">{c.invite}</p><InvitePanel thing={thing} /></>}
    {thing.status === 'pending_charm' && <CharmPanel key={`${thing.id}:${thing.proposal?.version ?? 0}`} thing={thing} />}
  </Screen></>;
}
