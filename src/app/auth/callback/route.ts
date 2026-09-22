import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  let destination = "/?auth_error=1";
  if (code && !url.searchParams.has("error")) {
    try {
      const client = await getSupabaseServerClient();
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      if (!error && data.user && !data.user.is_anonymous) destination = "/";
    } catch { /* Present a safe, localized error; never echo OAuth parameters. */ }
  }
  // A relative Location stays on the public request origin on localhost/Vercel.
  // No forwarded-host trust and no user-controlled next/open redirect.
  return new Response(null, { status: 303, headers: { Location: destination, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
