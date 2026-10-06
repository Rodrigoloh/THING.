'use server';

import { createHash, randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { maxThingPhotoBytes, thingPhotoBucket, thingPhotoExtension, validateThingPhotoFile, type ThingPhotoUploadResult } from './model';
import { extractThingPhotoMetadata } from './metadata';
import { reverseGeocodePhotoCity } from './geocode';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function uploadThingPhoto(thingId: string, formData: FormData): Promise<ThingPhotoUploadResult> {
  const file = formData.get('photo');
  const claimedHash = formData.get('contentHash');
  if (!uuidPattern.test(thingId) || !(file instanceof File) || file.size > maxThingPhotoBytes || await validateThingPhotoFile(file)) return { ok: false, error: 'invalid_file' };
  try {
    const header = new Uint8Array(await file.slice(0,12).arrayBuffer());
    const extension = thingPhotoExtension(file.type);
    const validSignature = file.type === 'image/jpeg' ? header[0]===0xff&&header[1]===0xd8&&header[2]===0xff
      : file.type === 'image/png' ? [137,80,78,71,13,10,26,10].every((value,index)=>header[index]===value)
      : file.type === 'image/webp' ? [82,73,70,70].every((value,index)=>header[index]===value)&&[87,69,66,80].every((value,index)=>header[index+8]===value)
      : false;
    const originalFilename=file.name.trim();
    if (!extension || !validSignature || originalFilename.length > 255 || /[\u0000-\u001f\u007f]/.test(originalFilename)) return { ok: false, error: 'invalid_file' };
    const bytes = Buffer.from(await file.arrayBuffer());
    const contentHash = createHash('sha256').update(bytes).digest('hex');
    if (typeof claimedHash !== 'string' || claimedHash !== contentHash) return { ok: false, error: 'invalid_file' };
    const metadata=await extractThingPhotoMetadata(bytes,file.type);

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
      original_filename: originalFilename || null, mime_type: file.type, file_size_bytes: file.size,
      content_hash: contentHash, width:metadata.width, height:metadata.height,
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
    const { error: uploadError } = await client.storage.from(thingPhotoBucket).upload(storagePath, bytes, { contentType: file.type, upsert: false });
    if (uploadError) {
      await client.from('thing_photos').delete().eq('id',photoId);
      if (/size|limit|large|maximum|exceed/i.test(uploadError.message)) return { ok: false, error: 'storage_limit' };
      console.error('Thing photo storage upload failed', { name: uploadError.name });
      return { ok: false, error: 'upload_failed' };
    }
    revalidatePath(`/thing/${thingId}/moments`);
    revalidatePath(`/thing/${thingId}`);
    return { ok: true, photoId };
  } catch { return { ok: false, error: 'connection_failed' }; }
}
