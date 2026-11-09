import assert from "node:assert/strict";
import test from "node:test";

import { chatResponseV1Schema, conversationStateV1Schema } from "../lib/contracts/chat/v1.ts";
import {
  continueTariffComparison,
  extractTariffPreferences,
  isClearlyUnrelatedToTariffs,
  isTariffComparisonQuery,
  selectTariffs,
  startTariffComparison,
  TARIFF_COMPARISON_SCENARIO_ID,
} from "../lib/tariff-comparison.ts";
import { isTariffCatalogFresh, mobileTariffCatalog } from "../lib/tariff-catalog.ts";

const verifiedNow = new Date("2026-11-08T12:00:00Z");

test("tarifní katalog obsahuje jen unikátní ověřené položky a rozlišuje cenu", () => {
  assert.equal(mobileTariffCatalog.checkedAt, "2026-11-08");
  assert.equal(mobileTariffCatalog.sourceUrl, "https://www.vodafone.cz/tarify/");
  assert.equal(new Set(mobileTariffCatalog.tariffs.map((tariff) => tariff.tariffId)).size, mobileTariffCatalog.tariffs.length);
  assert.ok(mobileTariffCatalog.tariffs.every((tariff) => tariff.detailUrl.startsWith("https://www.vodafone.cz/tarify/")));
  assert.equal(mobileTariffCatalog.tariffs.find((tariff) => tariff.tariffId === "slimitem-m")?.monthlyPriceCzk, 497);
  assert.equal(mobileTariffCatalog.tariffs.find((tariff) => tariff.tariffId === "slimitem-m")?.data.gb, 12);
});

test("čerstvost katalogu používá schválený sedmidenní limit", () => {
  assert.equal(isTariffCatalogFresh(mobileTariffCatalog, verifiedNow), true);
  assert.equal(isTariffCatalogFresh(mobileTariffCatalog, new Date("2026-11-17T00:00:00Z")), false);
});

test("parser rozpozná tarifní záměr a omezené preference", () => {
  assert.equal(isTariffComparisonQuery("Hledám levný tarif s alespoň 10 GB dat."), true);
  assert.equal(isTariffComparisonQuery("tarif do 400 Kč s 10 GB"), true);
  assert.equal(isTariffComparisonQuery("Nefunguje mi pevný internet."), false);
  assert.deepEqual(extractTariffPreferences("Tarif do 800 Kč s alespoň 10 GB."), {
    maxMonthlyPriceCzk: 800,
    minDataGb: 10,
    unlimitedData: false,
  });
  assert.deepEqual(extractTariffPreferences("800 Kč", { maxMonthlyPriceCzk: null, minDataGb: 10, unlimitedData: false }), {
    maxMonthlyPriceCzk: 800,
    minDataGb: 10,
    unlimitedData: false,
  });
  assert.deepEqual(extractTariffPreferences("Stačí 10 GB", { maxMonthlyPriceCzk: 800, minDataGb: null, unlimitedData: true }), {
    maxMonthlyPriceCzk: 800,
    minDataGb: 10,
    unlimitedData: false,
  });
  assert.equal(extractTariffPreferences("Tarif do 800 Kč s neomezenými daty.").unlimitedData, true);
  assert.equal(isClearlyUnrelatedToTariffs("Nefunguje mi internet doma."), true);
  assert.equal(isClearlyUnrelatedToTariffs("Chci internetový tarif."), false);
});

test("deterministický výběr vrací nejvýše tři existující tarify", () => {
  const selection = selectTariffs({ maxMonthlyPriceCzk: 800, minDataGb: 10, unlimitedData: null });
  assert.equal(selection.exact, true);
  assert.deepEqual(selection.tariffs.map((tariff) => tariff.tariffId), ["slimitem-m", "bezlimitu-m", "bezlimitu-l"]);
  assert.ok(selection.tariffs.length <= 3);
});

test("nulová přesná shoda vrátí katalogové alternativy a neskrývá změkčení", () => {
  const selection = selectTariffs({ maxMonthlyPriceCzk: 400, minDataGb: 10, unlimitedData: null });
  assert.equal(selection.exact, false);
  assert.ok(selection.tariffs.length >= 2 && selection.tariffs.length <= 3);
  assert.ok(selection.tariffs.every((tariff) => mobileTariffCatalog.tariffs.some((candidate) => candidate.tariffId === tariff.tariffId)));

  const response = startTariffComparison("Hledám tarif do 400 Kč s alespoň 10 GB.", verifiedNow);
  assert.match(response.text, /Přesnou shodu jsem.*nenašel/u);
  const carousel = response.blocks.find((block) => block.type === "tariffComparison");
  assert.equal(carousel?.presentation, "carousel");
  assert.ok(carousel?.tariffs.every((tariff) => tariff.mismatch?.includes("Nesplňuje přesně zadání")));
});

