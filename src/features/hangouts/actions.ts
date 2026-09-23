'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { flowError, type Result } from '@/features/things/model';
import type { ChoiceSnapshot, CreateHangoutResult, GameType, HangoutSnapshot, HotContext, HotLevel, HotMode, HotSetup, HotSnapshot, SameBrainSnapshot } from './model';

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

export async function createHangout(thingId: string, gameType: GameType, hotMode: HotMode | null = null, context: HotContext | null = null): Promise<Result<CreateHangoutResult>> {
  try {
    const { data, error } = await (await getSupabaseServerClient()).rpc('create_hangout', { p_thing_id: thingId, p_game_type: gameType, p_hot_mode: hotMode, p_context: context });
    if (error || !data) return { ok: false, error: flowError(error) };
    revalidatePath(`/thing/${thingId}`);
    return { ok: true, data };
  } catch { return { ok: false, error: 'connection_failed' }; }
}

export async function abandonHangout(thingId: string, hangoutId: string): Promise<Result<null>> {
  try {
    const { error } = await (await getSupabaseServerClient()).rpc('abandon_hangout', { p_hangout_id: hangoutId });
    if (error) return { ok: false, error: flowError(error) };
    revalidatePath(`/thing/${thingId}`);
    return { ok: true, data: null };
  } catch { return { ok: false, error: 'connection_failed' }; }
}

