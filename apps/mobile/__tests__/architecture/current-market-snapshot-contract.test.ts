import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildMarketRateSnapshotEnvelope,
  buildPersistRpcPayload,
} from "../../../../supabase/functions/_shared/market-rate-snapshot-contract.ts";
import { validateCurrentMarketSnapshot } from "@monyvi/logic";

const ROOT = join(__dirname, "../../../..");
const CONTRACT_PATH = join(
  ROOT,
  "specs/302-atomic-market-rate-snapshots/contracts/market-rate-snapshots.openapi.yaml"
);
const SHARED_MODULE_PATH = join(
  ROOT,
  "supabase/functions/_shared/market-rate-snapshot-contract.ts"
);

const SNAPSHOT_ID = "11111111-1111-4111-8111-111111111111";
const RAW_PROVIDER_SUCCESS = `{"status":"success","currency":"USD","unit":"g",
"metals":{"gold":3738.74,"silver":43.73874,"platinum":1508.9,"palladium":1020.5},
"currencies":{"AED":0.2722854563,"AUD":0.6572,"BHD":0.2650066252,"BTC":95000.5,"CAD":0.7296,
"CHF":1.1229,"CNH":0.13750,"CNY":0.13842,"DKK":0.15713,"DZD":0.0073624976,
"EGP":0.0210523309,"EUR":1.1712,"GBP":1.2724,"HKD":0.12821,"INR":0.01135,"IQD":0.0007633588,
"ISK":0.007543,"JOD":0.1408450704,"JPY":0.006678,"KPW":0.0011110000,"KRW":0.0007185,
"KWD":0.3255287081,"LYD":0.0002234475,"MAD":0.0999014878,"MYR":0.22345,"NOK":0.09417,
"NZD":0.5983,"OMR":0.0275495286,"QAR":0.2747252747,"RUB":0.01106,"SAR":0.2666480021,
"SEK":0.10524,"SGD":0.7431,"TND":0.3215434083,"TRY":0.02589,"USD":1,"ZAR":0.05518},
"timestamps":{"metal":"2026-09-08T09:55:00Z","currency":"2026-09-08T09:50:00Z"}}`;

function schemaBlock(yamlText: string, name: string): string {
  const pattern = new RegExp(
    `\\n {4}${name}:\\n([\\s\\S]*?)(?=\\n {4}\\w|\\n {2}\\w|$)`
  );
  const match = yamlText.match(pattern);
  if (!match) {
    throw new Error(`OpenAPI schema ${name} not found`);
  }
  return match[1];
}

describe("issue #302 snapshot identity contract", () => {
  it("carries exactly one wire snapshot identity materialized as market_rates.id", () => {
    const requestSchema = schemaBlock(
      readFileSync(CONTRACT_PATH, "utf8"),
      "PersistSnapshotRequest"
    );
    const rootSchema = schemaBlock(
      readFileSync(CONTRACT_PATH, "utf8"),
      "MarketRateRootExact"
    );

    expect(requestSchema).toContain("p_snapshot_id");
    expect(rootSchema).not.toMatch(/^\s+id:/m);

    const envelope = buildMarketRateSnapshotEnvelope({
      rawResponseText: RAW_PROVIDER_SUCCESS,
      snapshotId: SNAPSHOT_ID,
      capturedAt: "2026-09-08T10:00:00.000Z",
    });
    expect(envelope.snapshotId).toBe(SNAPSHOT_ID);
    expect(envelope.observations).toHaveLength(37);
    for (const observation of envelope.observations) {
      expect(observation.batchId).toBe(SNAPSHOT_ID);
    }

    const payload = buildPersistRpcPayload(envelope);
    expect(payload.p_snapshot_id).toBe(SNAPSHOT_ID);
    expect(payload.p_root).not.toHaveProperty("id");
    for (const observation of payload.p_observations) {
      expect(observation).not.toHaveProperty("batchId");
      expect(observation).not.toHaveProperty("id");
    }
  });

  it("models PersistedObservation as one explicit closed object, never allOf", () => {
    const persisted = schemaBlock(
      readFileSync(CONTRACT_PATH, "utf8"),
      "PersistedObservation"
    );

    expect(persisted).not.toContain("allOf");
    expect(persisted).toContain("additionalProperties: false");
    for (const field of [
      "id",
      "batchId",
      "capturedAt",
      "instrumentCode",
      "valueDecimal",
      "unit",
      "orientation",
      "providerObservedAt",
      "source",
      "quality",
    ]) {
      expect(persisted).toContain(`${field}:`);
    }
  });

  it("financial values cross the contract as plain decimals without exponents", () => {
    const yamlText = readFileSync(CONTRACT_PATH, "utf8");
    const decimalSchema = schemaBlock(yamlText, "DecimalString");

    expect(decimalSchema).toContain("^(?:0|[1-9]\\\\d*)(?:\\\\.\\\\d+)?$");
  });

  it("current calculations consume exact observation decimals, not wide root numbers", () => {
    const envelope = buildMarketRateSnapshotEnvelope({
      rawResponseText: RAW_PROVIDER_SUCCESS,
      snapshotId: SNAPSHOT_ID,
      capturedAt: "2026-09-08T10:00:00.000Z",
    });
    const result = validateCurrentMarketSnapshot(
      envelope.observations.map((observation) => ({
        instrumentCode: observation.instrumentCode,
        valueDecimal: observation.valueDecimal,
        unit: observation.unit,
        orientation: observation.orientation,
        providerObservedAt: observation.providerObservedAt,
        source: observation.source,
        quality: observation.quality,
        capturedAt: observation.capturedAt,
      }))
    );

    expect(result.available).toBe(true);
    if (result.available) {
      expect(typeof result.rates.get("metal:GOLD")?.valueDecimal).toBe(
        "string"
      );
    }
  });

  it("root created_at is never a freshness source in the shared contract module", () => {
    const sourceText = readFileSync(SHARED_MODULE_PATH, "utf8");

    expect(sourceText).not.toContain("Date.now(");
    expect(sourceText).not.toMatch(/providerObservedAt[^;\n]*capturedAt/);
  });
});
