import { HangoutSelectorScreen } from '@/features/hangouts/screens';
import { loadHotSetup } from '@/features/hangouts/actions';
import { loadThing } from '@/features/things/actions';
export default async function HangoutPage({ params }: { params: Promise<{ thingId: string }> }) {
  const { thingId } = await params;
  const [thingResult, hotResult] = await Promise.all([loadThing(thingId), loadHotSetup(thingId)]);
  return <HangoutSelectorScreen thingResult={thingResult} hotResult={hotResult} />;
}
