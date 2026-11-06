import { z } from "zod";

export const operatorAvailabilitySchema = z.enum(["online", "offline", "unknown"]);
export const renderModeSchema = z.enum(["carousel", "cards", "list"]);
export const conversationModeSchema = z.enum(["ai", "operator"]);
export const handoverStateSchema = z.enum(["bot_active", "handover_requested", "waiting_for_agent", "agent_connected", "conversation_ended"]);
export const incidentStatusSchema = z.enum(["active", "resolved"]);
export const incidentScopeSchema = z.enum(["local", "service", "global", "unknown"]);

export const incidentSchema = z.object({
  id: z.string(),
  service: z.string(),
  scope: incidentScopeSchema,
  severity: z.enum(["minor", "major", "critical"]),
  status: incidentStatusSchema,
  title: z.string(),
  message: z.string(),
  updatedAt: z.string(),
  detailUrl: z.string().url(),
  targeting: z.enum(["all", "known-location", "unknown-location"]),
  source: z.object({ kind: z.enum(["demo", "verified-feed", "manual"]), label: z.string() }),
  expiresAt: z.string().optional(),
});

export const mediaCardSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  image: z.string(),
  imageAlt: z.string(),
  actionLabel: z.string().optional(),
  actionUrl: z.string().url().optional(),
  external: z.boolean().default(false),
});

export const tobiPublicConfigSchema = z.object({
  brand: z.object({
    name: z.string(),
    disclaimer: z.string(),
    headerStyle: z.enum(["white", "red"]).default("white"),
    iconVariant: z.enum(["sparkles", "vodafone", "ai-modern"]).default("sparkles"),
  }),
  copy: z.object({
    welcome: z.string(),
    operatorOnline: z.string(),
    operatorOffline: z.string(),
    operatorUnknown: z.string(),
  }),
  features: z.object({
    timestamps: z.boolean(),
    sources: z.boolean(),
    mediaCards: z.boolean(),
    feedback: z.boolean(),
    majorIncident: z.boolean(),
    majorIncidentServices: z.array(z.string()),
  }),
  headerActions: z.object({
    close: z.boolean().default(true),
    minimize: z.boolean().default(true),
    agent: z.boolean().default(true),
    newRequest: z.boolean().default(true),
  }).default({ close: true, minimize: true, agent: true, newRequest: true }),
  presentation: z.object({
    renderMode: renderModeSchema,
    intro: z.object({
      displayMode: z.enum(["none", "list", "carousel"]).default("list"),
      visibleTopicsCount: z.number().int().min(1).max(10).default(3),
      orderedTopicIds: z.array(z.string()).default(["puk", "internet", "tv", "billing"]),
    }),
    carousel: z.object({
      loop: z.boolean(),
      wideBreakpoint: z.number().int().positive(),
    }),
  }),
  topics: z.array(z.object({
    id: z.string(), label: z.string(), detail: z.string(), icon: z.string(), prompt: z.string(),
  })),
  introUseCases: z.array(z.object({
    id: z.string(), label: z.string(), detail: z.string(), icon: z.string(), prompt: z.string(),
  })).max(10),
  knowledgeAreas: z.array(z.string()),
});

export const tobiModelSchema = z.enum(["gpt-6-astra", "gpt-6.1-sol", "gpt-6-sol", "gpt-4.1"]);
export const tobiReasoningEffortSchema = z.enum(["low", "medium", "high", "xhigh"]);

export const tobiRuntimeConfigSchema = z.object({
  model: tobiModelSchema,
  systemPrompt: z.string().trim().min(1).max(12_000),
  reasoningEffort: tobiReasoningEffortSchema.nullable(),
  temperature: z.number().min(0).max(2).nullable(),
  maxOutputTokens: z.number().int().min(100).max(4_000),
  sources: z.object({
    localIndex: z.boolean(),
    presetKnowledge: z.boolean(),
    webSearch: z.boolean(),
  }).strict(),
}).strict().superRefine((runtime, context) => {
  const supportsTemperature = runtime.model === "gpt-4.1";
  if (!supportsTemperature && runtime.temperature !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["temperature"], message: "Zvolený model nepodporuje temperature." });
  }
  if (supportsTemperature && runtime.reasoningEffort !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["reasoningEffort"], message: "Zvolený model nepodporuje reasoning effort." });
  }
});

