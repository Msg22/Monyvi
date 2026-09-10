/**
 * Copies complete production-like market-rate snapshot units from the linked
 * Supabase project into the local Supabase database.
 *
 * A root row is never imported without all 37 bound exact observations. The
 * linked complete-envelope RPC is paged under one fixed watermark, every page
 * is revalidated locally, and local root plus observation tables are replaced
 * together inside one SQL transaction. User-owned data is never touched.
 */
const { spawnSync } = require("node:child_process");
const { unlinkSync, writeFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

const repoRoot = resolve(__dirname, "..");
const SNAPSHOT_PAGE_LIMIT = 100;
const INVALID_SNAPSHOT_PREFIX = "Invalid complete market-rate snapshot";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POSITIVE_PLAIN_DECIMAL = /^(?=.*[1-9])(?:0|[1-9]\d*)(?:\.\d+)?$/;

const REQUIRED_FIAT_CODES = Object.freeze([
  "EGP",
  "SAR",
  "AED",
  "KWD",
  "QAR",
  "BHD",
  "OMR",
  "JOD",
  "IQD",
  "LYD",
  "TND",
  "MAD",
  "DZD",
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CHF",
  "CNY",
  "INR",
  "KRW",
  "KPW",
  "SGD",
  "HKD",
  "MYR",
  "AUD",
  "NZD",
  "CAD",
  "SEK",
  "NOK",
  "DKK",
  "ISK",
  "TRY",
  "RUB",
  "ZAR",
]);
const ROOT_FIAT_CODES = Object.freeze([
  ...REQUIRED_FIAT_CODES.filter((code) => code !== "USD"),
  "BTC",
]);
const REQUIRED_INSTRUMENT_CODES = Object.freeze([
  "metal:GOLD",
  "metal:SILVER",
  ...REQUIRED_FIAT_CODES.map((code) => `currency:${code}`),
]);
const REQUIRED_INSTRUMENT_SET = new Set(REQUIRED_INSTRUMENT_CODES);

const PAGE_KEYS = Object.freeze([
  "nextCursor",
  "snapshots",
  "upperWatermark",
]);
const CURSOR_KEYS = Object.freeze(["createdAt", "id"]);
const ENVELOPE_KEYS = Object.freeze([
  "capturedAt",
  "observations",
  "root",
  "snapshotId",
]);
const ROOT_KEYS = Object.freeze([
  "fiatUsdPerUnit",
  "goldUsdPerGram",
  "palladiumUsdPerGram",
  "platinumUsdPerGram",
  "providerCurrencyObservedAt",
  "providerMetalObservedAt",
  "silverUsdPerGram",
]);
const OBSERVATION_KEYS = Object.freeze([
  "batchId",
  "capturedAt",
  "id",
  "instrumentCode",
  "orientation",
  "providerObservedAt",
  "quality",
  "source",
  "unit",
  "valueDecimal",
]);

function getSupabaseSpawnArgs(args) {
  return [
    process.execPath,
    require.resolve("supabase/dist/supabase.js"),
    ...args,
  ];
}

function runSupabase(args) {
  const [command, ...commandArgs] = getSupabaseSpawnArgs(args);
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });

  if (result.status !== 0) {
    throw new Error(
      [
        `Supabase command failed: supabase ${args.join(" ")}`,
        result.stderr,
        result.stdout,
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  return result.stdout;
}

function parseImportMarketRatesArgs(argv = process.argv.slice(2)) {
  return {
    bestEffort: argv.includes("--best-effort"),
  };
}

function parseSupabaseQueryRows(output) {
  const jsonStartIndex = output.search(/[\[{]/);
  if (jsonStartIndex === -1) {
    throw new Error("Supabase query did not return JSON output.");
  }

  const jsonEndIndex = Math.max(
    output.lastIndexOf("]"),
    output.lastIndexOf("}")
  );
  if (jsonEndIndex < jsonStartIndex) {
    throw new Error("Supabase query returned incomplete JSON output.");
  }

  const parsed = JSON.parse(output.slice(jsonStartIndex, jsonEndIndex + 1));
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (isRecord(parsed) && Array.isArray(parsed.rows)) {
    return parsed.rows;
  }

  throw new Error("Supabase query JSON did not include result rows.");
}

function buildLinkedSnapshotPageQuery(request) {
  const normalized = validatePageRequest(request);
  return `select public.pull_market_rate_snapshots_page_v1(
  p_upper_watermark => ${sqlNullableTimestamp(normalized.upperWatermark)},
  p_cursor_created_at => ${sqlNullableTimestamp(normalized.cursor?.createdAt ?? null)},
  p_cursor_id => ${sqlNullableUuid(normalized.cursor?.id ?? null)},
  p_limit => ${normalized.limit}
) as page;`;
}

function getLinkedMarketRateSnapshotsQueryArgs(request) {
  return [
    "db",
    "query",
    "--agent=no",
    "--linked",
    "-o",
    "json",
    buildLinkedSnapshotPageQuery(request),
  ];
}

function queryLinkedMarketRateSnapshotPage(request) {
  const output = runSupabase(getLinkedMarketRateSnapshotsQueryArgs(request));
  const rows = parseSupabaseQueryRows(output);
  if (rows.length !== 1 || !isRecord(rows[0]) || !("page" in rows[0])) {
    invalidSnapshot("linked RPC did not return exactly one page row");
  }

  const page = rows[0].page;
  if (typeof page === "string") {
    try {
      return JSON.parse(page);
    } catch {
      invalidSnapshot("linked RPC page was not valid JSON");
    }
  }
  return page;
}

async function collectCompleteSnapshotUnits(fetchPage) {
  const units = [];
  const seenSnapshotIds = new Set();
  const seenObservationIds = new Set();
  const seenCursors = new Set();
  let cursor = null;
  let upperWatermark = null;
  let previousUnit = null;

  for (;;) {
    const request = {
      cursor,
      limit: SNAPSHOT_PAGE_LIMIT,
      upperWatermark,
    };
    const rawPage = await fetchPage(request);
    const page = validateSnapshotPage(rawPage, upperWatermark);
    upperWatermark = page.upperWatermark;

    for (const unit of page.units) {
      if (seenSnapshotIds.has(unit.root.id)) {
        invalidSnapshot(`duplicate snapshot identity ${unit.root.id}`);
      }
      if (previousUnit && compareSnapshotUnits(previousUnit, unit) >= 0) {
        invalidSnapshot("snapshot pages were not strictly ordered");
      }
      for (const observation of unit.observations) {
        if (seenObservationIds.has(observation.id)) {
          invalidSnapshot(`duplicate observation identity ${observation.id}`);
        }
        seenObservationIds.add(observation.id);
      }
      seenSnapshotIds.add(unit.root.id);
      units.push(unit);
      previousUnit = unit;
    }

    if (page.nextCursor === null) {
      return units;
    }

    const key = cursorKey(page.nextCursor);
    if (seenCursors.has(key)) {
      invalidSnapshot("snapshot page cursor repeated");
    }
    seenCursors.add(key);
    cursor = page.nextCursor;
  }
}

async function queryLinkedMarketRateSnapshots() {
  return collectCompleteSnapshotUnits(queryLinkedMarketRateSnapshotPage);
}

function validateSnapshotPage(value, expectedUpperWatermark) {
  const page = requireExactRecord(value, PAGE_KEYS, "page");
  const upperWatermark = requireTimestamp(
    page.upperWatermark,
    "page upper watermark"
  );
  if (
    expectedUpperWatermark !== null &&
    upperWatermark !== expectedUpperWatermark
  ) {
    invalidSnapshot("page upper watermark changed during pagination");
  }
  if (!Array.isArray(page.snapshots)) {
    invalidSnapshot("page snapshots must be an array");
  }

  const units = page.snapshots.map((snapshot) =>
    validateSnapshotEnvelope(snapshot, upperWatermark)
  );
  for (let index = 1; index < units.length; index += 1) {
    if (compareSnapshotUnits(units[index - 1], units[index]) >= 0) {
      invalidSnapshot("page snapshots were not strictly ordered");
    }
  }

  const nextCursor =
    page.nextCursor === null
      ? null
      : validateCursor(page.nextCursor, "page next cursor");
  if (nextCursor !== null) {
    const lastUnit = units.at(-1);
    if (
      !lastUnit ||
      lastUnit.root.id !== nextCursor.id ||
      !timestampsEqual(lastUnit.root.created_at, nextCursor.createdAt)
    ) {
      invalidSnapshot("page cursor did not identify the last snapshot");
    }
  }

  return { units, nextCursor, upperWatermark };
}

function validateSnapshotEnvelope(value, upperWatermark) {
  const envelope = requireExactRecord(value, ENVELOPE_KEYS, "envelope");
  const snapshotId = requireUuid(envelope.snapshotId, "snapshot identity");
  const capturedAt = requireTimestamp(envelope.capturedAt, "capture time");
  if (Date.parse(capturedAt) > Date.parse(upperWatermark)) {
    invalidSnapshot("capture time exceeded the page watermark");
  }

  const parsedRoot = validateRoot(envelope.root, capturedAt);
  if (!Array.isArray(envelope.observations)) {
    invalidSnapshot("observations must be an array");
  }
  if (envelope.observations.length !== REQUIRED_INSTRUMENT_CODES.length) {
    invalidSnapshot("snapshot did not contain exactly 37 observations");
  }

  const observedInstruments = new Set();
  const observedIds = new Set();
  const observations = envelope.observations.map((observation) => {
    const parsed = validateObservation(
      observation,
      snapshotId,
      capturedAt,
      parsedRoot
    );
    if (observedInstruments.has(parsed.instrument_code)) {
      invalidSnapshot(`duplicate instrument ${parsed.instrument_code}`);
    }
    if (observedIds.has(parsed.id)) {
      invalidSnapshot(`duplicate observation identity ${parsed.id}`);
    }
    observedInstruments.add(parsed.instrument_code);
    observedIds.add(parsed.id);
    return parsed;
  });

  for (const instrumentCode of REQUIRED_INSTRUMENT_CODES) {
    if (!observedInstruments.has(instrumentCode)) {
      invalidSnapshot(`missing instrument ${instrumentCode}`);
    }
  }

  return {
    root: toRootRow(snapshotId, capturedAt, parsedRoot),
    observations,
  };
}

function validateRoot(value, capturedAt) {
  const root = requireExactRecord(value, ROOT_KEYS, "root");
  const fiat = requireRecord(root.fiatUsdPerUnit, "root fiat rates");
  assertExactKeys(fiat, ROOT_FIAT_CODES, "root fiat rates");

  const fiatUsdPerUnit = {};
  for (const code of ROOT_FIAT_CODES) {
    fiatUsdPerUnit[code] = requirePositiveDecimal(
      fiat[code],
      `root ${code} rate`
    );
  }

  return {
    goldUsdPerGram: requirePositiveDecimal(
      root.goldUsdPerGram,
      "root Gold rate"
    ),
    silverUsdPerGram: requirePositiveDecimal(
      root.silverUsdPerGram,
      "root Silver rate"
    ),
    platinumUsdPerGram: requirePositiveDecimal(
      root.platinumUsdPerGram,
      "root Platinum rate"
    ),
    palladiumUsdPerGram: requirePositiveDecimal(
      root.palladiumUsdPerGram,
      "root Palladium rate"
    ),
    fiatUsdPerUnit,
    providerMetalObservedAt: requireProviderTimestamp(
      root.providerMetalObservedAt,
      capturedAt,
      "root metal provider time"
    ),
    providerCurrencyObservedAt: requireProviderTimestamp(
      root.providerCurrencyObservedAt,
      capturedAt,
      "root currency provider time"
    ),
  };
}

function validateObservation(value, snapshotId, capturedAt, root) {
  const observation = requireExactRecord(
    value,
    OBSERVATION_KEYS,
    "observation"
  );
  const id = requireUuid(observation.id, "observation identity");
  const batchId = requireUuid(observation.batchId, "observation batch");
  const observationCapturedAt = requireTimestamp(
    observation.capturedAt,
    "observation capture time"
  );
  if (
    batchId !== snapshotId ||
    !timestampsEqual(observationCapturedAt, capturedAt)
  ) {
    invalidSnapshot("observation identity or capture did not match its root");
  }

  const instrumentCode = requireNonEmptyString(
    observation.instrumentCode,
    "observation instrument"
  );
  if (!REQUIRED_INSTRUMENT_SET.has(instrumentCode)) {
    invalidSnapshot(`unexpected instrument ${instrumentCode}`);
  }
  const isMetal = instrumentCode.startsWith("metal:");
  const unit = requireNonEmptyString(observation.unit, "observation unit");
  if (
    unit !==
    (isMetal ? "usd_per_pure_gram" : "usd_per_currency_unit")
  ) {
    invalidSnapshot(`invalid unit for ${instrumentCode}`);
  }
  if (observation.orientation !== "quote_per_base") {
    invalidSnapshot(`invalid orientation for ${instrumentCode}`);
  }
  if (observation.quality !== "valid") {
    invalidSnapshot(`invalid quality for ${instrumentCode}`);
  }
  const source = requireNonEmptyString(
    observation.source,
    "observation source"
  ).trim();
  const valueDecimal = requirePositiveDecimal(
    observation.valueDecimal,
    `observation ${instrumentCode} value`
  );
  const expectedValue = expectedObservationValue(root, instrumentCode);
  if (valueDecimal !== expectedValue) {
    invalidSnapshot(`root value mismatch for ${instrumentCode}`);
  }

  const providerObservedAt = requireProviderTimestamp(
    observation.providerObservedAt,
    capturedAt,
    `observation ${instrumentCode} provider time`
  );
  const expectedProviderObservedAt = isMetal
    ? root.providerMetalObservedAt
    : root.providerCurrencyObservedAt;
  if (
    !nullableTimestampsEqual(
      providerObservedAt,
      expectedProviderObservedAt
    )
  ) {
    invalidSnapshot(`provider time mismatch for ${instrumentCode}`);
  }

  return {
    id,
    batch_id: batchId,
    instrument_code: instrumentCode,
    value_decimal: valueDecimal,
    unit,
    orientation: "quote_per_base",
    provider_observed_at: providerObservedAt,
    source,
    quality: "valid",
    created_at: capturedAt,
  };
}

function expectedObservationValue(root, instrumentCode) {
  if (instrumentCode === "metal:GOLD") return root.goldUsdPerGram;
  if (instrumentCode === "metal:SILVER") return root.silverUsdPerGram;
  if (instrumentCode === "currency:USD") return "1";
  const currencyCode = instrumentCode.slice("currency:".length);
  return root.fiatUsdPerUnit[currencyCode];
}

function toRootRow(snapshotId, capturedAt, root) {
  const row = {
    id: snapshotId,
    created_at: capturedAt,
    updated_at: capturedAt,
    gold_usd_per_gram: root.goldUsdPerGram,
    silver_usd_per_gram: root.silverUsdPerGram,
    platinum_usd_per_gram: root.platinumUsdPerGram,
    palladium_usd_per_gram: root.palladiumUsdPerGram,
    timestamp_metal: root.providerMetalObservedAt,
    timestamp_currency: root.providerCurrencyObservedAt,
  };
  for (const code of ROOT_FIAT_CODES) {
    row[`${code.toLowerCase()}_usd`] = root.fiatUsdPerUnit[code];
  }
  return row;
}

function buildImportSql(units) {
  if (!Array.isArray(units) || units.length === 0) {
    invalidSnapshot("remote RPC returned no complete snapshots");
  }

  const rootRows = units.map((unit) => unit.root);
  const observationRows = units.flatMap((unit) => unit.observations);
  const rootJson = escapeDollarTag(JSON.stringify(rootRows), "$market_roots$");
  const observationJson = escapeDollarTag(
    JSON.stringify(observationRows),
    "$market_observations$"
  );

  return `begin;

delete from public.market_rate_observations;
delete from public.market_rates;

with source_roots as (
  select *
  from jsonb_populate_recordset(
    null::public.market_rates,
    $market_roots$${rootJson}$market_roots$::jsonb
  )
)
insert into public.market_rates
select source_roots.*
from source_roots;

with source_observations as (
  select *
  from jsonb_populate_recordset(
    null::public.market_rate_observations,
    $market_observations$${observationJson}$market_observations$::jsonb
  )
)
insert into public.market_rate_observations
select source_observations.*
from source_observations;

commit;
`;
}

function importLocalMarketRateSnapshots(units) {
  const importPath = join(repoRoot, ".tmp-market-rates-import.sql");
  writeFileSync(importPath, buildImportSql(units), "utf8");

  try {
    runSupabase(["db", "query", "--local", "-f", importPath]);
  } finally {
    unlinkSync(importPath);
  }
}

async function runMarketRatesImport(argv = process.argv.slice(2)) {
  const { bestEffort } = parseImportMarketRatesArgs(argv);
  try {
    const units = await queryLinkedMarketRateSnapshots();
    if (units.length === 0) {
      invalidSnapshot("remote RPC returned no complete snapshots");
    }

    importLocalMarketRateSnapshots(units);
    const observationCount = units.reduce(
      (count, unit) => count + unit.observations.length,
      0
    );
    console.log(
      `Imported ${units.length} complete market-rate snapshots and ${observationCount} bound observations into local Supabase.`
    );
  } catch (error) {
    if (!bestEffort) {
      throw error;
    }

    console.warn(
      [
        "Skipped local market-rate snapshot import.",
        "Manual QA user data was seeded, but a complete linked market-rate snapshot was not available.",
        error instanceof Error ? error.message : String(error),
      ].join("\n")
    );
  }
}

function validatePageRequest(request) {
  if (!isRecord(request)) {
    invalidSnapshot("page request was not an object");
  }
  const limit = request.limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    invalidSnapshot("page request limit was invalid");
  }
  const upperWatermark =
    request.upperWatermark === null
      ? null
      : requireTimestamp(request.upperWatermark, "request upper watermark");
  const cursor =
    request.cursor === null
      ? null
      : validateCursor(request.cursor, "request cursor");
  return { cursor, limit, upperWatermark };
}

function validateCursor(value, label) {
  const cursor = requireExactRecord(value, CURSOR_KEYS, label);
  return {
    createdAt: requireTimestamp(cursor.createdAt, `${label} time`),
    id: requireUuid(cursor.id, `${label} id`),
  };
}

function requireRecord(value, label) {
  if (!isRecord(value)) {
    invalidSnapshot(`${label} must be an object`);
  }
  return value;
}

function requireExactRecord(value, keys, label) {
  const record = requireRecord(value, label);
  assertExactKeys(record, keys, label);
  return record;
}

function assertExactKeys(record, expectedKeys, label) {
  const actual = Object.keys(record).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    invalidSnapshot(`${label} fields did not match the contract`);
  }
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    invalidSnapshot(`${label} was missing`);
  }
  return value;
}

function requireUuid(value, label) {
  const text = requireNonEmptyString(value, label);
  if (!UUID_PATTERN.test(text)) {
    invalidSnapshot(`${label} was not a UUID`);
  }
  return text;
}

function requirePositiveDecimal(value, label) {
  const text = requireNonEmptyString(value, label);
  if (!POSITIVE_PLAIN_DECIMAL.test(text)) {
    invalidSnapshot(`${label} was not a positive plain decimal`);
  }
  return text;
}

function requireTimestamp(value, label) {
  const text = requireNonEmptyString(value, label);
  if (!Number.isFinite(Date.parse(text)) || text.includes("'")) {
    invalidSnapshot(`${label} was not a timestamp`);
  }
  return text;
}

function requireProviderTimestamp(value, capturedAt, label) {
  if (value === null) return null;
  const timestamp = requireTimestamp(value, label);
  if (Date.parse(timestamp) > Date.parse(capturedAt)) {
    invalidSnapshot(`${label} was after the capture time`);
  }
  return timestamp;
}

function timestampsEqual(left, right) {
  return Date.parse(left) === Date.parse(right);
}

function nullableTimestampsEqual(left, right) {
  if (left === null || right === null) return left === right;
  return timestampsEqual(left, right);
}

function compareSnapshotUnits(left, right) {
  const byTime =
    Date.parse(left.root.created_at) - Date.parse(right.root.created_at);
  return byTime !== 0 ? byTime : left.root.id.localeCompare(right.root.id);
}

function cursorKey(cursor) {
  return `${Date.parse(cursor.createdAt)}\u0000${cursor.id}`;
}

function sqlNullableTimestamp(value) {
  return value === null ? "null" : `${sqlString(value)}::timestamptz`;
}

function sqlNullableUuid(value) {
  return value === null ? "null" : `${sqlString(value)}::uuid`;
}

function sqlString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function escapeDollarTag(value, tag) {
  return value.replaceAll(tag, tag.replaceAll("$", "$ "));
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidSnapshot(message) {
  throw new Error(`${INVALID_SNAPSHOT_PREFIX}: ${message}`);
}

if (require.main === module) {
  void runMarketRatesImport().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  REQUIRED_FIAT_CODES,
  REQUIRED_INSTRUMENT_CODES,
  buildImportSql,
  buildLinkedSnapshotPageQuery,
  collectCompleteSnapshotUnits,
  getLinkedMarketRateSnapshotsQueryArgs,
  getSupabaseSpawnArgs,
  importLocalMarketRateSnapshots,
  parseImportMarketRatesArgs,
  parseSupabaseQueryRows,
  queryLinkedMarketRateSnapshots,
  runMarketRatesImport,
  validateSnapshotPage,
};
