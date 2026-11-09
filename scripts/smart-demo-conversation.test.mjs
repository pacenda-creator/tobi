import assert from "node:assert/strict";
import test from "node:test";

import { createSmartDemoResponse, isAmbiguousBlockedPhone, isBroadPhoneProblem } from "../lib/smart-demo-conversation.ts";

test("obecný problém s telefonem vyvolá konkrétní vizuální doptání", () => {
  assert.equal(isBroadPhoneProblem("Nefunguje mi telefon."), true);
  const response = createSmartDemoResponse("Nefunguje mi telefon.");
  assert.ok(response);
  assert.match(response.text, /co přesně/i);
  assert.equal(response.blocks[0].type, "mediaCards");
  assert.deepEqual(response.blocks[0].cards.map((card) => card.title), [
    "Volání nebo SMS",
    "Mobilní data",
    "Telefon se nezapne",
    "Displej nebo aplikace",
  ]);
  assert.equal(response.blocks[0].cards.every((card) => card.action?.action.kind === "sendMessage"), true);
});

test("konkrétní problém se zapnutím dostane věcný postup a bezpečnostní upozornění", () => {
  const response = createSmartDemoResponse("Telefon se nezapne ani po připojení nabíječky.");
  assert.ok(response);
  assert.deepEqual(response.blocks.map((block) => block.type), ["steps", "alert"]);
  assert.equal(response.quickReplies.length, 2);
});

test("chytrý demo fallback nepřebírá již konkrétní dotaz na volání", () => {
  assert.equal(createSmartDemoResponse("Nejde volat ani přijímat hovory."), null);
});

test("zablokovaný telefon se nejdřív rozliší podle významu", () => {
  assert.equal(isAmbiguousBlockedPhone("Mám zablokovaný telefon, co s tím?"), true);
  const response = createSmartDemoResponse("Mám zablokovaný telefon, co s tím?");
  assert.ok(response);
  assert.match(response.text, /co je přesně zablokované/i);
  assert.equal(response.blocks[0].type, "mediaCards");
  assert.deepEqual(response.blocks[0].cards.map((card) => card.title), [
    "SIM žádá PIN nebo PUK",
    "Zapomenutý kód obrazovky",
    "Ztracený nebo odcizený telefon",
    "Telefon je blokovaný v síti",
  ]);
});

test("ztracený telefon a zámek obrazovky pokračují rozdílnou diagnostikou", () => {
  const lost = createSmartDemoResponse("Ztratil jsem telefon a potřebuji zablokovat SIM i zařízení.");
  const screen = createSmartDemoResponse("Zapomněl jsem kód zámku obrazovky telefonu.");
  assert.deepEqual(lost?.blocks.map((block) => block.type), ["steps", "alert", "action"]);
  assert.equal(screen?.quickReplies.length, 2);
  assert.match(screen?.text || "", /iPhone.*Android/i);
});
