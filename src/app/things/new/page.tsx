import { ActionLink } from "@/components/ui/action-link";
import { Screen } from "@/components/ui/screen";
import { Placeholder } from "@/components/ui/placeholder";
import { mockJoinCode } from "@/data/mock-things";

export default function NewThingPage() {
  return <Screen title="Start a Thing" description="You and one other person. No labels needed." backHref="/things"><Placeholder>Invite your person and pick a shared Charm. Creating a Thing will be available in a future step.</Placeholder><div className="space-y-3"><ActionLink href="/things" secondary>Explore sample Things</ActionLink><ActionLink href={`/join/${mockJoinCode}`} secondary>Preview joining a Thing</ActionLink></div></Screen>;
}
