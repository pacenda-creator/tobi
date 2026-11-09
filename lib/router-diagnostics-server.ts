import { conversationStateV1Schema, chatResponseV1Schema } from "./contracts/chat/v1.ts";
import type { TobiAdminConfigSnapshot } from "./tobi-config.ts";
import {
  ROUTER_IMAGE_MAX_BYTES,
  canUploadRouterPhoto,
  createRouterVisionResponse,
  routerVisionResultSchema,
} from "./router-diagnostics.ts";
import { validateRouterImage } from "./router-image-validation.ts";
import { resolveRouterVisionFixture } from "./router-vision-fixtures.ts";
import {
  OpenAiRouterVisionProvider,
  type RouterVisionProvider,
  unavailableRouterVisionResult,
} from "./router-vision-provider.ts";

type RouterAnalyzeDependencies = {
  provider?: RouterVisionProvider;
  configSnapshot?: TobiAdminConfigSnapshot;
  fixtureResolver?: (bytes: Uint8Array) => Promise<unknown>;
};

const messages = {
  unsupported_type: "Použijte fotografii JPEG, PNG nebo WebP.",
  too_large: "Fotografie je příliš velká. Maximální velikost je 6 MiB.",
  invalid_image: "Soubor není platná fotografie JPEG, PNG nebo WebP.",
  dimensions_exceeded: "Fotografie musí mít 160–4096 px na každé straně a nejvýše 16 megapixelů.",
  invalid_request: "Fotografii se nepodařilo přijmout.",
  invalid_state: "Tento krok už není aktivní. Znovu zvolte možnost přiložit router.",
  feature_disabled: "Diagnostika z fotografie teď není dostupná.",
} as const;

function errorResponse(code: keyof typeof messages, status: number) {
  return Response.json({ error: { code, message: messages[code] } }, { status, headers: { "Cache-Control": "no-store" } });
}

function isFileLike(value: FormDataEntryValue | null): value is File {
  return Boolean(value && typeof value === "object" && "arrayBuffer" in value && typeof value.arrayBuffer === "function" && "size" in value && typeof value.size === "number");
}

export async function handleRouterDiagnosticAnalyze(request: Request, dependencies: RouterAnalyzeDependencies = {}) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLocaleLowerCase("en-US").startsWith("multipart/form-data;")) return errorResponse("invalid_request", 415);
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return errorResponse("invalid_request", 403);
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > ROUTER_IMAGE_MAX_BYTES + 128 * 1024) return errorResponse("too_large", 413);

  const form = await request.formData().catch(() => null);
  if (!form || [...form.keys()].some((key) => key !== "image" && key !== "conversationState") || form.getAll("image").length !== 1 || form.getAll("conversationState").length !== 1) {
    return errorResponse("invalid_request", 400);
  }
  const file = form.get("image");
  const rawState = form.get("conversationState");
  if (!isFileLike(file) || typeof rawState !== "string") return errorResponse("invalid_request", 400);
  if (file.size > ROUTER_IMAGE_MAX_BYTES) return errorResponse("too_large", 413);
  const parsedStateJson = (() => { try { return JSON.parse(rawState) as unknown; } catch { return null; } })();
  const parsedState = conversationStateV1Schema.safeParse(parsedStateJson);
  if (!parsedState.success || !canUploadRouterPhoto(parsedState.data)) return errorResponse("invalid_state", 409);

  let configSnapshot = dependencies.configSnapshot;
  if (!configSnapshot) {
    configSnapshot = await import("./tobi-config-store.ts").then((module) => module.getTobiAdminConfigSnapshot());
  }
  if (!configSnapshot) throw new Error("router_diagnostics_config_unavailable");
  if (!configSnapshot.config.features.routerPhotoDiagnostics) return errorResponse("feature_disabled", 404);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const validated = validateRouterImage(bytes, file.type || null);
  if (!validated.ok) return errorResponse(validated.error, validated.error === "too_large" ? 413 : 400);

  const startedAt = Date.now();
  let providerResult: unknown = null;
  if (process.env.TOBI_ROUTER_VISION_FIXTURES_ENABLED === "true") {
    try {
      const fixtureCandidate = await (dependencies.fixtureResolver || resolveRouterVisionFixture)(validated.image.bytes);
      const parsedFixture = routerVisionResultSchema.safeParse(fixtureCandidate);
      if (parsedFixture.success) providerResult = parsedFixture.data;
    } catch {
      providerResult = null;
    }
  }
  if (!providerResult) {
    const provider = dependencies.provider || (process.env.OPENAI_API_KEY
      ? new OpenAiRouterVisionProvider(process.env.OPENAI_API_KEY, process.env.TOBI_ROUTER_VISION_MODEL || "gpt-4.1-mini")
      : { analyze: async () => unavailableRouterVisionResult() });
    try {
      providerResult = await provider.analyze(validated.image);
    } catch {
      providerResult = unavailableRouterVisionResult();
    }
  }
  const response = createRouterVisionResponse(providerResult, parsedState.data);
  console.info("Router image analysis completed", {
    requestId: crypto.randomUUID(),
    mime: validated.image.mime,
    sizeBucket: validated.image.bytes.length < 1_000_000 ? "lt1mb" : validated.image.bytes.length < 3_000_000 ? "1to3mb" : "3to6mb",
    outcome: response.conversationState?.stepId.startsWith("router-confirm-") ? "hypothesis" : "manual_fallback",
    latencyMs: Date.now() - startedAt,
  });
  return Response.json(chatResponseV1Schema.parse({ ...response, configVersion: configSnapshot.configVersion }), { headers: { "Cache-Control": "no-store" } });
}
