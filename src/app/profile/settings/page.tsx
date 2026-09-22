import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { AccountSettings } from "@/features/auth/account-settings";

export default async function SettingsPage() {
  const client = await getSupabaseServerClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user || user.is_anonymous) redirect("/");
  return <AccountSettings />;
}
