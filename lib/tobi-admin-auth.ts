const USER_ID_HEADER = "oai-authenticated-user-id";
const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const LOCAL_COOKIE = "tobi-local-admin-token";

function csvSet(value: string | undefined, normalize: (item: string) => string) {
  return new Set((value || "").split(",").map((item) => normalize(item.trim())).filter(Boolean));
}

function constantTimeEqual(left: string, right: string) {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  return mismatch === 0;
}

function cookieValue(cookieHeader: string | null, name: string) {
  return cookieHeader?.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1) || null;
}

function isLoopbackHost(host: string) {
  const hostname = (host.startsWith("[") ? host.slice(1, host.indexOf("]")) : host.split(":")[0])?.toLocaleLowerCase("en-US");
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function isTobiAdminAuthorized(headers: Headers) {
  const ids = csvSet(process.env.TOBI_ADMIN_IDS, (value) => value);
  const emails = csvSet(process.env.TOBI_ADMIN_EMAILS, (value) => value.toLocaleLowerCase("en-US"));
  const userId = headers.get(USER_ID_HEADER);
  const email = headers.get(USER_EMAIL_HEADER)?.toLocaleLowerCase("en-US");
  if (userId && email && (ids.has(userId) || emails.has(email))) return true;

  const localToken = process.env.TOBI_LOCAL_ADMIN_TOKEN;
  if (process.env.NODE_ENV === "production" || !localToken || !isLoopbackHost(headers.get("host") || "")) return false;
  const supplied = cookieValue(headers.get("cookie"), LOCAL_COOKIE);
  return Boolean(supplied && constantTimeEqual(supplied, localToken));
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
