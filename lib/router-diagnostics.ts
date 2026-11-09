import { z } from "zod";

import {
  CHAT_CONTRACT_VERSION,
  chatResponseV1Schema,
  conversationStateV1Schema,
  type ChatResponseV1,
  type ConversationStateV1,
  type UiBlockV1,
} from "./contracts/chat/v1.ts";

export const ROUTER_DIAGNOSTICS_SCENARIO_ID = "router-photo-diagnostics" as const;
export const ROUTER_UPLOAD_PURPOSE = "router-diagnostics-v1" as const;
export const ROUTER_IMAGE_MAX_BYTES = 6 * 1024 * 1024;
export const ROUTER_IMAGE_MIN_SIDE = 160;
export const ROUTER_IMAGE_MAX_SIDE = 4096;
export const ROUTER_IMAGE_MAX_PIXELS = 16_000_000;

export const routerModelIds = [
  "vodafone-station-wifi6",
  "vodafone-station-fibre",
  "compal-ch7465-white",
  "compal-ch7465-black",
  "technicolor-tc7200",
  "ubee-evw3226",
  "fritzbox-6690",
] as const;

export type RouterModelId = typeof routerModelIds[number];
export type RouterCaseId = "normal" | "power-off" | "connection-off" | "starting";

type RouterCatalogEntry = {
  id: RouterModelId;
  label: string;
  description: string;
  selectionMessage: string;
  connectionIndicator: "internet" | "online";
  sourceUrl: string;
  image: string;
  imageAlt: string;
};

export const routerDiagnosticsCatalog: readonly RouterCatalogEntry[] = [
  { id: "vodafone-station-wifi6", label: "Vodafone Station Wi-Fi 6", description: "Kabelový modem", selectionMessage: "Mám Vodafone Station Wi-Fi 6.", connectionIndicator: "internet", sourceUrl: "https://www.vodafone.cz/pece/internet-data/kabelovy-internet/vodafone-station-wifi6-tg6442/", image: "/tobi/routers/vodafone-station-wifi6.png", imageAlt: "Vodafone Station Wi-Fi 6 z bočního pohledu" },
  { id: "vodafone-station-fibre", label: "Vodafone Station Fibre", description: "Optický modem", selectionMessage: "Mám Vodafone Station Fibre.", connectionIndicator: "internet", sourceUrl: "https://www.vodafone.cz/pece/internet-data/internet-fibre/vodafone-station-fibre/", image: "/tobi/routers/vodafone-station-fibre.png", imageAlt: "Modem Vodafone Station Fibre" },
  { id: "compal-ch7465-white", label: "Compal CH7465 bílý", description: "Bílý kabelový modem", selectionMessage: "Mám bílý Compal CH7465.", connectionIndicator: "online", sourceUrl: "https://www.vodafone.cz/pece/internet-data/datova-zarizeni/compal-ch7465lg/", image: "/tobi/routers/compal-ch7465-white.png", imageAlt: "Bílý modem Compal CH7465" },
  { id: "compal-ch7465-black", label: "Compal CH7465 černý", description: "Černý kabelový modem", selectionMessage: "Mám černý Compal CH7465.", connectionIndicator: "online", sourceUrl: "https://www.vodafone.cz/pece/internet-data/datova-zarizeni/compal-ch7465vf/", image: "/tobi/routers/compal-ch7465-black.png", imageAlt: "Černý modem Compal CH7465" },
  { id: "technicolor-tc7200", label: "Technicolor TC7200", description: "Černý kabelový modem", selectionMessage: "Mám Technicolor TC7200.", connectionIndicator: "online", sourceUrl: "https://www.vodafone.cz/pece/internet-data/datova-zarizeni/technicolor-tc7200/", image: "/tobi/routers/technicolor-tc7200.png", imageAlt: "Černý modem Technicolor TC7200" },
  { id: "ubee-evw3226", label: "Ubee EVW3226", description: "Černý kabelový modem", selectionMessage: "Mám Ubee EVW3226.", connectionIndicator: "online", sourceUrl: "https://www.vodafone.cz/pece/internet-data/datova-zarizeni/ubee-evw3226/", image: "/tobi/routers/ubee-evw3226.png", imageAlt: "Černý modem Ubee EVW3226" },
  { id: "fritzbox-6690", label: "FRITZ!Box 6690 Wi-Fi 6", description: "Bílý modem s červenými prvky", selectionMessage: "Mám FRITZ!Box 6690 Wi-Fi 6.", connectionIndicator: "internet", sourceUrl: "https://www.vodafone.cz/pece/internet-data/kabelovy-internet/fritzbox-6690/", image: "/tobi/routers/fritzbox-6690.jpg", imageAlt: "Bílý modem FRITZ!Box 6690 s červenými prvky" },
] as const;

