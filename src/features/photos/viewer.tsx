'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { galleryViewerIndex, thingPhotoViewerMetadata, type ThingGalleryPhoto } from './model';
import { createThingPhotoDownload } from './download-actions';

export function PhotoViewer({ photos, photoId, uploaderNames, onClose, onMakeMoment }: { photos:ThingGalleryPhoto[]; photoId:string; uploaderNames:Record<string,string>; onClose:()=>void; onMakeMoment?:(photo:ThingGalleryPhoto)=>void }) {
  const initial=Math.max(0,photos.findIndex((photo)=>photo.id===photoId));
  const [index,setIndex]=useState(initial);
  const [message,setMessage]=useState('');
  const [downloading,startDownload]=useTransition();
  const touch=useRef<{x:number;y:number}|null>(null);
  const photo=photos[index];
  useEffect(()=>{
    const previous=document.body.style.overflow; document.body.style.overflow='hidden';
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();if(event.key==='ArrowLeft')setIndex((value)=>galleryViewerIndex(value,photos.length,-1));if(event.key==='ArrowRight')setIndex((value)=>galleryViewerIndex(value,photos.length,1));};
    window.addEventListener('keydown',key); return()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',key);};
  },[onClose,photos.length]);
  if(!photo) return null;
  const metadata=thingPhotoViewerMetadata(photo,uploaderNames[photo.uploaded_by]??'Thing member');
  const move=(direction:-1|1)=>{setIndex((value)=>galleryViewerIndex(value,photos.length,direction));setMessage('');};
  const download=()=>startDownload(async()=>{
    setMessage('');
    const result=await createThingPhotoDownload(photo.thing_id,photo.id);
    if(!result.ok){setMessage('Couldn’t download this photo. Try again.');return;}
    window.location.assign(result.url);
  });
  return <div role="dialog" aria-modal="true" aria-label="Photo viewer" className="fixed inset-0 z-50 flex min-h-dvh flex-col bg-black text-white">
    <header className="flex min-h-16 items-center justify-between px-4"><button type="button" onClick={onClose} aria-label="Close photo viewer" className="min-h-11 min-w-11 text-left text-2xl">←</button><details className="relative"><summary aria-label="Photo actions" className="min-h-11 min-w-11 cursor-pointer list-none content-center text-right text-2xl">•••</summary><div className="absolute right-0 top-11 z-10 grid w-48 overflow-hidden rounded-xl bg-white text-sm font-bold text-black shadow-xl"><button type="button" disabled={downloading} onClick={download} className="min-h-12 px-4 text-left disabled:opacity-50">{downloading?'preparing…':'download original'}</button><button type="button" onClick={()=>{onMakeMoment?.(photo);setMessage('moment creation coming soon')}} className="min-h-12 border-t border-black/10 px-4 text-left">make a moment</button></div></details></header>
    <div className="relative flex min-h-0 flex-1 items-center justify-center px-3" onTouchStart={(event)=>{const point=event.touches[0];touch.current={x:point.clientX,y:point.clientY};}} onTouchEnd={(event)=>{const start=touch.current,point=event.changedTouches[0];touch.current=null;if(!start)return;const dx=point.clientX-start.x,dy=point.clientY-start.y;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy))move(dx<0?1:-1);}}>
      {/* Gallery URLs point at the private original, so the viewer never substitutes a cropped thumbnail. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img key={photo.id} src={photo.image_url} alt={photo.original_filename??'Shared Thing photo'} className="max-h-full max-w-full object-contain" />
      <button type="button" aria-label="Previous photo" disabled={index===0} onClick={()=>move(-1)} className="absolute left-2 top-1/2 hidden min-h-12 min-w-12 -translate-y-1/2 rounded-full bg-black/45 text-3xl disabled:opacity-20 sm:block">‹</button>
      <button type="button" aria-label="Next photo" disabled={index===photos.length-1} onClick={()=>move(1)} className="absolute right-2 top-1/2 hidden min-h-12 min-w-12 -translate-y-1/2 rounded-full bg-black/45 text-3xl disabled:opacity-20 sm:block">›</button>
    </div>
    <footer className="space-y-1 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4"><p className="font-heading text-lg font-black">{metadata.uploader}</p><p className="text-sm text-white/75">{metadata.date}</p>{metadata.locationSaved&&<p className="text-sm text-white/60">location saved</p>}<p className="pt-1 text-center text-xs text-white/45">{index+1} / {photos.length} · swipe ← →</p>{message&&<p role="status" className="text-center text-xs text-white/70">{message}</p>}</footer>
  </div>;
}
