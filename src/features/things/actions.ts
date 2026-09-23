'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { flowError, inviteCookie, inviteRpcResult, normalizeInvite, type Result, type ThingSnapshot, type InvitePreview, type Charm, type ThingColor } from './model';

export async function loadThings(): Promise<Result<ThingSnapshot[]>> {
  try {
    const client = await getSupabaseServerClient();
    const { data, error } = await client.rpc('list_my_things');
    return error ? { ok: false, error: flowError(error) } : { ok: true, data: data ?? [] };
  } catch { return { ok: false, error: 'connection_failed' }; }
}
export async function loadThing(id: string): Promise<Result<ThingSnapshot>> {
  try {
    const { data, error } = await (await getSupabaseServerClient()).rpc('thing_snapshot', { p_thing_id: id });
    return error || !data ? { ok: false, error: error ? flowError(error) : 'thing_unavailable' } : { ok: true, data };
  } catch { return { ok: false, error: 'connection_failed' }; }
}
export async function startThing(requestId: string): Promise<Result<string>> {
  try {
    const { data, error } = await (await getSupabaseServerClient()).rpc('create_thing', { p_request_id: requestId });
    if (error || !data) return { ok: false, error: flowError(error) };
    revalidatePath('/things');
    return { ok: true, data };
  } catch { return { ok: false, error: 'connection_failed' }; }
}
export async function previewInvite(input: string): Promise<Result<InvitePreview>> {
  const code = normalizeInvite(input);
  if (!code) return { ok: false, error: 'invite_unavailable' };
  try {
    const { data, error } = await (await getSupabaseServerClient()).rpc('preview_thing_invite_v2', { p_code: code });
    return error ? { ok: false, error: flowError(error) } : inviteRpcResult<InvitePreview>(data);
  } catch { return { ok: false, error: 'connection_failed' }; }
}
export async function forgetInvite() {
  (await cookies()).delete(inviteCookie);
}
export async function acceptInvite(input: string): Promise<Result<string>> {
  const code = normalizeInvite(input);
  if (!code) return { ok: false, error: 'invite_unavailable' };
  try {
    const { data, error } = await (await getSupabaseServerClient()).rpc('accept_thing_invite_v2', { p_code: code });
    const result = error ? { ok: false as const, error: flowError(error) } : inviteRpcResult<string>(data);
    if (!result.ok) return result;
    await forgetInvite();
    revalidatePath('/things');
    return result;
  } catch { return { ok: false, error: 'connection_failed' }; }
}
export async function proposeCharm(id: string, version: number, charm: Charm): Promise<Result<number>> {
  try {
    const { data, error } = await (await getSupabaseServerClient()).rpc('propose_thing_charm', { p_thing_id: id, p_expected_version: version, p_charm: charm });
    if (error || typeof data !== 'number') return { ok: false, error: flowError(error) };
    revalidatePath(`/thing/${id}`);
    return { ok: true, data };
  } catch { return { ok: false, error: 'connection_failed' }; }
}

export async function acceptCharm(id: string, version: number): Promise<Result<null>> {
  try {
    const { error } = await (await getSupabaseServerClient()).rpc('accept_thing_charm', { p_thing_id: id, p_expected_version: version });
    if (error) return { ok: false, error: flowError(error) };
    revalidatePath('/things');
    revalidatePath(`/thing/${id}`);
    return { ok: true, data: null };
  } catch { return { ok: false, error: 'connection_failed' }; }
}
export async function manageInvite(id: string, action: 'renew' | 'cancel'): Promise<Result<null>> {
  try {
    const { error } = await (await getSupabaseServerClient()).rpc(action === 'renew' ? 'renew_thing_invite' : 'cancel_pending_thing', { p_thing_id: id });
    if (error) return { ok: false, error: flowError(error) };
    revalidatePath('/things');
    revalidatePath(`/thing/${id}`);
    return { ok: true, data: null };
  } catch { return { ok: false, error: 'connection_failed' }; }
}

export async function updateThingColor(id: string, color: ThingColor): Promise<Result<null>> {
  try {
    const { error } = await (await getSupabaseServerClient()).rpc('update_thing_color', { p_thing_id: id, p_color_key: color });
    if (error) return { ok: false, error: flowError(error) };
    revalidatePath('/things');
    revalidatePath(`/thing/${id}`);
    return { ok: true, data: null };
  } catch { return { ok: false, error: 'connection_failed' }; }
}

export async function endThing(id: string): Promise<Result<null>> {
  try {
    const { error } = await (await getSupabaseServerClient()).rpc('end_thing', { p_thing_id: id });
    if (error) return { ok: false, error: flowError(error) };
    revalidatePath('/things');
    revalidatePath(`/thing/${id}`);
    return { ok: true, data: null };
  } catch { return { ok: false, error: 'connection_failed' }; }
}
