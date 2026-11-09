// BLOCKED: no server-verified identity/session provider has been approved.
// Unsigned Sites headers, allowlists and development cookies cannot authenticate.
export function isTobiAdminAuthorized(headers: Headers): boolean {
  void headers;
  return false;
}

export function hasValidMutationOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
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