const indicatorSchema = z.enum(["power", "internet", "online", "wifi"]);
const observedStateSchema = z.enum(["off", "solid", "blinking", "unknown"]);

export const routerVisionResultSchema = z.object({
  schemaVersion: z.literal("1"),
  routerModelId: z.enum(routerModelIds).nullable(),
  observations: z.array(z.object({ indicator: indicatorSchema, state: observedStateSchema }).strict()).max(8),
  confidence: z.number().min(0).max(1),
  imageQuality: z.enum(["readable", "blurry", "missing_indicators", "unknown"]),
  unknownReason: z.enum(["unsupported_model", "unreadable", "missing_indicators", "invalid_output"]).nullable(),
}).strict().superRefine((value, context) => {
  const indicators = value.observations.map((observation) => observation.indicator);
  if (new Set(indicators).size !== indicators.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["observations"], message: "Kontrolky musí být unikátní." });
  if (!value.routerModelId && !value.unknownReason) context.addIssue({ code: z.ZodIssueCode.custom, path: ["unknownReason"], message: "Neznámý model vyžaduje důvod." });
});

export type RouterVisionResult = z.infer<typeof routerVisionResultSchema>;

function responseId() { return `router_${crypto.randomUUID()}`; }
function modelById(modelId: RouterModelId) { return routerDiagnosticsCatalog.find((candidate) => candidate.id === modelId)!; }

function state(stepId: string, allowedTransitionIds: string[], choices: ConversationStateV1["choices"] = []): ConversationStateV1 {
  return conversationStateV1Schema.parse({ scenarioId: ROUTER_DIAGNOSTICS_SCENARIO_ID, stepId, choices, allowedTransitionIds });
}

function presetResponse(input: { text: string; blocks: UiBlockV1[]; quickReplies: ChatResponseV1["quickReplies"]; quickReplyPrompt?: string; conversationState?: ConversationStateV1 | null; intentLabel?: string }): ChatResponseV1 {
  return chatResponseV1Schema.parse({
    contractVersion: CHAT_CONTRACT_VERSION,
    responseId: responseId(),
    mode: "preset",
    text: input.text,
    blocks: input.blocks,
    quickReplies: input.quickReplies,
    quickReplyPrompt: input.quickReplyPrompt,
    sources: [],
    intent: { id: "router-diagnostics", label: input.intentLabel || "Diagnostika routeru", confidence: 1 },
    conversationState: input.conversationState,
    fallback: null,
  });
}

function safeObservationSummary(result: RouterVisionResult, model: RouterCatalogEntry) {
  const labels = { power: "napájení", internet: "internet", online: "online", wifi: "Wi-Fi" } as const;
  const states = { solid: "zřejmě svítí", off: "vypadá zhasnutá" } as const;
  return result.observations
    .filter((observation): observation is typeof observation & { state: "solid" | "off" } => observation.state === "solid" || observation.state === "off")
    .filter((observation) => observation.indicator === "power" || observation.indicator === model.connectionIndicator || observation.indicator === "wifi")
    .map((observation) => `${labels[observation.indicator]} ${states[observation.state]}`);
}

