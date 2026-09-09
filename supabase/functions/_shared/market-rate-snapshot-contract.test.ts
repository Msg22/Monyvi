import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildMarketRateSnapshotEnvelope,
  buildPersistRpcPayload,
  MarketRateSnapshotContractError,
  normalizeDecimalToken,
  normalizeProviderObservedAt,
  parseLosslessJson,
  type MarketRateSnapshotEnvelope,
} from "./market-rate-snapshot-contract.ts";

const CAPTURED_AT = "2026-09-08T10:00:00.000Z";
const SNAPSHOT_ID = "11111111-1111-4111-8111-111111111111";

// Raw Metals.Dev response JSON text. Numeric tokens intentionally mix
// ordinary high-precision decimals and scientific notation (T004 fixtures).
const RAW_PROVIDER_SUCCESS = `{"status":"success","currency":"USD","unit":"g",
"metals":{"gold":3738.74,"silver":43.73874,"platinum":1.2300e+2,"palladium":1020.50000000000000001},
"currencies":{"AED":0.2722854563,"AUD":0.6572,"BHD":0.2650066252,"BTC":95000.5,"CAD":0.7296,
"CHF":1.1229,"CNH":0.13750,"CNY":0.13842,"DKK":0.15713,"DZD":0.0073624976,
"EGP":0.0210523309,"EUR":1.1712,"GBP":1.2724,"HKD":0.12821,"INR":0.01135,"IQD":0.0007633588,
"ISK":0.007543,"JOD":0.1408450704,"JPY":0.006678,"KPW":3.73874e-10,"KRW":0.0007185,
"KWD":0.3255287081,"LYD":0.0002234475,"MAD":0.0999014878,"MYR":0.22345,"NOK":0.09417,
"NZD":0.5983,"OMR":0.10000000000000001,"QAR":0.2747252747,"RUB":0.01106,"SAR":0.2666480021,
"SEK":0.10524,"SGD":0.7431,"TND":0.3215434083,"TRY":0.02589,"USD":1,"ZAR":0.05518},
"timestamps":{"metal":"2026-09-08T09:55:00Z","currency":"2026-09-08T09:50:00Z"}}`;

function withRawReplacements(
  replacements: Readonly<Record<string, string>>
): string {
  return Object.entries(replacements).reduce(
    (text, [from, to]) => text.split(from).join(to),
    RAW_PROVIDER_SUCCESS
  );
}

const PROVIDER_CURRENCY_CODES = [
  "AED",
  "AUD",
  "BHD",
  "BTC",
  "CAD",
  "CHF",
  "CNH",
  "CNY",
  "DKK",
  "DZD",
  "EGP",
  "EUR",
  "GBP",
  "HKD",
  "INR",
  "IQD",
  "ISK",
  "JOD",
  "JPY",
  "KPW",
  "KRW",
  "KWD",
  "LYD",
  "MAD",
  "MYR",
  "NOK",
  "NZD",
  "OMR",
  "QAR",
  "RUB",
  "SAR",
  "SEK",
  "SGD",
  "TND",
  "TRY",
  "USD",
  "ZAR",
];

function buildEnvelope(
  rawText: string = RAW_PROVIDER_SUCCESS
): MarketRateSnapshotEnvelope {
  return buildMarketRateSnapshotEnvelope({
    rawResponseText: rawText,
    snapshotId: SNAPSHOT_ID,
    capturedAt: CAPTURED_AT,
  });
}

test("parseLosslessJson preserves ordinary high-precision decimal tokens unchanged", () => {
  const parsed = parseLosslessJson(
    '{"value":0.10000000000000001,"other":1020.50000000000000001}'
  ) as { value: unknown; other: unknown };

  assert.equal(String(parsed.value), "0.10000000000000001");
  assert.equal(String(parsed.other), "1020.50000000000000001");
});

test("normalizeDecimalToken expands scientific notation without rounding", () => {
  assert.equal(
    normalizeDecimalToken("0.10000000000000001"),
    "0.10000000000000001"
  );
  assert.equal(normalizeDecimalToken("3.73874e-10"), "0.000000000373874");
  assert.equal(normalizeDecimalToken("1.2300e+2"), "123.00");
  assert.equal(normalizeDecimalToken("3738.74"), "3738.74");
  assert.equal(normalizeDecimalToken("1"), "1");
});

