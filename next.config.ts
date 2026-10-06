import type { NextConfig } from "next";
import { getSupabaseEnv } from "./src/lib/supabase/env";

// Fail at startup/build with an actionable message, before auth is attempted.
getSupabaseEnv();

// Batch uploads dispatch one Server Action per file. This admits a 20 MiB
// photo plus multipart metadata without accepting an entire batch at once.
const nextConfig: NextConfig = { experimental: { serverActions: { bodySizeLimit: "21mb" } } };
export default nextConfig;
