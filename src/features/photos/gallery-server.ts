import { getSupabaseServerClient } from '@/lib/supabase/server';
import { flowError, type Result } from '@/features/things/model';
import { selectThingGalleryPhotos, thingPhotoBucket, type ThingGalleryPhoto, type ThingPhoto } from './model';

const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const galleryPageSize=1000;
const signedUrlBatchSize=100;
type GalleryRow=ThingPhoto;
const galleryFields='id,thing_id,uploaded_by,storage_path,original_filename,mime_type,width,height,file_size_bytes,content_hash,uploaded_at,taken_at,latitude,longitude,location_city,orientation,exif_available,created_at';
const legacyGalleryFields='id,thing_id,uploaded_by,storage_path,original_filename,mime_type,width,height,file_size_bytes,content_hash,uploaded_at,taken_at,latitude,longitude,orientation,exif_available,created_at';

export async function loadThingGallery(thingId:string): Promise<Result<ThingGalleryPhoto[]>> {
  if (!uuidPattern.test(thingId)) return {ok:false,error:'thing_unavailable'};
  try {
    const client=await getSupabaseServerClient();
    const rows:GalleryRow[]=[];
    for(let from=0;;from+=galleryPageSize) {
      const primary=await client.from('thing_photos')
        .select(galleryFields).eq('thing_id',thingId).order('uploaded_at',{ascending:false}).order('id',{ascending:true}).range(from,from+galleryPageSize-1);
      let page:GalleryRow[];
      if (primary.error?.code==='PGRST204'&&/location_city/i.test(primary.error.message)) {
        const legacy=await client.from('thing_photos')
          .select(legacyGalleryFields).eq('thing_id',thingId).order('uploaded_at',{ascending:false}).order('id',{ascending:true}).range(from,from+galleryPageSize-1);
        if(legacy.error) return {ok:false,error:flowError(legacy.error)};
        page=(legacy.data??[]).map((row)=>({...row,location_city:null})) as GalleryRow[];
      } else {
        if(primary.error) return {ok:false,error:flowError(primary.error)};
        page=(primary.data??[]) as GalleryRow[];
      }
      rows.push(...page);
      if(page.length<galleryPageSize) break;
    }
    const signedUrls=new Map<string,string>();
    for(let index=0;index<rows.length;index+=signedUrlBatchSize) {
      const batch=rows.slice(index,index+signedUrlBatchSize);
      const {data,error}=await client.storage.from(thingPhotoBucket).createSignedUrls(batch.map((photo)=>photo.storage_path),3600);
      if(error) return {ok:false,error:'connection_failed'};
      batch.forEach((photo,batchIndex)=>signedUrls.set(photo.id,data?.[batchIndex]?.signedUrl??''));
    }
    return {ok:true,data:selectThingGalleryPhotos(rows.map(({latitude,longitude,...photo})=>({...photo,image_url:signedUrls.get(photo.id)??'',location_saved:latitude!==null&&longitude!==null})),thingId)};
  } catch { return {ok:false,error:'connection_failed'}; }
}
