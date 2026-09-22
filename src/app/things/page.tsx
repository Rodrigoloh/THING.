import { ActionLink } from "@/components/ui/action-link";
import { Screen } from "@/components/ui/screen";
import { ThingCard } from "@/components/thing/thing-card";
import { mockThings } from "@/data/mock-things";

export default function ThingsPage() {
  return <Screen title="Your Things" description="A little space for each of you."><div className="space-y-3">{mockThings.map((thing) => <ThingCard key={thing.id} thing={thing} name={thing.otherPerson} activity={thing.activity} />)}</div><ActionLink href="/things/new">+ start a thing</ActionLink><p className="text-[13px] text-muted">Sample Things for this preview.</p></Screen>;
}
