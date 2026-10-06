export const thingPhotoBucket = 'thing-moments';
export const maxThingPhotoBytes = 20 * 1024 * 1024;
export const maxThingPhotoBatch = 50;
export const thingPhotoMimeTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type ThingPhotoFileError = 'invalid_type' | 'too_large' | 'invalid_data' | 'too_many_files' | 'duplicate_selection';
export type PreparedThingPhoto = { file: File; contentHash: string };
export type RejectedThingPhoto = { file: File; error: ThingPhotoFileError };
export type ThingPhotoUploadError = 'duplicate' | 'invalid_file' | 'not_member' | 'setup_required' | 'storage_limit' | 'upload_failed' | 'connection_failed';
export type ThingPhotoUploadResult = { ok: true; photoId: string } | { ok: false; error: ThingPhotoUploadError };
export type ThingPhotoDownloadResult = { ok: true; url: string; filename: string; expiresAt: string } | { ok: false; error: 'download_unavailable' };

export type ThingPhoto = {
  id: string;
  thing_id: string;
  uploaded_by: string;
  storage_path: string;
  original_filename: string | null;
  mime_type: string;
  width: number | null;
  height: number | null;
  file_size_bytes: number | null;
  content_hash: string | null;
  uploaded_at: string;
  taken_at: string | null;
  latitude: number | null;
  longitude: number | null;
  orientation: number | null;
  exif_available: boolean;
  created_at: string;
};

export type ThingGalleryPhoto = Omit<ThingPhoto,'latitude'|'longitude'> & { image_url: string; location_saved: boolean };
export type ThingGalleryGroup = { key: string; label: string; photos: ThingGalleryPhoto[] };
export type ThingPhotoViewerMetadata = { uploader: string; date: string; dateKind: 'taken'|'uploaded'; locationSaved: boolean };

export function thingPhotoDisplayDate(photo: Pick<ThingPhoto, 'taken_at' | 'uploaded_at'>): string {
  return photo.taken_at ?? photo.uploaded_at;
}

export function orderThingGalleryPhotos(photos: ThingGalleryPhoto[]): ThingGalleryPhoto[] {
  return [...photos].sort((left,right)=>{
    const byDisplayDate=new Date(thingPhotoDisplayDate(right)).getTime()-new Date(thingPhotoDisplayDate(left)).getTime();
    if (byDisplayDate) return byDisplayDate;
    const byUpload=new Date(right.uploaded_at).getTime()-new Date(left.uploaded_at).getTime();
    return byUpload || left.id.localeCompare(right.id);
  });
}

export function selectThingGalleryPhotos(photos: ThingGalleryPhoto[], thingId:string): ThingGalleryPhoto[] {
  return orderThingGalleryPhotos(photos.filter((photo)=>photo.thing_id===thingId));
}

export function groupThingGalleryPhotos(photos: ThingGalleryPhoto[], locale='en-US'): ThingGalleryGroup[] {
  const formatter=new Intl.DateTimeFormat(locale,{month:'long',year:'numeric',timeZone:'UTC'});
  const groups=new Map<string,ThingGalleryGroup>();
  for (const photo of orderThingGalleryPhotos(photos)) {
    const date=new Date(thingPhotoDisplayDate(photo));
    const key=`${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`;
    const group=groups.get(key)??{key,label:formatter.format(date).toUpperCase(),photos:[]};
    group.photos.push(photo); groups.set(key,group);
  }
  return [...groups.values()];
}

export function toggleGallerySelection(selected: ReadonlySet<string>, photoId: string): Set<string> {
  const next=new Set(selected);
  if (next.has(photoId)) next.delete(photoId); else next.add(photoId);
  return next;
}

export function galleryViewerIndex(current:number,length:number,direction:-1|1): number {
  if(length<=0) return -1;
  return Math.max(0,Math.min(length-1,current+direction));
}

