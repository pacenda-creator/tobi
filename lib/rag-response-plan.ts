import { z } from "zod";

const plainText = z.string().trim().min(1);
const safeText = (max: number) => plainText.max(max).refine((value) => !/<\/?[a-z][^>]*>/i.test(value) && !/[{}]\s*[^{}]*:[^{}]*[{}]/.test(value), "HTML ani CSS nejsou povolené.");

const ragStepsBlockSchema = z.object({
  type: z.literal("steps"),
  title: safeText(160).nullable(),
  items: z.array(safeText(1_000)).min(1).max(6),
}).strict();

const ragAlertBlockSchema = z.object({
  type: z.literal("alert"),
  severity: z.enum(["info", "warning", "error"]),
  title: safeText(160).nullable(),
  text: safeText(1_000),
}).strict();

const ragInfoCardBlockSchema = z.object({
  type: z.literal("infoCard"),
  title: safeText(160),
  text: safeText(1_000),
}).strict();

const ragActionBlockSchema = z.object({
  type: z.literal("action"),
  label: safeText(120),
  message: safeText(500),
}).strict();

export const ragVisualSchema = z.enum([
  "phone-calls",
  "phone-data",
  "phone-power",
  "phone-app",
  "internet-outage",
  "modem-connected",
  "modem-restart",
]);

const ragMediaCardsBlockSchema = z.object({
  type: z.literal("mediaCards"),
  cards: z.array(z.object({
    title: safeText(160),
    description: safeText(500),
    visual: ragVisualSchema,
    actionLabel: safeText(120).nullable(),
    actionMessage: safeText(500).nullable(),
  }).strict().superRefine((card, context) => {
    if (Boolean(card.actionLabel) !== Boolean(card.actionMessage)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Popisek a zpráva akce musí být uvedené společně." });
    }
  })).min(2).max(4),
}).strict();

export const ragModelPlanSchema = z.object({
  text: safeText(2_000),
  blocks: z.array(z.discriminatedUnion("type", [ragStepsBlockSchema, ragAlertBlockSchema, ragInfoCardBlockSchema, ragActionBlockSchema, ragMediaCardsBlockSchema])).max(6),
  quickReplies: z.array(z.object({ label: safeText(120), message: safeText(500) }).strict()).max(4),
}).strict();

export type RagModelPlan = z.infer<typeof ragModelPlanSchema>;

export const ragModelPlanJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["text", "blocks", "quickReplies"],
  properties: {
    text: { type: "string", minLength: 1, maxLength: 2000 },
    blocks: {
      type: "array",
      maxItems: 6,
      items: {
        anyOf: [
          { type: "object", additionalProperties: false, required: ["type", "title", "items"], properties: { type: { const: "steps" }, title: { type: ["string", "null"] }, items: { type: "array", minItems: 1, maxItems: 6, items: { type: "string" } } } },
          { type: "object", additionalProperties: false, required: ["type", "severity", "title", "text"], properties: { type: { const: "alert" }, severity: { enum: ["info", "warning", "error"] }, title: { type: ["string", "null"] }, text: { type: "string" } } },
          { type: "object", additionalProperties: false, required: ["type", "title", "text"], properties: { type: { const: "infoCard" }, title: { type: "string" }, text: { type: "string" } } },
          { type: "object", additionalProperties: false, required: ["type", "label", "message"], properties: { type: { const: "action" }, label: { type: "string" }, message: { type: "string" } } },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "cards"],
            properties: {
              type: { const: "mediaCards" },
              cards: {
                type: "array",
                minItems: 2,
                maxItems: 4,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["title", "description", "visual", "actionLabel", "actionMessage"],
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    visual: { enum: ["phone-calls", "phone-data", "phone-power", "phone-app", "internet-outage", "modem-connected", "modem-restart"] },
                    actionLabel: { type: ["string", "null"] },
                    actionMessage: { type: ["string", "null"] },
                  },
                },
              },
            },
          },
        ],
      },
    },
    quickReplies: { type: "array", maxItems: 4, items: { type: "object", additionalProperties: false, required: ["label", "message"], properties: { label: { type: "string" }, message: { type: "string" } } } },
  },
} as const;

function stripCodeFence(value: string) {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function safePlainText(value: string) {
  return value.replace(/<[^>]*>/g, "").replace(/[{}]\s*[^{}]*:[^{}]*[{}]/g, "").replace(/\s+/g, " ").trim().slice(0, 2_000);
}

export function parseRagModelOutput(raw: string) {
  const clean = stripCodeFence(raw);
  try {
    const payload = JSON.parse(clean) as unknown;
    const parsed = ragModelPlanSchema.safeParse(payload);
    if (parsed.success) return { plan: parsed.data, plainText: parsed.data.text };
    if (payload && typeof payload === "object" && "text" in payload && typeof payload.text === "string" && safePlainText(payload.text)) return { plan: null, plainText: safePlainText(payload.text) };
  } catch { /* plain-text fallback below */ }
  return { plan: null, plainText: clean.startsWith("{") ? "Odpověď se nepodařilo bezpečně strukturovat. Zkuste prosím dotaz upřesnit." : safePlainText(clean) };
}
