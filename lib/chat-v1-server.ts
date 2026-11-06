import {
  CHAT_CONTRACT_VERSION,
  chatErrorV1Schema,
  chatRequestV1Schema,
  chatResponseV1Schema,
  type ChatRequestV1,
  type FallbackV1,
  type QuickReplyV1,
  type SourceV1,
  type UiBlockV1,
} from "@/lib/contracts/chat/v1";
import type { KnowledgeCard } from "@/lib/vodafone-knowledge";
import { applyDemoScenarioTransition, findExplicitDemoScenario, instantiateDemoResponse } from "@/lib/demo-scenario-catalog";
import { orchestrateConversation } from "@/lib/conversation-orchestrator.mts";
import { parseRagModelOutput, type RagModelPlan } from "@/lib/rag-response-plan";
import { createSmartDemoResponse } from "@/lib/smart-demo-conversation";
import type { SearchResult } from "@/lib/vodafone-search";
import { getTobiAdminConfigSnapshot } from "@/lib/tobi-config-store";
import type { TobiRuntimeConfig } from "@/lib/tobi-config";
import { createOpenAiRequestBody, hasAllowedGenerationEvidence, retrieveConfiguredKnowledge } from "@/lib/tobi-runtime-policy";

type TobiEnv = Cloudflare.Env & {
  OPENAI_API_KEY?: string;
};

const CHECKED_AT = new Date().toISOString().slice(0, 10);
const SAFE_UPSTREAM_FALLBACK = "TOBi se teď nemůže spojit se službou. Zkuste to prosím za chvíli.";
const visualAssets = {
  "phone-calls": { src: "/tobi/phone-calls.svg", alt: "Telefon se symbolem hovoru" },
  "phone-data": { src: "/tobi/phone-data.svg", alt: "Telefon se symbolem mobilních dat" },
  "phone-power": { src: "/tobi/phone-power.svg", alt: "Telefon s vypnutou obrazovkou" },
  "phone-app": { src: "/tobi/phone-app.svg", alt: "Telefon s upozorněním aplikace" },
  "internet-outage": { src: "/tobi/internet-outage.svg", alt: "Dům se symbolem internetového signálu" },
  "modem-connected": { src: "/tobi/modem-connected.svg", alt: "Modem se zapojenými kabely" },
  "modem-restart": { src: "/tobi/modem-restart.svg", alt: "Restart modemu" },
} as const;


const quickReplyMessages: Record<string, string> = {
  "Ano, funguje": "Internet už funguje.",
  "Už to funguje": "Internet už funguje.",
  "Výpadek není hlášený": "Nefunguje mi pevný internet a výpadek na adrese není hlášený.",
  "Nevím, jaký internet mám": "Nevím, jaký typ pevného internetu mám a potřebuji ho poznat.",
  "Stále nefunguje": "Pevný internet stále nefunguje ani po restartu modemu.",
  "Ne, stále nefunguje": "Pevný internet stále nefunguje. Potřebuji pokračovat v diagnostice.",
  "Internet nejde na žádném zařízení": "Pevný internet po restartu nefunguje na žádném zařízení.",
  "Funguje na jiném zařízení": "Pevný internet po restartu funguje na jiném zařízení, ale ne na původním.",
  "První aktivace": "Chci poprvé aktivovat eSIM.",
  "Přesun do telefonu": "Chci přesunout eSIM do nového telefonu.",
  "Aktivace selhala": "Aktivace eSIM selhala.",
  "Najít vyúčtování": "Potřebuji najít vyúčtování v Můj Vodafone.",
  "Platba se nepropsala": "Platba vyúčtování se nepropsala.",
  "Vysvětlit částku": "Potřebuji vysvětlit částku na vyúčtování.",
  "Země v EU": "Potřebuji informace o roamingu v zemi Evropské unie.",
  "Mimo EU": "Potřebuji informace o roamingu mimo Evropskou unii.",
  "Roaming nefunguje": "Roaming v zahraničí mi nefunguje.",
  "Najít PUK": "Potřebuji najít PUK.",
  "Nastavit nový PIN": "Potřebuji nastavit nový PIN po zadání PUK.",
  "Nemohu se přihlásit": "Nemohu se přihlásit do Můj Vodafone a potřebuji PUK.",
  "Ověřit pokrytí": "Potřebuji ověřit pokrytí a řeším potíže se signálem.",
  "Jen mobilní data": "Nefungují mi mobilní data, ale volání funguje.",
  "Otevřít čerpání": "Potřebuji otevřít přehled čerpání dat.",
  "Dokoupit data": "Potřebuji dokoupit mobilní data.",
  "Vysvětlit útratu": "Potřebuji vysvětlit aktuální útratu.",
};

