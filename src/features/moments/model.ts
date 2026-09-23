import { hasImageSignature } from '@/features/profile/avatar';

export const momentBucket = 'thing-moments';
export const maxMomentBytes = 5 * 1024 * 1024;
export type Moment = { id: string; thing_id: string; author_id: string; storage_path: string; caption: string | null; created_at: string; image_url: string };

export async function validateMomentFile(file: File): Promise<'invalid_type' | 'too_large' | 'invalid_data' | null> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'invalid_type';
  if (!file.size || file.size > maxMomentBytes) return file.size ? 'too_large' : 'invalid_data';
  try { return hasImageSignature(new Uint8Array(await file.slice(0, 12).arrayBuffer()), file.type) ? null : 'invalid_data'; }
  catch { return 'invalid_data'; }
}
