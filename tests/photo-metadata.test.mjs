import test from 'node:test';
import assert from 'node:assert/strict';

const { extractThingPhotoMetadata } = await import('../src/features/photos/metadata.ts');

function writeEntry(buffer,offset,tag,type,count,value,{short=false}={}) {
  buffer.writeUInt16LE(tag,offset); buffer.writeUInt16LE(type,offset+2); buffer.writeUInt32LE(count,offset+4);
  if(short) buffer.writeUInt16LE(value,offset+8); else buffer.writeUInt32LE(value,offset+8);
}

function jpegWithExif() {
  const tiff=Buffer.alloc(214);
  tiff.write('II',0,'ascii'); tiff.writeUInt16LE(42,2); tiff.writeUInt32LE(8,4);
  tiff.writeUInt16LE(3,8);
  writeEntry(tiff,10,0x0112,3,1,6,{short:true});
  writeEntry(tiff,22,0x8769,4,1,50);
  writeEntry(tiff,34,0x8825,4,1,92);
  tiff.writeUInt32LE(0,46);
  tiff.writeUInt16LE(3,50);
  writeEntry(tiff,52,0x9003,2,20,146);
  writeEntry(tiff,64,0xa002,4,1,1200);
  writeEntry(tiff,76,0xa003,4,1,900);
  tiff.writeUInt32LE(0,88);
  tiff.writeUInt16LE(4,92);
  writeEntry(tiff,94,0x0001,2,2,0); tiff[102]=78;
  writeEntry(tiff,106,0x0002,5,3,166);
  writeEntry(tiff,118,0x0003,2,2,0); tiff[126]=87;
  writeEntry(tiff,130,0x0004,5,3,190);
  tiff.writeUInt32LE(0,142);
  tiff.write('2024:06:15 14:30:00\0',146,'ascii');
  for(const [offset,values] of [[166,[19,1,25,1,30,1]],[190,[99,1,8,1,0,1]]]) values.forEach((value,index)=>tiff.writeUInt32LE(value,offset+index*4));
  const exif=Buffer.concat([Buffer.from('Exif\0\0','binary'),tiff]);
  const appLength=exif.length+2;
  const sof=Buffer.from([0xff,0xc0,0x00,0x11,0x08,0x03,0x84,0x04,0xb0,0x03,0x01,0x11,0x00,0x02,0x11,0x00,0x03,0x11,0x00]);
  return Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe1,appLength>>8,appLength&255]),exif,sof,Buffer.from([0xff,0xd9])]);
}

function jpegWithoutExif(width=640,height=480) {
  return Buffer.from([0xff,0xd8,0xff,0xc0,0x00,0x11,0x08,height>>8,height&255,width>>8,width&255,0x03,0x01,0x11,0x00,0x02,0x11,0x00,0x03,0x11,0x00,0xff,0xd9]);
}

function png(width=320,height=240) {
  const bytes=Buffer.alloc(24); Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes); bytes.writeUInt32BE(13,8); bytes.write('IHDR',12,'ascii'); bytes.writeUInt32BE(width,16); bytes.writeUInt32BE(height,20); return bytes;
}

test('JPEG preserves DateTimeOriginal, GPS, orientation and dimensions', async () => {
  const metadata=await extractThingPhotoMetadata(jpegWithExif(),'image/jpeg');
  assert.equal(metadata.takenAt,'2024-06-15T14:30:00.000Z');
  assert.ok(Math.abs(metadata.latitude-19.425)<0.000001);
  assert.ok(Math.abs(metadata.longitude-(-99.1333333333))<0.000001);
  assert.equal(metadata.orientation,6);
  assert.deepEqual([metadata.width,metadata.height],[1200,900]);
  assert.equal(metadata.exifAvailable,true);
});

test('JPEG and PNG without EXIF keep dimensions and leave private metadata empty', async () => {
  const jpeg=await extractThingPhotoMetadata(jpegWithoutExif(),'image/jpeg');
  assert.deepEqual(jpeg,{takenAt:null,latitude:null,longitude:null,orientation:null,width:640,height:480,exifAvailable:false});
  const pngMetadata=await extractThingPhotoMetadata(png(),'image/png');
  assert.deepEqual(pngMetadata,{takenAt:null,latitude:null,longitude:null,orientation:null,width:320,height:240,exifAvailable:false});
});

test('EXIF parsing failure never breaks dimension extraction or upload metadata', async () => {
  const failing={parse:async()=>{throw new Error('broken exif')},gps:async()=>{throw new Error('broken gps')}};
  const metadata=await extractThingPhotoMetadata(jpegWithoutExif(800,600),'image/jpeg',failing);
  assert.deepEqual(metadata,{takenAt:null,latitude:null,longitude:null,orientation:null,width:800,height:600,exifAvailable:false});
});
