import { ActionLink } from "@/components/ui/action-link";
import { Screen } from "@/components/ui/screen";
import { mockThings } from "@/data/mock-things";

export default async function ThingPage({ params }: { params: Promise<{ thingId: string }> }) {
  const { thingId } = await params;
  const thing = mockThings.find((item) => item.id === thingId);
  return <Screen title={thing ? `You & ${thing.otherPerson}` : "Your Thing"} description="Something shared by just the two of you." backHref="/things"><div className="rounded-[20px] border border-border bg-surface p-8 text-center"><span role="img" aria-label="Shared Charm" className="text-6xl">{thing?.charm ?? "✦"}</span><p className="mt-4 text-[13px] text-muted">Your shared Charm</p></div><ActionLink href={`/thing/${encodeURIComponent(thingId)}/hangout/new`}>Hang out →</ActionLink></Screen>;
}
