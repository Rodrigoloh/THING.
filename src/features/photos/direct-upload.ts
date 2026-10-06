import type { ThingPhotoUploadError } from './model';

type SignedUploadStorage = {
  uploadToSignedUrl: (path:string,token:string,file:File,options:{contentType:string;upsert:false}) => Promise<{error:{message:string}|null}>;
  exists: (path:string) => Promise<{data:boolean|null}>;
};

export type DirectThingPhotoUploadResult = {ok:true}|{ok:false;error:ThingPhotoUploadError};

export async function uploadThingPhotoDirect(
  storage: SignedUploadStorage,
  ticket: {storagePath:string;token:string},
  file: File,
): Promise<DirectThingPhotoUploadResult> {
  try {
    const {error}=await storage.uploadToSignedUrl(ticket.storagePath,ticket.token,file,{contentType:file.type,upsert:false});
    if (!error) return {ok:true};
    const {data:exists}=await storage.exists(ticket.storagePath);
    if (exists) return {ok:true};
    if (/size|limit|large|maximum|exceed/i.test(error.message)) return {ok:false,error:'storage_limit'};
    return {ok:false,error:'upload_failed'};
  } catch {
    try {
      const {data:exists}=await storage.exists(ticket.storagePath);
      if (exists) return {ok:true};
    } catch { /* The original connection error remains the useful result. */ }
    return {ok:false,error:'connection_failed'};
  }
}
