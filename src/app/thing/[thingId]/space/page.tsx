import { loadSpace } from '@/features/space/actions';
import { SpaceScreen } from '@/features/space/screen';

export default async function SpacePage({ params }: { params: Promise<{ thingId: string }> }) {
  const { thingId } = await params;
  return <SpaceScreen result={await loadSpace(thingId)} />;
}
