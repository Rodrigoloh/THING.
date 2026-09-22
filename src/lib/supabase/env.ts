export function getSupabaseEnv() {
  // Direct references are required for Next.js to inline public browser values.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const missing = [
    !url && "NEXT_PUBLIC_SUPABASE_URL",
    !publishableKey && "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  ].filter(Boolean);

  if (missing.length) {
    throw new Error(
      `THING: Missing ${missing.join(", ")}. Copy .env.example to .env.local, fill in your Supabase public API details, and restart the app.`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url!);
  } catch {
    throw new Error("THING: NEXT_PUBLIC_SUPABASE_URL must be a valid Supabase project URL.");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if (
    (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) ||
    parsed.username || parsed.password || parsed.search || parsed.hash ||
    parsed.pathname !== "/"
  ) {
    throw new Error("THING: NEXT_PUBLIC_SUPABASE_URL must be an HTTPS project origin (HTTP is allowed for localhost).");
  }
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey!)) {
    throw new Error("THING: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a public sb_publishable_ key, never a secret or service_role key.");
  }

  return { url: parsed.origin, publishableKey: publishableKey! };
}
