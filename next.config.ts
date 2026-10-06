import type { NextConfig } from "next";
import { getSupabaseEnv } from "./src/lib/supabase/env";

// Fail at startup/build with an actionable message, before auth is attempted.
getSupabaseEnv();

// Gallery originals bypass Server Actions and upload directly to private
// Supabase Storage. Keep this limit for the legacy Moment upload flow.
const nextConfig: NextConfig = { experimental: { serverActions: { bodySizeLimit: "21mb" } } };
export default nextConfig;