export const tobiConfigSchema = tobiPublicConfigSchema.extend({
  runtime: tobiRuntimeConfigSchema,
}).strict();

export type OperatorAvailability = z.infer<typeof operatorAvailabilitySchema>;
export type RenderMode = z.infer<typeof renderModeSchema>;
export type MediaCard = z.infer<typeof mediaCardSchema>;
export type Incident = z.infer<typeof incidentSchema>;
export type TobiPublicConfig = z.infer<typeof tobiPublicConfigSchema>;
export type TobiRuntimeConfig = z.infer<typeof tobiRuntimeConfigSchema>;
export type TobiConfig = z.infer<typeof tobiConfigSchema>;
export type IntroUseCase = TobiPublicConfig["introUseCases"][number];

export type TobiPublicConfigSnapshot = {
  configVersion: number;
  updatedAt: string;
  config: TobiPublicConfig;
};

export type TobiAdminConfigSnapshot = {
  configVersion: number;
  updatedAt: string;
  config: TobiConfig;
};

export type TobiRuntimeState = {
  operatorAvailability: OperatorAvailability;
  authenticated: boolean;
  conversationMode: z.infer<typeof conversationModeSchema>;
  handoverState: z.infer<typeof handoverStateSchema>;
  activeIncident: Incident | null;
  incidentMatch: "matched" | "not-matched" | "unknown";
};

