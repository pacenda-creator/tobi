import { z } from "zod";

export const CHAT_CONTRACT_VERSION = "1" as const;

const contractIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/);
const plainTextSchema = z.string().trim().min(1);

function isAllowedHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && (url.hostname === "vodafone.cz" || url.hostname.endsWith(".vodafone.cz") || url.hostname === "tam.je");
  } catch {
    return false;
  }
}

const allowedHttpsUrlSchema = z.string().url().refine(isAllowedHttpsUrl, "URL musí používat HTTPS a povolenou doménu.");
const safeAssetUrlSchema = z.string().refine((value) => {
  if (value.startsWith("/")) {
    if (/\\|[\u0000-\u001f\u007f]|%(?:00|2e|2f|5c)/i.test(value)) return false;
    try {
      const trustedOrigin = "https://tobi.invalid";
      const normalized = new URL(value, trustedOrigin);
      return normalized.origin === trustedOrigin && normalized.pathname.startsWith("/");
    } catch {
      return false;
    }
  }
  return isAllowedHttpsUrl(value);
}, "Asset URL musí být bezpečná relativní cesta nebo povolená HTTPS URL.");

export const chatMessageV1Schema = z.object({
  id: contractIdSchema.optional(),
  role: z.enum(["user", "assistant"]),
  content: plainTextSchema.max(4_000),
}).strict();

export const chatRequestV1Schema = z.object({
  contractVersion: z.literal(CHAT_CONTRACT_VERSION),
  requestId: contractIdSchema.optional(),
  messages: z.array(chatMessageV1Schema).min(1).max(12),
  context: z.object({
    locale: z.literal("cs-CZ"),
    channel: z.literal("web"),
  }).strict(),
  preferences: z.object({
    tone: z.enum(["friendly", "brief", "formal"]),
  }).strict().optional(),
}).strict().superRefine((request, context) => {
  if (request.messages.at(-1)?.role !== "user") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["messages"],
      message: "Poslední zpráva musí být od uživatele.",
    });
  }
});

export const openUrlActionV1Schema = z.object({
  kind: z.literal("openUrl"),
  url: allowedHttpsUrlSchema,
  external: z.boolean(),
}).strict();

export const sendMessageActionV1Schema = z.object({
  kind: z.literal("sendMessage"),
  message: plainTextSchema.max(4_000),
}).strict();

export const uiActionV1Schema = z.discriminatedUnion("kind", [
  openUrlActionV1Schema,
  sendMessageActionV1Schema,
]);

export const stepsBlockV1Schema = z.object({
  type: z.literal("steps"),
  id: contractIdSchema,
  title: plainTextSchema.max(160).optional(),
  items: z.array(z.object({
    id: contractIdSchema,
    text: plainTextSchema.max(1_000),
  }).strict()).min(1).max(8),
}).strict();

export const alertBlockV1Schema = z.object({
  type: z.literal("alert"),
  id: contractIdSchema,
  severity: z.enum(["info", "warning", "error"]),
  title: plainTextSchema.max(160).optional(),
  text: plainTextSchema.max(1_000),
}).strict();

export const infoCardBlockV1Schema = z.object({
  type: z.literal("infoCard"),
  id: contractIdSchema,
  title: plainTextSchema.max(160),
  text: plainTextSchema.max(1_000),
}).strict();

export const actionBlockV1Schema = z.object({
  type: z.literal("action"),
  id: contractIdSchema,
  label: plainTextSchema.max(120),
  action: uiActionV1Schema,
}).strict();

export const mediaCardV1Schema = z.object({
  id: contractIdSchema,
  title: plainTextSchema.max(160),
  description: plainTextSchema.max(1_000),
  image: z.object({
    src: safeAssetUrlSchema,
    alt: plainTextSchema.max(300),
  }).strict(),
  action: z.object({
    label: plainTextSchema.max(120),
    action: uiActionV1Schema,
  }).strict().optional(),
}).strict();

export const mediaCardsBlockV1Schema = z.object({
  type: z.literal("mediaCards"),
  id: contractIdSchema,
  cards: z.array(mediaCardV1Schema).min(1).max(6),
}).strict();

export const sourceListBlockV1Schema = z.object({
  type: z.literal("sourceList"),
  id: contractIdSchema,
  title: plainTextSchema.max(160).optional(),
  sourceIds: z.array(contractIdSchema).min(1).max(5),
}).strict();

