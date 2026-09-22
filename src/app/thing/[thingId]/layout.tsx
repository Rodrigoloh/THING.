import { ThingNav } from "@/components/thing/thing-nav";

export default async function ThingLayout({ children, params }: { children: React.ReactNode; params: Promise<{ thingId: string }> }) {
  const { thingId } = await params;
  return <div className="space-y-8"><ThingNav thingId={thingId} />{children}</div>;
}