function responseId() {
  return `resp_${crypto.randomUUID()}`;
}

const SAFE_INTERNAL_FALLBACK_TEMPLATE = chatResponseV1Schema.parse({
  contractVersion: CHAT_CONTRACT_VERSION,
  responseId: "resp_safe_internal_fallback",
  mode: "fallback",
  text: SAFE_UPSTREAM_FALLBACK,
  blocks: [],
  quickReplies: [],
  sources: [],
  intent: { id: "unknown", label: "Potřebuji upřesnit", confidence: 0 },
  fallback: { code: "invalid_generation", retryable: true },
});

function safeInternalFallback() {
  return { ...SAFE_INTERNAL_FALLBACK_TEMPLATE, responseId: responseId() };
}

function conciseSnippet(snippet: string) {
  const clean = snippet.replace(/\s+/g, " ").replace(/\s+([,.!?;:])/g, "$1").trim();
  const sentences = clean.match(/[^.!?]+[.!?]+/g)?.slice(0, 2).join(" ").trim() || clean;
  return sentences.length > 280 ? `${sentences.slice(0, 277).trimEnd()}…` : sentences;
}

function extractOutputText(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const response = payload as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  if (response.output_text?.trim()) return response.output_text.trim();
  return response.output
    ?.flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text" && item.text)
    .map((item) => item.text?.trim())
    .filter(Boolean)
    .join("\n") || null;
}

function extractWebSources(payload: unknown) {
  if (!payload || typeof payload !== "object") return [];
  const output = (payload as { output?: unknown[] }).output;
  if (!Array.isArray(output)) return [];
  const candidates: Array<{ title: string; url: string }> = [];
  const addCandidate = (title: unknown, url: unknown) => {
    if (typeof url !== "string") return;
    try {
      candidates.push({ title: typeof title === "string" && title.trim() ? title : new URL(url).hostname, url });
    } catch { /* invalid URLs are ignored and never reach the response contract */ }
  };
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const record = item as { action?: { sources?: unknown[] }; content?: unknown[] };
    for (const source of record.action?.sources || []) {
      if (!source || typeof source !== "object") continue;
      const value = source as { title?: unknown; url?: unknown };
      addCandidate(value.title, value.url);
    }
    for (const content of record.content || []) {
      if (!content || typeof content !== "object") continue;
      const annotations = (content as { annotations?: unknown[] }).annotations;
      for (const annotation of annotations || []) {
        if (!annotation || typeof annotation !== "object") continue;
        const value = annotation as { title?: unknown; url?: unknown };
        addCandidate(value.title, value.url);
      }
    }
  }
  return candidates;
}

function quickReplyId(label: string, index: number) {
  if (label === "Ano, funguje" || label === "Už to funguje") return "internet-resolved";
  if (label === "Ne, stále nefunguje") return "internet-not-resolved";
  return `reply-${index + 1}`;
}

function toQuickReplies(labels: string[]): QuickReplyV1[] {
  return labels.map((label, index) => ({
    id: quickReplyId(label, index),
    label,
    action: {
      kind: "sendMessage",
      message: quickReplyMessages[label] || label,
    },
  }));
}

