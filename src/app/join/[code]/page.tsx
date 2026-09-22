import { ActionLink } from "@/components/ui/action-link";
import { Placeholder } from "@/components/ui/placeholder";
import { Screen } from "@/components/ui/screen";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <Screen title="Join Thing" description="A Thing is always just the two of you." backHref="/"><div className="rounded-[20px] border border-border bg-surface p-6"><p className="text-[13px] text-muted">Invitation code</p><p className="mt-2 break-all font-semibold">{code}</p></div><Placeholder>Invitation validation and joining will be available later. No membership is created in this preview.</Placeholder><ActionLink href="/things" secondary>Explore sample Things</ActionLink></Screen>;
}
