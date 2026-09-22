import { checkProfileRoute } from "@/features/profile/server";

export default async function JoinLayout({ children }: { children: React.ReactNode }) {
  await checkProfileRoute("/join");
  return children;
}