test("neúplné zadání položí jednu krátkou doplňující otázku", () => {
  const data = startTariffComparison("Doporučte mi mobilní tarif.", verifiedNow);
  assert.equal(data.text, "Kolik mobilních dat potřebujete?");
  assert.equal(data.quickReplyPrompt, undefined);
  assert.deepEqual(data.quickReplies.map((reply) => reply.label), ["Alespoň 10 GB", "Neomezená data"]);
  assert.equal(data.blocks.some((block) => block.type === "action" && block.label === "Konec"), false);

  const response = startTariffComparison("Hledám levný tarif s alespoň 10 GB dat.", verifiedNow);
  assert.equal(response.conversationState?.stepId, "collect-budget");
  assert.equal(response.text, "Kolik chcete za tarif měsíčně platit?");
  assert.equal(response.quickReplyPrompt, undefined);
  assert.deepEqual(response.quickReplies.map((reply) => reply.label), ["Do 400 Kč", "Ukázat nejlevnější"]);
});

test("volná částka během sběru rozpočtu pokračuje bez dalšího doptávání", () => {
  const collecting = startTariffComparison("Hledám levný tarif s alespoň 10 GB dat.", verifiedNow);
  const result = continueTariffComparison(collecting.conversationState, "800 Kč", undefined, verifiedNow);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.response.conversationState?.stepId, "shortlist");
  assert.equal(result.response.conversationState?.scenarioData?.maxMonthlyPriceCzk, 800);
});

test("carousel rovnou porovná všechny katalogové tarify bez CTA Porovnat", () => {
  const shortlist = startTariffComparison("Chci tarif do 800 Kč s 10 GB dat.", verifiedNow);
  assert.equal(shortlist.conversationState?.stepId, "shortlist");
  const carousel = shortlist.blocks.find((candidate) => candidate.type === "tariffComparison");
  assert.equal(carousel?.presentation, "carousel");
  assert.deepEqual(carousel?.tariffs.map((tariff) => tariff.tariffId), ["slimitem-m", "bezlimitu-m", "bezlimitu-l"]);
  assert.equal(carousel?.tariffs[0]?.priceCondition, "Samostatný tarif; zvýhodněná cena bez uvedeného data konce.");
  assert.equal(shortlist.blocks.some((block) => block.type === "infoCard"), false);
  assert.equal(shortlist.blocks.some((block) => block.type === "action" && /Porovnat|Přidat|Odebrat|Konec/u.test(block.label)), false);
  assert.deepEqual(shortlist.conversationState?.allowedTransitionIds, ["tariff-change-preferences"]);
  assert.deepEqual(shortlist.quickReplies.map((candidate) => candidate.label), ["Změnit požadavky"]);
  assert.deepEqual(continueTariffComparison(shortlist.conversationState, "Porovnat vybrané tarify.", "tariff-compare", verifiedNow), { ok: false });
  assert.equal(chatResponseV1Schema.safeParse(shortlist).success, true);
});

test("starší povolený vstup tariff-compare zůstává zpětně kompatibilní", () => {
  const shortlist = startTariffComparison("Chci tarif do 800 Kč s 10 GB dat.", verifiedNow);
  const legacyState = conversationStateV1Schema.parse({
    ...shortlist.conversationState,
    allowedTransitionIds: ["tariff-compare", "tariff-change-preferences"],
  });
  const compared = continueTariffComparison(legacyState, "Porovnat vybrané tarify.", "tariff-compare", verifiedNow);
  assert.equal(compared.ok, true);
  if (!compared.ok) return;
  assert.match(compared.response.text, /sLimitem M stojí o 79 Kč měsíčně méně než BezLimitu M/u);
  assert.doesNotMatch(compared.response.text, /o -/u);
  const block = compared.response.blocks.find((candidate) => candidate.type === "tariffComparison");
  assert.deepEqual(block?.tariffs.map((tariff) => tariff.tariffId), ["slimitem-m", "bezlimitu-m", "bezlimitu-l"]);
});

test("při jediné přesné shodě nabídne jednu carousel kartu bez akce Porovnat", () => {
  const response = startTariffComparison("Chci tarif do 500 Kč s 12 GB dat.", verifiedNow);
  assert.match(response.text, /Tenhle tarif splňuje/u);
  const carousel = response.blocks.find((block) => block.type === "tariffComparison");
  assert.equal(carousel?.presentation, "carousel");
  assert.equal(carousel?.tariffs.length, 1);
  assert.equal(carousel?.tariffs[0]?.tariffId, "slimitem-m");
  assert.equal(response.blocks.some((block) => block.type === "action" && block.label.startsWith("Porovnat")), false);
});