export const uiBlockV1Schema = z.discriminatedUnion("type", [
  stepsBlockV1Schema,
  alertBlockV1Schema,
  infoCardBlockV1Schema,
  actionBlockV1Schema,
  mediaCardsBlockV1Schema,
  sourceListBlockV1Schema,
]);

export const quickReplyV1Schema = z.object({
  id: contractIdSchema,
  label: plainTextSchema.max(120),
  action: sendMessageActionV1Schema,
}).strict();

export const sourceV1Schema = z.object({
  id: contractIdSchema,
  title: plainTextSchema.max(300),
  url: allowedHttpsUrlSchema,
  checkedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict();

export const intentV1Schema = z.object({
  id: contractIdSchema,
  label: plainTextSchema.max(200),
  confidence: z.number().min(0).max(1),
}).strict();

export const fallbackV1Schema = z.object({
  code: z.enum([
    "no_match",
    "insufficient_context",
    "upstream_unavailable",
    "invalid_generation",
    "policy_blocked",
  ]),
  retryable: z.boolean(),
}).strict();

const responseCommonV1Schema = z.object({
  contractVersion: z.literal(CHAT_CONTRACT_VERSION),
  responseId: contractIdSchema,
  text: plainTextSchema.max(2_000),
  blocks: z.array(uiBlockV1Schema).max(12),
  quickReplies: z.array(quickReplyV1Schema).max(5),
  sources: z.array(sourceV1Schema).max(5),
  intent: intentV1Schema,
}).strict();

export const chatResponseV1Schema = z.discriminatedUnion("mode", [
  responseCommonV1Schema.extend({ mode: z.literal("preset"), fallback: z.null() }),
  responseCommonV1Schema.extend({ mode: z.literal("rag"), fallback: z.null() }),
  responseCommonV1Schema.extend({ mode: z.literal("fallback"), fallback: fallbackV1Schema }),
]).superRefine((response, context) => {
  const addDuplicateIssues = (values: string[], path: string) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [path], message: `${path} musí mít unikátní ID.` });
    }
  };

  addDuplicateIssues(response.blocks.map((block) => block.id), "blocks");
  addDuplicateIssues(response.quickReplies.map((reply) => reply.id), "quickReplies");
  addDuplicateIssues(response.sources.map((source) => source.id), "sources");

  const sourceIds = new Set(response.sources.map((source) => source.id));
  const sourceLists = response.blocks.filter((block): block is z.infer<typeof sourceListBlockV1Schema> => block.type === "sourceList");
  for (const [blockIndex, block] of sourceLists.entries()) {
    if (new Set(block.sourceIds).size !== block.sourceIds.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["blocks", blockIndex, "sourceIds"], message: "sourceIds musí být unikátní." });
    }
    for (const sourceId of block.sourceIds) {
      if (!sourceIds.has(sourceId)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["blocks", blockIndex, "sourceIds"], message: `Zdroj ${sourceId} neexistuje.` });
      }
    }
  }

  if (response.mode === "rag" && (!response.sources.length || !sourceLists.length)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["sources"], message: "RAG odpověď musí obsahovat zdroje a sourceList." });
  }
  if (response.mode === "fallback" && (response.sources.length || sourceLists.length)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["sources"], message: "Fallback nesmí obsahovat zdroje ani sourceList." });
  }
});

export const chatErrorV1Schema = z.object({
  contractVersion: z.literal(CHAT_CONTRACT_VERSION),
  error: z.object({
    code: z.literal("invalid_request"),
    message: z.literal("Neplatný požadavek."),
    requestId: contractIdSchema.optional(),
  }).strict(),
}).strict();

export function salvageChatResponseTextV1(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const text = "text" in payload ? payload.text : null;
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  return trimmed.length >= 1 && trimmed.length <= 2_000 ? trimmed : null;
}

export type ChatRequestV1 = z.infer<typeof chatRequestV1Schema>;
export type ChatResponseV1 = z.infer<typeof chatResponseV1Schema>;
export type UiBlockV1 = z.infer<typeof uiBlockV1Schema>;
export type QuickReplyV1 = z.infer<typeof quickReplyV1Schema>;
export type SourceV1 = z.infer<typeof sourceV1Schema>;
export type IntentV1 = z.infer<typeof intentV1Schema>;
export type FallbackV1 = z.infer<typeof fallbackV1Schema>;
export type MediaCardV1 = z.infer<typeof mediaCardV1Schema>;