function caseFromResult(result: RouterVisionResult, model: RouterCatalogEntry): RouterCaseId | null {
  const observations = new Map(result.observations.map((observation) => [observation.indicator, observation.state]));
  if (observations.get("power") === "off") return "power-off";
  if (observations.get(model.connectionIndicator) === "off") return "connection-off";
  if (observations.get(model.connectionIndicator) === "solid") return "normal";
  return null;
}

function analyzedChoice(fromStepId: string, toStepId: string): ConversationStateV1["choices"] {
  return [{ transitionId: "router-upload-analyzed", fromStepId, toStepId }];
}

export function createRouterVisionResponse(resultInput: unknown, fromState: ConversationStateV1): ChatResponseV1 {
  const parsed = routerVisionResultSchema.safeParse(resultInput);
  if (!parsed.success) return createManualModelResponse("invalid_output", fromState.stepId);
  const result = parsed.data;
  if (!result.routerModelId || result.confidence < 0.65 || result.imageQuality !== "readable" || result.unknownReason) {
    return createManualModelResponse(result.unknownReason || (result.imageQuality === "blurry" ? "unreadable" : "missing_indicators"), fromState.stepId);
  }
  const model = modelById(result.routerModelId);
  const caseId = caseFromResult(result, model);
  const summary = safeObservationSummary(result, model);
  if (!caseId || !summary.length) return createManualModelResponse("missing_indicators", fromState.stepId);
  const stepId = `router-confirm-${model.id}-${caseId}`;
  return presetResponse({
    text: `Router pravděpodobně připomíná ${model.label}. Z fotografie ale nelze stav připojení potvrdit s jistotou.`,
    blocks: [
      { type: "infoCard", id: "router-hypothesis", title: "Co na fotografii pravděpodobně vidím", text: `${model.label}: ${summary.join(", ")}.` },
      { type: "alert", id: "router-verify", severity: "info", title: "Ověřte to přímo na routeru", text: "Podívejte se prosím na kontrolky přímo. Z jedné fotografie neumím spolehlivě poznat blikání a kontrolka mimo záběr neznamená, že nesvítí." },
    ],
    quickReplyPrompt: "Odpovídá to tomu, co vidíte přímo na routeru?",
    quickReplies: [
      { id: "router-confirm-yes", label: "Ano, odpovídá", action: { kind: "sendMessage", message: "Model a kontrolky odpovídají.", transitionId: "router-confirm-yes" } },
      { id: "router-confirm-correct", label: "Opravit údaje", action: { kind: "sendMessage", message: "Chci opravit model nebo stav kontrolek.", transitionId: "router-confirm-correct" } },
    ],
    conversationState: state(stepId, ["router-confirm-yes", "router-confirm-correct"], analyzedChoice(fromState.stepId, stepId)),
  });
}

const unknownCopy = {
  unsupported_model: "Z fotky model nepoznám.",
  unreadable: "Fotka je příliš rozmazaná.",
  missing_indicators: "Na fotce kontrolky dobře nevidím.",
  invalid_output: "Fotku se nepodařilo zpracovat.",
} as const;

export function createManualModelResponse(reason: RouterVisionResult["unknownReason"] = "unreadable", fromStepId = "photo-offer"): ChatResponseV1 {
  const allowed = [...routerDiagnosticsCatalog.map((model) => `router-model-${model.id}`), "router-skip-text"];
  const stepId = "router-manual-model";
  const blocks: UiBlockV1[] = [
    {
      type: "mediaCards",
      id: "router-model-selection",
      presentation: "selection",
      cards: routerDiagnosticsCatalog.map((model) => ({
        id: `select-${model.id}`,
        title: model.label,
        description: model.description,
        image: { src: model.image, alt: model.imageAlt },
        action: { label: "To je můj modem", action: { kind: "sendMessage", message: model.selectionMessage, transitionId: `router-model-${model.id}` } },
      })),
    },
  ];
  const text = fromStepId.startsWith("router-confirm-")
    ? "Který modem máte doma?"
    : `${unknownCopy[reason || "unreadable"]} Který modem máte doma?`;
  return presetResponse({
    text,
    blocks,
    quickReplies: [
      { id: "router-skip-text", label: "Jiný model / nevím", action: { kind: "sendMessage", message: "Mám jiný modem nebo si nejsem jistý.", transitionId: "router-skip-text" } },
      { id: "router-another-photo", label: "Přidat jinou fotku", action: { kind: "requestUpload", purpose: ROUTER_UPLOAD_PURPOSE } },
    ],
    conversationState: state(stepId, allowed, analyzedChoice(fromStepId, stepId)),
  });
}

