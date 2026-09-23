'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { flowError, type Result } from '@/features/things/model';
import type { GameType, HangoutSnapshot, HotLevel, HotMode, HotSetup } from './model';

export async function loadHotSetup(thingId: string): Promise<Result<HotSetup>> {
  try {
    const { data, error } = await (await getSupabaseServerClient()).rpc('hot_setup_snapshot', { p_thing_id: thingId });
    return error || !data ? { ok: false, error: flowError(error) } : { ok: true, data };
  } catch { return { ok: false, error: 'connection_failed' }; }
}

export async function setHotConsent(thingId: string, level: HotLevel): Promise<Result<HotSetup>> {
  try {
    const { data, error } = await (await getSupabaseServerClient()).rpc('set_hot_consent', { p_thing_id: thingId, p_level: level });
    if (error || !data) return { ok: false, error: flowError(error) };
    revalidatePath(`/thing/${thingId}/hangout/new`);
    return { ok: true, data };
  } catch { return { ok: false, error: 'connection_failed' }; }
}

export async function createHangout(thingId: string, gameType: GameType, hotMode: HotMode | null = null): Promise<Result<string>> {
  try {
    const { data, error } = await (await getSupabaseServerClient()).rpc('create_hangout', { p_thing_id: thingId, p_game_type: gameType, p_hot_mode: hotMode });
    if (error || !data) return { ok: false, error: flowError(error) };
    revalidatePath(`/thing/${thingId}`);
    return { ok: true, data };
  } catch { return { ok: false, error: 'connection_failed' }; }
}

export async function loadHangout(hangoutId: string): Promise<Result<HangoutSnapshot>> {
  try {
    const { data, error } = await (await getSupabaseServerClient()).rpc('hangout_snapshot', { p_hangout_id: hangoutId });
    return error || !data ? { ok: false, error: flowError(error) } : { ok: true, data };
  } catch { return { ok: false, error: 'connection_failed' }; }
}

export async function addHotCard(hangoutId: string, content: string): Promise<Result<string>> {
  try {
    const { data, error } = await (await getSupabaseServerClient()).rpc('add_hot_deck_card', { p_hangout_id: hangoutId, p_content: content });
    if (error || !data) return { ok: false, error: flowError(error) };
    revalidatePath('/thing/[thingId]/hangout/[hangoutId]', 'page');
    return { ok: true, data };
  } catch { return { ok: false, error: 'connection_failed' }; }
}

export async function readyHotBatch(hangoutId: string): Promise<Result<null>> {
  try {
    const { error } = await (await getSupabaseServerClient()).rpc('ready_hot_batch', { p_hangout_id: hangoutId });
    if (error) return { ok: false, error: flowError(error) };
    revalidatePath('/thing/[thingId]/hangout/[hangoutId]', 'page');
    return { ok: true, data: null };
  } catch { return { ok: false, error: 'connection_failed' }; }
}
