import { notFound } from 'next/navigation';
import { loadThing } from '@/features/things/actions';
import { loadChat } from '@/features/chat/actions';
import { ChatScreen } from '@/features/chat/screen';

export default async function ChatPage({ params }: { params: Promise<{ thingId: string }> }) {
  const { thingId } = await params;
  const [thing, messages] = await Promise.all([loadThing(thingId), loadChat(thingId)]);
  if (!thing.ok) notFound();
  return <ChatScreen thing={thing.data} messages={messages} />;
}
