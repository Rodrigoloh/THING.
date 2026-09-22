import { ThingNav } from "@/components/thing/thing-nav";
import { checkProfileRoute } from "@/features/profile/server";

export default async function ThingLayout({ children, params }: { children: React.ReactNode; params: Promise<{ thingId: string }> }) {
  const { thingId } = await params;
  await checkProfileRoute(`/thing/${encodeURIComponent(thingId)}`);
  return <div className="space-y-8"><ThingNav thingId={thingId} />{children}</div>;
}
