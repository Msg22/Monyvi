import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMarketRateSnapshotEnvelope,
  SUPPORTED_FIAT_CURRENCY_CODES,
} from "./market-rate-snapshot-contract.ts";
import {
  buildHistoricalSnapshotRateRecord,
  HistoricalMetalRateContractError,
} from "./historical-metal-rate-contract.ts";
import {
  tryQualifyRoot,
  tryQualifyRootRank,
  compareCandidates,
  timestamp,
} from "./historical-metal-rate-contract-remote.ts";
import {
  DATE,
  FETCHED_AT,
  DIGEST,
  BATCH,
  root,
  atom,
  atoms,
  raw,
} from "../fetch-historical-metal-rate/remote-fixture.test-data.ts";

function build(
  roots: readonly Record<string, unknown>[] = [root()],
  observations: readonly Record<string, unknown>[] = atoms()
): ReturnType<typeof buildHistoricalSnapshotRateRecord> {
  return buildHistoricalSnapshotRateRecord({
    rawRootResponseText: raw(roots),
    rawObservationResponseText: raw(observations),
    requestedDate: DATE,
    fetchedAt: FETCHED_AT,
    responseDigest: DIGEST,
  });
}

function unavailable(
  roots: readonly Record<string, unknown>[],
  observations: readonly Record<string, unknown>[]
): void {
  assert.throws(
    () => build(roots, observations),
    (error: unknown): boolean =>
      error instanceof HistoricalMetalRateContractError &&
      error.code === "date_unavailable"
  );
}

test("prefers canonical same-batch gram atoms and preserves exact numeric tokens/provenance", () => {
  const result = build();
  assert.equal(result.goldUsdPerPureGramDecimal, "101.123456789012345678901");
  assert.equal(result.currenciesUsdPerUnit.EGP, "0.020000000000000001");
  assert.equal(result.resolution, "snapshot");
  assert.equal(result.snapshotId, BATCH);
  assert.equal(result.source, "stored-provider");
  assert.equal(result.metalProviderObservedAt, "2026-10-10T12:00:00.000Z");
  assert.equal(result.currencyProviderObservedAt, "2026-10-10T12:00:00.000Z");
  assert.equal(result.providerResponseTimestamp, null);
});

test("full 38-instrument producer batch validates BTC without exposing it as fiat", () => {
  assert.equal(atoms().length, 38);
  const result = build();
  assert.equal(Object.keys(result.currenciesUsdPerUnit).length, 35);
  assert.equal(result.currenciesUsdPerUnit.BTC, undefined);
  for (const mutation of [
    { value_decimal: "0" },
    { quality: "invalid" },
    { unit: "usd_per_pure_gram" },
    { orientation: "base_per_quote" },
    { provider_observed_at: "2026-10-11T12:00:00Z" },
  ])
    unavailable(
      [root()],
      atoms().map((row) =>
        row.instrument_code === "currency:BTC" ? { ...row, ...mutation } : row
      )
    );
});

test("accepts the unchanged atomic producer's actual 38-row output", () => {
  const currencyTokens = [...SUPPORTED_FIAT_CURRENCY_CODES, "BTC"]
    .map(
      (code) =>
        JSON.stringify(code) +
        ":" +
        (code === "EGP"
          ? "0.020000000000000001"
          : code === "BTC"
            ? "95000.123456789012345678901"
            : "1")
    )
    .join(",");
  const producer = buildMarketRateSnapshotEnvelope({
    snapshotId: BATCH,
    capturedAt: FETCHED_AT,
    rawResponseText:
      '{"status":"success","currency":"USD","unit":"g","metals":{"gold":101.123456789012345678901,"silver":1.25,"platinum":2,"palladium":3},"currencies":{' +
      currencyTokens +
      '},"timestamps":{"metal":"2026-10-10T12:00:00.000Z","currency":"2026-10-10T12:00:00.000Z"}}',
  });
  const observations = producer.observations.map((row) => ({
    id: row.instrumentCode,
    batch_id: row.batchId,
    instrument_code: row.instrumentCode,
    value_decimal: row.valueDecimal,
    unit: row.unit,
    orientation: row.orientation,
    provider_observed_at: row.providerObservedAt,
    source: row.source,
    quality: row.quality,
    created_at: row.capturedAt,
  }));
  assert.equal(observations.length, 38);
  const result = build([root()], observations);
  assert.equal(result.source, "metals.dev");
  assert.equal(result.goldUsdPerPureGramDecimal, "101.123456789012345678901");
  assert.equal(result.currenciesUsdPerUnit.EGP, "0.020000000000000001");
  assert.equal(result.currenciesUsdPerUnit.BTC, undefined);
});