export const defaultTobiConfig: TobiConfig = tobiConfigSchema.parse({
  brand: {
    name: "TOBi",
    disclaimer: "AI může chybovat. Důležité údaje prosím ověřte.",
    headerStyle: "white",
    iconVariant: "sparkles",
  },
  copy: {
    welcome: "S čím vám mohu pomoci?",
    operatorOnline: "Operátor je dostupný",
    operatorOffline: "Operátor teď není dostupný",
    operatorUnknown: "Dostupnost operátora neznáme",
  },
  features: { timestamps: false, sources: true, mediaCards: true, feedback: true, majorIncident: true, majorIncidentServices: ["Pevný internet"] },
  headerActions: { close: true, minimize: true, agent: true, newRequest: true },
  presentation: { renderMode: "carousel", intro: { displayMode: "list", visibleTopicsCount: 3, orderedTopicIds: ["puk", "internet", "tv", "billing", "esim", "roaming", "signal", "wifi", "app", "tariff"] }, carousel: { loop: false, wideBreakpoint: 520 } },
  topics: [
    { id: "internet", label: "Internet a Wi‑Fi", detail: "Výpadek, modem, rychlost", icon: "router", prompt: "Nefunguje mi internet doma." },
    { id: "esim", label: "eSIM a SIM", detail: "Aktivace, přesun, výměna", icon: "qr-code", prompt: "Potřebuji aktivovat eSIM" },
    { id: "billing", label: "Vyúčtování", detail: "Platby a vysvětlení částky", icon: "wallet-cards", prompt: "Potřebuji poradit s vyúčtováním" },
    { id: "roaming", label: "Roaming", detail: "Data a volání v zahraničí", icon: "globe", prompt: "Jak funguje roaming v zahraničí?" },
    { id: "pin", label: "PIN a PUK", detail: "Kódy a blokace SIM", icon: "lock", prompt: "Kde najdu PUK?" },
    { id: "signal", label: "Signál a volání", detail: "Pokrytí, hovory a SMS", icon: "signal", prompt: "Mám potíže se signálem" },
  ],
  introUseCases: [
    { id: "puk", label: "Zjistit PUK", detail: "Odblokování SIM", icon: "key-round", prompt: "Kde najdu PUK?" },
    { id: "internet", label: "Nefunguje internet", detail: "Výpadek a modem", icon: "router", prompt: "Nefunguje mi internet doma." },
    { id: "tv", label: "Problémy s Vodafone TV", detail: "Přehrávání a zařízení", icon: "tv", prompt: "Nefunguje mi Vodafone TV." },
    { id: "billing", label: "Vyúčtování a platby", detail: "Částka, platba, faktura", icon: "receipt-text", prompt: "Potřebuji poradit s vyúčtováním." },
    { id: "esim", label: "Aktivovat eSIM", detail: "Aktivace a přenos", icon: "qr-code", prompt: "Potřebuji aktivovat eSIM." },
    { id: "roaming", label: "Roaming", detail: "Data a volání v zahraničí", icon: "globe", prompt: "Jak funguje roaming v zahraničí?" },
    { id: "signal", label: "Signál a volání", detail: "Pokrytí, hovory a SMS", icon: "signal", prompt: "Mám potíže se signálem." },
    { id: "wifi", label: "Nastavit Wi-Fi", detail: "Síť, heslo a modem", icon: "wifi", prompt: "Jak nastavím domácí Wi-Fi?" },
    { id: "app", label: "Můj Vodafone", detail: "Přihlášení a samoobsluha", icon: "smartphone", prompt: "Jak se přihlásím do Můj Vodafone?" },
    { id: "tariff", label: "Tarif a služby", detail: "Změna a správa služeb", icon: "wallet-cards", prompt: "Jak mohu změnit svůj tarif?" },
  ],
  knowledgeAreas: ["Tarify a služby", "Internet a data", "Vodafone TV", "Vyúčtování", "Účet, SIM a eSIM", "Telefony a zařízení", "Roaming", "Technická podpora", "OneNet"],
  runtime: {
    model: "gpt-6-astra",
    systemPrompt: "Jsi TOBi, schopný konverzační asistent Vodafonu v českém prototypu. Veď přirozený diagnostický rozhovor a vždy zohledni aktuální dotaz zákazníka. Nevymýšlej stav účtu, služby, cenu ani výpadek. Nežádej PIN, PUK, heslo, celé číslo karty ani QR kód eSIM.",
    reasoningEffort: "medium",
    temperature: null,
    maxOutputTokens: 1_400,
    sources: { localIndex: true, presetKnowledge: true, webSearch: true },
  },
});

export const defaultTobiPublicConfig: TobiPublicConfig = tobiPublicConfigSchema.parse(defaultTobiConfig);

export function toPublicTobiConfig(config: TobiConfig): TobiPublicConfig {
  return tobiPublicConfigSchema.parse(config);
}

export function modelSupportsReasoning(model: TobiRuntimeConfig["model"]) {
  return model !== "gpt-4.1";
}

export function modelSupportsTemperature(model: TobiRuntimeConfig["model"]) {
  return model === "gpt-4.1";
}

export const defaultDemoRuntimeState: TobiRuntimeState = {
  operatorAvailability: "unknown",
  authenticated: false,
  conversationMode: "ai",
  handoverState: "bot_active",
  activeIncident: null,
  incidentMatch: "unknown",
};

export const demoMajorIncident: Incident = incidentSchema.parse({
  id: "demo-fixed-internet-2026-10",
  service: "Pevný internet",
  scope: "service",
  severity: "major",
  status: "active",
  title: "Evidujeme výpadek internetu",
  message: "V některých lokalitách momentálně nefunguje pevný internet. Na odstranění potíží pracujeme.",
  updatedAt: "2026-10-31T10:00:00+01:00",
  detailUrl: "https://www.vodafone.cz/vypadky/",
  targeting: "unknown-location",
  source: { kind: "demo", label: "Ukázkový incident" },
  expiresAt: "2030-01-01T00:00:00+01:00",
});
