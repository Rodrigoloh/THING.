import { HangoutSelectorScreen } from '@/features/hangouts/screens';
import { loadThing } from '@/features/things/actions';
export default async function HangoutPage({ params }: { params: Promise<{ thingId: string }> }) {
  const { thingId } = await params;
  return <HangoutSelectorScreen thingResult={await loadThing(thingId)} />;
}
