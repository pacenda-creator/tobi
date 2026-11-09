import assert from "node:assert/strict";
import test from "node:test";

import { chatRequestV1Schema, chatResponseV1Schema } from "../lib/contracts/chat/v1.ts";
import { declaredBodyFits, hasJsonContentType, hasValidMutationOrigin, isTobiAdminAuthorized } from "../lib/tobi-admin-auth.ts";
import { defaultTobiConfig, tobiConfigSchema, toPublicTobiConfig } from "../lib/tobi-config.ts";
import { readOrSeedTobiConfig, saveTobiConfigInRepository } from "../lib/tobi-config-repository.ts";
import { createNextTobiConfigSnapshot, mergeTobiConfigDraft, shouldApplyTobiConfigVersion, TobiConfigVersionConflictError } from "../lib/tobi-config-versioning.ts";
import { ragModelPlanJsonSchema } from "../lib/rag-response-plan.ts";
import { createOpenAiRequestBody, describeOpenAiError, hasAllowedGenerationEvidence, retrieveConfiguredKnowledge } from "../lib/tobi-runtime-policy.ts";

function requestWithHistory() {
  return chatRequestV1Schema.parse({
    contractVersion: "1",
    messages: [
      { role: "user", content: "První dotaz" },
      { role: "assistant", content: "Stará odpověď ze zdroje, který už může být vypnutý" },
      { role: "user", content: "Navazující dotaz" },
    ],
    context: { locale: "cs-CZ", channel: "web" },
  });
}

test("veřejná projekce nikdy neobsahuje interní prompt ani modelové parametry", () => {
  const publicConfig = toPublicTobiConfig(defaultTobiConfig);
  assert.equal("runtime" in publicConfig, false);
  assert.equal(JSON.stringify(publicConfig).includes(defaultTobiConfig.runtime.systemPrompt), false);
});

test("modelový request používá uložený model, prompt a reasoning, ale ne staré assistant zprávy", () => {
  const runtime = structuredClone(defaultTobiConfig.runtime);
  runtime.model = "gpt-6.1-sol";
  runtime.systemPrompt = "Testovací systémový prompt";
  runtime.reasoningEffort = "high";
  runtime.sources.webSearch = false;
  const body = createOpenAiRequestBody(requestWithHistory(), [], runtime);
  assert.equal(body.model, "gpt-6.1-sol");
  assert.match(body.instructions, /Testovací systémový prompt/);
  assert.deepEqual(body.reasoning, { effort: "high" });
  assert.deepEqual(body.input, [
    { role: "user", content: "První dotaz" },
    { role: "user", content: "Navazující dotaz" },
  ]);
  assert.equal("tools" in body, false);
});

test("strict Structured Outputs schema používá jen konzervativně podporované union a string prvky", () => {
  const serializedSchema = JSON.stringify(ragModelPlanJsonSchema);
  assert.equal(serializedSchema.includes('"oneOf"'), false);
  assert.equal(serializedSchema.includes('"anyOf"'), true);
  assert.equal(serializedSchema.includes('"const"'), false);
  assert.equal(serializedSchema.includes('"minLength"'), false);
  assert.equal(serializedSchema.includes('"maxLength"'), false);
});

test("diagnostika upstream chyby vypíše jen bezpečný omezený detail", () => {
  const details = describeOpenAiError({ error: { type: "invalid_request_error", code: "invalid_json_schema", param: "text.format.schema", message: "Schema sk-secret Bearer token" } });
  assert.deepEqual(details, {
    type: "invalid_request_error",
    code: "invalid_json_schema",
    param: "text.format.schema",
    message: "Schema [REDACTED] Bearer [REDACTED]",
  });
});

test("web search se přidá jen při povoleném zdroji", () => {
  const runtime = structuredClone(defaultTobiConfig.runtime);
  runtime.sources.webSearch = true;
  const body = createOpenAiRequestBody(requestWithHistory(), [], runtime);
  assert.equal(Array.isArray(body.tools), true);
  assert.equal(body.tool_choice, "required");
  assert.equal(hasAllowedGenerationEvidence([], [], runtime), false);
  assert.equal(hasAllowedGenerationEvidence([], [{ title: "Zdroj", url: "https://www.vodafone.cz/", snippet: "Podklad", updated: null, score: 100 }], runtime), true);
  runtime.sources.webSearch = false;
  assert.equal("tools" in createOpenAiRequestBody(requestWithHistory(), [], runtime), false);
});

