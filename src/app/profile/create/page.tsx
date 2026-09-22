import { ProfileForm } from "@/features/profile/profile-form";
import { checkProfileRoute } from "@/features/profile/server";

export default async function CreateProfilePage() {
  await checkProfileRoute("/profile/create");
  return <ProfileForm />;
}
