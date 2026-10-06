import { createClient } from '@supabase/supabase-js';
// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { reverseGeocodePhotoCity } from '../src/features/photos/geocode.ts';

const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!secret) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');

const client=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const {data,error}=await client.from('thing_photos').select('id,latitude,longitude').is('location_city',null).not('latitude','is',null).not('longitude','is',null).order('uploaded_at',{ascending:true});
if(error) throw new Error(`Could not read photo coordinates (${error.code}). Apply migration 015 first.`);

let updated=0,unresolved=0;
for(const photo of data??[]) {
  if(typeof photo.latitude!=='number'||typeof photo.longitude!=='number') continue;
  const city=await reverseGeocodePhotoCity(photo.latitude,photo.longitude);
  if(!city){unresolved++;continue;}
  const {error:updateError}=await client.from('thing_photos').update({location_city:city}).eq('id',photo.id).is('location_city',null);
  if(updateError) throw new Error(`Could not update photo ${photo.id} (${updateError.code}).`);
  updated++;
}

console.log(JSON.stringify({scanned:data?.length??0,updated,unresolved}));
