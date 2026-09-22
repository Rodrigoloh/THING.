import { EmptyThings } from "@/features/things/empty-things";

export default function ThingsPage() {
  // No Things persistence exists yet. Never substitute development fixtures.
  return <EmptyThings />;
}