test("temperature a reasoning mají modelově bezpečné kombinace", () => {
  const invalid = structuredClone(defaultTobiConfig);
  invalid.runtime.model = "gpt-4.1";
  invalid.runtime.reasoningEffort = "high";
  invalid.runtime.temperature = 0.4;
  assert.equal(tobiConfigSchema.safeParse(invalid).success, false);
  invalid.runtime.reasoningEffort = null;
  assert.equal(tobiConfigSchema.safeParse(invalid).success, true);
});

test("vypnuté lokální i preset zdroje nic nevrátí", () => {
  const none = retrieveConfiguredKnowledge("Nefunguje mi internet doma", { localIndex: false, presetKnowledge: false, webSearch: false });
  assert.deepEqual(none.retrieved, []);
  assert.equal(none.knowledge, null);
  const preset = retrieveConfiguredKnowledge("Nefunguje mi internet doma", { localIndex: false, presetKnowledge: true, webSearch: false });
  assert.equal(preset.knowledge?.id, "internet");
  const local = retrieveConfiguredKnowledge("Jak zaplatím vyúčtování?", { localIndex: true, presetKnowledge: false, webSearch: false });
  assert.ok(local.retrieved.length > 0);
  assert.equal(local.knowledge, null);
});

test("optimistické verzování zachová poslední platnou konfiguraci při konfliktu", () => {
  const current = { configVersion: 3, updatedAt: "2026-11-04T10:00:00.000Z", config: structuredClone(defaultTobiConfig) };
  assert.throws(() => createNextTobiConfigSnapshot(current, defaultTobiConfig, 2), TobiConfigVersionConflictError);
  const next = createNextTobiConfigSnapshot(current, defaultTobiConfig, 3, "2026-11-04T10:01:00.000Z");
  assert.equal(next.configVersion, 4);
  assert.equal(current.configVersion, 3);
});

test("model, reasoning a temperature se při konfliktu slučují jako jedna platná skupina", () => {
  const base = structuredClone(defaultTobiConfig);
  const latest = structuredClone(base);
  latest.runtime.model = "gpt-4.1";
  latest.runtime.reasoningEffort = null;
  latest.runtime.temperature = 0.4;
  const draft = structuredClone(base);
  draft.runtime.reasoningEffort = "high";
  const merged = mergeTobiConfigDraft(latest, base, draft);
  assert.equal(merged.runtime.model, draft.runtime.model);
  assert.equal(merged.runtime.reasoningEffort, "high");
  assert.equal(merged.runtime.temperature, draft.runtime.temperature);
  assert.equal(tobiConfigSchema.safeParse(merged).success, true);
});

test("merge konfliktu zachová novější dostupnost, pokud ji draft nezměnil", () => {
  const base = structuredClone(defaultTobiConfig);
  const latest = structuredClone(base);
  latest.operatorAvailability = "online";
  const draft = structuredClone(base);
  draft.copy.welcome = "Změněné uvítání";
  const merged = mergeTobiConfigDraft(latest, base, draft);
  assert.equal(merged.operatorAvailability, "online");
  assert.equal(merged.copy.welcome, "Změněné uvítání");

  const changedDraft = structuredClone(base);
  changedDraft.operatorAvailability = "offline";
  assert.equal(mergeTobiConfigDraft(latest, base, changedDraft).operatorAvailability, "offline");
});

