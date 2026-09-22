import { redirect } from "next/navigation";
import { Screen } from "@/components/ui/screen";
import { PasswordForm } from "@/features/auth/password-form";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function UpdatePasswordPage() {
  const { data: { user }, error } = await (await getSupabaseServerClient()).auth.getUser();
  if (error || !user || user.is_anonymous) redirect("/");
  return <Screen title="THING." backHref="/"><PasswordForm recovery /></Screen>;
}
