import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { safeThingPhotoFilename, thingPhotoBucket, type ThingPhotoDownloadResult } from './model';

const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const downloadLifetimeSeconds=120;

export async function issueThingPhotoDownload(client:SupabaseClient<Database>,thingId:string,photoId:string): Promise<ThingPhotoDownloadResult> {
  if(!uuidPattern.test(thingId)||!uuidPattern.test(photoId)) return {ok:false,error:'download_unavailable'};
  try {
    const {data:{user},error:authError}=await client.auth.getUser();
    if(authError||!user) return {ok:false,error:'download_unavailable'};
    const {data:membership,error:membershipError}=await client.from('thing_members').select('user_id').eq('thing_id',thingId).eq('user_id',user.id).eq('status','active').maybeSingle();
    if(membershipError||!membership) return {ok:false,error:'download_unavailable'};
    const {data:photo,error:photoError}=await client.from('thing_photos').select('id,thing_id,storage_path,original_filename,mime_type').eq('id',photoId).eq('thing_id',thingId).maybeSingle();
    if(photoError||!photo||photo.thing_id!==thingId) return {ok:false,error:'download_unavailable'};
    const expected=new RegExp(`^${thingId}/${photoId}/original\\.(jpg|jpeg|png|webp)$`,'i');
    if(!expected.test(photo.storage_path)) return {ok:false,error:'download_unavailable'};
    const filename=safeThingPhotoFilename(photo.original_filename,photo.id,photo.mime_type);
    const {data,error}=await client.storage.from(thingPhotoBucket).createSignedUrl(photo.storage_path,downloadLifetimeSeconds,{download:filename});
    if(error||!data?.signedUrl) return {ok:false,error:'download_unavailable'};
    return {ok:true,url:data.signedUrl,filename,expiresAt:new Date(Date.now()+downloadLifetimeSeconds*1000).toISOString()};
  } catch { return {ok:false,error:'download_unavailable'}; }
}
