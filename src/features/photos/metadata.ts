import exifr from 'exifr';

export type ThingPhotoMetadata = {
  takenAt: string | null;
  latitude: number | null;
  longitude: number | null;
  orientation: number | null;
  width: number | null;
  height: number | null;
  exifAvailable: boolean;
};

type ExifReader = {
  parse: typeof exifr.parse;
  gps: typeof exifr.gps;
};

const defaultExifReader: ExifReader = { parse: exifr.parse, gps: exifr.gps };

function uint16(bytes: Uint8Array, offset: number, littleEndian = false): number {
  if (offset + 1 >= bytes.length) return 0;
  return littleEndian ? bytes[offset] | (bytes[offset + 1] << 8) : (bytes[offset] << 8) | bytes[offset + 1];
}

function uint24le(bytes: Uint8Array, offset: number): number {
  if (offset + 2 >= bytes.length) return 0;
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

export function readThingPhotoDimensions(bytes: Uint8Array, mimeType: string): { width: number; height: number } | null {
  if (mimeType === 'image/png' && bytes.length >= 24 && [137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value)) {
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const width=view.getUint32(16), height=view.getUint32(20);
    return width>0&&height>0?{width,height}:null;
  }
  if (mimeType === 'image/jpeg' && bytes[0]===0xff && bytes[1]===0xd8) {
    const sof=new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
    let offset=2;
    while (offset+8<bytes.length) {
      if (bytes[offset]!==0xff) { offset++; continue; }
      const marker=bytes[offset+1]; offset+=2;
      if (marker===0xd8||marker===0xd9||marker===0x01||(marker>=0xd0&&marker<=0xd7)) continue;
      const length=uint16(bytes,offset);
      if (length<2||offset+length>bytes.length) break;
      if (sof.has(marker)) {
        const height=uint16(bytes,offset+3), width=uint16(bytes,offset+5);
        return width>0&&height>0?{width,height}:null;
      }
      offset+=length;
    }
  }
  if (mimeType === 'image/webp' && bytes.length>=30 && String.fromCharCode(...bytes.slice(0,4))==='RIFF' && String.fromCharCode(...bytes.slice(8,12))==='WEBP') {
    const chunk=String.fromCharCode(...bytes.slice(12,16));
    if (chunk==='VP8X') return {width:uint24le(bytes,24)+1,height:uint24le(bytes,27)+1};
    if (chunk==='VP8 '&&bytes[23]===0x9d&&bytes[24]===0x01&&bytes[25]===0x2a) return {width:uint16(bytes,26,true)&0x3fff,height:uint16(bytes,28,true)&0x3fff};
    if (chunk==='VP8L'&&bytes[20]===0x2f) return {width:1+(bytes[21]|((bytes[22]&0x3f)<<8)),height:1+((bytes[22]>>6)|(bytes[23]<<2)|((bytes[24]&0x0f)<<10))};
  }
  return null;
}

function normalizeTakenAt(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value !== 'string') return null;
  const match=/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const [,year,month,day,hour,minute,second]=match.map(Number);
  const date=new Date(Date.UTC(year,month-1,day,hour,minute,second));
  return Number.isFinite(date.getTime())?date.toISOString():null;
}

function validCoordinate(value: unknown, minimum: number, maximum: number): number | null {
  return typeof value==='number'&&Number.isFinite(value)&&value>=minimum&&value<=maximum?value:null;
}

export async function extractThingPhotoMetadata(bytes: Uint8Array, mimeType: string, reader: ExifReader = defaultExifReader): Promise<ThingPhotoMetadata> {
  const dimensions=readThingPhotoDimensions(bytes,mimeType);
  let takenAt: string|null=null, latitude: number|null=null, longitude: number|null=null, orientation: number|null=null;
  if (mimeType==='image/jpeg') {
    try {
      const parsed=await reader.parse(bytes,{pick:['DateTimeOriginal','Orientation'],reviveValues:false,translateValues:false}) as Record<string,unknown>|undefined;
      takenAt=normalizeTakenAt(parsed?.DateTimeOriginal);
      const rawOrientation=parsed?.Orientation;
      orientation=typeof rawOrientation==='number'&&Number.isInteger(rawOrientation)&&rawOrientation>=1&&rawOrientation<=8?rawOrientation:null;
    } catch { /* EXIF is optional and never blocks an upload. */ }
    try {
      const position=await reader.gps(bytes);
      const lat=validCoordinate(position?.latitude,-90,90), lon=validCoordinate(position?.longitude,-180,180);
      if (lat!==null&&lon!==null) { latitude=lat; longitude=lon; }
    } catch { /* Missing or malformed GPS is treated as unavailable. */ }
  }
  return {
    takenAt,latitude,longitude,orientation,
    width:dimensions?.width??null,height:dimensions?.height??null,
    exifAvailable:takenAt!==null||(latitude!==null&&longitude!==null)||orientation!==null,
  };
}
