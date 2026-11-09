import assert from "node:assert/strict";
import test from "node:test";

import {
  chatRequestV1Schema,
  chatResponseV1Schema,
  salvageChatResponseTextV1,
} from "../lib/contracts/chat/v1.ts";
import {
  CHAT_BLOCK_TYPES_V1,
  planChatBlockPresentationV1,
} from "../components/tobi/chat-block-presentation.ts";
import { getVisibleChatSources } from "../lib/chat-source-visibility.ts";

const source = {
  id: "source-1",
  title: "Vodafone Centrum péče",
  url: "https://www.vodafone.cz/pece/",
  checkedAt: "2026-10-30",
};

const baseResponse = {
  contractVersion: "1",
  responseId: "response-1",
  text: "Bezpečná odpověď.",
  quickReplies: [],
  intent: { id: "internet", label: "Internet", confidence: 0.9 },
};

test("ChatRequest v1 přijme omezenou konverzaci zakončenou uživatelem", () => {
  const result = chatRequestV1Schema.safeParse({
    contractVersion: "1",
    requestId: "request-1",
    messages: [{ role: "user", content: "Nefunguje mi internet." }],
    context: { locale: "cs-CZ", channel: "web" },
    preferences: { tone: "friendly" },
  });
  assert.equal(result.success, true);
});

test("ChatRequest v1 odmítne konverzaci nezakončenou uživatelem", () => {
  const result = chatRequestV1Schema.safeParse({
    contractVersion: "1",
    messages: [{ role: "assistant", content: "Jak mohu pomoci?" }],
    context: { locale: "cs-CZ", channel: "web" },
  });
  assert.equal(result.success, false);
});

test("ChatRequest v1 přijme explicitní stav scénáře a transitionId", () => {
  const result = chatRequestV1Schema.safeParse({
    contractVersion: "1",
    messages: [{ role: "user", content: "Pevný internet stále nefunguje." }],
    context: { locale: "cs-CZ", channel: "web" },
    conversationState: {
      scenarioId: "demo-internet",
      stepId: "initial",
      choices: [],
      allowedTransitionIds: ["internet-resolved", "internet-not-resolved"],
    },
    transitionId: "internet-not-resolved",
  });
  assert.equal(result.success, true);
});

test("ChatRequest v1 odmítne transitionId bez aktivního stavu", () => {
  const result = chatRequestV1Schema.safeParse({
    contractVersion: "1",
    messages: [{ role: "user", content: "Pokračovat." }],
    context: { locale: "cs-CZ", channel: "web" },
    transitionId: "internet-not-resolved",
  });
  assert.equal(result.success, false);
});

test("ChatResponse v1 podporuje všechny schválené UI bloky", () => {
  const result = chatResponseV1Schema.safeParse({
    ...baseResponse,
    mode: "preset",
    fallback: null,
    sources: [source],
    blocks: [
      { type: "steps", id: "steps-1", items: [{ id: "step-1", text: "Restartujte modem." }] },
      { type: "alert", id: "alert-1", severity: "warning", text: "Nemačkejte reset." },
      { type: "infoCard", id: "info-1", title: "Modem", text: "Počkejte pět minut." },
      { type: "action", id: "action-1", label: "Ověřit výpadek", action: { kind: "openUrl", url: "https://www.vodafone.cz/vypadky/", external: true } },
      {
        type: "mediaCards",
        id: "media-1",
        cards: [{
          id: "card-1",
          title: "Restart",
          description: "Odpojte napájení.",
          image: { src: "/tobi/modem-restart.svg", alt: "Restart modemu" },
          action: {
            label: "Ověřit výpadek",
            action: { kind: "openUrl", url: "https://www.vodafone.cz/vypadky/", external: true },
          },
        }],
      },
      {
        type: "tariffComparison",
        id: "tariffs-1",
        title: "Srovnání tarifů",
        catalogVersion: "catalog-1",
        checkedAt: "2026-11-08",
        highlightedTariffId: "tariff-a",
        tariffs: [
          { tariffId: "tariff-a", name: "Tarif A", monthlyPriceCzk: 497, listPriceCzk: 699, priceCondition: "Samostatný tarif.", data: { kind: "limited", gb: 12 }, calls: "unlimited", sms: "unlimited", commitment: "none", detailUrl: "https://www.vodafone.cz/tarify/slimitem-m/" },
          { tariffId: "tariff-b", name: "Tarif B", monthlyPriceCzk: 576, priceCondition: "Samostatný tarif.", data: { kind: "unlimited", speedMbps: 8 }, calls: "unlimited", sms: "unlimited", commitment: "none", detailUrl: "https://www.vodafone.cz/tarify/bezlimitu-m/" },
        ],
      },
      { type: "sourceList", id: "sources-1", sourceIds: ["source-1"] },
    ],
  });
  assert.equal(result.success, true);
});

