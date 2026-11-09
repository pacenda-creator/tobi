import {
  CHAT_CONTRACT_VERSION,
  chatResponseV1Schema,
  conversationStateV1Schema,
  type ChatResponseV1,
  type ConversationStateV1,
  type QuickReplyV1,
  type TariffComparisonBlockV1,
  type TariffComparisonScenarioDataV1,
  type UiBlockV1,
} from "./contracts/chat/v1.ts";
import {
  getMobileTariff,
  isTariffCatalogFresh,
  mobileTariffCatalog,
  type MobileTariff,
} from "./tariff-catalog.ts";

export const TARIFF_COMPARISON_SCENARIO_ID = "tariff-comparison-v1";

type Preferences = Pick<TariffComparisonScenarioDataV1, "maxMonthlyPriceCzk" | "minDataGb" | "unlimitedData">;

const SOURCE_ID = "tariff-catalog-source";
const transitionMessages: Record<string, string> = {
  "tariff-data-10": "Chci alespoň 10 GB dat.",
  "tariff-unlimited": "Chci neomezená data.",
  "tariff-budget-400": "Chci tarif do 400 Kč měsíčně.",
  "tariff-show-cheapest": "Ukažte mi nejlevnější odpovídající tarify.",
  "tariff-compare": "Porovnat vybrané tarify.",
  "tariff-back": "Zpět k tarifům.",
  "tariff-change-preferences": "Chci změnit požadavky na tarif.",
};

function responseId() {
  return `resp_${crypto.randomUUID()}`;
}

