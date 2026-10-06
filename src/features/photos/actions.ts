'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { thingPhotoBucket, thingPhotoExtension, validateThingPhotoUploadRequest, type ThingPhotoUploadRequest, type ThingPhotoUploadTicket } from './model';
import { reverseGeocodePhotoCity } from './geocode';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function prepareThingPhotoUpload(thingId: string, request: ThingPhotoUploadRequest): Promise<ThingPhotoUploadTicket> {
  if (!uuidPattern.test(thingId) || !validateThingPhotoUploadRequest(request)) return { ok: false, error: 'invalid_file' };
  try {
    const extension = thingPhotoExtension(request.mimeType);
    if (!extension) return { ok: false, error: 'invalid_file' };
    const originalFilename=request.originalFilename.trim();
    const metadata=request.metadata;

    const client = await getSupabaseServerClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return { ok: false, error: 'not_member' };
    const locationCity = metadata.latitude !== null && metadata.longitude !== null
      ? await reverseGeocodePhotoCity(metadata.latitude, metadata.longitude)
      : null;
    const photoId = randomUUID();
    const storagePath = `${thingId}/${photoId}/original.${extension}`;
    const photoRow = {
      id: photoId, thing_id: thingId, uploaded_by: user.id, storage_path: storagePath,
      original_filename: originalFilename, mime_type: request.mimeType, file_size_bytes: request.fileSizeBytes,
      content_hash: request.contentHash, width:metadata.width, height:metadata.height,
      taken_at:metadata.takenAt, latitude:metadata.latitude, longitude:metadata.longitude,
      location_city:locationCity, orientation:metadata.orientation, exif_available:metadata.exifAvailable,
    };
    let { error: rowError } = await client.from('thing_photos').insert(photoRow);
    if (rowError?.code === 'PGRST204' && /location_city/i.test(rowError.message)) {
      const { location_city: ignoredLocationCity, ...legacyRow } = photoRow;
      void ignoredLocationCity;
      ({ error: rowError } = await client.from('thing_photos').insert(legacyRow));
    }
    if (rowError) {
      if (rowError.code === '23505' && (rowError.message.includes('content_hash') || rowError.message.includes('thing_photos_thing_content_hash_unique'))) return { ok: false, error: 'duplicate' };
      if (rowError.code === '42501') return { ok: false, error: 'not_member' };
      if (rowError.code === 'PGRST205' || rowError.code === 'PGRST204' || rowError.code === '42P01' || /thing_photos|orientation/i.test(rowError.message)) {
        console.error('Thing photo schema is unavailable', { code: rowError.code });
        return { ok: false, error: 'setup_required' };
      }
      console.error('Thing photo row insert failed', { code: rowError.code });
      return { ok: false, error: 'upload_failed' };
    }
    const { data: signedUpload, error: signedUploadError } = await client.storage.from(thingPhotoBucket).createSignedUploadUrl(storagePath, { upsert: false });
    if (signedUploadError || !signedUpload?.token) {
      await client.from('thing_photos').delete().eq('id',photoId);
      console.error('Thing photo signed upload creation failed', { name: signedUploadError?.name });
      return { ok: false, error: 'upload_failed' };
    }
    return { ok: true, photoId, storagePath, token: signedUpload.token };
  } catch { return { ok: false, error: 'connection_failed' }; }
}

export async function cancelThingPhotoUpload(thingId: string, photoId: string): Promise<void> {
  if (!uuidPattern.test(thingId) || !uuidPattern.test(photoId)) return;
  try {
    const client=await getSupabaseServerClient();
    const {data:photo}=await client.from('thing_photos').select('id,storage_path,uploaded_by').eq('id',photoId).eq('thing_id',thingId).maybeSingle();
    const {data:{user}}=await client.auth.getUser();
    if (!photo || !user || photo.uploaded_by!==user.id) return;
    await client.storage.from(thingPhotoBucket).remove([photo.storage_path]);
    await client.from('thing_photos').delete().eq('id',photoId).eq('thing_id',thingId);
  } catch { /* A retry can clean up or replace an interrupted reservation later. */ }
}

export async function completeThingPhotoUpload(thingId: string): Promise<void> {
  if (!uuidPattern.test(thingId)) return;
  revalidatePath(`/thing/${thingId}/moments`);
  revalidatePath(`/thing/${thingId}`);
}
