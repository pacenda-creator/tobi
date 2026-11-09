import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getCarouselCardBasis, getCarouselVisibleCount } from "../lib/carousel-layout.ts";

test("carousel využije šířku stejným adaptivním výpočtem", () => {
  assert.equal(getCarouselVisibleCount({ containerWidth: 320, itemCount: 10 }), 1);
  assert.equal(getCarouselVisibleCount({ containerWidth: 390, itemCount: 10 }), 2);
  assert.equal(getCarouselVisibleCount({ containerWidth: 520, itemCount: 10 }), 2);
  assert.equal(getCarouselVisibleCount({ containerWidth: 720, itemCount: 10 }), 4);
  assert.equal(getCarouselVisibleCount({ containerWidth: 1200, itemCount: 3 }), 3);
});

test("šířka karty přesně odečte mezery", () => {
  assert.equal(getCarouselCardBasis(1), "calc((100% - 0px) / 1)");
  assert.equal(getCarouselCardBasis(4), "calc((100% - 36px) / 4)");
});

test("výběrový carousel má popisky, klávesnici a skryté karty mimo přístupnost", () => {
  const source = readFileSync(new URL("../components/tobi/media-carousel.tsx", import.meta.url), "utf8");
  assert.match(source, /"Výběr modemu"/);
  assert.match(source, /"Předchozí modem"/);
  assert.match(source, /"Další modem"/);
  assert.match(source, /`\$\{visibleIndices\[0\] \+ 1\} ze \$\{cards\.length\}`/);
  assert.match(source, /aria-label=\{`\$\{card\.actionLabel\}: \$\{card\.title\}`\}/);
  assert.match(source, /onSendMessage\?\.\(card\.actionMessage!, card\.actionMessage!, card\.actionTransitionId\)/);
  assert.match(source, /aria-hidden=\{!visibleIndexSet\.has\(index\)\}/);
  assert.match(source, /inert=\{!visibleIndexSet\.has\(index\)\}/);
  assert.match(source, /event\.key === "ArrowLeft"/);
  assert.match(source, /event\.key === "ArrowRight"/);
});
