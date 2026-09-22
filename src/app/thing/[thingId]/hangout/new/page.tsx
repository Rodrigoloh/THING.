import { HangoutScreen } from "@/components/thing/placeholder-screens";
export default async function HangoutPage({ params }: { params: Promise<{ thingId: string }> }) {
  const { thingId } = await params;
  return <HangoutScreen thingId={thingId} />;
}