import { notFound } from 'next/navigation';
import { loadThing } from '@/features/things/actions';
import { loadSpace } from '@/features/space/actions';
import { SpaceScreen } from '@/features/space/screen';

export default async function SpacePage({ params }: { params: Promise<{ thingId: string }> }) {
  const { thingId } = await params;
  const [thing, space] = await Promise.all([loadThing(thingId), loadSpace(thingId)]);
  if (!thing.ok || !space.ok) notFound();
  return <SpaceScreen thing={thing.data} space={space.data} />;
}