test("normalizeProviderObservedAt preserves valid non-future timestamps", () => {
  assert.equal(
    normalizeProviderObservedAt("2026-09-08T09:55:00Z", new Date(CAPTURED_AT)),
    "2026-09-08T09:55:00Z"
  );
});

test("normalizeProviderObservedAt maps missing/malformed/future times to null", () => {
  const capturedAt = new Date(CAPTURED_AT);
  assert.equal(normalizeProviderObservedAt(undefined, capturedAt), null);
  assert.equal(normalizeProviderObservedAt(null, capturedAt), null);
  assert.equal(normalizeProviderObservedAt("", capturedAt), null);
  assert.equal(
    normalizeProviderObservedAt("not-a-timestamp", capturedAt),
    null
  );
  assert.equal(
    normalizeProviderObservedAt("2099-01-01T00:00:00Z", capturedAt),
    null
  );
  assert.equal(
    normalizeProviderObservedAt("2026-13-45T99:99:99Z", capturedAt),
    null
  );
});

test("buildMarketRateSnapshotEnvelope emits exactly 37 trusted observations", () => {
  const envelope = buildEnvelope();

  assert.equal(envelope.snapshotId, SNAPSHOT_ID);
  assert.equal(envelope.capturedAt, CAPTURED_AT);
  assert.equal(envelope.observations.length, 37);

  const instruments = envelope.observations.map(
    ({ instrumentCode }) => instrumentCode
  );
  assert.ok(instruments.includes("metal:GOLD"));
  assert.ok(instruments.includes("metal:SILVER"));
  assert.ok(!instruments.includes("currency:BTC"));
  assert.ok(!instruments.includes("currency:CNH"));
  assert.equal(new Set(instruments).size, 37);
});

test("envelope preserves exact precision canaries as plain decimals", () => {
  const envelope = buildEnvelope();
  const byInstrument = new Map(
    envelope.observations.map((observation) => [
      observation.instrumentCode,
      observation,
    ])
  );

  assert.equal(
    byInstrument.get("currency:OMR")?.valueDecimal,
    "0.10000000000000001"
  );
  assert.equal(
    byInstrument.get("currency:KPW")?.valueDecimal,
    "0.000000000373874"
  );
  assert.equal(envelope.root.platinumUsdPerGram, "123.00");
  assert.equal(envelope.root.palladiumUsdPerGram, "1020.50000000000000001");
  assert.equal(envelope.root.fiatUsdPerUnit["KPW"], "0.000000000373874");
  assert.equal(byInstrument.get("currency:DZD")?.valueDecimal, "0.0073624976");
});

test("envelope certifies USD identity, source, quality, unit, and orientation", () => {
  const envelope = buildEnvelope();

  for (const observation of envelope.observations) {
    assert.equal(observation.quality, "valid");
    assert.equal(observation.source, "metals.dev");
    assert.equal(observation.orientation, "quote_per_base");
    if (observation.instrumentCode.startsWith("metal:")) {
      assert.equal(observation.unit, "usd_per_pure_gram");
      assert.equal(observation.providerObservedAt, "2026-09-08T09:55:00Z");
    } else {
      assert.equal(observation.unit, "usd_per_currency_unit");
      assert.equal(observation.providerObservedAt, "2026-09-08T09:50:00Z");
    }
  }

  const usd = envelope.observations.find(
    ({ instrumentCode }) => instrumentCode === "currency:USD"
  );
  assert.equal(usd?.valueDecimal, "1");
});

test("root and bound observations agree exactly", () => {
  const envelope = buildEnvelope();

  const gold = envelope.observations.find(
    ({ instrumentCode }) => instrumentCode === "metal:GOLD"
  );
  assert.equal(gold?.valueDecimal, envelope.root.goldUsdPerGram);
  assert.equal(gold?.batchId ?? envelope.snapshotId, envelope.snapshotId);
});

