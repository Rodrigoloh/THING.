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
  return <Screen title={c.title}>
    <Sync enabled={result.data.some((thing) => thing.status.startsWith('pending_'))} />
    <ul className="space-y-4">{result.data.map((thing) => <li key={thing.id}>
      <Link href={`/thing/${thing.id}`} className={`${panel} block`}>
        <span className="text-4xl" aria-hidden="true">{thing.charm_key ? charms[thing.charm_key] : '◌'}</span>
        <p className="break-words text-xl font-semibold">{thing.members.map((member) => member.display_name).join(' + ')}</p>
        <p className="text-muted">{c[thing.status]}</p>
      </Link>
    </li>)}</ul>
    <ActionLink href="/things/new">{c.start}</ActionLink><ActionLink href="/join" secondary>{c.join}</ActionLink>
    <Link href="/profile/settings" className="inline-flex min-h-11 items-center underline">{c === flowCopy.es ? 'tu cuenta' : 'your account'}</Link>
  </Screen>;
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

export function ThingScreen({ result }: { result: Result<ThingSnapshot> }) {
  const c = useCopy();
  if (!result.ok) return <LoadError error={result.error} />;
  const thing = result.data;
  return <Screen title={c[thing.status]} backHref="/things">
    <Sync enabled={thing.status.startsWith('pending_')} />
    <p className="break-words text-xl font-semibold">{thing.members.map((member) => member.display_name).join(' + ')}</p>
    {thing.status === 'pending_invite' && <><p className="text-muted">{c.invite}</p><InvitePanel thing={thing} /></>}
    {thing.status === 'pending_charm' && <CharmPanel key={`${thing.id}:${thing.proposal?.version ?? 0}`} thing={thing} />}
    {thing.status === 'active' && thing.charm_key && <div className={`${panel} py-12 text-center`}><p className="text-8xl" aria-label={c[thing.charm_key]}>{charms[thing.charm_key]}</p><p>{c.home}</p></div>}
  </Screen>;
}