export function thingPhotoViewerMetadata(photo:ThingGalleryPhoto,uploader:string,locale='en-US'): ThingPhotoViewerMetadata {
  const value=photo.taken_at??photo.uploaded_at;
  const date=new Date(value);
  const day=new Intl.DateTimeFormat(locale,{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(date);
  const time=new Intl.DateTimeFormat(locale,{hour:'numeric',minute:'2-digit',timeZone:'UTC'}).format(date);
  return {uploader,date:photo.taken_at?`${day} · ${time}`:`uploaded ${day}`,dateKind:photo.taken_at?'taken':'uploaded',locationSaved:photo.location_saved};
}

export function validateThingPhotoFile(file: Pick<File, 'size' | 'type'>): ThingPhotoFileError | null {
  if (!thingPhotoMimeTypes.includes(file.type as (typeof thingPhotoMimeTypes)[number])) return 'invalid_type';
  if (!file.size) return 'invalid_data';
  if (file.size > maxThingPhotoBytes) return 'too_large';
  return null;
}

function hasThingPhotoSignature(bytes: Uint8Array, type: string): boolean {
  if (type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === 'image/png') return [137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value);
  if (type === 'image/webp') return [82,73,70,70].every((value,index)=>bytes[index]===value) && [87,69,66,80].every((value,index)=>bytes[index+8]===value);
  return false;
}

export async function hashThingPhoto(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function prepareThingPhotoBatch(files: File[]): Promise<{ accepted: PreparedThingPhoto[]; rejected: RejectedThingPhoto[] }> {
  if (files.length > maxThingPhotoBatch) return { accepted: [], rejected: files.map((file)=>({ file, error: 'too_many_files' })) };
  const accepted: PreparedThingPhoto[] = [];
  const rejected: RejectedThingPhoto[] = [];
  const hashes = new Set<string>();
  for (const file of files) {
    const initial = validateThingPhotoFile(file);
    if (initial) { rejected.push({ file, error: initial }); continue; }
    try {
      const header = new Uint8Array(await file.slice(0,12).arrayBuffer());
      if (!hasThingPhotoSignature(header,file.type)) { rejected.push({ file, error: 'invalid_data' }); continue; }
      const contentHash = await hashThingPhoto(file);
      if (hashes.has(contentHash)) { rejected.push({ file, error: 'duplicate_selection' }); continue; }
      hashes.add(contentHash);
      accepted.push({ file, contentHash });
    } catch { rejected.push({ file, error: 'invalid_data' }); }
  }
  return { accepted, rejected };
}

export async function uploadPreparedThingPhotos(
  photos: PreparedThingPhoto[],
  upload: (photo: PreparedThingPhoto) => Promise<ThingPhotoUploadResult>,
  onProgress?: (completed: number, total: number) => void,
  onResult?: (photo: PreparedThingPhoto, result: ThingPhotoUploadResult) => void,
): Promise<ThingPhotoUploadResult[]> {
  const results: ThingPhotoUploadResult[] = [];
  for (const photo of photos) {
    let result: ThingPhotoUploadResult;
    try { result = await upload(photo); }
    catch { result = { ok: false, error: 'connection_failed' }; }
    results.push(result);
    onResult?.(photo, result);
    onProgress?.(results.length, photos.length);
  }
  return results;
}

export function thingPhotoExtension(mimeType: string): 'jpg' | 'png' | 'webp' | null {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return null;
}

export function safeThingPhotoFilename(originalFilename:string|null,photoId:string,mimeType:string): string {
  const extension=thingPhotoExtension(mimeType)??'jpg';
  const fallback=`thing-photo-${photoId}.${extension}`;
  if(!originalFilename) return fallback;
  const cleaned=originalFilename.normalize('NFKC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g,'-').replace(/\s+/g,' ').replace(/^[ .]+|[ .]+$/g,'');
  if(!cleaned) return fallback;
  const base=cleaned.replace(/\.[^.]*$/,'').toUpperCase();
  if(/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(base)) return `thing-${cleaned}`;
  return cleaned.length<=180?cleaned:`${cleaned.slice(0,160)}.${extension}`;
}

export function formatPhotoBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}
