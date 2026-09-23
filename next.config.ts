import type { NextConfig } from "next";
import { getSupabaseEnv } from "./src/lib/supabase/env";

// Fail at startup/build with an actionable message, before auth is attempted.
getSupabaseEnv();

const nextConfig: NextConfig = { experimental: { serverActions: { bodySizeLimit: "6mb" } } };
export default nextConfig;
