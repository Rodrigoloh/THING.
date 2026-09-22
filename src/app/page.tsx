import { checkProfileRoute } from "@/features/profile/server";
import { AuthScreen } from "@/features/auth/auth-screen";

export default async function EntryPage({ searchParams }: { searchParams: Promise<{ auth_error?: string }> }) {
  await checkProfileRoute("/");
  return <AuthScreen callbackError={(await searchParams).auth_error === "1"} />;
}
