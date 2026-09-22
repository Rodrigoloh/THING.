import { Screen } from "@/components/ui/screen";
import { Placeholder } from "@/components/ui/placeholder";

export default async function HangoutPage({ params }: { params: Promise<{ thingId: string }> }) {
  const { thingId } = await params;
  return <Screen title="Hangout Setup" description="Make a little time for the two of you." backHref={`/thing/${encodeURIComponent(thingId)}`}><Placeholder>Same Brain will be the first game here. Game selection, the ready lobby, and synchronized play will come later.</Placeholder></Screen>;
}
