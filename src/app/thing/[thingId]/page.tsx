import { ThingScreen } from '@/features/things/screens';
import { loadThing } from '@/features/things/actions';
import { loadSpace } from '@/features/space/actions';
export default async function ThingPage({ params }: { params: Promise<{ thingId: string }> }) {
  const { thingId } = await params;
  const result = await loadThing(thingId);
  const spaceResult = result.ok && (result.data.status === 'active' || result.data.status === 'disconnected') ? await loadSpace(thingId) : undefined;
  return <ThingScreen result={result} spaceResult={spaceResult} />;
}
