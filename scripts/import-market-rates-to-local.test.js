const assert = require("node:assert/strict");
const test = require("node:test");

const {
  REQUIRED_FIAT_CODES,
  REQUIRED_INSTRUMENT_CODES,
  buildImportSql,
  buildLinkedSnapshotPageQuery,
  collectCompleteSnapshotUnits,
  parseImportMarketRatesArgs,
  parseSupabaseQueryRows,
  validateSnapshotPage,
} = require("./import-market-rates-to-local");

const SNAPSHOT_A = "11111111-1111-4111-8111-111111111111";
const SNAPSHOT_B = "22222222-2222-4222-8222-222222222222";
const CAPTURED_A = "2026-09-09T10:00:00.000Z";
const CAPTURED_B = "2026-09-09T11:00:00.000Z";
const WATERMARK = "2026-09-09T12:00:00.000Z";
const METAL_TIME = "2026-09-09T09:55:00.000Z";
const CURRENCY_TIME = "2026-09-09T09:50:00.000Z";

function buildRoot() {
  const fiatUsdPerUnit = { BTC: "95000.5000000001" };
  for (const code of REQUIRED_FIAT_CODES) {
    if (code !== "USD") {
      fiatUsdPerUnit[code] =
        code === "OMR" ? "0.10000000000000001" : "0.5";
    }
  }
  return {
    goldUsdPerGram: "3738.7400000000001",
    silverUsdPerGram: "43.7387400000001",
    platinumUsdPerGram: "123.00",
    palladiumUsdPerGram: "1020.50000000000000001",
    fiatUsdPerUnit,
    providerMetalObservedAt: METAL_TIME,
    providerCurrencyObservedAt: CURRENCY_TIME,
  };
}