function toSources(results: Array<{ title: string; url: string }>): SourceV1[] {
  const seen = new Set<string>();
  return results
    .filter((result) => {
      if (seen.has(result.url)) return false;
      seen.add(result.url);
      return true;
    })
    .slice(0, 3)
    .map((result, index) => ({
      id: `source-${index + 1}`,
      title: result.title,
      url: result.url,
      checkedAt: CHECKED_AT,
    }));
}

function knowledgeBlocks(knowledge: KnowledgeCard, sources: SourceV1[]): UiBlockV1[] {
  const blocks: UiBlockV1[] = [
    {
      type: "steps",
      id: "answer-steps",
      title: knowledge.shortLabel,
      items: knowledge.steps.map((text, index) => ({ id: `step-${index + 1}`, text })),
    },
  ];

  if (knowledge.warning) {
    blocks.push({ type: "alert", id: "answer-warning", severity: "warning", text: knowledge.warning });
  }
  if (knowledge.actionLabel && knowledge.actionUrl) {
    blocks.push({
      type: "action",
      id: "answer-action",
      label: knowledge.actionLabel,
      action: { kind: "openUrl", url: knowledge.actionUrl, external: true },
    });
  }
  if (knowledge.mediaCards?.length) {
    blocks.push({
      type: "mediaCards",
      id: "answer-media",
      cards: knowledge.mediaCards.map((card) => ({
        id: card.id,
        title: card.title,
        description: card.description,
        image: { src: card.image, alt: card.imageAlt },
        action: card.actionLabel && card.actionUrl
          ? { label: card.actionLabel, action: { kind: "openUrl", url: card.actionUrl, external: card.external } }
          : undefined,
      })),
    });
  }
  if (sources.length) {
    blocks.push({ type: "sourceList", id: "answer-sources", sourceIds: sources.map((source) => source.id) });
  }
  return blocks;
}

function retrievedBlocks(sources: SourceV1[]): UiBlockV1[] {
  return sources.length
    ? [{ type: "sourceList", id: "answer-sources", sourceIds: sources.map((source) => source.id) }]
    : [];
}

function createKnowledgeResponse(knowledge: KnowledgeCard, text: string, mode: "preset" | "rag", retrieved: SearchResult[] = []) {
  const sources = toSources(retrieved.length
    ? retrieved
    : [{ title: knowledge.sourceTitle, url: knowledge.sourceUrl }]);
  return chatResponseV1Schema.parse({
    contractVersion: CHAT_CONTRACT_VERSION,
    responseId: responseId(),
    mode,
    text,
    blocks: knowledgeBlocks(knowledge, sources),
    quickReplies: toQuickReplies(knowledge.quickReplies),
    sources,
    intent: { id: knowledge.id, label: knowledge.label, confidence: 0.94 },
    fallback: null,
  });
}

function createRetrievedResponse(text: string, retrieved: SearchResult[], quickReplies: QuickReplyV1[] = [], cardLimit = 2) {
  const sources = toSources(retrieved);
  const primary = retrieved[0];
  return chatResponseV1Schema.parse({
    contractVersion: CHAT_CONTRACT_VERSION,
    responseId: responseId(),
    mode: "rag",
    text,
    blocks: [
      ...retrieved.slice(0, cardLimit).map((result, index) => ({
        type: "infoCard" as const,
        id: `retrieved-card-${index + 1}`,
        title: result.title.slice(0, 160),
        text: conciseSnippet(result.snippet) || "Podrobnosti najdete v uvedeném zdroji.",
      })),
      ...retrievedBlocks(sources),
    ],
    quickReplies,
    sources,
    intent: { id: "retrieved", label: primary.title, confidence: Math.min(0.91, 0.64 + primary.score / 150) },
    fallback: null,
  });
}

function retrievedVisual(title: string) {
  const value = title.toLocaleLowerCase("cs");
  if (/pin|puk|sim|blok/.test(value)) return { src: "/tobi/sim-lock.svg", alt: "SIM karta se zámkem" };
  if (/ztracen|odcizen|ukraden/.test(value)) return { src: "/tobi/phone-lost.svg", alt: "Ztracený telefon" };
  if (/telefon|mobil|vol[aá]n|sms|sign[aá]l/.test(value)) return { src: "/tobi/phone-calls.svg", alt: "Telefon a mobilní síť" };
  if (/internet|data|wi.fi/.test(value)) return { src: "/tobi/phone-data.svg", alt: "Telefon a datové připojení" };
  return { src: "/tobi/phone-app.svg", alt: "Možnost zákaznické podpory" };
}