function normalized(input: string) {
  return input.toLocaleLowerCase("cs").normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function isTariffComparisonQuery(input: string) {
  const clean = normalized(input);
  return /\b(tarif|tarify|tarifu|tarifů)\b/u.test(clean)
    && (
      /\b(hled[aá]m|chci|vyber|doporu[cč]|porovn|levn|mobil|data|zm[eě]n)\w*/u.test(clean)
      || /\b\d{1,4}\s*gb\b/u.test(clean)
      || /\b(?:do|max(?:im[aá]ln[eě])?|nejv[yý][sš])\s*\d{2,5}\s*(?:k[cč]|korun)?\b/u.test(clean)
    );
}

export function isClearlyUnrelatedToTariffs(input: string) {
  const clean = normalized(input);
  return /\b(internet|wi[ -]?fi|modem|router|puk|pin|e?sim|vy[uú][cč]tov[aá]n[ií]|faktur|roaming|televiz|vodafone\s+tv|oper[aá]tor)\b/u.test(clean)
    && !/\b(tarif|tarify|tarifu|tarifů)\b/u.test(clean);
}

export function extractTariffPreferences(input: string, current: Preferences = { maxMonthlyPriceCzk: null, minDataGb: null, unlimitedData: null }) {
  const clean = normalized(input);
  const budget = clean.match(/(?:\bdo\b|\bmax(?:im[aá]ln[eě])?\b|\bnejv[yý][sš]\b)\s*(\d{2,5})\s*(?:k[cč]|korun)?/u)?.[1]
    ?? clean.match(/\b(\d{2,5})\s*(?:k[cč]|korun(?:y|a)?)(?:\s|$)/u)?.[1];
  const data = clean.match(/\b(?:alespo[nň]\s*|sta[cč][ií]\s*)?(\d{1,4})\s*gb\b/u)?.[1];
  const wantsUnlimited = /\bneomezen\S*\s+dat\S*|\bdat\S*\s+bez\s+limitu\b/u.test(clean);
  return {
    maxMonthlyPriceCzk: budget ? Number(budget) : current.maxMonthlyPriceCzk,
    minDataGb: wantsUnlimited ? null : data ? Number(data) : current.minDataGb,
    unlimitedData: wantsUnlimited ? true : data ? false : current.unlimitedData,
  } satisfies Preferences;
}

function state(
  stepId: string,
  preferences: Preferences,
  selectedTariffIds: string[],
  allowedTransitionIds: string[],
  choices: ConversationStateV1["choices"] = [],
) {
  return conversationStateV1Schema.parse({
    scenarioId: TARIFF_COMPARISON_SCENARIO_ID,
    stepId,
    choices,
    allowedTransitionIds,
    scenarioData: { kind: "tariffComparison", ...preferences, selectedTariffIds },
  });
}

function sourceBlock(): UiBlockV1 {
  return { type: "sourceList", id: "tariff-catalog-sources", title: "Zdroj nabídky", sourceIds: [SOURCE_ID] };
}

function baseResponse(input: {
  text: string;
  blocks?: UiBlockV1[];
  quickReplies?: QuickReplyV1[];
  quickReplyPrompt?: string;
  conversationState?: ConversationStateV1 | null;
  confidence?: number;
}): ChatResponseV1 {
  return chatResponseV1Schema.parse({
    contractVersion: CHAT_CONTRACT_VERSION,
    responseId: responseId(),
    mode: "preset",
    text: input.text,
    blocks: input.blocks ?? [],
    quickReplies: input.quickReplies ?? [],
    quickReplyPrompt: input.quickReplyPrompt,
    sources: input.blocks?.some((block) => block.type === "sourceList")
      ? [{ id: SOURCE_ID, title: "Vodafone – mobilní tarify", url: mobileTariffCatalog.sourceUrl, checkedAt: mobileTariffCatalog.checkedAt }]
      : [],
    intent: { id: "tariff-comparison", label: "Srovnání mobilních tarifů", confidence: input.confidence ?? 0.98 },
    conversationState: input.conversationState,
    fallback: null,
  });
}

function reply(id: string, label: string): QuickReplyV1 {
  return { id, label, action: { kind: "sendMessage", message: transitionMessages[id], transitionId: id } };
}

function staleCatalogResponse() {
  return baseResponse({
    text: "Ceny v mém katalogu už nejsou dostatečně čerstvé pro spolehlivé srovnání. Aktuální nabídku najdete přímo na Vodafone.cz.",
    blocks: [
      { type: "alert", id: "tariff-catalog-stale", severity: "warning", title: "Ceny potřebuji znovu ověřit", text: `Katalog byl naposledy zkontrolován ${mobileTariffCatalog.checkedAt}.` },
      { type: "action", id: "tariff-open-catalog", label: "Otevřít aktuální tarify", action: { kind: "openUrl", url: mobileTariffCatalog.sourceUrl, external: true } },
    ],
    conversationState: null,
    confidence: 1,
  });
}

function collectDataResponse(
  preferences: Preferences,
  choices: ConversationStateV1["choices"] = [],
  returnToComparison = false,
  selectedTariffIds: string[] = [],
) {
  return baseResponse({
    text: "Kolik mobilních dat potřebujete?",
    quickReplies: [reply("tariff-data-10", "Alespoň 10 GB"), reply("tariff-unlimited", "Neomezená data")],
    conversationState: state(returnToComparison ? "collect-data-from-comparison" : "collect-data", preferences, selectedTariffIds, ["tariff-data-10", "tariff-unlimited"], choices),
  });
}

function collectBudgetResponse(
  preferences: Preferences,
  choices: ConversationStateV1["choices"] = [],
  returnToComparison = false,
  selectedTariffIds: string[] = [],
) {
  return baseResponse({
    text: "Kolik chcete za tarif měsíčně platit?",
    quickReplies: [reply("tariff-budget-400", "Do 400 Kč"), reply("tariff-show-cheapest", "Ukázat nejlevnější")],
    conversationState: state(returnToComparison ? "collect-budget-from-comparison" : "collect-budget", preferences, selectedTariffIds, ["tariff-budget-400", "tariff-show-cheapest"], choices),
  });
}

function dataMeets(tariff: MobileTariff, preferences: Preferences) {
  if (preferences.unlimitedData) return tariff.data.kind === "unlimited";
  if (preferences.minDataGb === null) return true;
  return tariff.data.kind === "unlimited" || tariff.data.gb >= preferences.minDataGb;
}

function budgetMeets(tariff: MobileTariff, preferences: Preferences) {
  return preferences.maxMonthlyPriceCzk === null || tariff.monthlyPriceCzk <= preferences.maxMonthlyPriceCzk;
}

function tariffPenalty(tariff: MobileTariff, preferences: Preferences) {
  const budgetPenalty = preferences.maxMonthlyPriceCzk === null
    ? 0
    : Math.max(0, tariff.monthlyPriceCzk - preferences.maxMonthlyPriceCzk) / 25;
  const dataPenalty = preferences.unlimitedData
    ? tariff.data.kind === "unlimited" ? 0 : 100 + tariff.data.gb
    : preferences.minDataGb === null || tariff.data.kind === "unlimited"
      ? 0
      : Math.max(0, preferences.minDataGb - tariff.data.gb) * 3;
  return budgetPenalty + dataPenalty;
}

export function selectTariffs(preferences: Preferences) {
  const exact = mobileTariffCatalog.tariffs
    .filter((tariff) => budgetMeets(tariff, preferences) && dataMeets(tariff, preferences))
    .sort((a, b) => a.monthlyPriceCzk - b.monthlyPriceCzk || a.name.localeCompare(b.name, "cs"));
  if (exact.length) return { exact: true, tariffs: exact.slice(0, 3) } as const;
  const alternatives = [...mobileTariffCatalog.tariffs]
    .sort((a, b) => tariffPenalty(a, preferences) - tariffPenalty(b, preferences) || a.monthlyPriceCzk - b.monthlyPriceCzk)
    .slice(0, 3);
  return { exact: false, tariffs: alternatives } as const;
}

function missingCriteria(tariff: MobileTariff, preferences: Preferences) {
  const missing: string[] = [];
  if (!budgetMeets(tariff, preferences) && preferences.maxMonthlyPriceCzk !== null) missing.push(`je nad limitem o ${tariff.monthlyPriceCzk - preferences.maxMonthlyPriceCzk} Kč`);
  if (!dataMeets(tariff, preferences)) missing.push(preferences.unlimitedData ? "nemá neomezená data" : `má méně než ${preferences.minDataGb} GB`);
  return missing.join(" a ");
}

function comparisonItem(tariff: MobileTariff, mismatch?: string): TariffComparisonBlockV1["tariffs"][number] {
  return {
    tariffId: tariff.tariffId,
    name: tariff.name,
    monthlyPriceCzk: tariff.monthlyPriceCzk,
    listPriceCzk: tariff.listPriceCzk,
    priceCondition: tariff.priceCondition,
    data: tariff.data,
    calls: tariff.calls,
    sms: tariff.sms,
    commitment: tariff.commitment,
    detailUrl: tariff.detailUrl,
    mismatch,
  };
}

function shortlistResponse(preferences: Preferences, choices: ConversationStateV1["choices"] = []) {
  const selection = selectTariffs(preferences);
  const selectedTariffIds = selection.tariffs.map((tariff) => tariff.tariffId);
  const text = selection.exact
    ? selection.tariffs.length === 1
      ? "Tenhle tarif splňuje vaše požadavky."
      : `Tyhle ${selection.tariffs.length} tarify splňují vaše požadavky.`
    : "Přesnou shodu jsem v katalogu nenašel. Tady jsou nejbližší možnosti; u každé uvádím, v čem se od zadání liší.";
  const carousel: TariffComparisonBlockV1 = {
    type: "tariffComparison",
    id: "tariff-shortlist",
    title: selection.tariffs.length === 1 ? "Doporučený tarif" : "Doporučené tarify",
    presentation: "carousel",
    catalogVersion: mobileTariffCatalog.version,
    checkedAt: mobileTariffCatalog.checkedAt,
    tariffs: selection.tariffs.map((tariff) => comparisonItem(
      tariff,
      selection.exact ? undefined : `Nesplňuje přesně zadání: ${missingCriteria(tariff, preferences)}.`,
    )) as TariffComparisonBlockV1["tariffs"],
    highlightedTariffId: selection.tariffs[0]?.tariffId,
  };
  const blocks: UiBlockV1[] = [
    carousel,
    sourceBlock(),
  ];
  return baseResponse({
    text,
    blocks,
    quickReplies: [reply("tariff-change-preferences", "Změnit požadavky")],
    conversationState: state("shortlist", preferences, selectedTariffIds, ["tariff-change-preferences"], choices),
  });
}

function comparisonExplanation(tariffs: MobileTariff[]) {
  const [first, second] = tariffs;
  const difference = second.monthlyPriceCzk - first.monthlyPriceCzk;
  const dataContext = tariffs.every((tariff) => tariff.data.kind === "unlimited")
    ? "Všechny mají neomezená data; liší se hlavně rychlostí."
    : "Porovnejte také objem dat a podmínku uvedené ceny.";
  return `${first.name} stojí o ${difference} Kč měsíčně méně než ${second.name}. ${dataContext}`;
}

function comparisonResponse(current: ConversationStateV1, selectedTariffIds = current.scenarioData?.selectedTariffIds ?? []) {
  const scenarioData = current.scenarioData;
  if (!scenarioData) return unknownTariffResponse();
  const tariffs = selectedTariffIds.map((id) => getMobileTariff(id));
  if (selectedTariffIds.length < 2 || selectedTariffIds.length > 3 || tariffs.some((tariff) => !tariff)) return unknownTariffResponse();
  const validTariffs = [...tariffs as MobileTariff[]]
    .sort((a, b) => a.monthlyPriceCzk - b.monthlyPriceCzk || a.tariffId.localeCompare(b.tariffId));
  const preferences: TariffComparisonScenarioDataV1 = scenarioData;
  const block: TariffComparisonBlockV1 = {
    type: "tariffComparison",
    id: "tariff-comparison",
    title: "Srovnání vybraných tarifů",
    presentation: "table",
    warning: selectTariffs(preferences).exact ? undefined : "Žádný z těchto tarifů nesplňuje celé zadání.",
    catalogVersion: mobileTariffCatalog.version,
    checkedAt: mobileTariffCatalog.checkedAt,
    tariffs: validTariffs.map((tariff) => comparisonItem(tariff)) as TariffComparisonBlockV1["tariffs"],
    highlightedTariffId: validTariffs[0].tariffId,
  };
  return baseResponse({
    text: comparisonExplanation(validTariffs),
    blocks: [
      { type: "action", id: "tariff-back-action", label: "Zpět k tarifům", appearance: "secondary", action: { kind: "sendMessage", message: transitionMessages["tariff-back"], transitionId: "tariff-back" } },
      block,
      sourceBlock(),
    ],
    quickReplies: [reply("tariff-change-preferences", "Změnit požadavky")],
    conversationState: state("comparison", preferences, selectedTariffIds, ["tariff-change-preferences", "tariff-back"], current.choices),
  });
}

function responseForPreferences(
  preferences: Preferences,
  choices: ConversationStateV1["choices"],
  preferComparison: boolean,
) {
  const selection = selectTariffs(preferences);
  const selectedTariffIds = selection.tariffs.map((tariff) => tariff.tariffId);
  if (preferComparison && selectedTariffIds.length >= 2) {
    const comparisonState = state("comparison", preferences, selectedTariffIds, ["tariff-change-preferences", "tariff-back"], choices);
    return comparisonResponse(comparisonState);
  }
  return shortlistResponse(preferences, choices);
}

function endResponse() {
  return baseResponse({
    text: "Srovnání tarifů jsem ukončil. S čím dalším vám mohu pomoci?",
    conversationState: null,
    confidence: 1,
  });
}

function unknownTariffResponse() {
  const preferences: Preferences = { maxMonthlyPriceCzk: null, minDataGb: null, unlimitedData: null };
  return baseResponse({
    text: "Tenhle tarif už v aktuálním katalogu nemám. Řekněte mi prosím znovu, kolik dat potřebujete.",
    quickReplies: [reply("tariff-data-10", "Alespoň 10 GB"), reply("tariff-unlimited", "Neomezená data")],
    conversationState: state("collect-data", preferences, [], ["tariff-data-10", "tariff-unlimited"]),
    confidence: 0.6,
  });
}

function hasValidSelectedTariffs(current: ConversationStateV1) {
  const ids = current.scenarioData?.selectedTariffIds ?? [];
  if (!current.scenarioData || !ids.every((id) => Boolean(getMobileTariff(id))) || new Set(ids).size !== ids.length) return false;
  if (!ids.length) return !["shortlist", "comparison"].includes(current.stepId);
  const candidates = new Set(selectTariffs(current.scenarioData).tariffs.map((tariff) => tariff.tariffId));
  return ids.every((id) => candidates.has(id));
}

export function startTariffComparison(input: string, now = new Date()) {
  if (!isTariffCatalogFresh(mobileTariffCatalog, now)) return staleCatalogResponse();
  const preferences = extractTariffPreferences(input);
  if (preferences.minDataGb === null && !preferences.unlimitedData) return collectDataResponse(preferences);
  if (preferences.maxMonthlyPriceCzk === null && !/\b(nejlevn[eě]j[sš][ií]|bez\s+rozpo[cč]tu)\b/u.test(normalized(input))) return collectBudgetResponse(preferences);
  return shortlistResponse(preferences);
}

export type TariffTransitionResult = { ok: true; response: ChatResponseV1 } | { ok: false };

export function continueTariffComparison(currentInput: unknown, input: string, transitionId?: string, now = new Date()): TariffTransitionResult {
  if (!isTariffCatalogFresh(mobileTariffCatalog, now)) return { ok: true, response: staleCatalogResponse() };
  const parsed = conversationStateV1Schema.safeParse(currentInput);
  if (!parsed.success || parsed.data.scenarioId !== TARIFF_COMPARISON_SCENARIO_ID || !parsed.data.scenarioData) return { ok: false };
  const current = parsed.data;
  const scenarioData = current.scenarioData;
  if (!scenarioData) return { ok: false };
  if (!hasValidSelectedTariffs(current)) return { ok: true, response: unknownTariffResponse() };
  if (transitionId && !current.allowedTransitionIds.includes(transitionId)) return { ok: false };

  const preferences: Preferences = scenarioData;
  const preferComparison = current.stepId === "comparison" || current.stepId.endsWith("-from-comparison");
  const choice = transitionId
    ? { transitionId, fromStepId: current.stepId, toStepId: null }
    : null;
  const choices = choice ? [...current.choices, choice] : current.choices;

  if (transitionId === "tariff-data-10") {
    const updated = { ...preferences, minDataGb: 10, unlimitedData: false };
    return { ok: true, response: updated.maxMonthlyPriceCzk === null
      ? collectBudgetResponse(updated, choices, preferComparison, scenarioData.selectedTariffIds)
      : responseForPreferences(updated, choices, preferComparison) };
  }
  if (transitionId === "tariff-unlimited") {
    const updated = { ...preferences, minDataGb: null, unlimitedData: true };
    return { ok: true, response: updated.maxMonthlyPriceCzk === null
      ? collectBudgetResponse(updated, choices, preferComparison, scenarioData.selectedTariffIds)
      : responseForPreferences(updated, choices, preferComparison) };
  }
  if (transitionId === "tariff-budget-400") return { ok: true, response: responseForPreferences({ ...preferences, maxMonthlyPriceCzk: 400 }, choices, preferComparison) };
  if (transitionId === "tariff-show-cheapest") return { ok: true, response: responseForPreferences({ ...preferences, maxMonthlyPriceCzk: null }, choices, preferComparison) };
  if (transitionId === "tariff-compare") return { ok: true, response: comparisonResponse(current) };
  if (transitionId === "tariff-back") return { ok: true, response: shortlistResponse(preferences, choices) };
  if (transitionId === "tariff-change-preferences") return { ok: true, response: collectDataResponse(preferences, choices, current.stepId === "comparison", scenarioData.selectedTariffIds) };
  const clean = normalized(input);
  if (/^(?:(?:konec|ukon[cč]it|zru[sš]it)(?:\s+srovn[aá]n[ií])?|sta[cč][ií](?:,?\s+d[ií]ky)?|d[ií]ky,?\s+sta[cč][ií])[.!]?$/u.test(clean)) return { ok: true, response: endResponse() };
  if (/\bzm[eě]nit\s+po[zž]adavky\b|\bupravit\s+(?:tarif|po[zž]adavky|data|rozpo[cč]et)\b/u.test(clean)) {
    return { ok: true, response: collectDataResponse(preferences, choices, current.stepId === "comparison", scenarioData.selectedTariffIds) };
  }
  const updated = extractTariffPreferences(input, preferences);
  const explicitlyCheapest = /\bnejlevn[eě]j[sš][ií]\b/u.test(clean);
  if (updated.minDataGb === null && !updated.unlimitedData) return { ok: true, response: collectDataResponse(updated, choices, preferComparison, scenarioData.selectedTariffIds) };
  if (updated.maxMonthlyPriceCzk === null && !explicitlyCheapest) return { ok: true, response: collectBudgetResponse(updated, choices, preferComparison, scenarioData.selectedTariffIds) };
  return { ok: true, response: responseForPreferences(updated, choices, preferComparison) };
}
