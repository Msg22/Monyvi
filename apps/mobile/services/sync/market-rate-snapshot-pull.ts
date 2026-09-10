import type { SyncTableChangeSet } from "@nozbe/watermelondb/sync";
import {
  CURRENT_MARKET_INSTRUMENT_CODES,
  SUPPORTED_CURRENCIES,
  parseCanonicalDecimal,
  validateCurrentMarketSnapshot,
} from "@monyvi/logic";

import { supabase } from "../supabase";
import { createSyncTableError } from "./errors";
import { transformFromSupabase } from "./transforms";

export const MARKET_RATE_SNAPSHOT_PULL_ERROR_CODE =
  "sync_invalid_market_rate_snapshot_page";

const MARKET_RATE_SNAPSHOT_RPC = "pull_market_rate_snapshots_page_v1";
const MARKET_RATE_SNAPSHOT_PAGE_SIZE = 50;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POSITIVE_PLAIN_DECIMAL = /^(?=.*[1-9])(?:0|[1-9]\d*)(?:\.\d+)?$/;

const ROOT_KEYS = [
  "fiatUsdPerUnit",
  "goldUsdPerGram",
  "palladiumUsdPerGram",
  "platinumUsdPerGram",
  "providerCurrencyObservedAt",
  "providerMetalObservedAt",
  "silverUsdPerGram",
] as const;
const ENVELOPE_KEYS = [
  "capturedAt",
  "observations",
  "root",
  "snapshotId",
] as const;
const OBSERVATION_KEYS = [
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
] as const;
const PAGE_KEYS = ["nextCursor", "snapshots", "upperWatermark"] as const;
const CURSOR_KEYS = ["createdAt", "id"] as const;
const ROOT_FIAT_CODES: readonly string[] = [
  ...SUPPORTED_CURRENCIES.map(({ code }) => code).filter(
    (code) => code !== "USD"
  ),
  "BTC",
];

export interface MarketRateSnapshotCursor {
  readonly createdAt: string;
  readonly id: string;
}

export interface MarketRateSnapshotRpcRequest {
  readonly cursor: MarketRateSnapshotCursor | null;
  readonly limit: number;
  readonly upperWatermark: string | null;
}

export interface MarketRateSnapshotRpcResponse {
  readonly data: unknown;
  readonly error: unknown | null;
}

export interface MarketRateSnapshotRpcClient {
  pull(
    request: MarketRateSnapshotRpcRequest
  ): Promise<MarketRateSnapshotRpcResponse>;
}

export interface MarketRateSnapshotPullResult {
  readonly changes: {
    readonly market_rates: SyncTableChangeSet;
    readonly market_rate_observations: SyncTableChangeSet;
  };
  readonly upperWatermark: string;
}

interface ParsedMarketRateRoot {
  readonly fiatUsdPerUnit: Readonly<Record<string, string>>;
  readonly goldUsdPerGram: string;
  readonly palladiumUsdPerGram: string;
  readonly platinumUsdPerGram: string;
  readonly providerCurrencyObservedAt: string | null;
  readonly providerMetalObservedAt: string | null;
  readonly silverUsdPerGram: string;
}

interface ParsedMarketRateObservation {
  readonly batchId: string;
  readonly capturedAt: string;
  readonly id: string;
  readonly instrumentCode: string;
  readonly orientation: string;
  readonly providerObservedAt: string | null;
  readonly quality: string;
  readonly source: string;
  readonly unit: string;
  readonly valueDecimal: string;
}

interface ParsedMarketRateEnvelope {
  readonly capturedAt: string;
  readonly observations: readonly ParsedMarketRateObservation[];
  readonly root: ParsedMarketRateRoot;
  readonly snapshotId: string;
}

interface ParsedMarketRatePage {
  readonly nextCursor: MarketRateSnapshotCursor | null;
  readonly snapshots: readonly ParsedMarketRateEnvelope[];
  readonly upperWatermark: string;
}