function createRetrievedClarificationResponse(retrieved: SearchResult[]) {
  const choices = retrieved.slice(0, 4);
  const sources = toSources(choices);
  return chatResponseV1Schema.parse({
    contractVersion: CHAT_CONTRACT_VERSION,
    responseId: responseId(),
    mode: "rag",
    text: "Váš dotaz může znamenat několik různých věcí. Která možnost je nejblíž tomu, co řešíte?",
    blocks: [
      {
        type: "mediaCards",
        id: "retrieved-choices",
        cards: choices.map((result, index) => ({
          id: `retrieved-choice-${index + 1}`,
          title: result.title.slice(0, 160),
          description: "Vyberte tuto možnost, pokud odpovídá vašemu problému.",
          image: retrievedVisual(result.title),
          action: {
            label: "To je ono",
            action: { kind: "sendMessage", message: `Chci poradit k tématu: ${result.title}` },
          },
        })),
      },
      { type: "sourceList", id: "answer-sources", sourceIds: sources.map((source) => source.id) },
    ],
    quickReplies: [{ id: "describe-differently", label: "Ani jedna možnost", action: { kind: "sendMessage", message: "Ani jedna možnost neodpovídá. Popíšu problém jinak." } }],
    sources,
    intent: { id: "retrieval-clarification", label: "Upřesnění tématu", confidence: 0.56 },
    fallback: null,
  });
}

function createStructuredRagResponse(plan: RagModelPlan, retrieved: SearchResult[], knowledge?: KnowledgeCard | null) {
  const sources = toSources(retrieved);
  const blocks: UiBlockV1[] = plan.blocks.map((block, index): UiBlockV1 => {
    if (block.type === "steps") return { type: "steps", id: `rag-steps-${index + 1}`, title: block.title || undefined, items: block.items.map((text, itemIndex) => ({ id: `rag-step-${index + 1}-${itemIndex + 1}`, text })) };
    if (block.type === "alert") return { type: "alert", id: `rag-alert-${index + 1}`, severity: block.severity, title: block.title || undefined, text: block.text };
    if (block.type === "infoCard") return { type: "infoCard", id: `rag-info-${index + 1}`, title: block.title, text: block.text };
    if (block.type === "action") return { type: "action", id: `rag-action-${index + 1}`, label: block.label, action: { kind: "sendMessage", message: block.message } };
    return {
      type: "mediaCards",
      id: `rag-media-${index + 1}`,
      cards: block.cards.map((card, cardIndex) => ({
        id: `rag-media-${index + 1}-${cardIndex + 1}`,
        title: card.title,
        description: card.description,
        image: visualAssets[card.visual],
        action: card.actionLabel && card.actionMessage
          ? { label: card.actionLabel, action: { kind: "sendMessage", message: card.actionMessage } }
          : undefined,
      })),
    };
  });
  blocks.push(...retrievedBlocks(sources));
  const primary = retrieved[0];
  return chatResponseV1Schema.parse({
    contractVersion: CHAT_CONTRACT_VERSION,
    responseId: responseId(),
    mode: sources.length ? "rag" : "preset",
    text: plan.text,
    blocks,
    quickReplies: plan.quickReplies.map((reply, index) => ({ id: `rag-reply-${index + 1}`, label: reply.label, action: { kind: "sendMessage", message: reply.message } })),
    sources,
    intent: knowledge
      ? { id: knowledge.id, label: knowledge.label, confidence: 0.82 }
      : primary
        ? { id: "retrieved", label: primary.title, confidence: Math.min(0.91, 0.64 + primary.score / 150) }
        : { id: "assistant", label: "Doplňující diagnostika", confidence: 0.74 },
    fallback: null,
  });
}

