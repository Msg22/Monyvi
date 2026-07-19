import assert from "node:assert/strict";
import test from "node:test";

import { assertPositiveFiniteRateValues } from "./market-rate-validation.ts";

test("accepts a row whose rate values are positive and finite", () => {
  assert.doesNotThrow(() =>
    assertPositiveFiniteRateValues({
      egp_usd: 0.02,
      gold_usd_per_gram: 75,
      timestamp_currency: "2026-07-14T08:00:00.000Z",
      created_at: "2026-07-14T08:00:00.000Z",
    })
  );
});

for (const [label, invalidValue] of [
  ["missing", undefined],
  ["zero", 0],
  ["negative", -1],
  ["NaN", Number.NaN],
  ["infinity", Number.POSITIVE_INFINITY],
] as const) {
  test(`rejects a ${label} rate before inserting it`, () => {
    assert.throws(
      () =>
        assertPositiveFiniteRateValues({
          egp_usd: invalidValue,
          gold_usd_per_gram: 75,
        }),
      /INVALID_MARKET_RATE:egp_usd/
    );
  });
}