export async function joinHangout(thingId: string, hangoutId: string): Promise<Result<string>> {
  try {
    const { error } = await (await getSupabaseServerClient()).rpc('join_hangout', { p_hangout_id: hangoutId });
    if (error) return { ok: false, error: flowError(error) };
    revalidatePath(`/thing/${thingId}`);
    return { ok: true, data: hangoutId };
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

export async function loadSameBrain(hangoutId: string): Promise<Result<SameBrainSnapshot>> {
  try {
    const { data, error } = await (await getSupabaseServerClient()).rpc('same_brain_snapshot', { p_hangout_id: hangoutId });
    return error || !data ? { ok: false, error: flowError(error) } : { ok: true, data };
  } catch { return { ok: false, error: 'connection_failed' }; }
}

export async function startSameBrain(hangoutId: string): Promise<Result<SameBrainSnapshot>> {
  try {
    const client = await getSupabaseServerClient();
    const { error } = await client.rpc('start_same_brain', { p_hangout_id: hangoutId });
    if (error) return { ok: false, error: flowError(error) };
    const { data, error: snapshotError } = await client.rpc('same_brain_snapshot', { p_hangout_id: hangoutId });
    return snapshotError || !data ? { ok: false, error: flowError(snapshotError) } : { ok: true, data };
  } catch { return { ok: false, error: 'connection_failed' }; }
}

export async function submitSameBrainAnswer(hangoutId: string, roundId: string, answerKey: 'a' | 'b'): Promise<Result<SameBrainSnapshot>> {
  try {
    const client = await getSupabaseServerClient();
    const { error } = await client.rpc('submit_same_brain_answer', { p_hangout_id: hangoutId, p_round_id: roundId, p_answer_key: answerKey });
    if (error) return { ok: false, error: flowError(error) };
    const { data, error: snapshotError } = await client.rpc('same_brain_snapshot', { p_hangout_id: hangoutId });
    return snapshotError || !data ? { ok: false, error: flowError(snapshotError) } : { ok: true, data };
  } catch { return { ok: false, error: 'connection_failed' }; }
}

export async function advanceSameBrain(hangoutId: string): Promise<Result<SameBrainSnapshot>> {
  try {
    const client = await getSupabaseServerClient();
    const { error } = await client.rpc('advance_same_brain_round', { p_hangout_id: hangoutId });
    if (error) return { ok: false, error: flowError(error) };
    revalidatePath('/thing/[thingId]/hangout/[hangoutId]', 'page');
    revalidatePath('/thing/[thingId]', 'page');
    const { data, error: snapshotError } = await client.rpc('same_brain_snapshot', { p_hangout_id: hangoutId });
    return snapshotError || !data ? { ok: false, error: flowError(snapshotError) } : { ok: true, data };
  } catch { return { ok: false, error: 'connection_failed' }; }
}

async function choiceSnapshot(client: Awaited<ReturnType<typeof getSupabaseServerClient>>, hangoutId: string, game: 'know_me' | 'this_or_that') {
  return game === 'know_me'
    ? client.rpc('know_me_snapshot', { p_hangout_id: hangoutId })
    : client.rpc('this_or_that_snapshot', { p_hangout_id: hangoutId });
}

export async function loadChoiceEngine(hangoutId: string, game: 'know_me' | 'this_or_that'): Promise<Result<ChoiceSnapshot>> {
  try {
    const { data, error } = await choiceSnapshot(await getSupabaseServerClient(), hangoutId, game);
    return error || !data ? { ok: false, error: flowError(error) } : { ok: true, data };
  } catch { return { ok: false, error: 'connection_failed' }; }
}

export async function startChoiceEngine(hangoutId: string, game: 'know_me' | 'this_or_that'): Promise<Result<ChoiceSnapshot>> {
  try {
    const client = await getSupabaseServerClient();
    const response = game === 'know_me' ? await client.rpc('start_know_me', { p_hangout_id: hangoutId }) : await client.rpc('start_this_or_that', { p_hangout_id: hangoutId });
    if (response.error) return { ok: false, error: flowError(response.error) };
    const { data, error } = await choiceSnapshot(client, hangoutId, game);
    return error || !data ? { ok: false, error: flowError(error) } : { ok: true, data };
  } catch { return { ok: false, error: 'connection_failed' }; }
}

export async function submitChoiceAnswer(hangoutId: string, roundId: string, answerKey: 'a' | 'b', game: 'know_me' | 'this_or_that'): Promise<Result<ChoiceSnapshot>> {
  try {
    const client = await getSupabaseServerClient();
    const response = game === 'know_me'
      ? await client.rpc('submit_know_me_answer', { p_hangout_id: hangoutId, p_round_id: roundId, p_answer_key: answerKey })
      : await client.rpc('submit_this_or_that_vote', { p_hangout_id: hangoutId, p_round_id: roundId, p_answer_key: answerKey });
    if (response.error) return { ok: false, error: flowError(response.error) };
    const { data, error } = await choiceSnapshot(client, hangoutId, game);
    return error || !data ? { ok: false, error: flowError(error) } : { ok: true, data };
  } catch { return { ok: false, error: 'connection_failed' }; }
}

export async function advanceChoiceEngine(hangoutId: string, game: 'know_me' | 'this_or_that'): Promise<Result<ChoiceSnapshot>> {
  try {
    const client = await getSupabaseServerClient();
    const response = game === 'know_me' ? await client.rpc('advance_know_me_round', { p_hangout_id: hangoutId }) : await client.rpc('advance_this_or_that_round', { p_hangout_id: hangoutId });
    if (response.error) return { ok: false, error: flowError(response.error) };
    revalidatePath('/thing/[thingId]', 'page');
    const { data, error } = await choiceSnapshot(client, hangoutId, game);
    return error || !data ? { ok: false, error: flowError(error) } : { ok: true, data };
  } catch { return { ok: false, error: 'connection_failed' }; }
}

export async function loadHot(hangoutId: string): Promise<Result<HotSnapshot>> {
  try {
    const { data, error } = await (await getSupabaseServerClient()).rpc('hot_snapshot', { p_hangout_id: hangoutId });
    return error || !data ? { ok: false, error: flowError(error) } : { ok: true, data };
  } catch { return { ok: false, error: 'connection_failed' }; }
}

async function hotMutation(hangoutId: string, mutate: (client: Awaited<ReturnType<typeof getSupabaseServerClient>>) => PromiseLike<{ error: unknown }>): Promise<Result<HotSnapshot>> {
  try {
    const client = await getSupabaseServerClient();
    const response = await mutate(client);
    if (response.error) return { ok: false, error: flowError(response.error) };
    revalidatePath('/thing/[thingId]', 'page');
    const { data, error } = await client.rpc('hot_snapshot', { p_hangout_id: hangoutId });
    return error || !data ? { ok: false, error: flowError(error) } : { ok: true, data };
  } catch { return { ok: false, error: 'connection_failed' }; }
}

export async function startHot(hangoutId: string) { return hotMutation(hangoutId, (client) => client.rpc('start_hot', { p_hangout_id: hangoutId })); }
export async function submitHotRound(hangoutId: string, roundId: string, answerKey: 'a' | 'b') { return hotMutation(hangoutId, (client) => client.rpc('submit_hot_round', { p_hangout_id: hangoutId, p_round_id: roundId, p_answer_key: answerKey })); }
export async function advanceHot(hangoutId: string) { return hotMutation(hangoutId, (client) => client.rpc('advance_hot', { p_hangout_id: hangoutId })); }
export async function skipHotPrompt(hangoutId: string, roundId: string) { return hotMutation(hangoutId, (client) => client.rpc('skip_hot_prompt', { p_hangout_id: hangoutId, p_round_id: roundId })); }
export async function submitHotEscalation(hangoutId: string, accept: boolean) { return hotMutation(hangoutId, (client) => client.rpc('submit_hot_escalation', { p_hangout_id: hangoutId, p_accept: accept })); }
export async function completeHot(hangoutId: string) { return hotMutation(hangoutId, (client) => client.rpc('complete_hot', { p_hangout_id: hangoutId })); }
