'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ThingTheme } from '@/components/thing/thing-theme';
import { CharmIcon, thingDisplayName } from '@/components/thing/charm-icon';
import type { Result, ThingSnapshot } from '@/features/things/model';
import type { ChatMessage } from './model';
import { sendMessage } from './actions';

export function ChatScreen({ thing, messages }: { thing: ThingSnapshot; messages: Result<ChatMessage[]> }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  useEffect(() => { const timer = window.setInterval(() => router.refresh(), 5000); return () => clearInterval(timer); }, [router]);
  const memberNames = new Map(thing.members.map((member) => [member.user_id, member.display_name]));
  return <ThingTheme color={thing.color_key} className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col pb-4">
    <header className="flex items-center gap-3 border-b border-border py-4"><Link href={`/thing/${thing.id}`} className="min-h-11 min-w-11 content-center text-xl">←</Link><CharmIcon charm={thing.charm_key} size={44} /><div><h1 className="font-heading text-lg font-bold">{thingDisplayName(thing)}</h1><p className="text-xs text-muted">private chat · just you two</p></div></header>
    <main className="flex-1 space-y-3 py-6" aria-live="polite">{messages.ok ? messages.data.map((message) => { const own = message.author_id === thing.viewer_id; return <article key={message.id} className={`max-w-[82%] ${own ? 'ml-auto' : ''}`}><p className="mb-1 text-xs text-muted">{own ? 'you' : memberNames.get(message.author_id)}</p><div className={`rounded-[18px] px-4 py-3 ${own ? 'bg-[var(--thing-primary)] text-[var(--thing-on-primary)]' : 'border border-border bg-surface'}`}>{message.body}</div><time className="mt-1 block text-[11px] text-muted">{new Date(message.created_at).toLocaleString()}</time></article>; }) : <p role="alert">Could not load the conversation.</p>}{messages.ok && !messages.data.length && <p className="py-16 text-center text-muted">Say the first thing.</p>}</main>
    <form className="sticky bottom-0 flex gap-2 border-t border-border bg-background py-3" onSubmit={(event) => { event.preventDefault(); startTransition(async () => { const result = await sendMessage(thing.id, body); if (!result.ok) setError(result.error); else { setBody(''); setError(''); router.refresh(); } }); }}><label className="sr-only" htmlFor="chat-body">Message</label><input id="chat-body" value={body} maxLength={2000} onChange={(event) => setBody(event.target.value)} placeholder="write something…" className="min-h-12 min-w-0 flex-1 rounded-full border border-border bg-surface px-4" /><button disabled={pending || !body.trim()} className="thing-primary-button min-h-12 rounded-full px-5 font-bold">send</button></form>{error && <p role="alert" className="pb-2 text-sm">Could not send that message.</p>}
  </ThingTheme>;
}
