import { HangoutDetailScreen } from '@/features/hangouts/screens';
import { loadHangout, loadSameBrain } from '@/features/hangouts/actions';

export default async function HangoutDetailPage({ params }: { params: Promise<{ hangoutId: string }> }) {
  const { hangoutId } = await params;
  const result = await loadHangout(hangoutId);
  const sameBrainResult = result.ok && result.data.game_type === 'same_brain' ? await loadSameBrain(hangoutId) : undefined;
  return <HangoutDetailScreen result={result} sameBrainResult={sameBrainResult} />;
}
