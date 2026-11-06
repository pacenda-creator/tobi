import assert from "node:assert/strict";
import test from "node:test";

import { defaultTobiConfig, tobiConfigSchema } from "../lib/tobi-config.ts";

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

test("počet úvodních témat je omezen na deset", () => {
  assert.equal(defaultTobiConfig.introUseCases.length, 10);
  const candidate = structuredClone(defaultTobiConfig);
  candidate.presentation.intro.visibleTopicsCount = 11;
  assert.equal(tobiConfigSchema.safeParse(candidate).success, false);
});