function createManualIndicatorResponse(modelId: RouterModelId, previous: ConversationStateV1): ChatResponseV1 {
  const model = modelById(modelId);
  const stepId = `router-manual-indicator-${model.id}`;
  const labels = [["solid", "Svítí"], ["off", "Nesvítí"], ["blinking", "Bliká"], ["unknown", "Nevím"]] as const;
  return presetResponse({
    text: `Podívejte se přímo na router ${model.label}. Jak se chová kontrolka ${model.connectionIndicator === "online" ? "Online" : "Internet"}?`,
    blocks: labels.map(([value, label]) => ({ type: "action" as const, id: `indicator-${value}`, label, action: { kind: "sendMessage" as const, message: `Kontrolka ${model.connectionIndicator} ${label.toLocaleLowerCase("cs")}.`, transitionId: `router-indicator-${value}` } })),
    quickReplies: [],
    conversationState: state(stepId, labels.map(([value]) => `router-indicator-${value}`), [...previous.choices, { transitionId: `router-model-${model.id}`, fromStepId: previous.stepId, toStepId: stepId }]),
  });
}

function adviceFor(caseId: RouterCaseId) {
  if (caseId === "power-off") return { title: "Zkontrolujte napájení", steps: ["Zkontrolujte, že je napájecí adaptér zasunutý v routeru i v zásuvce.", "Pokud má router vypínač, ověřte, že je zapnutý.", "Po zapnutí vyčkejte přibližně 5 minut."], image: "/tobi/modem-connected.svg" };
  if (caseId === "connection-off") return { title: "Zkontrolujte připojení a restartujte router", steps: ["Vizuálně zkontrolujte oba konce datového kabelu. Konektory nerozebírejte.", "Odpojte pouze napájecí kabel routeru na 1 minutu a znovu ho zapojte.", "Vyčkejte přibližně 5 minut. Nemačkejte tlačítko Reset."], image: "/tobi/modem-restart.svg" };
  if (caseId === "starting") return { title: "Počkejte na dokončení připojení", steps: ["Nechte router zapnutý přibližně 5 minut.", "Pak znovu zkontrolujte kontrolku Internet nebo Online.", "Pokud stále bliká, pokračujte obecnou diagnostikou nebo požádejte o pomoc."], image: "/tobi/modem-connected.svg" };
  return { title: "Ověřte Wi-Fi a další zařízení", steps: ["Zkontrolujte, že je na routeru zapnutá Wi-Fi.", "Vyzkoušejte připojení na jiném zařízení.", "Pokud jiné zařízení funguje, problém bude pravděpodobně v původním zařízení, ne v routeru."], image: "/tobi/modem-connected.svg" };
}

