import assert from "node:assert/strict";
import test from "node:test";

import {
  INTRO_HELPER_MAX_LABEL_LENGTH,
  INTRO_HELPER_MAX_LENGTH,
  INTRO_HELPER_MAX_LINKS,
  INTRO_HELPER_MAX_URL_LENGTH,
  parseIntroHelperMarkup,
} from "../lib/intro-helper-markup.ts";
import { defaultTobiConfig, tobiConfigSchema, toPublicTobiConfig } from "../lib/tobi-config.ts";

test("konfigurace přijme všechny varianty úvodních témat", () => {
  for (const displayMode of ["none", "list", "carousel"]) {
    const candidate = structuredClone(defaultTobiConfig);
    candidate.presentation.intro.displayMode = displayMode;
    assert.equal(tobiConfigSchema.parse(candidate).presentation.intro.displayMode, displayMode);
  }
});

test("konfigurace přijme všechny varianty ikony TOBi", () => {
  for (const iconVariant of ["sparkles", "vodafone", "ai-modern"]) {
    const candidate = structuredClone(defaultTobiConfig);
    candidate.brand.iconVariant = iconVariant;
    assert.equal(tobiConfigSchema.parse(candidate).brand.iconVariant, iconVariant);
  }
});

test("starší uložená konfigurace dostane bezpečnou výchozí ikonu", () => {
  const legacy = structuredClone(defaultTobiConfig);
  delete legacy.brand.iconVariant;
  assert.equal(tobiConfigSchema.parse(legacy).brand.iconVariant, "sparkles");
});

test("starší uložená konfigurace dostane neznámou dostupnost operátora", () => {
  const legacy = structuredClone(defaultTobiConfig);
  delete legacy.operatorAvailability;
  const parsed = tobiConfigSchema.parse(legacy);
  assert.equal(parsed.operatorAvailability, "unknown");
  assert.equal(toPublicTobiConfig(parsed).operatorAvailability, "unknown");
});

test("veřejná konfigurace přijme pouze tři bezpečné stavy operátora", () => {
  for (const operatorAvailability of ["unknown", "online", "offline"]) {
    const candidate = structuredClone(defaultTobiConfig);
    candidate.operatorAvailability = operatorAvailability;
    assert.equal(toPublicTobiConfig(candidate).operatorAvailability, operatorAvailability);
  }
  const invalid = structuredClone(defaultTobiConfig);
  invalid.operatorAvailability = "busy";
  assert.equal(tobiConfigSchema.safeParse(invalid).success, false);
});

test("počet úvodních témat je omezen na deset", () => {
  assert.equal(defaultTobiConfig.introUseCases.length, 10);
  const candidate = structuredClone(defaultTobiConfig);
  candidate.presentation.intro.visibleTopicsCount = 11;
  assert.equal(tobiConfigSchema.safeParse(candidate).success, false);
});

test("mini-markup zachová prostý text a raw HTML jako text", () => {
  const plain = parseIntroHelperMarkup("Nebo mi napište vlastní dotaz.");
  assert.equal(plain.success, true);
  assert.deepEqual(plain.tokens, [{ type: "text", value: "Nebo mi napište vlastní dotaz." }]);

  const html = parseIntroHelperMarkup('<a href="javascript:alert(1)">Není to aktivní HTML</a>');
  assert.equal(html.success, true);
  assert.deepEqual(html.tokens, [{ type: "text", value: '<a href="javascript:alert(1)">Není to aktivní HTML</a>' }]);

  const lineBreak = parseIntroHelperMarkup("První<br>druhý");
  assert.equal(lineBreak.success, true);
  assert.deepEqual(lineBreak.tokens, [{ type: "text", value: "První<br>druhý" }]);
});

test("mini-markup vrací více HTTPS odkazů ve správném pořadí", () => {
  const result = parseIntroHelperMarkup("Otevřete [Centrum péče](https://www.vodafone.cz/pece/?kanal=chat#kontakt) nebo [výpadky](https://www.vodafone.cz/vypadky/).");
  assert.equal(result.success, true);
  assert.equal(result.linkCount, 2);
  assert.deepEqual(result.tokens.map((token) => token.type), ["text", "link", "text", "link", "text"]);
  assert.deepEqual(result.tokens.filter((token) => token.type === "link"), [
    { type: "link", label: "Centrum péče", url: "https://www.vodafone.cz/pece/?kanal=chat#kontakt" },
    { type: "link", label: "výpadky", url: "https://www.vodafone.cz/vypadky/" },
  ]);
});

