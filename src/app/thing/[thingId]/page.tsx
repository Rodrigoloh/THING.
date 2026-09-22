import { ThingScreen } from '@/features/things/screens';
import { loadThing } from '@/features/things/actions';
export default async function ThingPage({ params }: { params: Promise<{ thingId: string }> }) {
  const { thingId } = await params;
  return <ThingScreen result={await loadThing(thingId)} />;
}