function createAdviceResponse(modelId: RouterModelId, caseId: RouterCaseId, previous: ConversationStateV1): ChatResponseV1 {
  const model = modelById(modelId);
  const advice = adviceFor(caseId);
  const stepId = `router-advice-${model.id}-${caseId}`;
  return presetResponse({
    text: `Děkuji za potvrzení. Pro ${model.label} zkuste tento bezpečný postup.`,
    blocks: [
      { type: "steps", id: "router-advice-steps", title: advice.title, items: advice.steps.map((text, index) => ({ id: `router-step-${index + 1}`, text })) },
      { type: "alert", id: "router-no-reset", severity: "warning", text: "Použijte pouze běžné vypnutí a zapnutí napájení. Nemačkejte tlačítko Reset a zařízení neotevírejte." },
      { type: "mediaCards", id: "router-advice-media", cards: [{ id: "router-model-card", title: model.label, description: advice.title, image: { src: advice.image, alt: model.imageAlt } }] },
    ],
    quickReplyPrompt: "Pomohlo to?",
    quickReplies: [
      { id: "router-helped", label: "Ano, internet funguje", action: { kind: "sendMessage", message: "Internet už funguje.", transitionId: "router-helped" } },
      { id: "router-not-helped", label: "Ne, stále nefunguje", action: { kind: "sendMessage", message: "Internet stále nefunguje.", transitionId: "router-not-helped" } },
    ],
    conversationState: state(stepId, ["router-helped", "router-not-helped"], [...previous.choices, { transitionId: previous.stepId.startsWith("router-confirm-") ? "router-confirm-yes" : `router-indicator-${caseId === "normal" ? "solid" : caseId === "starting" ? "blinking" : "off"}`, fromStepId: previous.stepId, toStepId: stepId }]),
  });
}

function createTextFallbackResponse(previous: ConversationStateV1): ChatResponseV1 {
  const stepId = "router-text-fallback";
  return presetResponse({
    text: "Dobře, pokračujme bez fotografie. Zkuste nejdřív tyto obecné a bezpečné kroky.",
    blocks: [{ type: "steps", id: "router-text-steps", title: "Kontrola pevného internetu", items: [
      { id: "router-text-1", text: "Ověřte, zda není na vaší adrese hlášený výpadek." },
      { id: "router-text-2", text: "Vizuálně zkontrolujte napájecí a datový kabel." },
      { id: "router-text-3", text: "Odpojte napájení routeru na 1 minutu, znovu ho zapojte a vyčkejte 5 minut. Nemačkejte Reset." },
    ] }],
    quickReplyPrompt: "Pomohlo to?",
    quickReplies: [
      { id: "router-helped", label: "Ano, internet funguje", action: { kind: "sendMessage", message: "Internet už funguje.", transitionId: "router-helped" } },
      { id: "router-not-helped", label: "Ne, stále nefunguje", action: { kind: "sendMessage", message: "Internet stále nefunguje.", transitionId: "router-not-helped" } },
    ],
    conversationState: state(stepId, ["router-helped", "router-not-helped"], [...previous.choices, { transitionId: "router-skip-text", fromStepId: previous.stepId, toStepId: stepId }]),
  });
}

function createResolvedResponse(): ChatResponseV1 {
  return presetResponse({ text: "Skvělé, internet už funguje. Diagnostika je dokončená.", blocks: [], quickReplies: [], conversationState: null, intentLabel: "Internet funguje" });
}

function createNotHelpedResponse(previous: ConversationStateV1): ChatResponseV1 {
  const stepId = "router-retry";
  return presetResponse({
    text: "Mrzí mě, že internet stále nefunguje. Můžete zkusit jinou fotografii nebo požádat o pomoc operátora.",
    blocks: [{ type: "alert", id: "router-unresolved", severity: "info", text: "Fotografie je pouze pomůcka. Neznamená přímý důkaz výpadku ani přístup TOBiho k routeru nebo síti." }],
    quickReplies: [
      { id: "router-retry-photo", label: "Vybrat jinou fotografii", action: { kind: "requestUpload", purpose: ROUTER_UPLOAD_PURPOSE } },
      { id: "router-operator", label: "Požádat operátora", action: { kind: "sendMessage", message: "Chci mluvit s operátorem." } },
    ],
    conversationState: state(stepId, [], [...previous.choices, { transitionId: "router-not-helped", fromStepId: previous.stepId, toStepId: stepId }]),
  });
}

