import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

import { defaultTobiConfig } from "../lib/tobi-config.ts";
import {
  ROUTER_IMAGE_MAX_BYTES,
  applyRouterDiagnosticTransition,
  canUploadRouterPhoto,
  createRouterVisionResponse,
  routerDiagnosticsCatalog,
  routerVisionResultSchema,
} from "../lib/router-diagnostics.ts";
import { handleRouterDiagnosticAnalyze } from "../lib/router-diagnostics-server.ts";
import { validateRouterImage } from "../lib/router-image-validation.ts";
import { MockRouterVisionProvider, unavailableRouterVisionResult } from "../lib/router-vision-provider.ts";

function pngFixture(width = 200, height = 200, extraBytes = 0) {
  const bytes = new Uint8Array(24 + extraBytes);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  bytes.set([0, 0, 0, 13, 73, 72, 68, 82], 8);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

const uploadState = {
  scenarioId: "demo-internet",
  stepId: "photo-offer",
  choices: [],
  allowedTransitionIds: ["internet-photo-skip"],
};

const knownResult = routerVisionResultSchema.parse({
  schemaVersion: "1",
  routerModelId: "vodafone-station-wifi6",
  observations: [
    { indicator: "power", state: "solid" },
    { indicator: "internet", state: "off" },
  ],
  confidence: 0.92,
  imageQuality: "readable",
  unknownReason: null,
});

const configSnapshot = {
  configVersion: 1,
  updatedAt: "2026-11-07T00:00:00.000Z",
  config: structuredClone(defaultTobiConfig),
};

function analyzeRequest(state = uploadState, bytes = pngFixture(), mime = "image/png", filename = "private-router-name.png") {
  const form = new FormData();
  form.set("image", new File([bytes], filename, { type: mime }));
  form.set("conversationState", JSON.stringify(state));
  return new Request("https://tobi.invalid/api/router-diagnostics/v1/analyze", { method: "POST", body: form, headers: { "Sec-Fetch-Site": "same-origin" } });
}

function fixtureJpeg() {
  return new Uint8Array(readFileSync(new URL("../artifacts/router-diagnostics/vodafone-station-wifi6-online-test.jpg", import.meta.url)));
}

function countingProvider(result = knownResult) {
  return {
    calls: 0,
    async analyze() {
      this.calls += 1;
      return structuredClone(result);
    },
  };
}

async function withFixtureFlag(value, callback) {
  const previous = process.env.TOBI_ROUTER_VISION_FIXTURES_ENABLED;
  if (value === undefined) delete process.env.TOBI_ROUTER_VISION_FIXTURES_ENABLED;
  else process.env.TOBI_ROUTER_VISION_FIXTURES_ENABLED = value;
  try {
    return await callback();
  } finally {
    if (previous === undefined) delete process.env.TOBI_ROUTER_VISION_FIXTURES_ENABLED;
    else process.env.TOBI_ROUTER_VISION_FIXTURES_ENABLED = previous;
  }
}

test("katalog je rozšiřitelný a obsahuje ověřené modely z Vodafone stránek", () => {
  assert.equal(routerDiagnosticsCatalog.length, 7);
  assert.equal(new Set(routerDiagnosticsCatalog.map((model) => model.id)).size, routerDiagnosticsCatalog.length);
  assert.ok(routerDiagnosticsCatalog.every((model) => model.sourceUrl.startsWith("https://www.vodafone.cz/pece/")));
  assert.equal(new Set(routerDiagnosticsCatalog.map((model) => model.image)).size, 7);
  for (const model of routerDiagnosticsCatalog) {
    assert.match(model.image, /^\/tobi\/routers\/[a-z0-9-]+\.(?:png|jpg)$/);
    const localAsset = new URL(`../public${model.image}`, import.meta.url);
    assert.equal(existsSync(localAsset), true, `Chybí lokální fotografie ${model.image}`);
    assert.ok(statSync(localAsset).size > 10_000, `Fotografie ${model.image} je podezřele malá`);
  }
});

test("validace používá signaturu, rozměry a serverové limity", () => {
  const valid = validateRouterImage(pngFixture(), "image/png");
  assert.equal(valid.ok, true);
  assert.equal(valid.image.width, 200);
  assert.equal(validateRouterImage(pngFixture(), "image/jpeg").error, "unsupported_type");
  assert.equal(validateRouterImage(new Uint8Array([1, 2, 3]), "image/png").error, "invalid_image");
  assert.equal(validateRouterImage(pngFixture(5000, 200), "image/png").error, "dimensions_exceeded");
  assert.equal(validateRouterImage(pngFixture(4096, 4096), "image/png").error, "dimensions_exceeded");
  assert.equal(validateRouterImage(pngFixture(200, 200, ROUTER_IMAGE_MAX_BYTES), "image/png").error, "too_large");
});

test("klient zachová přesné bajty fotografie do 2048 px a větší dál zmenšuje", () => {
  const source = readFileSync(new URL("../components/tobi-studio.tsx", import.meta.url), "utf8");
  const functionStart = source.indexOf("async function normalizeRouterPhoto");
  const functionEnd = source.indexOf("\nfunction initialMessage", functionStart);
  const normalizeSource = source.slice(functionStart, functionEnd);
  const minimumDimensionsCheck = normalizeSource.indexOf("bitmap.width < 160 || bitmap.height < 160");
  const preserveBranch = normalizeSource.indexOf("Math.max(bitmap.width, bitmap.height) <= 2048");
  const exactByteCopy = normalizeSource.indexOf("new File([file], `router-photo.${extension}`");
  const canvasPath = normalizeSource.indexOf('document.createElement("canvas")');

  assert.ok(functionStart >= 0 && functionEnd > functionStart);
  assert.ok(minimumDimensionsCheck >= 0 && minimumDimensionsCheck < preserveBranch);
  assert.ok(preserveBranch >= 0 && preserveBranch < exactByteCopy);
  assert.ok(exactByteCopy >= 0 && exactByteCopy < canvasPath);
  assert.match(normalizeSource, /new File\(\[file\], `router-photo\.\$\{extension\}`, \{ type: file\.type, lastModified: Date\.now\(\) \}\)/);
  assert.match(normalizeSource.slice(canvasPath), /canvas\.toBlob/);
});

test("neplatný nebo nejistý vision výstup vždy vede do ručního fallbacku", () => {
  for (const result of [
    { arbitraryAction: { kind: "openUrl", url: "https://evil.example" } },
    { ...knownResult, routerModelId: "unknown-router" },
    { ...knownResult, confidence: 4 },
    { ...knownResult, observations: [{ indicator: "internet", state: "execute-reset" }] },
  ]) {
    const response = createRouterVisionResponse(result, uploadState);
    assert.equal(response.conversationState.stepId, "router-manual-model");
    assert.ok(response.blocks.every((block) => block.type !== "action" || block.action.kind === "sendMessage"));
    assert.doesNotMatch(JSON.stringify(response), /evil\.example|execute-reset/);
  }
});

test("nedostupný vision provider se nevydává za rozmazanou fotografii", () => {
  const result = unavailableRouterVisionResult();
  assert.equal(result.imageQuality, "unknown");
  assert.equal(result.unknownReason, "invalid_output");
  const response = createRouterVisionResponse(result, uploadState);
  assert.equal(response.text, "Fotku se nepodařilo zpracovat. Který modem máte doma?");
  assert.doesNotMatch(response.text, /rozmaz/i);
});

test("statická fotografie netvrdí blikání a chybějící kontrolka není vypnutá", () => {
  const blinking = createRouterVisionResponse({ ...knownResult, observations: [{ indicator: "internet", state: "blinking" }] }, uploadState);
  const missing = createRouterVisionResponse({ ...knownResult, observations: [{ indicator: "power", state: "solid" }] }, uploadState);
  assert.equal(blinking.conversationState.stepId, "router-manual-model");
  assert.equal(missing.conversationState.stepId, "router-manual-model");
});

test("potvrzená hypotéza vede jen na katalogový krok a otázku Pomohlo to", () => {
  const hypothesis = createRouterVisionResponse(knownResult, uploadState);
  assert.match(hypothesis.conversationState.stepId, /^router-confirm-/);
  const advice = applyRouterDiagnosticTransition(hypothesis.conversationState, "router-confirm-yes");
  assert.equal(advice.ok, true);
  assert.equal(advice.response.quickReplyPrompt, "Pomohlo to?");
  assert.match(JSON.stringify(advice.response.blocks), /Nemačkejte tlačítko Reset/);
  const resolved = applyRouterDiagnosticTransition(advice.response.conversationState, "router-helped");
  assert.equal(resolved.ok, true);
  assert.equal(resolved.response.conversationState, null);
});

test("ruční fallback je strukturovaný a nepovolí podvržený přechod", () => {
  const fallback = createRouterVisionResponse(null, uploadState);
  assert.equal(fallback.text, "Fotku se nepodařilo zpracovat. Který modem máte doma?");
  assert.equal(fallback.blocks.length, 1);
  assert.equal(fallback.blocks[0]?.type, "mediaCards");
  assert.equal(fallback.blocks[0]?.presentation, "selection");
  assert.equal(fallback.blocks[0]?.cards.length, 7);
  assert.deepEqual(fallback.quickReplies.map((reply) => reply.label), ["Jiný model / nevím", "Přidat jinou fotku"]);
  assert.equal(fallback.quickReplies[0]?.action.transitionId, "router-skip-text");
  assert.equal(fallback.quickReplies[1]?.action.kind, "requestUpload");
  for (const card of fallback.blocks[0].cards) {
    assert.match(card.image.src, /^\/tobi\/routers\//);
    assert.equal(card.action.label, "To je můj modem");
    assert.equal(card.action.action.kind, "sendMessage");
    assert.match(card.action.action.transitionId, /^router-model-/);
  }
  const whiteCompal = fallback.blocks[0].cards.find((card) => card.id === "select-compal-ch7465-white");
  const blackCompal = fallback.blocks[0].cards.find((card) => card.id === "select-compal-ch7465-black");
  const wifi6Station = fallback.blocks[0].cards.find((card) => card.id === "select-vodafone-station-wifi6");
  const fibreStation = fallback.blocks[0].cards.find((card) => card.id === "select-vodafone-station-fibre");
  assert.equal(whiteCompal.action.action.message, "Mám bílý Compal CH7465.");
  assert.equal(blackCompal.action.action.message, "Mám černý Compal CH7465.");
  assert.equal(wifi6Station.description, "Kabelový modem");
  assert.equal(fibreStation.description, "Optický modem");
  assert.doesNotMatch(`${wifi6Station.description} ${fibreStation.description} ${fibreStation.image.alt}`, /bíl/i);
  assert.doesNotMatch(JSON.stringify(fallback), /v této ukázce|podporovan|katalog|prototyp/i);
  const modelTransition = fallback.blocks[0].cards[0].action.action.transitionId;
  const indicator = applyRouterDiagnosticTransition(fallback.conversationState, modelTransition);
  assert.equal(indicator.ok, true);
  assert.match(indicator.response.conversationState.stepId, /^router-manual-indicator-/);
  assert.equal(applyRouterDiagnosticTransition({ ...fallback.conversationState, allowedTransitionIds: ["router-helped"] }, "router-helped").ok, false);
  assert.equal(canUploadRouterPhoto({ ...uploadState, stepId: "after-restart" }), false);
});

test("upload endpoint přijme explicitní platný krok a neloguje soubor ani obraz", async () => {
  const logged = [];
  const originalInfo = console.info;
  console.info = (...args) => logged.push(args);
  try {
    const response = await handleRouterDiagnosticAnalyze(analyzeRequest(), { provider: new MockRouterVisionProvider(knownResult), configSnapshot });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.match(payload.conversationState.stepId, /^router-confirm-/);
    const serialized = JSON.stringify(logged);
    assert.doesNotMatch(serialized, /private-router-name|iVBOR|base64/i);
  } finally {
    console.info = originalInfo;
  }
});

test("povolený přesný staging fixture vrátí validní hypotézu bez volání provideru", async () => {
  await withFixtureFlag("true", async () => {
    const provider = countingProvider();
    const logged = [];
    const originalInfo = console.info;
    console.info = (...args) => logged.push(args);
    try {
      const response = await handleRouterDiagnosticAnalyze(
        analyzeRequest(uploadState, fixtureJpeg(), "image/jpeg", "vodafone-station-wifi6-online-test.jpg"),
        { provider, configSnapshot },
      );
      assert.equal(response.status, 200);
      assert.equal(provider.calls, 0);
      const payload = await response.json();
      assert.match(payload.conversationState.stepId, /router-confirm-vodafone-station-wifi6-normal$/);
      assert.match(JSON.stringify(payload.blocks), /napájení zřejmě svítí, internet zřejmě svítí, Wi-Fi zřejmě svítí/);
      assert.doesNotMatch(JSON.stringify(logged), /C52F6D0B|base64|\/9j\//i);
    } finally {
      console.info = originalInfo;
    }
  });
});

test("vypnutý fixture flag vždy použije vision provider", async () => {
  await withFixtureFlag(undefined, async () => {
    const provider = countingProvider();
    const response = await handleRouterDiagnosticAnalyze(
      analyzeRequest(uploadState, fixtureJpeg(), "image/jpeg", "fixture.jpg"),
      { provider, configSnapshot },
    );
    assert.equal(response.status, 200);
    assert.equal(provider.calls, 1);
    const payload = await response.json();
    assert.match(payload.conversationState.stepId, /router-confirm-vodafone-station-wifi6-connection-off$/);
  });
});

test("změna jediného bajtu fixture zruší shodu a zavolá provider", async () => {
  await withFixtureFlag("true", async () => {
    const bytes = fixtureJpeg();
    bytes[bytes.length - 1] ^= 1;
    assert.equal(validateRouterImage(bytes, "image/jpeg").ok, true);
    const provider = countingProvider();
    const response = await handleRouterDiagnosticAnalyze(
      analyzeRequest(uploadState, bytes, "image/jpeg", "changed-fixture.jpg"),
      { provider, configSnapshot },
    );
    assert.equal(response.status, 200);
    assert.equal(provider.calls, 1);
  });
});

test("neplatný obraz se odmítne před výpočtem fixture hashe", async () => {
  await withFixtureFlag("true", async () => {
    let fixtureResolverCalls = 0;
    const provider = countingProvider();
    const response = await handleRouterDiagnosticAnalyze(
      analyzeRequest(uploadState, new Uint8Array([1, 2, 3]), "image/jpeg", "invalid.jpg"),
      {
        provider,
        configSnapshot,
        fixtureResolver: async () => {
          fixtureResolverCalls += 1;
          return knownResult;
        },
      },
    );
    assert.equal(response.status, 400);
    assert.equal(fixtureResolverCalls, 0);
    assert.equal(provider.calls, 0);
  });
});

test("chyba fixture i provideru zůstává klasifikovaná jako invalid_output", async () => {
  await withFixtureFlag("true", async () => {
    const response = await handleRouterDiagnosticAnalyze(
      analyzeRequest(uploadState, fixtureJpeg(), "image/jpeg", "fixture.jpg"),
      {
        configSnapshot,
        fixtureResolver: async () => { throw new Error("fixture_failed"); },
        provider: { analyze: async () => { throw new Error("provider_failed"); } },
      },
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.text, "Fotku se nepodařilo zpracovat. Který modem máte doma?");
    assert.equal(payload.conversationState.stepId, "router-manual-model");
  });
});

test("upload endpoint odmítne nevyžádaný upload a chybný MIME", async () => {
  const invalidState = await handleRouterDiagnosticAnalyze(analyzeRequest({ ...uploadState, stepId: "after-restart" }), { provider: new MockRouterVisionProvider(knownResult), configSnapshot });
  assert.equal(invalidState.status, 409);
  const invalidMime = await handleRouterDiagnosticAnalyze(analyzeRequest(uploadState, pngFixture(), "image/jpeg"), { provider: new MockRouterVisionProvider(knownResult), configSnapshot });
  assert.equal(invalidMime.status, 400);
});

test("feature flag bezpečně vypne endpoint", async () => {
  const disabled = structuredClone(configSnapshot);
  disabled.config.features.routerPhotoDiagnostics = false;
  const response = await handleRouterDiagnosticAnalyze(analyzeRequest(), { provider: new MockRouterVisionProvider(knownResult), configSnapshot: disabled });
  assert.equal(response.status, 404);
});
