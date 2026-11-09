import { NextRequest, NextResponse } from "next/server";
import { authClient, cookieOptions, ownAuthCookie, PRIVATE_HEADERS, safeNext, type CookieWrite } from "./tobi-supabase.ts";
import { hasValidMutationOrigin } from "./tobi-admin-auth.ts";

export async function handleAuth(request: NextRequest, logout = false) {
  const writes = new Map<string, CookieWrite>();
  const extra = new Headers(PRIVATE_HEADERS);
  const finish = (response: NextResponse) => {
    extra.forEach((value, key) => response.headers.set(key, value));
    writes.forEach(({ name, value, options }) => response.cookies.set(name, value, { ...options, ...cookieOptions() }));
    return response;
  };
  const deny = (status: number) => finish(NextResponse.json({ error: "Požadavek nelze dokončit." }, { status }));
  if (!hasValidMutationOrigin(request)) return deny(403);
  const client = authClient(() => request.cookies.getAll(), (cookies, headers) => {
    cookies.forEach(cookie => writes.set(cookie.name, cookie));
    Object.entries(headers).forEach(([key, value]) => extra.set(key, value));
  });
  if (logout) {
    try { await client?.auth.signOut({ scope: "local" }); } catch { /* Local cleanup is mandatory even offline. */ }
    for (const { name } of [...request.cookies.getAll(), ...writes.values()]) {
      if (ownAuthCookie(name)) writes.set(name, { name, value: "", options: { maxAge: 0 } });
    }
    return finish(NextResponse.redirect(new URL("/login", request.url), 303));
  }
  if (!client) return deny(503);
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > 8192)) return deny(413);
  if (request.headers.get("content-type")?.split(";", 1)[0] !== "application/x-www-form-urlencoded") return deny(415);
  // Read at most 8 KiB, including chunked requests.
  const reader = request.body?.getReader();
  if (!reader) return deny(400);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); return deny(413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    chunks.forEach(chunk => { bytes.set(chunk, offset); offset += chunk.length; });
    const form = new URLSearchParams(new TextDecoder().decode(bytes));
    const email = form.get("email"); const password = form.get("password");
    if (!email || !password) return deny(400);
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) return deny(401);
    return finish(NextResponse.redirect(new URL(safeNext(form.get("next")), request.url), 303));
  } catch { return deny(401); }
}
