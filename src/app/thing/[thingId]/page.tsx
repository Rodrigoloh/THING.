import { ThingHomeScreen } from "@/components/thing/placeholder-screens";
export default async function ThingPage({ params }: { params: Promise<{ thingId: string }> }) {
  const { thingId } = await params;
  return <ThingHomeScreen thingId={thingId} />;
}