export async function pullMarketRateSnapshots(
  start: MarketRateSnapshotCursor | null
): Promise<MarketRateSnapshotPullResult> {
  const client: MarketRateSnapshotRpcClient = {
    async pull(
      request: MarketRateSnapshotRpcRequest
    ): Promise<MarketRateSnapshotRpcResponse> {
      const args = {
        p_limit: request.limit,
        ...(request.upperWatermark === null
          ? {}
          : { p_upper_watermark: request.upperWatermark }),
        ...(request.cursor === null
          ? {}
          : {
              p_cursor_created_at: request.cursor.createdAt,
              p_cursor_id: request.cursor.id,
            }),
      };
      const { data, error } = await supabase.rpc(
        MARKET_RATE_SNAPSHOT_RPC,
        args
      );
      return { data, error };
    },
  };

  return pullMarketRateSnapshotsWithClient(client, start);
}

export async function pullMarketRateSnapshotsWithClient(
  client: MarketRateSnapshotRpcClient,
  start: MarketRateSnapshotCursor | null
): Promise<MarketRateSnapshotPullResult> {
  const roots: Record<string, unknown>[] = [];
  const observations: Record<string, unknown>[] = [];
  const seenSnapshotIds = new Set<string>();
  const seenCursorKeys = new Set<string>();
  let cursor = start;
  let upperWatermark: string | null = null;

  if (cursor !== null) {
    validateCursor(cursor);
    seenCursorKeys.add(cursorKey(cursor));
  }

  for (;;) {
    const response = await client.pull({
      cursor,
      limit: MARKET_RATE_SNAPSHOT_PAGE_SIZE,
      upperWatermark,
    });
    if (response.error !== null) {
      throw createSyncTableError(
        "pull",
        "market_rate_snapshots",
        response.error
      );
    }

    const page = parsePage(response.data);
    if (
      upperWatermark !== null &&
      page.upperWatermark !== upperWatermark
    ) {
      failInvalidPage();
    }
    upperWatermark = page.upperWatermark;

    for (const envelope of page.snapshots) {
      if (seenSnapshotIds.has(envelope.snapshotId)) {
        failInvalidPage();
      }
      seenSnapshotIds.add(envelope.snapshotId);
      roots.push(toLocalRoot(envelope));
      observations.push(
        ...envelope.observations.map(toLocalObservation)
      );
    }

    if (page.nextCursor === null) {
      break;
    }

    const lastSnapshot = page.snapshots.at(-1);
    if (
      !lastSnapshot ||
      page.nextCursor.id !== lastSnapshot.snapshotId ||
      !timestampsEqual(
        page.nextCursor.createdAt,
        lastSnapshot.capturedAt
      )
    ) {
      failInvalidPage();
    }

    const nextCursorKey = cursorKey(page.nextCursor);
    if (seenCursorKeys.has(nextCursorKey)) {
      failInvalidPage();
    }
    seenCursorKeys.add(nextCursorKey);
    cursor = page.nextCursor;
  }

  if (upperWatermark === null) {
    failInvalidPage();
  }

  return {
    changes: {
      market_rates: {
        created: [],
        updated: roots,
        deleted: [],
      },
      market_rate_observations: {
        created: [],
        updated: observations,
        deleted: [],
      },
    },
    upperWatermark,
  };
}

function parsePage(value: unknown): ParsedMarketRatePage {
  const record = requireExactRecord(value, PAGE_KEYS);
  const upperWatermark = requireTimestamp(record.upperWatermark);
  if (!Array.isArray(record.snapshots)) {
    failInvalidPage();
  }

  const snapshots = record.snapshots.map((snapshot) =>
    parseEnvelope(snapshot, upperWatermark)
  );
  const nextCursor =
    record.nextCursor === null ? null : parseCursor(record.nextCursor);

  if (nextCursor !== null && snapshots.length === 0) {
    failInvalidPage();
  }

  return { nextCursor, snapshots, upperWatermark };
}