test("persist RPC payload carries exact strings, one identity, and no nesting ID", () => {
  const envelope = buildEnvelope();
  const payload = buildPersistRpcPayload(envelope);

  assert.equal(payload.p_snapshot_id, SNAPSHOT_ID);
  assert.equal(payload.p_captured_at, CAPTURED_AT);
  assert.equal(payload.p_root.goldUsdPerGram, "3738.74");
  assert.equal(payload.p_root.fiatUsdPerUnit["OMR"], "0.10000000000000001");
  assert.equal(payload.p_observations.length, 37);
  for (const observation of payload.p_observations) {
    assert.ok(!("id" in observation));
    assert.ok(!("batchId" in observation));
  }
  const serialized = JSON.stringify(payload);
  assert.ok(!/e[+-]/i.test(serialized));
});

test("missing provider timestamps normalize to null without capture substitution", () => {
  const raw = RAW_PROVIDER_SUCCESS.replace(/,\s*"timestamps":\{[^}]*\}/, "");
  const envelope = buildEnvelope(raw);

  assert.equal(envelope.root.providerMetalObservedAt, null);
  assert.equal(envelope.root.providerCurrencyObservedAt, null);
  for (const observation of envelope.observations) {
    assert.equal(observation.providerObservedAt, null);
    assert.notEqual(observation.providerObservedAt, CAPTURED_AT);
  }
});

test("malformed provider timestamps normalize to null", () => {
  const raw = withRawReplacements({
    '"metal":"2026-09-08T09:55:00Z"': '"metal":"not-a-timestamp"',
  });
  const envelope = buildEnvelope(raw);

  assert.equal(envelope.root.providerMetalObservedAt, null);
  assert.notEqual(envelope.root.providerCurrencyObservedAt, null);
  const gold = envelope.observations.find(
    ({ instrumentCode }) => instrumentCode === "metal:GOLD"
  );
  assert.equal(gold?.providerObservedAt, null);
});

test("future provider timestamps normalize to null", () => {
  const raw = withRawReplacements({
    '"currency":"2026-09-08T09:50:00Z"': '"currency":"2099-01-01T00:00:00Z"',
  });
  const envelope = buildEnvelope(raw);

  assert.equal(envelope.root.providerCurrencyObservedAt, null);
  assert.equal(envelope.root.providerMetalObservedAt, "2026-09-08T09:55:00Z");
});

test("provider status failure is rejected", async () => {
  const raw = RAW_PROVIDER_SUCCESS.replace(
    '"status":"success"',
    '"status":"error"'
  );
  await assertThrowsContract(
    () => buildEnvelope(raw),
    "invalid_provider_shape"
  );
});

test("non-positive rate token is rejected", () => {
  const raw = withRawReplacements({
    '"EGP":0.0210523309': '"EGP":-0.0210523309',
  });
  assertThrowsContract(() => buildEnvelope(raw), "invalid_rate");
});

test("malformed rate token is rejected", () => {
  const raw = withRawReplacements({
    '"EGP":0.0210523309': '"EGP":0.02105233O9',
  });
  assertThrowsContract(() => buildEnvelope(raw), "invalid_provider_shape");
});

test("missing required currency is rejected as incomplete", () => {
  const raw = withRawReplacements({ '"EGP":0.0210523309,': "" });
  assertThrowsContract(() => buildEnvelope(raw), "snapshot_incomplete");
});

test("non-numeric provider rate value is rejected", () => {
  const raw = withRawReplacements({
    '"EGP":0.0210523309': '"EGP":"0.0210523309"',
  });
  assertThrowsContract(() => buildEnvelope(raw), "invalid_rate");
});

test("all 36 provider currency codes plus four metals appear in the fixture", () => {
  for (const code of PROVIDER_CURRENCY_CODES) {
    assert.ok(
      RAW_PROVIDER_SUCCESS.includes(`"${code}"`),
      `fixture missing ${code}`
    );
  }
});

test("shared contract source has no binary-float or response.json authority", () => {
  const sourceText = readFileSync(
    new URL("./market-rate-snapshot-contract.ts", import.meta.url),
    "utf8"
  );
  assert.ok(!sourceText.includes("parseFloat"));
  assert.ok(!sourceText.includes("response.json("));
  assert.ok(!sourceText.includes("JSON.parse("));
});

function assertThrowsContract(action: () => unknown, code: string): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(
      error instanceof MarketRateSnapshotContractError,
      `expected MarketRateSnapshotContractError, got ${String(error)}`
    );
    assert.equal(error.code, code);
    return true;
  });
}
