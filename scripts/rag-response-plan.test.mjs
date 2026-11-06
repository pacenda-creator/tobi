import assert from "node:assert/strict";
import test from "node:test";

import { parseRagModelOutput } from "../lib/rag-response-plan.ts";

test("RAG plán přijme pouze povolené UI bloky", () => {
  const result = parseRagModelOutput(JSON.stringify({
    text: "Zkontrolujte nastavení služby.",
    blocks: [
      { type: "steps", title: "Postup", items: ["Otevřete samoobsluhu.", "Vyberte službu."] },
      { type: "alert", severity: "warning", title: null, text: "Nesdílejte přihlašovací údaje." },
    ],
    quickReplies: [{ label: "Potřebuji upřesnit", message: "Chci upřesnit službu." }],
  }));
  assert.equal(result.plan?.blocks.length, 2);
  assert.equal(result.plan?.quickReplies.length, 1);
});

test("RAG plán přijme bezpečné akce a vizuální karty z uzavřeného registru", () => {
  const result = parseRagModelOutput(JSON.stringify({
    text: "Co přesně na telefonu nefunguje?",
    blocks: [
      {
        type: "mediaCards",
        cards: [
          { title: "Volání", description: "Nejdou hovory.", visual: "phone-calls", actionLabel: "Vybrat", actionMessage: "Nejde mi volat." },
          { title: "Data", description: "Nejde internet.", visual: "phone-data", actionLabel: "Vybrat", actionMessage: "Nejdou mi data." },
        ],
      },
      { type: "action", label: "Popsat jiný problém", message: "Mám jiný problém s telefonem." },
    ],
    quickReplies: [],
  }));
  assert.equal(result.plan?.blocks[0].type, "mediaCards");
  assert.equal(result.plan?.blocks[1].type, "action");
});

test("RAG plán odmítne modelový obrázek mimo uzavřený registr", () => {
  const result = parseRagModelOutput(JSON.stringify({
    text: "Vyberte možnost.",
    blocks: [{
      type: "mediaCards",
      cards: [
        { title: "A", description: "A", visual: "https://evil.example/a.png", actionLabel: null, actionMessage: null },
        { title: "B", description: "B", visual: "phone-data", actionLabel: null, actionMessage: null },
      ],
    }],
    quickReplies: [],
  }));
  assert.equal(result.plan, null);
});

test("RAG plán odmítne libovolný typ komponenty", () => {
  const result = parseRagModelOutput(JSON.stringify({ text: "Bezpečný text.", blocks: [{ type: "customHtml", html: "<b>text</b>" }], quickReplies: [] }));
  assert.equal(result.plan, null);
  assert.equal(result.plainText, "Bezpečný text.");
});

test("RAG fallback odstraní HTML a CSS z prostého textu", () => {
  const html = parseRagModelOutput("<b>Bezpečný</b> text.");
  const css = parseRagModelOutput("body { color: red; } Použijte samoobsluhu.");
  assert.equal(html.plan, null);
  assert.equal(html.plainText, "Bezpečný text.");
  assert.equal(css.plainText, "body Použijte samoobsluhu.");
});
