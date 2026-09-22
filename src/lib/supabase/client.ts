"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./env";
import type { Database } from "@/types/database";

export function getSupabaseBrowserClient() {
  const { url, publishableKey } = getSupabaseEnv();
  // The SSR SDK maintains one browser client and stores its session in cookies.
  return createBrowserClient<Database>(url, publishableKey);
}
