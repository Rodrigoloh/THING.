import { checkProfileRoute } from "@/features/profile/server";

export default async function ThingsLayout({ children }: { children: React.ReactNode }) {
  await checkProfileRoute("/things");
  return children;
}