test("volná změna na neomezená data zachová rozpočet a kontext", () => {
  const shortlist = startTariffComparison("Chci tarif do 800 Kč s 10 GB dat.", verifiedNow);
  const updated = continueTariffComparison(shortlist.conversationState, "Raději neomezená data.", undefined, verifiedNow);
  assert.equal(updated.ok, true);
  if (!updated.ok) return;
  assert.equal(updated.response.conversationState?.scenarioData?.maxMonthlyPriceCzk, 800);
  assert.equal(updated.response.conversationState?.scenarioData?.unlimitedData, true);
  assert.deepEqual(updated.response.conversationState?.scenarioData?.selectedTariffIds, ["bezlimitu-m", "bezlimitu-l"]);
  assert.equal(updated.response.blocks.some((block) => block.type === "action" && block.label.startsWith("Porovnat")), false);
  assert.deepEqual(updated.response.conversationState?.allowedTransitionIds, ["tariff-change-preferences"]);
});

test("změna požadavků z carouselu obnoví carousel a omezená data vypnou neomezený režim", () => {
  const shortlist = startTariffComparison("Chci tarif do 800 Kč s neomezenými daty.", verifiedNow);
  const collecting = continueTariffComparison(shortlist.conversationState, "Chci změnit požadavky na tarif.", "tariff-change-preferences", verifiedNow);
  assert.equal(collecting.ok, true);
  if (!collecting.ok) return;
  assert.equal(collecting.response.conversationState?.stepId, "collect-data");
  const updated = continueTariffComparison(collecting.response.conversationState, "Stačí 10 GB.", undefined, verifiedNow);
  assert.equal(updated.ok, true);
  if (!updated.ok) return;
  assert.equal(updated.response.conversationState?.stepId, "shortlist");
  assert.equal(updated.response.conversationState?.scenarioData?.unlimitedData, false);
  assert.equal(updated.response.conversationState?.scenarioData?.minDataGb, 10);
  const carousel = updated.response.blocks.find((block) => block.type === "tariffComparison");
  assert.equal(carousel?.presentation, "carousel");
});

test("carousel alternativ zachová rozdíl na každé kartě", () => {
  const shortlist = startTariffComparison("Tarif do 400 Kč s 10 GB.", verifiedNow);
  const carousel = shortlist.blocks.find((candidate) => candidate.type === "tariffComparison");
  assert.ok(carousel?.tariffs.every((tariff) => tariff.mismatch));
  assert.equal(shortlist.blocks.some((block) => block.type === "action" && block.label.startsWith("Porovnat")), false);
});

test("textové ukončení funguje bez samostatného tlačítka Konec", () => {
  const shortlist = startTariffComparison("Chci tarif do 800 Kč s 10 GB dat.", verifiedNow);
  assert.equal(shortlist.blocks.some((block) => block.type === "action" && block.label === "Konec"), false);
  const ended = continueTariffComparison(shortlist.conversationState, "Stačí, díky.", undefined, verifiedNow);
  assert.equal(ended.ok, true);
  if (!ended.ok) return;
  assert.equal(ended.response.conversationState, null);
  assert.match(ended.response.text, /ukončil/u);
});

test("neznámé ID tarifu nespadne a vrátí bezpečné objasnění", () => {
  const state = conversationStateV1Schema.parse({
    scenarioId: TARIFF_COMPARISON_SCENARIO_ID,
    stepId: "shortlist",
    choices: [],
    allowedTransitionIds: ["tariff-compare"],
    scenarioData: {
      kind: "tariffComparison",
      maxMonthlyPriceCzk: 800,
      minDataGb: 10,
      unlimitedData: null,
      selectedTariffIds: ["neexistujici-tarif", "slimitem-m"],
    },
  });
  const result = continueTariffComparison(state, "Porovnat.", "tariff-compare", verifiedNow);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.response.text, /v aktuálním katalogu nemám/u);
  assert.equal(result.response.conversationState?.stepId, "collect-data");
});

test("nepovolený přechod je odmítnut", () => {
  const response = startTariffComparison("Chci tarif do 800 Kč s 10 GB dat.", verifiedNow);
  assert.deepEqual(continueTariffComparison(response.conversationState, "Objednat.", "tariff-order", verifiedNow), { ok: false });
});

test("starý katalog nezobrazuje ceny jako aktuální", () => {
  const response = startTariffComparison("Chci tarif do 800 Kč s 10 GB dat.", new Date("2026-11-17T00:00:00Z"));
  assert.match(response.text, /nejsou dostatečně čerstvé/u);
  assert.equal(response.blocks.some((block) => block.type === "tariffComparison"), false);
  assert.equal(response.conversationState, null);
});
