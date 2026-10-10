import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  HistoricalMetalRateContractError,
  buildHistoricalDailyRateRecord,
} from "./historical-metal-rate-contract.ts";

const DATE = "2026-10-10";
const FETCHED_AT = "2026-10-10T15:00:00.000Z";
const DIGEST =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const RAW = [
  '{"status":"success","currency":"USD","unit":"toz",',
  '"start_date":"2026-10-10","end_date":"2026-10-10",',
  '"rates":{"2026-10-10":{"date":"2026-10-10",',
  '"currencies":{"USD":1,"EGP":0.020000000000000001,"EUR":1.1000000000000001},',
  '"metals":{"gold":1932.1234567890123456789,"silver":23.4567890123456789}}}}',
].join("");

function build(raw: string = RAW) {
  return buildHistoricalDailyRateRecord({
    rawResponseText: raw,
    requestedDate: DATE,
    fetchedAt: FETCHED_AT,
    responseDigest: DIGEST,
  });
}

test("builds one exact daily record without inventing observation timestamps", () => {
  const record = build();

  assert.equal(record.rateDate, DATE);
  assert.equal(record.resolution, "daily");
  assert.equal(record.providerResponseTimestamp, null);
  assert.equal(record.source, "metals.dev");
  assert.equal(record.quality, "valid");
  assert.equal(
    record.goldUsdPerTroyOunceDecimal,
    "1932.1234567890123456789"
  );
  assert.equal(record.currenciesUsdPerUnit["USD"], "1");
  assert.equal(
    record.currenciesUsdPerUnit["EGP"],
    "0.020000000000000001"
  );
  assert.equal(
    record.currenciesUsdPerUnit["EUR"],
    "1.1000000000000001"
  );
});

test("normalizes USD/troy-ounce to USD/pure-gram at 50-digit Decimal precision", () => {
  const record = build();
  assert.equal(
    record.goldUsdPerPureGramDecimal,
    "62.119211598524970870102213139079036977628173066491"
  );
  assert.equal(
    record.silverUsdPerPureGramDecimal,
    "0.75415327884970335213457551472187829496926208583858"
  );
});

test("accepts missing EGP while retaining USD and other available supported currencies", () => {
  const record = build(RAW.replace('"EGP":0.020000000000000001,', ""));
  assert.equal(record.currenciesUsdPerUnit["EGP"], undefined);
  assert.equal(record.currenciesUsdPerUnit["USD"], "1");
  assert.equal(record.currenciesUsdPerUnit["EUR"], "1.1000000000000001");
});

test("requires the literal requested date and never substitutes a neighbor", () => {
  assertContractError(
    () => build(RAW.replaceAll("2026-10-10", "2026-10-09")),
    "invalid_provider_shape"
  );

  const neighborOnly = RAW.replace(
    '"rates":{"2026-10-10":{"date":"2026-10-10"',
    '"rates":{"2026-10-09":{"date":"2026-10-09"'
  );
  assertContractError(() => build(neighborOnly), "date_unavailable");
});

test("rejects a mixed or expanded date payload for a one-day request", () => {
  const extra = RAW.replace(
    '"rates":{"2026-10-10":',
    '"rates":{"2026-10-09":{"date":"2026-10-09","currencies":{"USD":1},"metals":{"gold":1,"silver":1}},"2026-10-10":'
  );
  assertContractError(() => build(extra), "date_unavailable");
});

test("requires exact USD identity", () => {
  assertContractError(
    () => build(RAW.replace('"USD":1', '"USD":1.0000000000000001')),
    "invalid_rate"
  );
});

test("preserves a genuine provider response timestamp when supplied", () => {
  const withTimestamp = RAW.replace(
    '"rates":',
    '"timestamp":"2026-10-10T13:59:00.000Z","rates":'
  );
  assert.equal(
    build(withTimestamp).providerResponseTimestamp,
    "2026-10-10T13:59:00.000Z"
  );
});

test("contract source does not parse provider financial values through JSON.parse, response.json, or parseFloat", () => {
  const source = readFileSync(
    new URL("./historical-metal-rate-contract.ts", import.meta.url),
    "utf8"
  );
  assert.equal(source.includes("JSON.parse("), false);
  assert.equal(source.includes("response.json("), false);
  assert.equal(source.includes("parseFloat("), false);
});

function assertContractError(
  action: () => unknown,
  code: string
): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof HistoricalMetalRateContractError);
    assert.equal(error.code, code);
    return true;
  });
}
