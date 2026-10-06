import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { galleryViewerIndex, groupThingGalleryPhotos, orderThingGalleryPhotos, selectThingGalleryPhotos, thingPhotoDisplayDate, thingPhotoViewerMetadata, toggleGallerySelection }=await import('../src/features/photos/model.ts');

function photo(id,thingId,takenAt,uploadedAt) {
  return {id,thing_id:thingId,uploaded_by:'member-a',storage_path:`${thingId}/${id}/original.jpg`,original_filename:`${id}.jpg`,mime_type:'image/jpeg',width:100,height:100,file_size_bytes:1000,content_hash:id,uploaded_at:uploadedAt,taken_at:takenAt,orientation:null,exif_available:Boolean(takenAt),created_at:uploadedAt,image_url:`https://example.test/${id}?token=private`,location_saved:false};
}

test('gallery keeps only the current Thing collection',()=>{
  const own=photo('a','thing-1',null,'2026-10-02T00:00:00Z');
  const leak=photo('b','thing-2',null,'2026-10-03T00:00:00Z');
  assert.deepEqual(selectThingGalleryPhotos([leak,own],'thing-1').map((item)=>item.id),['a']);
});

test('gallery orders by capture time and falls back to upload time',()=>{
  const olderCapture=photo('capture','thing-1','2026-09-12T12:00:00Z','2026-10-30T00:00:00Z');
  const newerCapture=photo('newer','thing-1','2026-10-20T12:00:00Z','2026-10-01T00:00:00Z');
  const uploadFallback=photo('fallback','thing-1',null,'2026-10-25T12:00:00Z');
  assert.equal(thingPhotoDisplayDate(uploadFallback),uploadFallback.uploaded_at);
  assert.deepEqual(orderThingGalleryPhotos([olderCapture,newerCapture,uploadFallback]).map((item)=>item.id),['fallback','newer','capture']);
});

test('gallery groups by the effective photo month',()=>{
  const groups=groupThingGalleryPhotos([
    photo('oct-capture','thing-1','2026-10-04T00:00:00Z','2026-11-01T00:00:00Z'),
    photo('oct-upload','thing-1',null,'2026-10-02T00:00:00Z'),
    photo('sep','thing-1','2026-09-30T23:00:00Z','2026-10-03T00:00:00Z'),
  ]);
  assert.deepEqual(groups.map((group)=>[group.key,group.photos.map((item)=>item.id)]),[
    ['2026-10',['oct-capture','oct-upload']],['2026-09',['sep']],
  ]);
  assert.equal(groups[0].label,'OCTOBER 2026');
});

test('selection toggles photo IDs without mixing gallery data',()=>{
  let selected=new Set();
  selected=toggleGallerySelection(selected,'photo-a'); selected=toggleGallerySelection(selected,'photo-b');
  assert.deepEqual([...selected],['photo-a','photo-b']);
  selected=toggleGallerySelection(selected,'photo-a');
  assert.deepEqual([...selected],['photo-b']);
});

test('viewer previous and next stay inside gallery order',()=>{
  assert.equal(galleryViewerIndex(1,3,-1),0);
  assert.equal(galleryViewerIndex(1,3,1),2);
  assert.equal(galleryViewerIndex(0,3,-1),0);
  assert.equal(galleryViewerIndex(2,3,1),2);
});

test('viewer prefers taken_at and falls back explicitly to uploaded_at',()=>{
  const captured={...photo('taken','thing-1','2026-09-14T20:42:00Z','2026-10-05T10:00:00Z'),location_saved:true};
  assert.deepEqual(thingPhotoViewerMetadata(captured,'Mariana'),{uploader:'Mariana',date:'Sep 14, 2026 · 8:42 PM',dateKind:'taken',locationSaved:true});
  const uploaded=thingPhotoViewerMetadata(photo('uploaded','thing-1',null,'2026-10-05T10:00:00Z'),'Alex');
  assert.equal(uploaded.uploader,'Alex');
  assert.equal(uploaded.date,'uploaded Oct 5, 2026');
  assert.equal(uploaded.dateKind,'uploaded');
});

test('viewer input cannot navigate into another Thing',()=>{
  const allowed=selectThingGalleryPhotos([photo('one','thing-1',null,'2026-10-05T00:00:00Z'),photo('leak','thing-2',null,'2026-10-06T00:00:00Z')],'thing-1');
  assert.deepEqual(allowed.map((item)=>item.id),['one']);
  assert.equal(galleryViewerIndex(0,allowed.length,1),0);
});

test('successful batch completion refreshes the server-loaded gallery',async()=>{
  const [batch,page]=await Promise.all([readFile('src/features/photos/batch-upload.tsx','utf8'),readFile('src/app/thing/[thingId]/moments/page.tsx','utf8')]);
  assert.match(batch,/router\.refresh\(\)/);
  assert.match(page,/loadThingGallery\(thingId\)/);
});
