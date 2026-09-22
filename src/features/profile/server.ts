import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { profileDestination, readOwnProfile } from "./profile";

export const getServerProfile = cache(async () => readOwnProfile(await getSupabaseServerClient()));

export async function checkProfileRoute(pathname: string) {
  const result = await getServerProfile();
  if (result.ok) {
    const destination = profileDestination(pathname, result.profile !== null);
    if (destination) redirect(destination);
  } else if (result.error === "sessionRequired" && pathname !== "/") {
    redirect("/");
  }
  // Read/connection errors are not treated as a missing profile. The client
  // gate displays a retry state and never exposes protected content meanwhile.
}
