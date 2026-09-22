import { Screen } from "@/components/ui/screen";
import { ActionLink } from "@/components/ui/action-link";

export default function NotFound() {
  return <Screen title="Nothing here yet" description="This page could not be found."><ActionLink href="/things">Back to your Things</ActionLink></Screen>;
}
