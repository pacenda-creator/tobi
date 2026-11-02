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
import { findKnowledge, type KnowledgeCard } from "@/lib/vodafone-knowledge";
import { formatRetrievedContext, searchVodafoneKnowledge, type SearchResult } from "@/lib/vodafone-search";

type TobiEnv = Cloudflare.Env & {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
};

const CHECKED_AT = "2026-10-30";
const SAFE_UPSTREAM_FALLBACK = "TOBi se teď nemůže spojit se službou. Zkuste to prosím za chvíli.";

const instructionsByTone = {
  friendly: "Mluv lidsky, klidně a stručně. Bez úvodních frází a bez emoji.",
  brief: "Odpovídej velmi stručně, maximálně ve třech větách.",
  formal: "Mluv zdvořile, profesionálně a bez emoji.",
};

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
  const clean = snippet.replace(/\s+/g, " ").trim();
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

function createRetrievedResponse(text: string, retrieved: SearchResult[]) {
  const sources = toSources(retrieved);
  const primary = retrieved[0];
  return chatResponseV1Schema.parse({
    contractVersion: CHAT_CONTRACT_VERSION,
    responseId: responseId(),
    mode: "rag",
    text,
    blocks: retrievedBlocks(sources),
    quickReplies: [],
    sources,
    intent: { id: "retrieved", label: primary.title, confidence: Math.min(0.91, 0.64 + primary.score / 150) },
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

async function callOpenAi(request: ChatRequestV1, retrieved: SearchResult[], runtime: TobiEnv) {
  const tone = request.preferences?.tone || "friendly";
  const apiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${runtime.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: runtime.OPENAI_MODEL || "gpt-6-astra",
      instructions: `Jsi TOBi, AI asistent Vodafonu v českém prototypu. Odpověz rovnou na dotaz; nepiš „Rozumím“, „Jasně“, „Na Vodafone.cz jsem našel“ ani podobný úvod. Potvrzení záměru použij jen tehdy, když je dotaz nejasný nebo by chybný výklad mohl zákazníkovi uškodit. Odpovídej pouze z dohledaných zdrojů níže; pokud podklad nestačí, přiznej nejistotu a polož jednu konkrétní doplňující otázku. Nikdy nevymýšlej stav účtu, služby, cenu ani výpadek. Nikdy nežádej PIN, PUK, heslo, celé číslo karty ani QR kód eSIM. Dej jeden další krok, nejvýše tři krátké věty. ${instructionsByTone[tone]}\n\nDOHLEDANÉ ZDROJE Z VODAFONE.CZ:\n${formatRetrievedContext(retrieved)}`,
      input: request.messages.map((message) => ({ role: message.role, content: message.content })),
      max_output_tokens: 220,
    }),
  });
  const payload = await apiResponse.json().catch(() => null);
  if (!apiResponse.ok) {
    console.error("OpenAI Responses API error", { status: apiResponse.status });
    return { ok: false as const, reason: "upstream_unavailable" as const };
  }
  const text = extractOutputText(payload);
  return text
    ? { ok: true as const, text }
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
  const retrieved = searchVodafoneKnowledge(lastMessage, 4);
  const knowledge = findKnowledge(lastMessage);
  const runtime = process.env as TobiEnv;

  if (knowledge?.id === "internet") {
    await new Promise((resolve) => setTimeout(resolve, 320));
    return Response.json(createKnowledgeResponse(knowledge, knowledge.answer, "preset"));
  }

  if (!runtime.OPENAI_API_KEY) {
    await new Promise((resolve) => setTimeout(resolve, 520));
    if (knowledge) return Response.json(createKnowledgeResponse(knowledge, knowledge.answer, "preset"));
    if (retrieved.length) return Response.json(createRetrievedResponse(conciseSnippet(retrieved[0].snippet), retrieved));
    return Response.json(createFallback(
      "Chci si být jistý, že vám poradím správně. Zkuste prosím doplnit službu nebo zařízení, kterého se dotaz týká.",
      "no_match",
      false,
      toQuickReplies(["Internet a Wi‑Fi", "eSIM a SIM", "Vyúčtování", "Roaming"]),
    ));
  }

  if (!retrieved.length && !knowledge) {
    return Response.json(createFallback(
      "Chci si být jistý, že vám poradím správně. Zkuste prosím doplnit službu nebo zařízení, kterého se dotaz týká.",
      "insufficient_context",
      false,
      toQuickReplies(["Internet a Wi‑Fi", "eSIM a SIM", "Vyúčtování", "Roaming"]),
    ));
  }

  const ragSources = retrieved.length
    ? retrieved
    : [{ title: knowledge!.sourceTitle, url: knowledge!.sourceUrl, snippet: knowledge!.answer, updated: null, score: 100 }];
  const generation = await callOpenAi(request, ragSources, runtime).catch(() => {
    console.error("OpenAI Responses API request failed");
    return { ok: false as const, reason: "upstream_unavailable" as const };
  });
  if (!generation.ok) {
    return Response.json(createFallback(SAFE_UPSTREAM_FALLBACK, generation.reason, true), { status: 502 });
  }
  return Response.json(knowledge
    ? createKnowledgeResponse(knowledge, generation.text, "rag", ragSources)
    : createRetrievedResponse(generation.text, ragSources));
}

export async function handleChatV1(httpRequest: Request) {
  try {
    return await handleChatV1Unsafe(httpRequest);
  } catch {
    console.error("Chat v1 response validation failed");
    return Response.json(safeInternalFallback(), { status: 502 });
  }
}
