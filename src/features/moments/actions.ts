'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { flowError, type Result } from '@/features/things/model';
import { momentBucket, validateMomentFile, type Moment } from './model';
import { recentThingItems } from '@/features/space/preview';

async function loadMomentSelection(thingId: string, limit: number): Promise<Result<Moment[]>> {
  try {
    const client = await getSupabaseServerClient();
    const { data, error } = await client.from('moments').select('*').eq('thing_id', thingId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit);
    if (error) return { ok: false, error: flowError(error) };
    const selected = recentThingItems(data ?? [], thingId, limit);
    const paths = selected.map((moment) => moment.storage_path);
    const { data: signed, error: signedError } = paths.length ? await client.storage.from(momentBucket).createSignedUrls(paths, 3600) : { data: [], error: null };
    if (signedError) return { ok: false, error: 'connection_failed' };
    return { ok: true, data: selected.map((moment, index) => ({ ...moment, image_url: signed?.[index]?.signedUrl ?? '' })) };
  } catch { return { ok: false, error: 'connection_failed' }; }
}

export async function loadMoments(thingId: string): Promise<Result<Moment[]>> { return loadMomentSelection(thingId, 100); }
export async function loadMomentsPreview(thingId: string): Promise<Result<Moment[]>> { return loadMomentSelection(thingId, 4); }

export async function addMoment(thingId: string, formData: FormData): Promise<Result<null>> {
  const file = formData.get('image');
  const rawCaption = formData.get('caption');
  const caption = typeof rawCaption === 'string' ? rawCaption.trim() : '';
  if (!(file instanceof File) || await validateMomentFile(file) || caption.length > 140 || /[\u0000-\u001f\u007f]/.test(caption)) return { ok: false, error: 'invalid_moment' };
  try {
    const client = await getSupabaseServerClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return { ok: false, error: 'session_required' };
    const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${thingId}/${user.id}/${randomUUID()}.${extension}`;
    const { error: uploadError } = await client.storage.from(momentBucket).upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) return { ok: false, error: 'invalid_moment' };
    const { error } = await client.from('moments').insert({ thing_id: thingId, storage_path: path, caption: caption || null });
    if (error) { await client.storage.from(momentBucket).remove([path]); return { ok: false, error: flowError(error) }; }
    revalidatePath(`/thing/${thingId}/moments`);
    revalidatePath(`/thing/${thingId}`);
    return { ok: true, data: null };
  } catch { return { ok: false, error: 'connection_failed' }; }
}