function buildObservations({
  snapshotId,
  capturedAt,
  source = "metals.dev",
  batchId = snapshotId,
  omitInstrument = null,
} = {}) {
  const root = buildRoot();
  return REQUIRED_INSTRUMENT_CODES.filter(
    (instrumentCode) => instrumentCode !== omitInstrument
  ).map((instrumentCode, index) => {
    const isMetal = instrumentCode.startsWith("metal:");
    const currency = isMetal
      ? null
      : instrumentCode.slice("currency:".length);
    const valueDecimal =
      instrumentCode === "metal:GOLD"
        ? root.goldUsdPerGram
        : instrumentCode === "metal:SILVER"
          ? root.silverUsdPerGram
          : currency === "USD"
            ? "1"
            : root.fiatUsdPerUnit[currency];
    return {
      id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index + 1).padStart(12, "0")}`,
      batchId,
      capturedAt,
      instrumentCode,
      valueDecimal,
      unit: isMetal
        ? "usd_per_pure_gram"
        : "usd_per_currency_unit",
      orientation: "quote_per_base",
      providerObservedAt: isMetal ? METAL_TIME : CURRENCY_TIME,
      source,
      quality: "valid",
    };
  });
}

function buildEnvelope({
  snapshotId = SNAPSHOT_A,
  capturedAt = CAPTURED_A,
  source,
  batchId,
  omitInstrument,
} = {}) {
  return {
    snapshotId,
    capturedAt,
    root: buildRoot(),
    observations: buildObservations({
      snapshotId,
      capturedAt,
      source,
      batchId,
      omitInstrument,
    }),
  };
}

function buildPage({ snapshots, nextCursor = null, upperWatermark = WATERMARK }) {
  return { snapshots, nextCursor, upperWatermark };
}

test("validateSnapshotPage accepts one complete bound root-plus-observation unit", () => {
  const page = validateSnapshotPage(
    buildPage({ snapshots: [buildEnvelope()] }),
    null
  );

  assert.equal(page.upperWatermark, WATERMARK);
  assert.equal(page.units.length, 1);
  assert.equal(page.units[0].root.id, SNAPSHOT_A);
  assert.equal(page.units[0].observations.length, 37);
  assert.equal(
    page.units[0].root.omr_usd,
    "0.10000000000000001"
  );
  assert.equal(
    page.units[0].observations.find(
      (row) => row.instrument_code === "currency:OMR"
    ).value_decimal,
    "0.10000000000000001"
  );
});

test("validateSnapshotPage rejects root-only, partial, blank-source, and cross-batch candidates", () => {
  const invalidEnvelopes = [
    { ...buildEnvelope(), observations: [] },
    buildEnvelope({ omitInstrument: "currency:EGP" }),
    buildEnvelope({ source: "   " }),
    buildEnvelope({ batchId: SNAPSHOT_B }),
  ];

  for (const envelope of invalidEnvelopes) {
    assert.throws(
      () => validateSnapshotPage(buildPage({ snapshots: [envelope] }), null),
      /invalid complete market-rate snapshot/i
    );
  }
});

test("validateSnapshotPage rejects root and observation value mismatch", () => {
  const envelope = buildEnvelope();
  const observations = envelope.observations.map((observation) =>
    observation.instrumentCode === "metal:GOLD"
      ? { ...observation, valueDecimal: "9999" }
      : observation
  );

  assert.throws(
    () =>
      validateSnapshotPage(
        buildPage({ snapshots: [{ ...envelope, observations }] }),
        null
      ),
    /invalid complete market-rate snapshot/i
  );
});

test("collectCompleteSnapshotUnits pins one watermark and advances by the validated cursor", async () => {
  const firstCursor = { createdAt: CAPTURED_A, id: SNAPSHOT_A };
  const requests = [];
  const pages = [
    buildPage({
      snapshots: [buildEnvelope()],
      nextCursor: firstCursor,
    }),
    buildPage({
      snapshots: [
        buildEnvelope({ snapshotId: SNAPSHOT_B, capturedAt: CAPTURED_B }),
      ],
    }),
  ];

  const units = await collectCompleteSnapshotUnits(async (request) => {
    requests.push(request);
    return pages.shift();
  });

  assert.equal(units.length, 2);
  assert.deepEqual(requests, [
    { cursor: null, limit: 100, upperWatermark: null },
    { cursor: firstCursor, limit: 100, upperWatermark: WATERMARK },
  ]);
});

test("collectCompleteSnapshotUnits refuses watermark drift and repeating cursors", async () => {
  const cursor = { createdAt: CAPTURED_A, id: SNAPSHOT_A };
  const driftingPages = [
    buildPage({ snapshots: [buildEnvelope()], nextCursor: cursor }),
    buildPage({
      snapshots: [
        buildEnvelope({ snapshotId: SNAPSHOT_B, capturedAt: CAPTURED_B }),
      ],
      upperWatermark: "2026-09-09T12:00:01.000Z",
    }),
  ];

  await assert.rejects(
    collectCompleteSnapshotUnits(async () => driftingPages.shift()),
    /invalid complete market-rate snapshot/i
  );

  const repeatingPages = [
    buildPage({ snapshots: [buildEnvelope()], nextCursor: cursor }),
    buildPage({
      snapshots: [buildEnvelope()],
      nextCursor: cursor,
    }),
  ];
  await assert.rejects(
    collectCompleteSnapshotUnits(async () => repeatingPages.shift()),
    /invalid complete market-rate snapshot/i
  );
});

test("buildImportSql replaces local shared rate tables in dependency-safe atomic order", () => {
  const { units } = validateSnapshotPage(
    buildPage({ snapshots: [buildEnvelope()] }),
    null
  );
  const sql = buildImportSql(units);

  assert.ok(sql.startsWith("begin;"));
  assert.ok(sql.endsWith("commit;\n"));
  assert.ok(
    sql.indexOf("delete from public.market_rate_observations") <
      sql.indexOf("delete from public.market_rates")
  );
  assert.match(sql, /insert into public\.market_rates/);
  assert.match(sql, /insert into public\.market_rate_observations/);
  assert.match(sql, /0\.10000000000000001/);
  assert.match(sql, /currency:USD/);
});

test("buildLinkedSnapshotPageQuery emits only validated pagination literals", () => {
  const query = buildLinkedSnapshotPageQuery({
    cursor: { createdAt: CAPTURED_A, id: SNAPSHOT_A },
    limit: 100,
    upperWatermark: WATERMARK,
  });

  assert.match(query, /pull_market_rate_snapshots_page_v1/);
  assert.match(query, new RegExp(SNAPSHOT_A));
  assert.match(query, /2026-09-09T12:00:00\.000Z/);
  assert.match(query, /100/);
});

test("existing argument and Supabase JSON parsing contracts remain supported", () => {
  assert.deepEqual(parseImportMarketRatesArgs([]), { bestEffort: false });
  assert.deepEqual(parseImportMarketRatesArgs(["--best-effort"]), {
    bestEffort: true,
  });
  assert.deepEqual(
    parseSupabaseQueryRows(`CLI banner\n[{"page":{"snapshots":[]}}]\n`),
    [{ page: { snapshots: [] } }]
  );
});