test("repository seed, atomický update a konflikt zachovají poslední platnou konfiguraci", async () => {
  let row = null;
  const repository = {
    async readActive() { return row ? structuredClone(row) : null; },
    async insertSeed(snapshot) {
      if (!row) row = { configVersion: snapshot.configVersion, config: structuredClone(snapshot.config), updatedAt: snapshot.updatedAt };
    },
    async updateActive(config, expectedVersion, updatedAt) {
      if (!row || row.configVersion !== expectedVersion) return null;
      row = { configVersion: expectedVersion + 1, config: structuredClone(config), updatedAt };
      return structuredClone(row);
    },
  };

  const seeded = await readOrSeedTobiConfig(repository);
  assert.equal(seeded.configVersion, 1);
  const changed = structuredClone(defaultTobiConfig);
  changed.copy.welcome = "Aktuální uvítání";
  changed.operatorAvailability = "online";
  const saved = await saveTobiConfigInRepository(repository, changed, 1);
  assert.equal(saved.configVersion, 2);
  assert.equal(saved.config.copy.welcome, "Aktuální uvítání");
  assert.equal(saved.config.operatorAvailability, "online");
  await assert.rejects(() => saveTobiConfigInRepository(repository, defaultTobiConfig, 1), (error) => {
    assert.ok(error instanceof TobiConfigVersionConflictError);
    assert.equal(error.current.configVersion, 2);
    assert.equal(error.current.config.copy.welcome, "Aktuální uvítání");
    assert.equal(error.current.config.operatorAvailability, "online");
    return true;
  });
});

test("repository odmítne poškozenou konfiguraci a propustí chybu úložiště", async () => {
  const corrupt = {
    async readActive() { return { configVersion: 4, config: { invalid: true }, updatedAt: new Date().toISOString() }; },
    async insertSeed() { throw new Error("insert se nemá volat"); },
    async updateActive() { return null; },
  };
  await assert.rejects(() => readOrSeedTobiConfig(corrupt));

  const unavailable = {
    async readActive() { throw new Error("D1 unavailable"); },
    async insertSeed() {},
    async updateActive() { throw new Error("D1 unavailable"); },
  };
  await assert.rejects(() => readOrSeedTobiConfig(unavailable), /D1 unavailable/);
  await assert.rejects(() => saveTobiConfigInRepository(unavailable, defaultTobiConfig, 1), /D1 unavailable/);
});

test("klient přijme jen platnou stejnou nebo novější verzi", () => {
  assert.equal(shouldApplyTobiConfigVersion(4, 5), true);
  assert.equal(shouldApplyTobiConfigVersion(4, 4), true);
  assert.equal(shouldApplyTobiConfigVersion(4, 3), false);
});

test("chat odpověď přenáší configVersion", () => {
  const response = chatResponseV1Schema.parse({
    contractVersion: "1", configVersion: 7, responseId: "response", mode: "preset", text: "Hotovo.",
    blocks: [], quickReplies: [], sources: [], intent: { id: "done", label: "Hotovo", confidence: 1 }, fallback: null,
  });
  assert.equal(response.configVersion, 7);
});

test("admin API odmítá raw identitu a zachová mutace stejného originu s JSON limitem", () => {
  const previousEmails = process.env.TOBI_ADMIN_EMAILS;
  process.env.TOBI_ADMIN_EMAILS = "admin@example.com";
  try {
    assert.equal(isTobiAdminAuthorized(new Headers({ "oai-authenticated-user-id": "user-1", "oai-authenticated-user-email": "ADMIN@example.com" })), false);
    assert.equal(isTobiAdminAuthorized(new Headers({ "oai-authenticated-user-email": "ADMIN@example.com" })), false);
    assert.equal(isTobiAdminAuthorized(new Headers({ "oai-authenticated-user-id": "user-1" })), false);
    assert.equal(isTobiAdminAuthorized(new Headers({ "oai-authenticated-user-id": "user-2", "oai-authenticated-user-email": "customer@example.com" })), false);
    const request = new Request("https://tobi.example/api/config/admin", { method: "PUT", headers: { Origin: "https://tobi.example", "Content-Type": "application/json; charset=utf-8", "Content-Length": "512" }, body: "{}" });
    assert.equal(hasValidMutationOrigin(request), true);
    assert.equal(hasJsonContentType(request), true);
    assert.equal(declaredBodyFits(request), true);
    const crossOrigin = new Request("https://tobi.example/api/config/admin", { method: "PUT", headers: { Origin: "https://evil.example", "Content-Type": "application/json" }, body: "{}" });
    assert.equal(hasValidMutationOrigin(crossOrigin), false);
  } finally {
    if (previousEmails === undefined) delete process.env.TOBI_ADMIN_EMAILS;
    else process.env.TOBI_ADMIN_EMAILS = previousEmails;
  }
});
