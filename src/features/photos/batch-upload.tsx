'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cancelThingPhotoUpload, completeThingPhotoUpload, prepareThingPhotoUpload } from './actions';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { uploadThingPhotoDirect } from './direct-upload';
import {
  formatPhotoBytes,
  prepareThingPhotoBatch,
  uploadPreparedThingPhotos,
  type PreparedThingPhoto,
  type RejectedThingPhoto,
  type ThingPhotoUploadError,
} from './model';

type BatchItem = PreparedThingPhoto & {
  previewUrl: string;
  status: 'ready' | 'uploading' | 'uploaded' | 'duplicate' | 'failed';
  error?: ThingPhotoUploadError;
};
type Outcome = { uploaded: number; failed: number; duplicates: number; errors: ThingPhotoUploadError[] };

const rejectionCopy: Record<RejectedThingPhoto['error'], string> = {
  invalid_type: 'unsupported file type',
  too_large: 'over 20 MB',
  invalid_data: 'not a valid image',
  too_many_files: 'choose no more than 50 photos',
  duplicate_selection: 'selected more than once',
};

const uploadErrorCopy: Record<ThingPhotoUploadError, string> = {
  duplicate: 'This photo is already here.',
  invalid_file: 'This file could not be read as a supported photo.',
  not_member: 'Your session cannot add photos to this Thing. Refresh and try again.',
  setup_required: 'Photo uploads are temporarily unavailable while Gallery finishes setting up.',
  storage_limit: 'This photo is larger than the current storage limit.',
  upload_failed: 'The photo could not be saved. Try again.',
  connection_failed: 'The connection was interrupted. Try again.',
};

