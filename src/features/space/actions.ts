'use server';

import { getSupabaseServerClient } from '@/lib/supabase/server';
import { flowError, type Result } from '@/features/things/model';
import type { SpaceSnapshot } from './model';

export async function loadSpace(thingId: string): Promise<Result<SpaceSnapshot>> {
  try {
    const { data, error } = await (await getSupabaseServerClient()).rpc('space_snapshot', { p_thing_id: thingId });
    return error || !data ? { ok: false, error: flowError(error) } : { ok: true, data };
  } catch { return { ok: false, error: 'connection_failed' }; }
}