test("selection mediaCards podporují sedm modelů a nejvýše osm karet", () => {
  const selectionCard = (index) => ({
    id: `router-card-${index}`,
    title: `Modem ${index}`,
    description: "Kabelový modem",
    image: { src: `/tobi/routers/router-${index}.png`, alt: `Modem ${index}` },
    action: {
      label: "To je můj modem",
      action: { kind: "sendMessage", message: `Mám modem ${index}.`, transitionId: `router-model-${index}` },
    },
  });
  const responseWithCards = (count) => chatResponseV1Schema.safeParse({
    ...baseResponse,
    mode: "preset",
    fallback: null,
    sources: [],
    blocks: [{
      type: "mediaCards",
      id: "router-selection",
      presentation: "selection",
      cards: Array.from({ length: count }, (_, index) => selectionCard(index + 1)),
    }],
  });

  assert.equal(responseWithCards(7).success, true);
  assert.equal(responseWithCards(8).success, true);
  assert.equal(responseWithCards(9).success, false);
});

test("upload lze vyžádat pouze uzavřenou katalogovou akcí", () => {
  const valid = chatResponseV1Schema.safeParse({
    ...baseResponse,
    mode: "preset",
    fallback: null,
    sources: [],
    blocks: [{ type: "action", id: "upload", label: "Přiložit router", action: { kind: "requestUpload", purpose: "router-diagnostics-v1" } }],
  });
  const invalid = chatResponseV1Schema.safeParse({
    ...baseResponse,
    mode: "preset",
    fallback: null,
    sources: [],
    blocks: [{ type: "action", id: "upload", label: "Přiložit soubor", action: { kind: "requestUpload", purpose: "arbitrary-upload" } }],
  });
  assert.equal(valid.success, true);
  assert.equal(invalid.success, false);
});

test("RAG vyžaduje canonical zdroj i sourceList", () => {
  const result = chatResponseV1Schema.safeParse({
    ...baseResponse,
    mode: "rag",
    fallback: null,
    sources: [],
    blocks: [],
  });
  assert.equal(result.success, false);
});

test("vypnuté zobrazení zdrojů skryje sourceList také u RAG odpovědi", () => {
  const ragResponse = chatResponseV1Schema.parse({
    ...baseResponse,
    mode: "rag",
    fallback: null,
    sources: [source],
    blocks: [{ type: "sourceList", id: "sources-1", sourceIds: [source.id] }],
  });
  const sourceList = ragResponse.blocks.find((block) => block.type === "sourceList");
  assert.ok(sourceList);

  assert.deepEqual(getVisibleChatSources({
    showSources: false,
    sources: ragResponse.sources,
    blockSourceIds: sourceList.sourceIds,
  }), []);

  assert.deepEqual(getVisibleChatSources({
    showSources: true,
    sources: ragResponse.sources,
    blockSourceIds: sourceList.sourceIds,
  }), [source]);

  assert.deepEqual(getVisibleChatSources({
    showSources: true,
    sources: ragResponse.sources,
    blockSourceIds: sourceList.sourceIds,
    presentationSourceIds: ["missing-source"],
  }), []);
});