function createPlainModelResponse(text: string, retrieved: SearchResult[]) {
  if (retrieved.length) return createRetrievedResponse(text, retrieved, toQuickReplies(["Upřesnit dotaz", "Položit jiný dotaz"]));
  return chatResponseV1Schema.parse({
    contractVersion: CHAT_CONTRACT_VERSION,
    responseId: responseId(),
    mode: "preset",
    text,
    blocks: [],
    quickReplies: toQuickReplies(["Upřesnit dotaz", "Položit jiný dotaz"]),
    sources: [],
    intent: { id: "assistant", label: "Konverzační odpověď", confidence: 0.7 },
    fallback: null,
  });
}

function createFallback(
  text: string,
  code: FallbackV1["code"],
  retryable: boolean,
  quickReplies: QuickReplyV1[] = [],
) {
  return chatResponseV1Schema.parse({
    contractVersion: CHAT_CONTRACT_VERSION,
    responseId: responseId(),
    mode: "fallback",
    text,
    blocks: [],
    quickReplies,
    sources: [],
    intent: { id: "unknown", label: "Potřebuji upřesnit", confidence: code === "no_match" ? 0.42 : 0 },
    fallback: { code, retryable },
  });
}

async function callOpenAi(request: ChatRequestV1, retrieved: SearchResult[], runtime: TobiEnv, config: TobiRuntimeConfig) {
  const apiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${runtime.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(createOpenAiRequestBody(request, retrieved, config)),
  });
  const payload = await apiResponse.json().catch(() => null);
  if (!apiResponse.ok) {
    console.error("OpenAI Responses API error", { status: apiResponse.status });
    return { ok: false as const, reason: "upstream_unavailable" as const };
  }
  const output = extractOutputText(payload);
  const parsed = output ? parseRagModelOutput(output) : null;
  return parsed?.plainText
    ? { ok: true as const, text: parsed.plainText, plan: parsed.plan, webSources: extractWebSources(payload) }
    : { ok: false as const, reason: "invalid_generation" as const };
}

