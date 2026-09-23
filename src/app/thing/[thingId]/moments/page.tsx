import { notFound } from 'next/navigation';
import { loadThing } from '@/features/things/actions';
import { loadMoments } from '@/features/moments/actions';
import { MomentsScreen } from '@/features/moments/screen';

export default async function MomentsPage({ params }: { params: Promise<{ thingId: string }> }) {
  const { thingId } = await params;
  const [thing, moments] = await Promise.all([loadThing(thingId), loadMoments(thingId)]);
  if (!thing.ok) notFound();
  return <MomentsScreen thing={thing.data} moments={moments} />;
}