function parseEnvelope(
  value: unknown,
  upperWatermark: string
): ParsedMarketRateEnvelope {
  const record = requireExactRecord(value, ENVELOPE_KEYS);
  const snapshotId = requireUuid(record.snapshotId);
  const capturedAt = requireTimestamp(record.capturedAt);
  if (Date.parse(capturedAt) > Date.parse(upperWatermark)) {
    failInvalidPage();
  }
  const root = parseRoot(record.root, capturedAt);
  if (!Array.isArray(record.observations)) {
    failInvalidPage();
  }
  const observations = record.observations.map((observation) =>
    parseObservation(observation, snapshotId, capturedAt)
  );

  const observationIds = new Set<string>();
  for (const observation of observations) {
    if (observationIds.has(observation.id)) {
      failInvalidPage();
    }
    observationIds.add(observation.id);
  }

  const validation = validateCurrentMarketSnapshot(
    observations.map((observation) => ({
      capturedAt,
      instrumentCode: observation.instrumentCode,
      orientation: observation.orientation,
      providerObservedAt: observation.providerObservedAt,
      quality: observation.quality,
      source: observation.source,
      unit: observation.unit,
      valueDecimal: observation.valueDecimal,
    }))
  );
  if (!validation.available) {
    failInvalidPage();
  }

  for (const observation of observations) {
    const expectedValue = expectedObservationValue(
      root,
      observation.instrumentCode
    );
    const expectedProviderTime = observation.instrumentCode.startsWith(
      "metal:"
    )
      ? root.providerMetalObservedAt
      : root.providerCurrencyObservedAt;
    if (
      expectedValue === null ||
      observation.valueDecimal !== expectedValue ||
      !nullableTimestampsEqual(
        observation.providerObservedAt,
        expectedProviderTime
      )
    ) {
      failInvalidPage();
    }
  }

  return {
    capturedAt,
    observations,
    root,
    snapshotId,
  };
}

function parseRoot(
  value: unknown,
  capturedAt: string
): ParsedMarketRateRoot {
  const record = requireExactRecord(value, ROOT_KEYS);
  const fiatRecord = requireRecord(record.fiatUsdPerUnit);
  assertExactKeys(fiatRecord, ROOT_FIAT_CODES);

  const fiatUsdPerUnit: Record<string, string> = {};
  for (const code of ROOT_FIAT_CODES) {
    fiatUsdPerUnit[code] = requirePositiveDecimal(fiatRecord[code]);
  }

  return {
    fiatUsdPerUnit,
    goldUsdPerGram: requirePositiveDecimal(record.goldUsdPerGram),
    palladiumUsdPerGram: requirePositiveDecimal(
      record.palladiumUsdPerGram
    ),
    platinumUsdPerGram: requirePositiveDecimal(
      record.platinumUsdPerGram
    ),
    providerCurrencyObservedAt: requireProviderTimestamp(
      record.providerCurrencyObservedAt,
      capturedAt
    ),
    providerMetalObservedAt: requireProviderTimestamp(
      record.providerMetalObservedAt,
      capturedAt
    ),
    silverUsdPerGram: requirePositiveDecimal(record.silverUsdPerGram),
  };
}

function parseObservation(
  value: unknown,
  snapshotId: string,
  capturedAt: string
): ParsedMarketRateObservation {
  const record = requireExactRecord(value, OBSERVATION_KEYS);
  const batchId = requireUuid(record.batchId);
  const observationCapturedAt = requireTimestamp(record.capturedAt);
  if (
    batchId !== snapshotId ||
    !timestampsEqual(observationCapturedAt, capturedAt)
  ) {
    failInvalidPage();
  }

  return {
    batchId,
    capturedAt: observationCapturedAt,
    id: requireUuid(record.id),
    instrumentCode: requireNonEmptyString(record.instrumentCode),
    orientation: requireNonEmptyString(record.orientation),
    providerObservedAt: requireProviderTimestamp(
      record.providerObservedAt,
      capturedAt
    ),
    quality: requireNonEmptyString(record.quality),
    source: requireNonEmptyString(record.source).trim(),
    unit: requireNonEmptyString(record.unit),
    valueDecimal: requirePositiveDecimal(record.valueDecimal),
  };
}

function expectedObservationValue(
  root: ParsedMarketRateRoot,
  instrumentCode: string
): string | null {
  if (instrumentCode === "metal:GOLD") {
    return root.goldUsdPerGram;
  }
  if (instrumentCode === "metal:SILVER") {
    return root.silverUsdPerGram;
  }
  if (instrumentCode === "currency:USD") {
    return "1";
  }
  if (!instrumentCode.startsWith("currency:")) {
    return null;
  }
  return root.fiatUsdPerUnit[instrumentCode.slice("currency:".length)] ?? null;
}

