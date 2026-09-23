import { redirect } from 'next/navigation';

export default async function SpacePage({ params }: { params: Promise<{ thingId: string }> }) {
  const { thingId } = await params;
  redirect(`/thing/${encodeURIComponent(thingId)}`);
}