test("sourceList odmítne referenci na neexistující zdroj", () => {
  const result = chatResponseV1Schema.safeParse({
    ...baseResponse,
    mode: "preset",
    fallback: null,
    sources: [source],
    blocks: [{ type: "sourceList", id: "sources-1", sourceIds: ["missing-source"] }],
  });
  assert.equal(result.success, false);
});

test("fallback odmítne zdroje a sourceList", () => {
  const result = chatResponseV1Schema.safeParse({
    ...baseResponse,
    mode: "fallback",
    fallback: { code: "upstream_unavailable", retryable: true },
    sources: [source],
    blocks: [{ type: "sourceList", id: "sources-1", sourceIds: ["source-1"] }],
  });
  assert.equal(result.success, false);
});

test("kontrakt odmítne nebezpečné externí URL", () => {
  const result = chatResponseV1Schema.safeParse({
    ...baseResponse,
    mode: "preset",
    fallback: null,
    sources: [],
    blocks: [{ type: "action", id: "action-1", label: "Pokračovat", action: { kind: "openUrl", url: "javascript:alert(1)", external: true } }],
  });
  assert.equal(result.success, false);
});

test("zdroje dovolí veřejný HTTPS web, ale odmítnou privátní adresu", () => {
  const publicResult = chatResponseV1Schema.safeParse({
    ...baseResponse,
    mode: "rag",
    fallback: null,
    sources: [{ ...source, url: "https://support.apple.com/cs-cz/guide/iphone/welcome/ios" }],
    blocks: [{ type: "sourceList", id: "sources-1", sourceIds: ["source-1"] }],
  });
  const privateResult = chatResponseV1Schema.safeParse({
    ...baseResponse,
    mode: "rag",
    fallback: null,
    sources: [{ ...source, url: "https://127.0.0.1/internal" }],
    blocks: [{ type: "sourceList", id: "sources-1", sourceIds: ["source-1"] }],
  });
  assert.equal(publicResult.success, true);
  assert.equal(privateResult.success, false);
});

test("ChatResponse v1 odmítne neznámý UI blok", () => {
  const result = chatResponseV1Schema.safeParse({
    ...baseResponse,
    mode: "preset",
    fallback: null,
    sources: [],
    blocks: [{ type: "unknownBlock", id: "unknown-1", text: "Nesmí projít." }],
  });
  assert.equal(result.success, false);
});

test("ChatResponse v1 odmítne chybějící top-level text", () => {
  const result = chatResponseV1Schema.safeParse({
    ...baseResponse,
    text: undefined,
    mode: "preset",
    fallback: null,
    sources: [],
    blocks: [],
  });
  assert.equal(result.success, false);
});

test("steps blok odmítne více než osm položek", () => {
  const result = chatResponseV1Schema.safeParse({
    ...baseResponse,
    mode: "preset",
    fallback: null,
    sources: [],
    blocks: [{
      type: "steps",
      id: "steps-1",
      items: Array.from({ length: 9 }, (_, index) => ({ id: `step-${index + 1}`, text: `Krok ${index + 1}` })),
    }],
  });
  assert.equal(result.success, false);
});

test("plain-text salvage zachrání pouze validní top-level text", () => {
  assert.equal(salvageChatResponseTextV1({ text: "  Bezpečný text <b>bez HTML renderování</b>.  ", blocks: [{ type: "unknown" }] }), "Bezpečný text <b>bez HTML renderování</b>.");
  assert.equal(salvageChatResponseTextV1({ nested: { text: "Vnořený text" } }), null);
  assert.equal(salvageChatResponseTextV1({ text: "   " }), null);
  assert.equal(salvageChatResponseTextV1({ text: "x".repeat(2_001) }), null);
});

