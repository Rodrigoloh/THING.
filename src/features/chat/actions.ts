'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { flowError, type Result } from '@/features/things/model';
import { normalizeMessage, type ChatMessage } from './model';
import { recentThingItems } from '@/features/space/preview';

export async function loadChat(thingId: string): Promise<Result<ChatMessage[]>> {
  try {
    const { data, error } = await (await getSupabaseServerClient()).from('chat_messages').select('*').eq('thing_id', thingId).order('created_at').order('id').limit(300);
    return error ? { ok: false, error: flowError(error) } : { ok: true, data: data ?? [] };
  } catch { return { ok: false, error: 'connection_failed' }; }
}

export async function loadChatPreview(thingId: string): Promise<Result<ChatMessage[]>> {
  try {
    const { data, error } = await (await getSupabaseServerClient()).from('chat_messages').select('*').eq('thing_id', thingId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(3);
    if (error) return { ok: false, error: flowError(error) };
    return { ok: true, data: recentThingItems(data ?? [], thingId, 3) };
  } catch { return { ok: false, error: 'connection_failed' }; }
}

export async function sendMessage(thingId: string, input: string): Promise<Result<null>> {
  const body = normalizeMessage(input);
  if (!body) return { ok: false, error: 'invalid_message' };
  try {
    const { error } = await (await getSupabaseServerClient()).from('chat_messages').insert({ thing_id: thingId, body });
    if (error) return { ok: false, error: flowError(error) };
    revalidatePath(`/thing/${thingId}/chat`);
    revalidatePath(`/thing/${thingId}`);
    return { ok: true, data: null };
  } catch { return { ok: false, error: 'connection_failed' }; }
}