function toLocalRoot(
  envelope: ParsedMarketRateEnvelope
): Record<string, unknown> {
  const root = envelope.root;
  const record: Record<string, unknown> = {
    id: envelope.snapshotId,
    created_at: envelope.capturedAt,
    updated_at: envelope.capturedAt,
    gold_usd_per_gram: toCompatibilityNumber(root.goldUsdPerGram),
    silver_usd_per_gram: toCompatibilityNumber(root.silverUsdPerGram),
    platinum_usd_per_gram: toCompatibilityNumber(root.platinumUsdPerGram),
    palladium_usd_per_gram: toCompatibilityNumber(
      root.palladiumUsdPerGram
    ),
    timestamp_metal: root.providerMetalObservedAt,
    timestamp_currency: root.providerCurrencyObservedAt,
  };

  for (const code of ROOT_FIAT_CODES) {
    record[`${code.toLowerCase()}_usd`] = toCompatibilityNumber(
      root.fiatUsdPerUnit[code]
    );
  }

  return transformFromSupabase("market_rates", record);
}

function toLocalObservation(
  observation: ParsedMarketRateObservation
): Record<string, unknown> {
  return transformFromSupabase("market_rate_observations", {
    batch_id: observation.batchId,
    created_at: observation.capturedAt,
    id: observation.id,
    instrument_code: observation.instrumentCode,
    orientation: observation.orientation,
    provider_observed_at: observation.providerObservedAt,
    quality: observation.quality,
    source: observation.source,
    unit: observation.unit,
    value_decimal: observation.valueDecimal,
  });
}

function toCompatibilityNumber(value: string | undefined): number {
  if (value === undefined) {
    failInvalidPage();
  }
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    failInvalidPage();
  }
  return numberValue;
}

function parseCursor(value: unknown): MarketRateSnapshotCursor {
  const record = requireExactRecord(value, CURSOR_KEYS);
  return {
    createdAt: requireTimestamp(record.createdAt),
    id: requireUuid(record.id),
  };
}

function validateCursor(cursor: MarketRateSnapshotCursor): void {
  requireTimestamp(cursor.createdAt);
  requireUuid(cursor.id);
}

function requireExactRecord(
  value: unknown,
  keys: readonly string[]
): Record<string, unknown> {
  const record = requireRecord(value);
  assertExactKeys(record, keys);
  return record;
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    failInvalidPage();
  }
  return value;
}

function assertExactKeys(
  record: Readonly<Record<string, unknown>>,
  expectedKeys: readonly string[]
): void {
  const actual = Object.keys(record).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    failInvalidPage();
  }
}

function requireUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    failInvalidPage();
  }
  return value;
}

function requireNonEmptyString(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    failInvalidPage();
  }
  return value;
}

function requirePositiveDecimal(value: unknown): string {
  if (typeof value !== "string" || !POSITIVE_PLAIN_DECIMAL.test(value)) {
    failInvalidPage();
  }
  try {
    if (!parseCanonicalDecimal(value).greaterThan("0")) {
      failInvalidPage();
    }
  } catch {
    failInvalidPage();
  }
  return value;
}

function requireTimestamp(value: unknown): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    failInvalidPage();
  }
  return value;
}

function requireProviderTimestamp(
  value: unknown,
  capturedAt: string
): string | null {
  if (value === null) {
    return null;
  }
  const timestamp = requireTimestamp(value);
  if (Date.parse(timestamp) > Date.parse(capturedAt)) {
    failInvalidPage();
  }
  return timestamp;
}

function timestampsEqual(left: string, right: string): boolean {
  return Date.parse(left) === Date.parse(right);
}

function nullableTimestampsEqual(
  left: string | null,
  right: string | null
): boolean {
  return left === null || right === null
    ? left === right
    : timestampsEqual(left, right);
}

function cursorKey(cursor: MarketRateSnapshotCursor): string {
  return `${Date.parse(cursor.createdAt)}\u0000${cursor.id}`;
}

function failInvalidPage(): never {
  throw new Error(MARKET_RATE_SNAPSHOT_PULL_ERROR_CODE);
}

export const MARKET_RATE_SNAPSHOT_REQUIRED_INSTRUMENTS =
  CURRENT_MARKET_INSTRUMENT_CODES;
