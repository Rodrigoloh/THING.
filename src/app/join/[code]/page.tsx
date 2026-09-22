import { JoinThingScreen } from "@/components/thing/placeholder-screens";
export default async function JoinCodePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <JoinThingScreen code={code} />;
}