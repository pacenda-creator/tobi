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

export const dynamic = "force-dynamic";

function forbidden() {
  return Response.json({ error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  if (!isTobiAdminAuthorized(request.headers)) return forbidden();
  try {
    return Response.json(await getTobiAdminConfigSnapshot(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("Admin TOBi config load failed");
    return Response.json({ error: "config_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function PUT(request: Request) {
  if (!isTobiAdminAuthorized(request.headers)) return forbidden();
  if (!hasValidMutationOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  if (!hasJsonContentType(request)) return Response.json({ error: "invalid_content_type" }, { status: 415 });
  if (!declaredBodyFits(request)) return Response.json({ error: "payload_too_large" }, { status: 413 });

  const rawBody = await request.text().catch(() => null);
  if (rawBody === null || new TextEncoder().encode(rawBody).byteLength > TOBI_CONFIG_MAX_BYTES) {
    return Response.json({ error: "payload_too_large" }, { status: 413 });
  }
  const body = (() => { try { return JSON.parse(rawBody) as unknown; } catch { return null; } })();
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "invalid_payload" }, { status: 400 });
  const candidate = body as { expectedVersion?: unknown; config?: unknown };
  if (!Number.isSafeInteger(candidate.expectedVersion) || (candidate.expectedVersion as number) < 1 || !("config" in candidate)) {
    return Response.json({ error: "invalid_payload" }, { status: 400 });
  }

  try {
    const snapshot = await saveTobiConfig(candidate.config, candidate.expectedVersion as number);
    return Response.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof TobiConfigVersionConflictError) {
      return Response.json({ error: "version_conflict", current: error.current }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    if (error instanceof ZodError || error instanceof TypeError) {
      return Response.json({ error: "invalid_config" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    console.error("Admin TOBi config save failed");
    return Response.json({ error: "config_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
