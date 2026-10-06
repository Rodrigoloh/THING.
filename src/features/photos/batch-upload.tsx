'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { uploadThingPhoto } from './actions';
import { formatPhotoBytes, prepareThingPhotoBatch, uploadPreparedThingPhotos, type PreparedThingPhoto, type RejectedThingPhoto } from './model';

type BatchItem = PreparedThingPhoto & { previewUrl: string; status: 'ready' | 'uploading' | 'uploaded' | 'duplicate' | 'failed' };
type Outcome = { uploaded: number; failed: number; duplicates: number };

const rejectionCopy: Record<RejectedThingPhoto['error'], string> = {
  invalid_type: 'unsupported file type', too_large: 'over 20 MB', invalid_data: 'not a valid image',
  too_many_files: 'choose no more than 50 photos', duplicate_selection: 'selected more than once',
};

export function PhotoBatchUpload({ thingId }: { thingId: string }) {
  const router=useRouter();
  const previews=useRef<string[]>([]);
  const [items,setItems]=useState<BatchItem[]>([]);
  const [rejected,setRejected]=useState<RejectedThingPhoto[]>([]);
  const [preparing,setPreparing]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [progress,setProgress]=useState({completed:0,total:0});
  const [outcome,setOutcome]=useState<Outcome|null>(null);
  useEffect(()=>()=>previews.current.forEach((url)=>URL.revokeObjectURL(url)),[]);

  async function selectFiles(files: File[]) {
    previews.current.forEach((url)=>URL.revokeObjectURL(url));
    previews.current=[]; setItems([]); setRejected([]); setOutcome(null); setProgress({completed:0,total:0});
    if (!files.length) return;
    setPreparing(true);
    const prepared=await prepareThingPhotoBatch(files);
    const next=prepared.accepted.map((photo)=>{
      const previewUrl=URL.createObjectURL(photo.file); previews.current.push(previewUrl);
      return {...photo,previewUrl,status:'ready' as const};
    });
    setItems(next); setRejected(prepared.rejected); setPreparing(false);
  }

  async function upload(targets: BatchItem[]) {
    if (!targets.length) return;
    setUploading(true); setOutcome(null); setProgress({completed:0,total:targets.length});
    const existingUploaded=items.filter((item)=>item.status==='uploaded').length;
    const existingDuplicates=items.filter((item)=>item.status==='duplicate').length;
    const results=await uploadPreparedThingPhotos(targets,async(photo)=>{
      setItems((current)=>current.map((item)=>item.contentHash===photo.contentHash?{...item,status:'uploading'}:item));
      const data=new FormData(); data.set('photo',photo.file); data.set('contentHash',photo.contentHash);
      const result=await uploadThingPhoto(thingId,data);
      setItems((current)=>current.map((item)=>item.contentHash===photo.contentHash?{...item,status:result.ok?'uploaded':result.error==='duplicate'?'duplicate':'failed'}:item));
      return result;
    },(completed,total)=>setProgress({completed,total}));
    const uploaded=results.filter((result)=>result.ok).length;
    const duplicates=results.filter((result)=>!result.ok&&result.error==='duplicate').length;
    const failed=results.length-uploaded-duplicates;
    setOutcome({uploaded:existingUploaded+uploaded,failed,duplicates:existingDuplicates+duplicates});
    setUploading(false); router.refresh();
  }

  const totalBytes=items.reduce((total,item)=>total+item.file.size,0);
  const failed=items.filter((item)=>item.status==='failed');
  return <section className="space-y-4 border-y border-dashed border-border py-5" aria-labelledby="gallery-upload-title">
    <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-muted">gallery</p><h2 id="gallery-upload-title" className="font-heading text-2xl font-black">add photos together</h2></div>
    <label className="block text-sm font-semibold">choose photos<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploading||preparing} onChange={(event)=>void selectFiles(Array.from(event.target.files??[]))} className="mt-2 block w-full text-sm" /></label>
    {preparing&&<p role="status" className="text-sm text-muted">checking photos…</p>}
    {!!items.length&&<>
      <p className="font-heading text-lg font-black">{items.length} {items.length===1?'photo':'photos'} selected</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">{items.map((item)=><figure key={item.contentHash} className="relative aspect-square overflow-hidden bg-surface">
        {/* Local object URLs are generated only from the user's current selection. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.previewUrl} alt={item.file.name} className="h-full w-full object-cover" />
        {item.status!=='ready'&&<figcaption className="absolute inset-x-0 bottom-0 bg-black/75 px-1 py-1 text-center text-[9px] font-bold text-white">{item.status==='duplicate'?'this photo is already here':item.status}</figcaption>}
      </figure>)}</div>
      <p className="text-sm font-semibold">{items.length} {items.length===1?'photo':'photos'} · {formatPhotoBytes(totalBytes)}</p>
      <button type="button" disabled={uploading} onClick={()=>void upload(items.filter((item)=>item.status==='ready'))} className="thing-primary-button min-h-12 px-6 font-bold disabled:opacity-50">{uploading?`uploading ${progress.completed} / ${progress.total}`:'upload photos'}</button>
    </>}
    {!!rejected.length&&<div role="alert" className="space-y-1 text-sm"><p className="font-bold">{rejected.length} {rejected.length===1?'file was':'files were'} not selected</p><ul className="text-muted">{rejected.map((item,index)=><li key={`${item.file.name}-${index}`}>{item.file.name}: {rejectionCopy[item.error]}</li>)}</ul></div>}
    {outcome&&<div role="status" className="space-y-2 text-sm"><p><strong>{outcome.uploaded} uploaded</strong>{outcome.failed>0&&<> · {outcome.failed} couldn&apos;t upload</>}{outcome.duplicates>0&&<> · {outcome.duplicates} already here</>}</p>{failed.length>0&&<button type="button" disabled={uploading} onClick={()=>void upload(failed)} className="font-bold underline decoration-2 underline-offset-4">retry failed</button>}</div>}
  </section>;
}
