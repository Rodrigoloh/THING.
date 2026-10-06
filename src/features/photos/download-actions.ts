'use server';

import { getSupabaseServerClient } from '@/lib/supabase/server';
import { issueThingPhotoDownload } from './download';
import type { ThingPhotoDownloadResult } from './model';

export async function createThingPhotoDownload(thingId:string,photoId:string): Promise<ThingPhotoDownloadResult> {
  return issueThingPhotoDownload(await getSupabaseServerClient(),thingId,photoId);
}
