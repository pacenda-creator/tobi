import { authClient, authConfiguration } from "./tobi-supabase.ts";

// Only the current Auth server response grants access. Headers and metadata do not.
export async function isTobiAdminAuthorized(headers?: Headers): Promise<boolean> {
  void headers;
  const config = authConfiguration();
  if (!config) return false;
  try {
    const { cookies } = await import("next/headers");
    const jar = await cookies();
    // Route Handlers can persist a late refresh; Components rely on proxy.
    // Every private response already carries the SSR cache headers.
    const client = authClient(() => jar.getAll(), (writes) => {
      try { writes.forEach(({ name, value, options }) => jar.set(name, value, options)); }
      catch { /* Server Components cannot write cookies. */ }
    });
    if (!client) return false;
    const { data, error } = await client.auth.getUser();
    return !error && typeof data.user?.id === "string" && config.ids.has(data.user.id.toLowerCase());
  } catch { return false; }
}

export function hasValidMutationOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export const TOBI_CONFIG_MAX_BYTES = 128 * 1024;

export function hasJsonContentType(request: Request) {
  return request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLocaleLowerCase("en-US") === "application/json";
}

export function declaredBodyFits(request: Request) {
  const value = request.headers.get("content-length");
  if (!value) return true;
  const length = Number(value);
  return Number.isSafeInteger(length) && length >= 0 && length <= TOBI_CONFIG_MAX_BYTES;
}
