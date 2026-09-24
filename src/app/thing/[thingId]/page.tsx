import { ThingScreen } from '@/features/things/screens';
import { loadThing } from '@/features/things/actions';
import { loadSpace } from '@/features/space/actions';
import { loadChatPreview } from '@/features/chat/actions';
import { loadMomentsPreview } from '@/features/moments/actions';
export default async function ThingPage({ params }: { params: Promise<{ thingId: string }> }) {
  const { thingId } = await params;
  const result = await loadThing(thingId);
  const hasSpace = result.ok && (result.data.status === 'active' || result.data.status === 'disconnected');
  const [spaceResult, chatPreview, momentsPreview] = hasSpace
    ? await Promise.all([loadSpace(thingId), loadChatPreview(thingId), loadMomentsPreview(thingId)])
    : [undefined, undefined, undefined];
  return <ThingScreen result={result} spaceResult={spaceResult} chatPreview={chatPreview} momentsPreview={momentsPreview} />;
}