test("newer partial canonical batch cannot shadow older complete same-date batch", () => {
  const newer = root({
    id: "newer",
    timestamp_metal: "2026-10-10T13:00:00Z",
    timestamp_currency: "2026-10-10T13:00:00Z",
  });
  const partial = ["metal:GOLD", "metal:SILVER", "currency:USD"].map((code) =>
    atom(code, {
      batch_id: "newer",
      provider_observed_at: "2026-10-10T13:00:00Z",
    })
  );
  assert.equal(
    build([newer, root()], [...partial, ...atoms()]).snapshotId,
    BATCH
  );
  unavailable([newer], partial);
  unavailable(
    [root()],
    atoms().filter((row) => row.instrument_code !== "currency:EGP")
  );
  unavailable(
    [root()],
    atoms().filter((row) => row.instrument_code !== "currency:BTC")
  );
});

test("legacy root uses provider timestamps with honest stored-root provenance", () => {
  const result = build([root()], []);
  assert.equal(result.source, "remote_market_rates");
  assert.equal(result.goldUsdPerPureGramDecimal, "100.123456789012345678901");
  assert.equal(result.currenciesUsdPerUnit.USD, "1");
});

test("Cairo midnight accepts the previous UTC date and never uses created_at as rate date", () => {
  const timestamp = "2026-10-09T21:30:00.000Z";
  assert.equal(
    build(
      [
        root({
          timestamp_metal: timestamp,
          timestamp_currency: timestamp,
          created_at: "2026-11-01T00:00:00Z",
        }),
      ],
      []
    ).rateDate,
    DATE
  );
  unavailable(
    [
      root({
        timestamp_metal: "2026-10-09T12:00:00Z",
        created_at: "2026-10-10T12:00:00Z",
      }),
    ],
    []
  );
});

test("newest eligible provider snapshot wins, with deterministic same-time tie order", () => {
  const older = root({
    id: "older",
    timestamp_metal: "2026-10-10T10:00:00Z",
    timestamp_currency: "2026-10-10T10:00:00Z",
    created_at: "2027-01-01T00:00:00Z",
  });
  assert.equal(build([older, root()], []).snapshotId, BATCH);
  assert.equal(
    build([root({ id: "a" }), root({ id: "z" })], []).snapshotId,
    "z"
  );
});

test("never mixes different batches or substitutes current/neighbor rates", () => {
  unavailable(
    [root()],
    [
      atom("metal:GOLD"),
      atom("metal:SILVER"),
      atom("currency:USD", { batch_id: "foreign" }),
    ]
  );
  unavailable([root({ timestamp_currency: "2026-10-11T12:00:00Z" })], []);
});

test("invalid or incomplete canonical atoms cannot fall back to valid legacy columns", () => {
  for (const mutation of [
    { quality: "invalid" },
    { value_decimal: "0" },
    { unit: "usd_per_troy_ounce" },
    { orientation: "base_per_quote" },
    { source: null },
    { provider_observed_at: null },
    { provider_observed_at: "2026-10-09T12:00:00Z" },
    { source: "another-provider" },
  ])
    unavailable([root()], [atom("metal:GOLD", mutation), ...atoms().slice(1)]);
  unavailable([root()], atoms().slice(1));
  unavailable([root()], [...atoms(), atom("metal:GOLD")]);
});

test("legacy missing currencies remain absent and invalid supplied FX is rejected", () => {
  assert.equal(
    build([root({ egp_usd: null })], []).currenciesUsdPerUnit.EGP,
    undefined
  );
  unavailable(
    [root()],
    atoms().map((row) =>
      row.instrument_code === "currency:USD"
        ? { ...row, value_decimal: "1.0000000000000001" }
        : row
    )
  );
  unavailable(
    [root()],
    [...atoms(), atom("currency:EUR", { value_decimal: "-1" })]
  );
});

test("skips newest ineligible snapshot without bypassing its bad canonical atoms", () => {
  const newer = root({
    id: "newer",
    timestamp_metal: "2026-10-10T13:00:00Z",
    timestamp_currency: "2026-10-10T13:00:00Z",
  });
  assert.equal(
    build(
      [newer, root()],
      [
        atom("metal:GOLD", { batch_id: "newer", quality: "invalid" }),
        ...atoms(),
      ]
    ).snapshotId,
    BATCH
  );
});

