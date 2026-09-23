'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ThingTheme } from './thing-theme';
import type { ThingColor } from '@/features/things/model';
import type { HangoutSnapshot } from '@/features/hangouts/model';
import { abandonHangout, loadHangout } from '@/features/hangouts/actions';
import { useLocale } from '@/lib/i18n/provider';

export function HangoutShell({ thingId, hangoutId, state: initialState, title, progress, color, children }: { thingId: string; hangoutId: string; state: HangoutSnapshot['state']; title: string; progress?: string; color: ThingColor; children: ReactNode }) {
  const { locale } = useLocale();
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(false);
  const [pending, transition] = useTransition();
  const open = ['setup', 'waiting', 'ready', 'active'].includes(state);
  useEffect(() => {
    if (!open) return;
    const refresh = async () => {
      const result = await loadHangout(hangoutId);
      if (!result.ok) return;
      setState(result.data.state);
      if (result.data.state === 'abandoned') router.replace(`/thing/${thingId}`);
    };
    const timer = window.setInterval(refresh, 2500);
    return () => window.clearInterval(timer);
  }, [hangoutId, open, router, thingId]);
  function abandon() {
    transition(async () => {
      setError(false);
      const result = await abandonHangout(thingId, hangoutId);
      if (!result.ok) setError(true); else router.replace(`/thing/${thingId}`);
    });
  }
  const words = locale === 'es'
    ? { cancel: 'Cancelar Hangout', end: 'Terminar Hangout', title: '¿Terminar este Hangout?', body: 'La sesión quedará como abandonada y no contará en sus resultados.', back: 'Seguir jugando', confirm: 'Terminar' }
    : { cancel: 'Cancel Hangout', end: 'End Hangout', title: 'End this Hangout?', body: 'The session will be abandoned and will not count toward your results.', back: 'Keep playing', confirm: 'End it' };
  return <ThingTheme color={color} className="space-y-10 pb-8">
    <header className="flex min-h-12 items-center justify-between gap-4 border-b border-border py-3 text-sm">
      <Link href={`/thing/${thingId}`} className="font-semibold lowercase">← {title}</Link>
      <div className="flex items-center gap-3">{progress && <span className="font-heading font-bold text-[var(--thing-accent-text)]">{progress}</span>}{open && <button className="min-h-11 text-xs text-muted underline underline-offset-4" onClick={() => state === 'active' ? setConfirming(true) : abandon()} disabled={pending}>{state === 'active' ? words.end : words.cancel}</button>}</div>
    </header>
    {children}
    {error && <p role="alert" className="text-sm">{locale === 'es' ? 'No se pudo terminar. Intenta otra vez.' : 'Could not end it. Try again.'}</p>}
    {confirming && <div className="fixed inset-0 z-50 flex items-end bg-black/45 p-4 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-labelledby="end-hangout-title"><div className="w-full max-w-md space-y-5 rounded-t-[28px] bg-background p-6 sm:rounded-[24px]"><h2 id="end-hangout-title" className="font-heading text-2xl font-bold">{words.title}</h2><p>{words.body}</p><div className="grid grid-cols-2 gap-3"><button className="min-h-12 border border-border px-4" onClick={() => setConfirming(false)}>{words.back}</button><button className="min-h-12 bg-foreground px-4 text-background" disabled={pending} onClick={abandon}>{words.confirm}</button></div></div></div>}
  </ThingTheme>;
}
