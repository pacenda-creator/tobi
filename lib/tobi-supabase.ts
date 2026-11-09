import { createServerClient, type CookieOptions } from "@supabase/ssr";

export const AUTH_COOKIE = "tobi-auth";
export const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  Pragma: "no-cache", Expires: "0", Vary: "Cookie",
};
// Keep the storage key separate: ResponseCookies options.name would overwrite
// each chunk's real name and collapse tobi-auth.0/.1 into duplicate base cookies.
export function cookieOptions() { return { path: "/", sameSite: "lax" as const, httpOnly: true, secure: process.env.NODE_ENV === "production" }; }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function authConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const ids = process.env.TOBI_ADMIN_USER_IDS?.trim().split(/[,\s]+/);
  if (!url || !key || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key) || !ids?.length || ids.some(id => !uuid.test(id))) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    return { url, key, ids: new Set(ids.map(id => id.toLowerCase())) };
  } catch { return null; }
}
export type CookieWrite = { name: string; value: string; options: CookieOptions };
export function authClient(getAll: () => { name: string; value: string }[], setAll: (cookies: CookieWrite[], headers: Record<string, string>) => void) {
  const config = authConfiguration();
  if (!config) return null;
  return createServerClient(config.url, config.key, {
    cookieOptions: { name: AUTH_COOKIE, ...cookieOptions() },
    // Auth verification and token responses must never enter a shared fetch cache.
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
    cookies: { getAll, setAll },
  });
}
export function safeNext(value: unknown) { return value === "/doc" ? "/doc" : "/admin"; }
export function ownAuthCookie(name: string) { return name === AUTH_COOKIE || /^tobi-auth\.\d+$/.test(name) || /^tobi-auth-code-verifier(?:\.\d+)?$/.test(name); }