async function handleChatV1Unsafe(httpRequest: Request) {
  const rawBody = await httpRequest.json().catch(() => null);
  const parsedRequest = chatRequestV1Schema.safeParse(rawBody);
  if (!parsedRequest.success) {
    const requestId = rawBody && typeof rawBody === "object" && "requestId" in rawBody && typeof rawBody.requestId === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(rawBody.requestId)
      ? rawBody.requestId
      : undefined;
    const error = chatErrorV1Schema.parse({
      contractVersion: CHAT_CONTRACT_VERSION,
      error: { code: "invalid_request", message: "Neplatný požadavek.", requestId },
    });
    return Response.json(error, { status: 400 });
  }

  const request = parsedRequest.data;
  const lastMessage = request.messages.at(-1)?.content || "";
  const configSnapshot = await getTobiAdminConfigSnapshot();
  const runtimeConfig = configSnapshot.config.runtime;

  if (request.transitionId && request.conversationState) {
    const transition = applyDemoScenarioTransition(request.conversationState, request.transitionId);
    if (!transition.ok) {
      const error = chatErrorV1Schema.parse({
        contractVersion: CHAT_CONTRACT_VERSION,
        error: { code: "invalid_request", message: "Tento přechod není v aktuálním kroku povolený.", requestId: request.requestId },
      });
      return Response.json(error, { status: 409 });
    }
    if (transition.kind === "step") {
      await new Promise((resolve) => setTimeout(resolve, 320));
      if (!runtimeConfig.sources.presetKnowledge) {
        return Response.json(chatResponseV1Schema.parse({ ...createFallback("Tento znalostní zdroj teď není dostupný. Zkuste prosím jiný dotaz.", "policy_blocked", false), configVersion: configSnapshot.configVersion }));
      }
      return Response.json(chatResponseV1Schema.parse({ ...instantiateDemoResponse(transition.match, transition.conversationState), configVersion: configSnapshot.configVersion }));
    }
  }

  const { retrieved, knowledge } = retrieveConfiguredKnowledge(lastMessage, runtimeConfig.sources);
  const runtime = process.env as TobiEnv;

  const genericClarification = () => createFallback(
    "Chci si být jistý, že vám poradím správně. Zkuste prosím doplnit službu nebo zařízení, kterého se dotaz týká.",
    "insufficient_context",
    false,
    toQuickReplies(["Internet a Wi‑Fi", "eSIM a SIM", "Vyúčtování", "Roaming"]),
  );

  const ragSources: SearchResult[] = retrieved.length
    ? retrieved
    : knowledge
      ? [{ title: knowledge.sourceTitle, url: knowledge.sourceUrl, snippet: knowledge.answer, updated: null, score: 100 }]
      : [];

  const aiResponse = async () => {
    if (!ragSources.length && !runtimeConfig.sources.webSearch) {
      return createFallback("Pro tento dotaz teď není povolený žádný vhodný znalostní zdroj.", "policy_blocked", false);
    }
    const generation = await callOpenAi(request, ragSources, runtime, runtimeConfig).catch(() => {
      console.error("OpenAI Responses API request failed");
      return { ok: false as const, reason: "upstream_unavailable" as const };
    });
    if (!generation.ok) return createFallback(SAFE_UPSTREAM_FALLBACK, generation.reason, true);
    const webSources: SearchResult[] = generation.webSources.map((source) => ({
      ...source,
      snippet: "Aktuální oficiální webový zdroj použitý při tvorbě odpovědi.",
      updated: null,
      score: 100,
    }));
    if (!hasAllowedGenerationEvidence(ragSources, webSources, runtimeConfig)) {
      return createFallback("Pro tento dotaz se nepodařilo získat povolený znalostní zdroj.", "policy_blocked", false);
    }
    const combinedSources = [...webSources, ...ragSources].filter((source, index, all) => all.findIndex((candidate) => candidate.url === source.url) === index);
    if (generation.plan) return createStructuredRagResponse(generation.plan, combinedSources, knowledge);
    return createPlainModelResponse(generation.text, combinedSources);
  };

  const clarification = async () => {
    if (runtime.OPENAI_API_KEY) return aiResponse();
    await new Promise((resolve) => setTimeout(resolve, 320));
    if (runtimeConfig.sources.presetKnowledge) return createSmartDemoResponse(lastMessage) || genericClarification();
    return retrieved.length ? createRetrievedClarificationResponse(retrieved) : createFallback("Pro tento dotaz teď není povolený žádný vhodný znalostní zdroj.", "policy_blocked", false);
  };

  const response = await orchestrateConversation(request, {
    explicit: runtimeConfig.sources.presetKnowledge ? findExplicitDemoScenario : () => null,
  }, {
    scenario: async (match) => {
      await new Promise((resolve) => setTimeout(resolve, 320));
      return instantiateDemoResponse(match);
    },
    clarification,
    rag: async () => {
      if (runtime.OPENAI_API_KEY) return aiResponse();
      await new Promise((resolve) => setTimeout(resolve, 420));
      const smartResponse = runtimeConfig.sources.presetKnowledge ? createSmartDemoResponse(lastMessage) : null;
      if (smartResponse) return smartResponse;
      if (knowledge) return createKnowledgeResponse(knowledge, knowledge.answer, "rag", ragSources);
      if (retrieved.length) {
        if (lastMessage.toLocaleLowerCase("cs").startsWith("chci poradit k tématu:")) {
          return createRetrievedResponse(conciseSnippet(retrieved[0].snippet), retrieved, [], 1);
        }
        return createRetrievedClarificationResponse(retrieved);
      }
      return genericClarification();
    },
  });
  return Response.json(chatResponseV1Schema.parse({ ...response, configVersion: configSnapshot.configVersion }));
}

export async function handleChatV1(httpRequest: Request) {
  try {
    return await handleChatV1Unsafe(httpRequest);
  } catch {
    console.error("Chat v1 response validation failed");
    return Response.json(safeInternalFallback(), { status: 502 });
  }
}