function expectedTransitions(stepId: string) {
  if (stepId.startsWith("router-confirm-")) return ["router-confirm-yes", "router-confirm-correct"];
  if (stepId === "router-manual-model") return [...routerDiagnosticsCatalog.map((model) => `router-model-${model.id}`), "router-skip-text"];
  if (stepId.startsWith("router-manual-indicator-")) return ["router-indicator-solid", "router-indicator-off", "router-indicator-blinking", "router-indicator-unknown"];
  if (stepId.startsWith("router-advice-") || stepId === "router-text-fallback") return ["router-helped", "router-not-helped"];
  if (stepId === "router-retry") return [];
  return null;
}

export function isValidRouterDiagnosticState(input: unknown): input is ConversationStateV1 {
  const parsed = conversationStateV1Schema.safeParse(input);
  if (!parsed.success || parsed.data.scenarioId !== ROUTER_DIAGNOSTICS_SCENARIO_ID) return false;
  const expected = expectedTransitions(parsed.data.stepId);
  if (!expected || expected.length !== parsed.data.allowedTransitionIds.length) return false;
  return expected.every((transitionId, index) => parsed.data.allowedTransitionIds[index] === transitionId);
}

export function canUploadRouterPhoto(input: unknown) {
  const parsed = conversationStateV1Schema.safeParse(input);
  if (!parsed.success) return false;
  if (parsed.data.scenarioId === "demo-internet") return parsed.data.stepId === "photo-offer" && parsed.data.allowedTransitionIds.length === 1 && parsed.data.allowedTransitionIds[0] === "internet-photo-skip";
  return isValidRouterDiagnosticState(parsed.data) && (parsed.data.stepId === "router-manual-model" || parsed.data.stepId === "router-retry");
}

function parseModelCase(stepId: string, kind: "confirm" | "advice") {
  for (const model of routerDiagnosticsCatalog) {
    const prefix = `router-${kind}-${model.id}-`;
    if (!stepId.startsWith(prefix)) continue;
    const caseId = stepId.slice(prefix.length);
    if (["normal", "power-off", "connection-off", "starting"].includes(caseId)) return { modelId: model.id, caseId: caseId as RouterCaseId };
  }
  return null;
}

export type RouterDiagnosticTransitionResult = { ok: true; response: ChatResponseV1 } | { ok: false };

export function applyRouterDiagnosticTransition(currentInput: unknown, transitionId: string): RouterDiagnosticTransitionResult {
  if (!isValidRouterDiagnosticState(currentInput)) return { ok: false };
  const current = currentInput;
  if (!current.allowedTransitionIds.includes(transitionId)) return { ok: false };
  const confirm = parseModelCase(current.stepId, "confirm");
  if (confirm) {
    if (transitionId === "router-confirm-correct") return { ok: true, response: createManualModelResponse("missing_indicators", current.stepId) };
    if (transitionId === "router-confirm-yes") return { ok: true, response: createAdviceResponse(confirm.modelId, confirm.caseId, current) };
    return { ok: false };
  }
  if (current.stepId === "router-manual-model") {
    if (transitionId === "router-skip-text") return { ok: true, response: createTextFallbackResponse(current) };
    const modelId = transitionId.replace(/^router-model-/, "") as RouterModelId;
    if (!routerModelIds.includes(modelId)) return { ok: false };
    return { ok: true, response: createManualIndicatorResponse(modelId, current) };
  }
  if (current.stepId.startsWith("router-manual-indicator-")) {
    const modelId = current.stepId.replace("router-manual-indicator-", "") as RouterModelId;
    if (!routerModelIds.includes(modelId)) return { ok: false };
    const selected = transitionId.replace("router-indicator-", "");
    if (selected === "unknown") return { ok: true, response: createTextFallbackResponse(current) };
    const caseId: RouterCaseId = selected === "solid" ? "normal" : selected === "blinking" ? "starting" : "connection-off";
    return { ok: true, response: createAdviceResponse(modelId, caseId, current) };
  }
  if (parseModelCase(current.stepId, "advice") || current.stepId === "router-text-fallback") {
    if (transitionId === "router-helped") return { ok: true, response: createResolvedResponse() };
    if (transitionId === "router-not-helped") return { ok: true, response: createNotHelpedResponse(current) };
  }
  return { ok: false };
}
