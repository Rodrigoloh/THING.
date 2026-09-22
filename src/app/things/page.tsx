import { ThingsScreen } from '@/features/things/screens';
import { loadThings } from '@/features/things/actions';

export default async function ThingsPage() {
  return <ThingsScreen result={await loadThings()} />;
}
