'use client';

import { useState } from 'react';
import { galleryPhotoTag, groupThingGalleryPhotos, toggleGallerySelection, type ThingGalleryPhoto } from './model';
import { PhotoViewer } from './viewer';

export function ThingGallery({ photos, members, onSelectionChange, onMakeMoment }: { photos: ThingGalleryPhoto[]; members:{user_id:string;display_name:string}[]; onSelectionChange?: (photoIds: string[])=>void; onMakeMoment?:(photo:ThingGalleryPhoto)=>void }) {
  const [selecting,setSelecting]=useState(false);
  const [selected,setSelected]=useState<Set<string>>(()=>new Set());
  const [viewingId,setViewingId]=useState<string|null>(null);
  const groups=groupThingGalleryPhotos(photos);
  const uploaderNames=Object.fromEntries(members.map((member)=>[member.user_id,member.display_name]));
  function leaveSelection() { setSelecting(false); setSelected(new Set()); onSelectionChange?.([]); }
  function toggle(photoId:string) {
    if (!selecting) return;
    setSelected((current)=>{ const next=toggleGallerySelection(current,photoId); onSelectionChange?.([...next]); return next; });
  }
  if (!photos.length) return <section className="border-y border-dashed border-border py-16 text-center"><p className="font-heading text-2xl font-black">nothing here yet</p><p className="mt-2 text-sm text-muted">add photos to start your shared gallery.</p></section>;
  return <section className="space-y-7" aria-label="Shared gallery">
    <div className="sticky top-0 z-10 flex min-h-12 items-center justify-between border-y border-border bg-background/95 py-2 backdrop-blur">
      <p className="text-sm font-bold">{selecting?`${selected.size} selected`:`${photos.length} ${photos.length===1?'photo':'photos'}`}</p>
      <div className="flex gap-4">{selecting&&selected.size>0&&<button type="button" onClick={()=>{setSelected(new Set());onSelectionChange?.([])}} className="min-h-11 text-sm font-bold">clear</button>}<button type="button" aria-pressed={selecting} onClick={()=>selecting?leaveSelection():setSelecting(true)} className="min-h-11 text-sm font-black underline decoration-2 underline-offset-4">{selecting?'done':'select'}</button></div>
    </div>
    {groups.map((group)=><section key={group.key} aria-labelledby={`gallery-${group.key}`} className="space-y-3"><h2 id={`gallery-${group.key}`} className="text-xs font-black tracking-[.18em] text-muted">{group.label}</h2><div className="grid grid-cols-3 gap-0.5 sm:grid-cols-4 md:grid-cols-5">{group.photos.map((photo)=>{
      const active=selected.has(photo.id);
      return <button key={photo.id} type="button" aria-label={selecting?`${active?'Deselect':'Select'} photo from ${group.label}`:`Open photo from ${group.label}`} aria-pressed={selecting?active:undefined} onClick={()=>selecting?toggle(photo.id):setViewingId(photo.id)} className="relative aspect-square overflow-hidden bg-surface text-left">
        {/* Original signed objects are temporary until a thumbnail pipeline exists. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.image_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        {!selecting&&<span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-1.5 pb-1.5 pt-6 text-[8px] font-bold leading-tight text-white sm:text-[9px]">{galleryPhotoTag(photo,uploaderNames[photo.uploaded_by]??'Thing member')}</span>}
        {selecting&&<span aria-hidden="true" className={`absolute right-2 top-2 grid size-6 place-items-center rounded-full border-2 border-white text-xs font-black shadow ${active?'bg-black text-white':'bg-black/25 text-transparent'}`}>✓</span>}
      </button>;
    })}</div></section>)}
    {photos.some((photo)=>photo.location_city)&&<p className="text-[10px] text-muted">City labels © OpenStreetMap contributors</p>}
    {viewingId&&<PhotoViewer photos={photos} photoId={viewingId} uploaderNames={uploaderNames} onClose={()=>setViewingId(null)} onMakeMoment={onMakeMoment}/>}
  </section>;
}
