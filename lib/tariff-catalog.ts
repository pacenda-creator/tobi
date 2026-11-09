import { z } from "zod";

import rawCatalog from "../data/vodafone-mobile-tariffs.v1.json" with { type: "json" };

const tariffIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
const vodafoneUrlSchema = z.string().url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && (url.hostname === "vodafone.cz" || url.hostname.endsWith(".vodafone.cz"));
}, "Katalog smí odkazovat pouze na Vodafone.cz přes HTTPS.");

export const tariffDataSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("limited"), gb: z.number().int().positive().max(10_000) }).strict(),
  z.object({ kind: z.literal("unlimited"), speedMbps: z.number().int().positive().max(10_000).nullable() }).strict(),
]);

export const mobileTariffSchema = z.object({
  tariffId: tariffIdSchema,
  name: z.string().trim().min(1).max(100),
  variant: z.enum(["standard", "extra", "black"]),
  monthlyPriceCzk: z.number().int().positive().max(100_000),
  listPriceCzk: z.number().int().positive().max(100_000).optional(),
  priceKind: z.enum(["standard", "promotion"]),
  priceCondition: z.string().trim().min(1).max(240),
  data: tariffDataSchema,
  calls: z.literal("unlimited"),
  sms: z.literal("unlimited"),
  commitment: z.literal("none"),
  detailUrl: vodafoneUrlSchema,
}).strict().superRefine((tariff, context) => {
  if (tariff.priceKind === "promotion" && tariff.listPriceCzk === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["listPriceCzk"], message: "Promo cena vyžaduje běžnou cenu." });
  }
  if (tariff.listPriceCzk !== undefined && tariff.listPriceCzk < tariff.monthlyPriceCzk) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["listPriceCzk"], message: "Běžná cena nesmí být nižší než aktuální cena." });
  }
});

export const mobileTariffCatalogSchema = z.object({
  version: z.string().regex(/^[a-z0-9][a-z0-9-]{0,95}$/),
  checkedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  maxAgeDays: z.number().int().min(1).max(30),
  sourceUrl: vodafoneUrlSchema,
  tariffs: z.array(mobileTariffSchema).min(2).max(50),
}).strict().superRefine((catalog, context) => {
  const ids = catalog.tariffs.map((tariff) => tariff.tariffId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["tariffs"], message: "ID tarifů musí být unikátní." });
  }
});

export type MobileTariff = z.infer<typeof mobileTariffSchema>;
export type MobileTariffCatalog = z.infer<typeof mobileTariffCatalogSchema>;

export const mobileTariffCatalog: MobileTariffCatalog = mobileTariffCatalogSchema.parse(rawCatalog);

export function isTariffCatalogFresh(catalog: MobileTariffCatalog = mobileTariffCatalog, now = new Date()) {
  const checkedAt = new Date(`${catalog.checkedAt}T23:59:59.999Z`);
  if (Number.isNaN(checkedAt.getTime())) return false;
  return now.getTime() - checkedAt.getTime() <= catalog.maxAgeDays * 86_400_000;
}

export function getMobileTariff(tariffId: string, catalog: MobileTariffCatalog = mobileTariffCatalog) {
  return catalog.tariffs.find((tariff) => tariff.tariffId === tariffId) ?? null;
}
