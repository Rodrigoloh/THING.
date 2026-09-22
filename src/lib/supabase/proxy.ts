import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "./env";
import { inviteCookie, normalizeInvite } from '@/features/things/model';

export async function updateSession(request: NextRequest) {
  const { url, publishableKey } = getSupabaseEnv();
  const isPrefetch = request.headers.has('next-router-prefetch')
    || request.headers.get('purpose') === 'prefetch'
    || request.headers.get('sec-purpose')?.includes('prefetch')
    || request.nextUrl.searchParams.has('_rsc');
  const invite = request.method === 'GET' && request.nextUrl.pathname.startsWith('/join/') && !isPrefetch
    ? normalizeInvite(request.nextUrl.pathname.slice('/join/'.length)) : null;
  if (invite) request.cookies.set(inviteCookie, invite);
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  // Refresh/verify only. Never create users during requests or link prefetches.
  // Profile routes and actions independently authorize access.
  await supabase.auth.getClaims();
  if (invite) response.cookies.set(inviteCookie, invite, { path: '/', sameSite: 'lax', secure: request.nextUrl.protocol === 'https:', maxAge: 7 * 24 * 60 * 60 });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
