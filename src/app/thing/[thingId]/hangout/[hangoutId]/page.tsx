import { HangoutDetailScreen } from '@/features/hangouts/screens';
import { loadHangout } from '@/features/hangouts/actions';

export default async function HangoutDetailPage({ params }: { params: Promise<{ hangoutId: string }> }) {
  const { hangoutId } = await params;
  return <HangoutDetailScreen result={await loadHangout(hangoutId)} />;
}
