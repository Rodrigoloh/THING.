"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { readOwnProfile, submitOwnProfile } from "./profile";

export async function loadProfile() {
  return readOwnProfile(await getSupabaseServerClient());
}

export async function createProfile(formData: FormData) {
  const result = await submitOwnProfile(
    await getSupabaseServerClient(), formData.get("display_name"), formData.get("locale"),
    formData.get("avatar_type"), formData.get("avatar_key"), formData.get("avatar_url"),
  );
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