test("kontrakt odmítne asset cestu s backslash origin bypassem", () => {
  const result = chatResponseV1Schema.safeParse({
    ...baseResponse,
    mode: "preset",
    fallback: null,
    sources: [],
    blocks: [{
      type: "mediaCards",
      id: "media-1",
      cards: [{
        id: "card-1",
        title: "Nebezpečný obrázek",
        description: "Asset nesmí opustit důvěryhodný origin.",
        image: { src: "/\\evil.example/x", alt: "Test" },
      }],
    }],
  });
  assert.equal(result.success, false);
});

test("kontrakt odmítne duplicitní ID bloků", () => {
  const result = chatResponseV1Schema.safeParse({
    ...baseResponse,
    mode: "preset",
    fallback: null,
    sources: [],
    blocks: [
      { type: "infoCard", id: "duplicate", title: "A", text: "A" },
      { type: "infoCard", id: "duplicate", title: "B", text: "B" },
    ],
  });
  assert.equal(result.success, false);
});

test("registry coverage obsahuje každý ChatResponse v1 block právě jednou", () => {
  assert.deepEqual(CHAT_BLOCK_TYPES_V1, ["steps", "alert", "infoCard", "action", "mediaCards", "tariffComparison", "sourceList"]);
  assert.equal(new Set(CHAT_BLOCK_TYPES_V1).size, CHAT_BLOCK_TYPES_V1.length);
});

test("presentation planner zachová pořadí a seskupí jen bezprostřední alert/action za steps", () => {
  const blocks = [
    { type: "infoCard", id: "before" },
    { type: "steps", id: "steps" },
    { type: "alert", id: "warning" },
    { type: "action", id: "cta" },
    { type: "infoCard", id: "after" },
    { type: "alert", id: "standalone" },
  ];
  const units = planChatBlockPresentationV1(blocks, "billing", true);
  assert.deepEqual(units.map((unit) => unit.block.id), ["before", "steps", "after", "standalone"]);
  assert.deepEqual(units[1].companions.map((block) => block.id), ["warning", "cta"]);
  assert.deepEqual(units[3].companions, []);
});

test("internet alternativa používá pouze přesná IDs a zachová companions", () => {
  const blocks = [
    { type: "steps", id: "answer-steps" },
    { type: "alert", id: "warning" },
    { type: "action", id: "cta" },
    { type: "mediaCards", id: "answer-media" },
    { type: "sourceList", id: "sources", sourceIds: ["source-1"] },
  ];
  const mediaUnits = planChatBlockPresentationV1(blocks, "internet", true);
  assert.deepEqual(mediaUnits.map((unit) => unit.block.id), ["answer-media", "warning", "cta", "sources"]);
  const stepsUnits = planChatBlockPresentationV1(blocks, "internet", false);
  assert.deepEqual(stepsUnits.map((unit) => unit.block.id), ["answer-steps", "sources"]);
  assert.deepEqual(stepsUnits[0].companions.map((block) => block.id), ["warning", "cta"]);

  const otherIntentUnits = planChatBlockPresentationV1(blocks, "billing", true);
  assert.deepEqual(otherIntentUnits.map((unit) => unit.block.id), ["answer-steps", "answer-media", "sources"]);
});

test("presentation planner zachová opakované sourceList bloky a stabilní keys", () => {
  const blocks = [
    { type: "sourceList", id: "sources-a", sourceIds: ["source-1"] },
    { type: "infoCard", id: "info" },
    { type: "sourceList", id: "sources-b", sourceIds: ["source-2"] },
  ];
  const first = planChatBlockPresentationV1(blocks, "retrieved", true);
  const second = planChatBlockPresentationV1(blocks, "retrieved", true);
  assert.deepEqual(first.map((unit) => unit.block.id), ["sources-a", "info", "sources-b"]);
  assert.deepEqual(first.map((unit) => unit.sourceIds), [["source-1"], undefined, ["source-2"]]);
  assert.deepEqual(first.map((unit) => unit.key), second.map((unit) => unit.key));
});
