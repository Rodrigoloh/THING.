import test from 'node:test';
import assert from 'node:assert/strict';

const { issueThingPhotoDownload }=await import('../src/features/photos/download.ts');
const { safeThingPhotoFilename }=await import('../src/features/photos/model.ts');

const thingId='11111111-1111-4111-8111-111111111111';
const photoId='22222222-2222-4222-8222-222222222222';

function downloadClient({userId='member-a',members=['member-a','member-b'],originalFilename='IMG 0001.JPG',mimeType='image/jpeg'}={}) {
  const signed=[];
  let generation=0;
  const photo={id:photoId,thing_id:thingId,storage_path:`${thingId}/${photoId}/original.jpg`,original_filename:originalFilename,mime_type:mimeType};
  const client={
    auth:{getUser:async()=>({data:{user:{id:userId}},error:null})},
    from(table) {
      const filters={};
      return {select(){return this},eq(key,value){filters[key]=value;return this},async maybeSingle(){
        if(table==='thing_members') return {data:members.includes(userId)&&filters.thing_id===thingId&&filters.user_id===userId&&filters.status==='active'?{user_id:userId}:null,error:null};
        if(table==='thing_photos') return {data:filters.id===photoId&&filters.thing_id===thingId?photo:null,error:null};
        throw new Error(`unexpected table ${table}`);
      }};
    },
    storage:{from(bucket){return {async createSignedUrl(path,expiresIn,options){generation++;signed.push({bucket,path,expiresIn,options});return {data:{signedUrl:`https://storage.test/private-${generation}`},error:null};}}}},
  };
  return {client,signed};
}

test('uploader and the other Thing member can request the original download',async()=>{
  for(const userId of ['member-a','member-b']) {
    const {client,signed}=downloadClient({userId});
    const result=await issueThingPhotoDownload(client,thingId,photoId);
    assert.equal(result.ok,true); assert.equal(result.filename,'IMG 0001.JPG');
    assert.equal(signed[0].bucket,'thing-moments');
    assert.equal(signed[0].path,`${thingId}/${photoId}/original.jpg`);
    assert.equal(signed[0].options.download,'IMG 0001.JPG');
  }
});

test('outsider cannot generate a download URL',async()=>{
  const {client,signed}=downloadClient({userId:'outsider'});
  assert.deepEqual(await issueThingPhotoDownload(client,thingId,photoId),{ok:false,error:'download_unavailable'});
  assert.equal(signed.length,0);
});

test('download filenames preserve safe originals, sanitize unsafe names and fall back by MIME',()=>{
  assert.equal(safeThingPhotoFilename('summer photo.JPG',photoId,'image/jpeg'),'summer photo.JPG');
  assert.equal(safeThingPhotoFilename('../trip:one?.jpg',photoId,'image/jpeg'),'-trip-one-.jpg');
  assert.equal(safeThingPhotoFilename(null,photoId,'image/png'),`thing-photo-${photoId}.png`);
});

test('an expired URL is regenerated through a new authorized request',async()=>{
  const {client,signed}=downloadClient();
  const first=await issueThingPhotoDownload(client,thingId,photoId);
  const second=await issueThingPhotoDownload(client,thingId,photoId);
  assert.equal(first.ok&&first.url,'https://storage.test/private-1');
  assert.equal(second.ok&&second.url,'https://storage.test/private-2');
  assert.equal(signed.length,2);
  assert.ok(signed.every((request)=>request.expiresIn===120));
});