export function PhotoBatchUpload({ thingId }: { thingId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const previews = useRef<string[]>([]);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [rejected, setRejected] = useState<RejectedThingPhoto[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), []);

  async function selectFiles(files: File[]) {
    previews.current.forEach((url) => URL.revokeObjectURL(url));
    previews.current = [];
    setItems([]);
    setRejected([]);
    setOutcome(null);
    setProgress({ completed: 0, total: 0 });
    if (!files.length) return;
    setPreparing(true);
    const prepared = await prepareThingPhotoBatch(files);
    const next = prepared.accepted.map((photo) => {
      const previewUrl = URL.createObjectURL(photo.file);
      previews.current.push(previewUrl);
      return { ...photo, previewUrl, status: 'ready' as const };
    });
    setItems(next);
    setRejected(prepared.rejected);
    setPreparing(false);
  }

  async function upload(targets: BatchItem[]) {
    if (!targets.length) return;
    setUploading(true);
    setOutcome(null);
    setProgress({ completed: 0, total: targets.length });
    const existingUploaded = items.filter((item) => item.status === 'uploaded').length;
    const existingDuplicates = items.filter((item) => item.status === 'duplicate').length;
    const results = await uploadPreparedThingPhotos(
      targets,
      async (photo) => {
        setItems((current) => current.map((item) => item.contentHash === photo.contentHash ? { ...item, status: 'uploading', error: undefined } : item));
        const ticket=await prepareThingPhotoUpload(thingId,{
          originalFilename:photo.file.name,
          mimeType:photo.file.type,
          fileSizeBytes:photo.file.size,
          contentHash:photo.contentHash,
          metadata:photo.metadata,
        });
        if (!ticket.ok) return ticket;
        const storage=getSupabaseBrowserClient().storage.from('thing-moments');
        const directResult=await uploadThingPhotoDirect(storage,ticket,photo.file);
        if (!directResult.ok) {
          await cancelThingPhotoUpload(thingId,ticket.photoId);
          return directResult;
        }
        return {ok:true,photoId:ticket.photoId};
      },
      (completed, total) => setProgress({ completed, total }),
      (photo, result) => {
        setItems((current) => current.map((item) => item.contentHash === photo.contentHash ? {
          ...item,
          status: result.ok ? 'uploaded' : result.error === 'duplicate' ? 'duplicate' : 'failed',
          error: result.ok ? undefined : result.error,
        } : item));
      },
    );
    const uploaded = results.filter((result) => result.ok).length;
    const duplicates = results.filter((result) => !result.ok && result.error === 'duplicate').length;
    const failed = results.length - uploaded - duplicates;
    const errors = [...new Set(results.flatMap((result) => result.ok || result.error === 'duplicate' ? [] : [result.error]))];
    setOutcome({ uploaded: existingUploaded + uploaded, failed, duplicates: existingDuplicates + duplicates, errors });
    setUploading(false);
    if (uploaded > 0) await completeThingPhotoUpload(thingId).catch(()=>undefined);
    router.refresh();
  }

  const totalBytes = items.reduce((total, item) => total + item.file.size, 0);
  const ready = items.filter((item) => item.status === 'ready');
  const failed = items.filter((item) => item.status === 'failed');
  const completed = items.filter((item) => item.status === 'uploaded' || item.status === 'duplicate');
  const errorMessages = outcome ? [...new Set(outcome.errors.map((error) => uploadErrorCopy[error]))] : [];

  function resetBatch() {
    previews.current.forEach((url) => URL.revokeObjectURL(url));
    previews.current = [];
    setItems([]);
    setRejected([]);
    setOutcome(null);
    setProgress({ completed: 0, total: 0 });
    if (input.current) input.current.value = '';
  }

  function keepOnlyFailed() {
    completed.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    previews.current = failed.map((item) => item.previewUrl);
    setItems(failed.map((item) => ({ ...item, status: 'failed' })));
    setProgress({ completed: 0, total: 0 });
  }

  return <section className="space-y-4 border-y border-dashed border-border py-5" aria-labelledby="gallery-upload-title">
    <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-muted">gallery</p><h2 id="gallery-upload-title" className="font-heading text-2xl font-black">add photos together</h2></div>
    <div className="space-y-2">
      <input ref={input} id="thing-photo-picker" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploading || preparing} onChange={(event) => { void selectFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ''; }} className="sr-only" />
      <button type="button" disabled={uploading || preparing} onClick={() => input.current?.click()} className="thing-primary-button flex min-h-14 w-full items-center justify-center gap-3 rounded-[18px] px-6 py-4 font-black disabled:opacity-50" aria-describedby="thing-photo-picker-help">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6 fill-none stroke-current stroke-2"><path d="M4 7.5h3l1.5-2h7l1.5 2h3v11H4z"/><circle cx="12" cy="13" r="3"/><path d="M19 2v4M17 4h4"/></svg>
        {preparing ? 'checking photos…' : items.length ? 'select different photos' : 'select photos'}
      </button>
      <p id="thing-photo-picker-help" className="text-center text-xs text-muted">JPEG, PNG or WebP · up to 50 photos · 20 MB each</p>
    </div>
    {preparing && <p role="status" className="text-sm text-muted">checking photos…</p>}
    {!!items.length && <>
      <p className="font-heading text-lg font-black">{items.length} {items.length === 1 ? 'photo' : 'photos'} selected</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">{items.map((item) => <figure key={item.contentHash} className="relative aspect-square overflow-hidden bg-surface">
        {/* Local object URLs are generated only from the user's current selection. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.previewUrl} alt={item.file.name} className="h-full w-full object-cover" />
        {item.status !== 'ready' && <figcaption className="absolute inset-x-0 bottom-0 bg-black/75 px-1 py-1 text-center text-[9px] font-bold text-white">{item.status === 'duplicate' ? 'already here' : item.status}</figcaption>}
      </figure>)}</div>
      <p className="text-sm font-semibold">{items.length} {items.length === 1 ? 'photo' : 'photos'} · {formatPhotoBytes(totalBytes)}</p>
      {ready.length > 0 && <button type="button" disabled={uploading} onClick={() => void upload(ready)} className="thing-primary-button min-h-12 px-6 font-bold disabled:opacity-50">{uploading ? `uploading ${progress.completed} / ${progress.total}` : 'upload photos'}</button>}
    </>}
    {uploading && <p role="status" className="rounded-[14px] border border-border bg-surface p-3 text-center text-sm font-bold">uploading {progress.completed} / {progress.total}</p>}
    {!!rejected.length && <div role="alert" className="space-y-1 text-sm"><p className="font-bold">{rejected.length} {rejected.length === 1 ? 'file was' : 'files were'} not selected</p><ul className="text-muted">{rejected.map((item, index) => <li key={`${item.file.name}-${index}`}>{item.file.name}: {rejectionCopy[item.error]}</li>)}</ul></div>}
    {outcome && <div role="status" className="space-y-2 text-sm">
      <p><strong>{outcome.uploaded} uploaded</strong>{outcome.failed > 0 && <> · {outcome.failed} couldn&apos;t upload</>}{outcome.duplicates > 0 && <> · {outcome.duplicates} already here</>}</p>
      {errorMessages.map((message) => <p key={message} role="alert" className="rounded-[14px] border border-border bg-surface p-3 font-semibold">{message}</p>)}
      <div className="grid gap-2 sm:grid-cols-2">
        {failed.length > 0 && !outcome.errors.includes('setup_required') && <button type="button" disabled={uploading} onClick={() => void upload(failed)} className="thing-primary-button min-h-12 rounded-[16px] px-4 font-bold disabled:opacity-50">{uploading ? `retrying ${progress.completed} / ${progress.total}` : `retry ${failed.length} failed ${failed.length === 1 ? 'photo' : 'photos'}`}</button>}
        {failed.length > 0 && completed.length > 0 && <button type="button" disabled={uploading} onClick={keepOnlyFailed} className="min-h-12 rounded-[16px] border border-border bg-surface px-4 font-bold disabled:opacity-50">keep only failed</button>}
        <button type="button" disabled={uploading} onClick={resetBatch} className="min-h-12 rounded-[16px] border border-border bg-surface px-4 font-bold disabled:opacity-50">clear selection</button>
      </div>
    </div>}
  </section>;
}
