import { JoinScreen } from '@/features/things/screens';
import { previewInvite } from '@/features/things/actions';
export default async function JoinCodePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <JoinScreen code={code} preview={await previewInvite(code)} />;
}