test("tryQualifyRoot returns null on invalid or partial atoms and succeeds on complete batch", () => {
  const validRoot = root();
  assert.ok(tryQualifyRoot(validRoot, atoms(), DATE) !== null);

  // Partial atoms (5 instead of 38)
  assert.equal(tryQualifyRoot(validRoot, atoms().slice(0, 5), DATE), null);

  // Truly zero atoms falls back to legacy
  const legacyCandidate = tryQualifyRoot(validRoot, [], DATE);
  assert.ok(legacyCandidate !== null);
  assert.equal(legacyCandidate?.source, "remote_market_rates");

  // Invalid atom quality
  const badAtoms = [
    atom("metal:GOLD", { quality: "invalid" }),
    ...atoms().slice(1),
  ];
  assert.equal(tryQualifyRoot(validRoot, badAtoms, DATE), null);
});

test("compareCandidates enforces min provider instant then max then createdAt then id", () => {
  const c1 = {
    id: "018f0c7a-1234-7abc-8def-000000000001",
    createdAt: 1000,
    metalAt: "2026-10-10T12:00:00.000Z",
    currencyAt: "2026-10-10T12:00:00.000Z",
    gold: "100",
    silver: "1",
    currencies: { USD: "1" },
    source: "metals.dev",
  };
  const cOlderMin = {
    ...c1,
    id: "018f0c7a-1234-7abc-8def-000000000002",
    metalAt: "2026-10-10T11:00:00.000Z",
  };
  // c1 has min 12:00, cOlderMin has min 11:00 -> c1 beats cOlderMin (< 0)
  assert.ok(compareCandidates(c1, cOlderMin) < 0);
  assert.ok(compareCandidates(cOlderMin, c1) > 0);

  // Equal min, differing max
  const cHigherMax = {
    ...c1,
    id: "018f0c7a-1234-7abc-8def-000000000003",
    currencyAt: "2026-10-10T14:00:00.000Z",
  };
  // cHigherMax has min 12:00, max 14:00. c1 has min 12:00, max 12:00. cHigherMax beats c1.
  assert.ok(compareCandidates(cHigherMax, c1) < 0);

  // Equal min, equal max, differing createdAt
  const cNewerCreated = {
    ...c1,
    id: "018f0c7a-1234-7abc-8def-000000000004",
    createdAt: 2000,
  };
  assert.ok(compareCandidates(cNewerCreated, c1) < 0);

  // Equal min, max, createdAt, differing ID (descending: higher id wins)
  const cIdZ = {
    ...c1,
    id: "z",
  };
  const cIdA = {
    ...c1,
    id: "a",
  };
  assert.ok(compareCandidates(cIdZ, cIdA) < 0);
});

test("timestamp helper validates exact Africa/Cairo calendar date across offsets", () => {
  // 2026-10-09T21:30:00Z is 2026-10-10T00:30:00+03:00 in Cairo DST
  assert.equal(
    timestamp("2026-10-09T21:30:00.000Z", "2026-10-10"),
    "2026-10-09T21:30:00.000Z"
  );
  // 2026-10-09T18:00:00Z is 2026-10-09T21:00:00+03:00 in Cairo (previous day)
  assert.equal(timestamp("2026-10-09T18:00:00.000Z", "2026-10-10"), null);
});

test("tryQualifyRootRank extracts strict metadata rank and compares accurately against candidates", () => {
  const rootData = root();
  const rank = tryQualifyRootRank(rootData, DATE);
  assert.ok(rank !== null);
  assert.equal(rank.id, BATCH);
  assert.equal(rank.metalAt, "2026-10-10T12:00:00.000Z");
  assert.equal(rank.currencyAt, "2026-10-10T12:00:00.000Z");
  assert.equal(rank.createdAt, Date.parse(FETCHED_AT));

  // Invalid roots return null
  assert.equal(tryQualifyRootRank({ ...rootData, id: "" }, DATE), null);
  assert.equal(
    tryQualifyRootRank({ ...rootData, created_at: "invalid" }, DATE),
    null
  );
  assert.equal(
    tryQualifyRootRank(
      { ...rootData, timestamp_metal: "2026-10-11T12:00:00Z" },
      DATE
    ),
    null
  );

  // Equal provider timestamps with descending createdAt: newer beats older
  const olderRank = tryQualifyRootRank(
    {
      ...rootData,
      created_at: new Date(Date.parse(FETCHED_AT) - 1000).toISOString(),
    },
    DATE
  );
  assert.ok(olderRank !== null);
  assert.ok(compareCandidates(rank, olderRank) < 0);
  assert.ok(compareCandidates(olderRank, rank) > 0);
});
