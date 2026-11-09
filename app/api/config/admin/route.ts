import { ZodError } from "zod";

import {
  TOBI_CONFIG_MAX_BYTES,
  declaredBodyFits,
  hasJsonContentType,
  hasValidMutationOrigin,
  isTobiAdminAuthorized,
} from "@/lib/tobi-admin-auth";
import {
  TobiConfigVersionConflictError,
  getTobiAdminConfigSnapshot,
  saveTobiConfig,
} from "@/lib/tobi-config-store";

import { PRIVATE_HEADERS } from "@/lib/tobi-supabase";

export const dynamic = "force-dynamic";

function forbidden() {
  return Response.json({ error: "forbidden" }, { status: 403, headers: PRIVATE_HEADERS });
}

export async function GET(request: Request) {
  if (!await isTobiAdminAuthorized(request.headers)) return forbidden();
  try {
    return Response.json(await getTobiAdminConfigSnapshot(), { headers: PRIVATE_HEADERS });
  } catch {
    console.error("Admin TOBi config load failed");
    return Response.json({ error: "config_unavailable" }, { status: 503, headers: PRIVATE_HEADERS });
  }
}

export async function PUT(request: Request) {
  if (!await isTobiAdminAuthorized(request.headers)) return forbidden();
  if (!hasValidMutationOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403, headers: PRIVATE_HEADERS });
  if (!hasJsonContentType(request)) return Response.json({ error: "invalid_content_type" }, { status: 415, headers: PRIVATE_HEADERS });
  if (!declaredBodyFits(request)) return Response.json({ error: "payload_too_large" }, { status: 413, headers: PRIVATE_HEADERS });

  const rawBody = await request.text().catch(() => null);
  if (rawBody === null || new TextEncoder().encode(rawBody).byteLength > TOBI_CONFIG_MAX_BYTES) {
    return Response.json({ error: "payload_too_large" }, { status: 413, headers: PRIVATE_HEADERS });
  }
  const body = (() => { try { return JSON.parse(rawBody) as unknown; } catch { return null; } })();
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "invalid_payload" }, { status: 400, headers: PRIVATE_HEADERS });
  const candidate = body as { expectedVersion?: unknown; config?: unknown };
  if (!Number.isSafeInteger(candidate.expectedVersion) || (candidate.expectedVersion as number) < 1 || !("config" in candidate)) {
    return Response.json({ error: "invalid_payload" }, { status: 400, headers: PRIVATE_HEADERS });
  }

  try {
    const snapshot = await saveTobiConfig(candidate.config, candidate.expectedVersion as number);
    return Response.json(snapshot, { headers: PRIVATE_HEADERS });
  } catch (error) {
    if (error instanceof TobiConfigVersionConflictError) {
      return Response.json({ error: "version_conflict", current: error.current }, { status: 409, headers: PRIVATE_HEADERS });
    }
    if (error instanceof ZodError || error instanceof TypeError) {
      return Response.json({ error: "invalid_config" }, { status: 400, headers: PRIVATE_HEADERS });
    }
    console.error("Admin TOBi config save failed");
    return Response.json({ error: "config_unavailable" }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
