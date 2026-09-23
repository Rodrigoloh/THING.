import { HangoutDetailScreen } from '@/features/hangouts/screens';
import { loadChoiceEngine, loadHangout, loadHot, loadSameBrain } from '@/features/hangouts/actions';

export default async function HangoutDetailPage({ params }: { params: Promise<{ hangoutId: string }> }) {
  const { hangoutId } = await params;
  const result = await loadHangout(hangoutId);
  const sameBrainResult = result.ok && result.data.game_type === 'same_brain' ? await loadSameBrain(hangoutId) : undefined;
  const choiceResult = result.ok && (result.data.game_type === 'know_me' || result.data.game_type === 'this_or_that') ? await loadChoiceEngine(hangoutId, result.data.game_type) : undefined;
  const hotResult = result.ok && result.data.game_type === 'hot' ? await loadHot(hangoutId) : undefined;
  return <HangoutDetailScreen result={result} sameBrainResult={sameBrainResult} choiceResult={choiceResult} hotResult={hotResult} />;
}
