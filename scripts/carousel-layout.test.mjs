import assert from "node:assert/strict";
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