test("mini-markup vrací kanonickou absolutní HTTPS adresu", () => {
  const result = parseIntroHelperMarkup("[Péče](https://EXAMPLE.com/a/../pece?kanal=chat#kontakt)");
  assert.equal(result.success, true);
  assert.deepEqual(result.tokens, [{ type: "link", label: "Péče", url: "https://example.com/pece?kanal=chat#kontakt" }]);
});

test("mini-markup podporuje escapované oddělovače a zpětné lomítko", () => {
  const result = parseIntroHelperMarkup(String.raw`\[hranaté závorky\] [text \[A\]](https://example.com/a\(b\)?x=1#frag) \\ konec`);
  assert.equal(result.success, true);
  assert.deepEqual(result.tokens, [
    { type: "text", value: "[hranaté závorky] " },
    { type: "link", label: "text [A]", url: "https://example.com/a(b)?x=1#frag" },
    { type: "text", value: " \\ konec" },
  ]);
});

test("mini-markup podporuje tučné úseky vedle více odkazů", () => {
  const result = parseIntroHelperMarkup("**Tip:** Otevřete [péči](https://example.com/pece) nebo [výpadky](https://example.com/vypadky). **Důležité.**");
  assert.equal(result.success, true);
  assert.equal(result.linkCount, 2);
  assert.deepEqual(result.tokens, [
    { type: "strong", value: "Tip:" },
    { type: "text", value: " Otevřete " },
    { type: "link", label: "péči", url: "https://example.com/pece" },
    { type: "text", value: " nebo " },
    { type: "link", label: "výpadky", url: "https://example.com/vypadky" },
    { type: "text", value: ". " },
    { type: "strong", value: "Důležité." },
  ]);
});

test("mini-markup zachová samostatné, escapované, prázdné a neuzavřené hvězdičky doslova", () => {
  const escaped = parseIntroHelperMarkup(String.raw`\*doslova\* a *jedna* a **tučně \*s hvězdou\***`);
  assert.equal(escaped.success, true);
  assert.deepEqual(escaped.tokens, [
    { type: "text", value: "*doslova* a *jedna* a " },
    { type: "strong", value: "tučně *s hvězdou*" },
  ]);
  for (const value of ["Nedokončené **tučně", "Prázdné **** dál", "Samotná * hvězda"]) {
    const result = parseIntroHelperMarkup(value);
    assert.equal(result.success, true, value);
    assert.deepEqual(result.tokens, [{ type: "text", value }], value);
  }
});

test("mini-markup nepovolí vnořený odkaz do tučného tokenu", () => {
  const result = parseIntroHelperMarkup("**[Péče](https://example.com)**");
  assert.equal(result.success, true);
  assert.equal(result.linkCount, 0);
  assert.deepEqual(result.tokens, [{ type: "strong", value: "[Péče](https://example.com)" }]);
});

test("mini-markup zachová LF, CRLF, prázdný řádek a newline uvnitř bold i labelu", () => {
  const result = parseIntroHelperMarkup("První\nDruhý\n\nČtvrtý\r\n**Tučně\nna dvou řádcích**\n[Více\nřádků](https://example.com/pece)");
  assert.equal(result.success, true);
  assert.deepEqual(result.tokens, [
    { type: "text", value: "První\nDruhý\n\nČtvrtý\r\n" },
    { type: "strong", value: "Tučně\nna dvou řádcích" },
    { type: "text", value: "\n" },
    { type: "link", label: "Více\nřádků", url: "https://example.com/pece" },
  ]);
  assert.equal(parseIntroHelperMarkup("[URL](https://example.com/pece\ndalsi)").success, false);
});

test("mini-markup odmítne nebezpečné a neúplné odkazy", () => {
  const invalid = [
    "[HTTP](http://example.com)",
    "[Chybí lomítka](https:example.com)",
    "[Chybí lomítko](https:/example.com)",
    "[Velká písmena](HTTPS://example.com)",
    "[JavaScript](javascript:alert(1))",
    "[Data](data:text/plain,ahoj)",
    "[Relativní](/pece)",
    "[Protocol relative](//example.com/pece)",
    "[Přihlašovací údaje](https://user:secret@example.com/pece)",
    "[](https://example.com)",
    "[Nedokončený](https://example.com",
    "[Vnější [vnitřní](https://example.com)](https://example.com)",
    String.raw`[Backslash](https:\example.com)`,
    String.raw`[Backslash v cestě](https://example.com\cesta)`,
    "[Mezera](https://example.com/dlouha cesta)",
    "[Tab](https://example.com/\tcesta)",
    "[Nový řádek](https://example.com/\ncesta)",
  ];
  for (const value of invalid) assert.equal(parseIntroHelperMarkup(value).success, false, value);
});

