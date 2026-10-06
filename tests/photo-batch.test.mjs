import test from 'node:test';
import assert from 'node:assert/strict';

const {
  maxThingPhotoBatch, maxThingPhotoBytes, prepareThingPhotoBatch,
  uploadPreparedThingPhotos, validateThingPhotoFile,
} = await import('../src/features/photos/model.ts');

function png(name, tail = 1) {
  return new File([Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,tail])],name,{type:'image/png'});
}

test('multiple valid photos prepare and upload as one isolated batch', async () => {
  const prepared=await prepareThingPhotoBatch([png('one.png',1),png('two.png',2),png('three.png',3)]);
  assert.equal(prepared.accepted.length,3); assert.equal(prepared.rejected.length,0);
  const progress=[];
  const results=await uploadPreparedThingPhotos(prepared.accepted,async(photo)=>({ok:true,photoId:photo.file.name}),
    (completed,total)=>progress.push([completed,total]));
  assert.equal(results.filter((result)=>result.ok).length,3);
  assert.deepEqual(progress,[[1,3],[2,3],[3,3]]);
});

test('one failed photo does not stop the rest of the batch', async () => {
  const prepared=(await prepareThingPhotoBatch([png('one.png',1),png('two.png',2),png('three.png',3)])).accepted;
  const called=[], settled=[];
  const results=await uploadPreparedThingPhotos(prepared,async(photo)=>{
    called.push(photo.file.name);
    if(photo.file.name==='two.png') throw new Error('connection dropped');
    return {ok:true,photoId:photo.file.name};
  },undefined,(photo,result)=>settled.push([photo.file.name,result.ok?'uploaded':result.error]));
  assert.deepEqual(called,['one.png','two.png','three.png']);
  assert.equal(results.filter((result)=>result.ok).length,2);
  assert.equal(results.filter((result)=>!result.ok).length,1);
  assert.deepEqual(settled,[['one.png','uploaded'],['two.png','connection_failed'],['three.png','uploaded']]);
});

test('invalid MIME, over 20 MiB and over 50 files are rejected before upload', async () => {
  assert.equal(validateThingPhotoFile({size:100,type:'image/gif'}),'invalid_type');
  assert.equal(validateThingPhotoFile({size:maxThingPhotoBytes+1,type:'image/jpeg'}),'too_large');
  const tooMany=await prepareThingPhotoBatch(Array.from({length:maxThingPhotoBatch+1},(_,index)=>png(`${index}.png`,index%255)));
  assert.equal(tooMany.accepted.length,0);
  assert.equal(tooMany.rejected.length,maxThingPhotoBatch+1);
  assert.ok(tooMany.rejected.every((item)=>item.error==='too_many_files'));
});

test('the same file selected twice is hashed once and skipped as a duplicate', async () => {
  const one=png('one.png',7), copy=png('copy.png',7);
  const prepared=await prepareThingPhotoBatch([one,copy]);
  assert.equal(prepared.accepted.length,1);
  assert.equal(prepared.rejected.length,1);
  assert.equal(prepared.rejected[0].error,'duplicate_selection');
});
