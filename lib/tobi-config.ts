import { z } from "zod";

export const operatorAvailabilitySchema = z.enum(["online", "offline", "unknown"]);
export const renderModeSchema = z.enum(["carousel", "cards", "list"]);
export const conversationModeSchema = z.enum(["ai", "operator"]);
export const handoverStateSchema = z.enum(["idle", "requested", "queued", "connected", "unavailable"]);
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

export const tobiConfigSchema = z.object({
  brand: z.object({
    name: z.string(),
    disclaimer: z.string(),
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
  presentation: z.object({
    renderMode: renderModeSchema,
    intro: z.object({
      renderMode: z.enum(["compact", "carousel"]),
      initialVisibleCount: z.number().int().nonnegative(),
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
  })).max(5),
  knowledgeAreas: z.array(z.string()),
});

export type OperatorAvailability = z.infer<typeof operatorAvailabilitySchema>;
export type RenderMode = z.infer<typeof renderModeSchema>;
export type MediaCard = z.infer<typeof mediaCardSchema>;
export type Incident = z.infer<typeof incidentSchema>;
export type TobiConfig = z.infer<typeof tobiConfigSchema>;
export type IntroUseCase = TobiConfig["introUseCases"][number];

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
  },
  copy: {
    welcome: "S čím vám mohu pomoci?",
    operatorOnline: "Operátor je dostupný",
    operatorOffline: "Operátor teď není dostupný",
    operatorUnknown: "Dostupnost operátora neznáme",
  },
  features: { timestamps: false, sources: true, mediaCards: true, feedback: true, majorIncident: true, majorIncidentServices: ["Pevný internet"] },
  presentation: { renderMode: "carousel", intro: { renderMode: "compact", initialVisibleCount: 3 }, carousel: { loop: false, wideBreakpoint: 520 } },
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
  ],
  knowledgeAreas: ["Tarify a služby", "Internet a data", "Vodafone TV", "Vyúčtování", "Účet, SIM a eSIM", "Telefony a zařízení", "Roaming", "Technická podpora", "OneNet"],
});

export const defaultDemoRuntimeState: TobiRuntimeState = {
  operatorAvailability: "unknown",
  authenticated: false,
  conversationMode: "ai",
  handoverState: "idle",
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