test("mini-markup vrací konkrétní české chyby a očísluje další odkaz", () => {
  const cases = [
    ["[](https://example.com)", "Doplňte text odkazu mezi hranaté závorky."],
    ["[HTTP](http://example.com)", "Použijte úplnou adresu začínající https://."],
    ["[JavaScript](javascript:alert(1))", "Použijte úplnou adresu začínající https://."],
    ["[Účet](https://user:secret@example.com)", "Odstraňte z adresy odkazu uživatelské jméno a heslo."],
    ["[Nedokončený](https://example.com", "Dokončete odkaz ve tvaru [text odkazu](https://…)."],
  ];
  for (const [value, message] of cases) {
    const result = parseIntroHelperMarkup(value);
    assert.equal(result.success, false, value);
    assert.equal(result.error.message, message, value);
  }

  const second = parseIntroHelperMarkup("[První](https://example.com) a [Druhý](http://example.com)");
  assert.equal(second.success, false);
  assert.equal(second.error.message, "U 2. odkazu použijte úplnou adresu začínající https://.");
});

test("mini-markup vynutí limity textu, labelu, URL a počtu odkazů", () => {
  assert.equal(parseIntroHelperMarkup("x".repeat(INTRO_HELPER_MAX_LENGTH + 1)).success, false);
  assert.equal(parseIntroHelperMarkup(`[${"x".repeat(INTRO_HELPER_MAX_LABEL_LENGTH + 1)}](https://example.com)`).success, false);
  assert.equal(parseIntroHelperMarkup(`[Příliš dlouhá URL](https://example.com/${"x".repeat(INTRO_HELPER_MAX_URL_LENGTH)})`).success, false);
  const tooMany = Array.from({ length: INTRO_HELPER_MAX_LINKS + 1 }, (_, index) => `[${index}](https://example.com/${index})`).join(" ");
  assert.equal(parseIntroHelperMarkup(tooMany).success, false);
});

test("konfigurace úvodního textu je zpětně kompatibilní a podporuje obě polohy", () => {
  const legacy = structuredClone(defaultTobiConfig);
  delete legacy.presentation.intro.helperText;
  delete legacy.presentation.intro.helperTextPlacement;
  const parsedLegacy = tobiConfigSchema.parse(legacy);
  assert.equal(parsedLegacy.presentation.intro.helperText, "");
  assert.equal(parsedLegacy.presentation.intro.helperTextPlacement, "top");

  for (const helperTextPlacement of ["top", "bottom"]) {
    const candidate = structuredClone(defaultTobiConfig);
    candidate.presentation.intro.helperTextPlacement = helperTextPlacement;
    candidate.presentation.intro.helperText = "Podívejte se na [péči](https://www.vodafone.cz/pece/?zdroj=tobi#kontakt).";
    assert.equal(tobiConfigSchema.parse(candidate).presentation.intro.helperTextPlacement, helperTextPlacement);
  }
});

test("prázdný doprovodný text zůstane prázdný i ve veřejné konfiguraci", () => {
  for (const helperText of ["", "  \n  "]) {
    const candidate = structuredClone(defaultTobiConfig);
    candidate.presentation.intro.helperText = helperText;
    assert.equal(tobiConfigSchema.parse(candidate).presentation.intro.helperText, helperText);
    assert.equal(toPublicTobiConfig(candidate).presentation.intro.helperText, helperText);
  }
});

test("serverové schéma odmítne neplatný markup a veřejná projekce zachová platný text bez runtime", () => {
  const invalid = structuredClone(defaultTobiConfig);
  invalid.presentation.intro.helperText = "[Neplatný](javascript:alert(1))";
  assert.equal(tobiConfigSchema.safeParse(invalid).success, false);

  const valid = structuredClone(defaultTobiConfig);
  valid.presentation.intro.helperText = "[Péče](https://www.vodafone.cz/pece/) a [výpadky](https://www.vodafone.cz/vypadky/)";
  valid.presentation.intro.helperTextPlacement = "bottom";
  const publicConfig = toPublicTobiConfig(valid);
  assert.equal(publicConfig.operatorAvailability, "unknown");
  assert.equal(publicConfig.presentation.intro.helperText, valid.presentation.intro.helperText);
  assert.equal(publicConfig.presentation.intro.helperTextPlacement, "bottom");
  assert.equal("runtime" in publicConfig, false);
});
