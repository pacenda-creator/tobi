import type { ChatRequestV1 } from "./contracts/chat/v1.ts";
import { ragModelPlanJsonSchema } from "./rag-response-plan.ts";
import { modelSupportsReasoning, modelSupportsTemperature, type TobiRuntimeConfig } from "./tobi-config.ts";
import { findKnowledge } from "./vodafone-knowledge.ts";
import { formatRetrievedContext, searchVodafoneKnowledge, type SearchResult } from "./vodafone-search.ts";

const WEB_SEARCH_DOMAINS = ["vodafone.cz", "support.apple.com", "support.google.com", "samsung.com"];
const instructionsByTone = {
  friendly: "Mluv lidsky, klidně a stručně. Bez úvodních frází a bez emoji.",
  brief: "Odpovídej velmi stručně, maximálně ve třech větách.",
  formal: "Mluv zdvořile, profesionálně a bez emoji.",
};

function safeOpenAiErrorText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return undefined;
  return value
    .replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .slice(0, maxLength);
}

export function describeOpenAiError(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("error" in payload)) return {};
  const error = payload.error;
  if (!error || typeof error !== "object") return {};
  const value = error as { type?: unknown; code?: unknown; param?: unknown; message?: unknown };
  return {
    type: safeOpenAiErrorText(value.type, 120),
    code: safeOpenAiErrorText(value.code, 120),
    param: safeOpenAiErrorText(value.param, 240),
    message: safeOpenAiErrorText(value.message, 1_000),
  };
}

export function retrieveConfiguredKnowledge(query: string, sources: TobiRuntimeConfig["sources"]) {
  return {
    retrieved: sources.localIndex ? searchVodafoneKnowledge(query, 4) : [],
    knowledge: sources.presetKnowledge ? findKnowledge(query) : null,
  };
}

export function createOpenAiRequestBody(request: ChatRequestV1, retrieved: SearchResult[], config: TobiRuntimeConfig) {
  const tone = request.preferences?.tone || "friendly";
  const localContext = retrieved.length
    ? formatRetrievedContext(retrieved)
    : "Pro tento dotaz nebyl v lokálním indexu nalezen spolehlivý podklad.";
  const body: Record<string, unknown> = {
    model: config.model,
    instructions: `${config.systemPrompt}\n\nKdyž je dotaz nejasný, nehádej řešení. Polož jednu nejdůležitější doplňující otázku. Odpovídej pouze z aktuálně povolených podkladů. Vrať pouze JSON podle dodaného schématu. Vhodně kombinuj blocks: steps, infoCard, alert, action a mediaCards. Nevytvářej HTML, CSS ani URL; odkazy a zdroje doplní server. ${instructionsByTone[tone]}\n\nAKTUÁLNĚ POVOLENÉ LOKÁLNÍ PODKLADY:\n${localContext}`,
    input: request.messages.filter((message) => message.role === "user").map((message) => ({ role: message.role, content: message.content })),
    text: { format: { type: "json_schema", name: "tobi_rag_response_plan", strict: true, schema: ragModelPlanJsonSchema } },
    max_output_tokens: config.maxOutputTokens,
  };
  if (modelSupportsReasoning(config.model) && config.reasoningEffort) body.reasoning = { effort: config.reasoningEffort };
  if (modelSupportsTemperature(config.model) && config.temperature !== null) body.temperature = config.temperature;
  if (config.sources.webSearch) {
    body.tools = [{ type: "web_search", search_context_size: "medium", filters: { allowed_domains: WEB_SEARCH_DOMAINS } }];
    body.tool_choice = retrieved.length ? "auto" : "required";
    body.include = ["web_search_call.action.sources"];
  }
  return body;
}

export function hasAllowedGenerationEvidence(localSources: SearchResult[], webSources: SearchResult[], config: TobiRuntimeConfig) {
  if (localSources.length > 0) return true;
  return config.sources.webSearch && webSources.length > 0;
}
