import { notFound } from 'next/navigation';
import { loadThing } from '@/features/things/actions';
import { loadMoments } from '@/features/moments/actions';
import { MomentsScreen } from '@/features/moments/screen';
import { loadThingGallery } from '@/features/photos/gallery-server';

export default async function MomentsPage({ params, searchParams }: { params: Promise<{ thingId: string }>; searchParams: Promise<{ view?: string }> }) {
  const { thingId } = await params;
  const { view } = await searchParams;
  const [thing, moments, gallery] = await Promise.all([loadThing(thingId), loadMoments(thingId), loadThingGallery(thingId)]);
  if (!thing.ok) notFound();
  return <MomentsScreen thing={thing.data} moments={moments} gallery={gallery} initialView={view==='gallery'?'gallery':'moments'} />;
}
