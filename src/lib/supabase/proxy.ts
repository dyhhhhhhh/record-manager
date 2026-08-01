import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { getPublicEnv } from "@/lib/env";

type SessionCookie = { name: string; value: string; options: CookieOptions };

export function applySessionCookies(
  request: NextRequest,
  cookies: SessionCookie[],
  headers: Record<string, string>
) {
  cookies.forEach(({ name, value }) => request.cookies.set(name, value));
  const response = NextResponse.next({ request });
  cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
  return response;
}

export async function updateSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const env = getPublicEnv();
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies, headers) => {
        response = applySessionCookies(request, cookies, headers);
      }
    }
  });

  await supabase.auth.getClaims();
  return response;
}
