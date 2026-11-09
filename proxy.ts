import { NextRequest, NextResponse } from "next/server";
import { authClient, cookieOptions, PRIVATE_HEADERS, type CookieWrite } from "./lib/tobi-supabase.ts";
export async function proxy(request: NextRequest) {
  const writes = new Map<string, CookieWrite>();
  const headers = new Headers(PRIVATE_HEADERS);
  const client = authClient(() => request.cookies.getAll(), (cookies, extra) => {
    cookies.forEach(cookie => { request.cookies.set(cookie.name, cookie.value); writes.set(cookie.name, cookie); });
    Object.entries(extra).forEach(([key, value]) => headers.set(key, value));
  });
  try { await client?.auth.getUser(); } catch { /* Handlers independently fail closed. */ }
  const response = NextResponse.next({ request: { headers: request.headers } });
  headers.forEach((value, key) => response.headers.set(key, value));
  writes.forEach(({ name, value, options }) => response.cookies.set(name, value, { ...options, ...cookieOptions() }));
  return response;
}
export const config = { matcher: ["/login", "/auth/:path*", "/admin/:path*", "/doc/:path*", "/api/config/admin/:path*"] };
