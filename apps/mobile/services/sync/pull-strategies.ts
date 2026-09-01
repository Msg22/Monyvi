import type {
  SyncPullResult,
  SyncTableChangeSet,
} from "@nozbe/watermelondb/sync";

import { logger } from "@/utils/logger";
import { parseCanonicalDecimal } from "@monyvi/logic";

import { assertCanonicalMetalRevision } from "../metal-financial-action-adapter";
import { getCurrentUserId, supabase } from "../supabase";
import { SNAPSHOT_RETENTION_DAYS, SYNCABLE_TABLES } from "./config";
import { createSyncTableError } from "./errors";
import {
  getChildTableConfig,
  isServerOwnedUserTable,
  isSnapshotTable,
} from "./table-predicates";
import { transformFromSupabase } from "./transforms";
import type {
  AppSyncDatabaseChangeSet,
  ChildTableConfig,
  ChildTableName,
  SnapshotTableName,
  UserOwnedPullTableName,
} from "./types";

export const SYNC_PULL_ERROR_CODES = {
  AUTH_SCOPE_LOST: "sync_pull_auth_scope_lost",
  INVALID_EXACT_TEXT: "sync_invalid_exact_text",
  INVALID_METAL_OBSERVATION_PAGE: "sync_invalid_metal_observation_page",
  INVALID_PULL_ROW: "sync_invalid_pull_row",
} as const;

const METAL_OBSERVATION_PAGE_SIZE = 500;
const METAL_HOLDING_STATE_PAGE_SIZE = 500;
const METAL_OBSERVATION_RPC = "pull_metal_observations_page_v1";
const UUID_MAX = "ffffffff-ffff-ffff-ffff-ffffffffffff";

interface MetalObservationCursor {
  readonly createdAt: string;
  readonly id: string;
}

interface MetalObservationRpcRow {
  readonly batchId: string;
  readonly createdAt: string;
  readonly id: string;
  readonly instrumentCode: string;
  readonly orientation: string;
  readonly providerObservedAt: string | null;
  readonly quality: string;
  readonly source: string | null;
  readonly unit: string;
  readonly valueDecimal: string;
}

interface MetalObservationPage {
  readonly hasMore: boolean;
  readonly nextCursor: MetalObservationCursor | null;
  readonly rows: readonly MetalObservationRpcRow[];
  readonly upperWatermark: string;
}

interface PulledRow extends Record<string, unknown> {
  readonly deleted?: boolean;
  readonly id: string;
}

function isPulledRow(value: unknown): value is PulledRow {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "id" in value &&
    typeof value.id === "string" &&
    (!("deleted" in value) || typeof value.deleted === "boolean")
  );
}

function requirePulledRows(values: readonly unknown[]): readonly PulledRow[] {
  if (!values.every(isPulledRow)) {
    throw new Error(SYNC_PULL_ERROR_CODES.INVALID_PULL_ROW);
  }
  return values;
}

export interface MetalObservationPullResult {
  readonly changes: SyncTableChangeSet;
  readonly upperWatermark: string;
}

const EXACT_TEXT_SELECTS = {
  assets: "*,purchase_price_decimal_text:purchase_price_decimal::text",
  asset_metals:
    "*,weight_grams_decimal_text:weight_grams_decimal::text,purity_factor_decimal_text:purity_factor_decimal::text",
  metal_holding_states: "*,financial_revision_text:financial_revision::text",
} as const;

function failInvalidObservationPage(): never {
  throw new Error(SYNC_PULL_ERROR_CODES.INVALID_METAL_OBSERVATION_PAGE);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    failInvalidObservationPage();
  }
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    failInvalidObservationPage();
  }
  return value;
}

function asTimestamp(value: unknown): string {
  const timestamp = asNonEmptyString(value);
  if (!Number.isFinite(Date.parse(timestamp))) {
    failInvalidObservationPage();
  }
  return timestamp;
}

function parseObservationCursor(value: unknown): MetalObservationCursor {
  const cursor = asRecord(value);
  return {
    createdAt: asTimestamp(cursor.createdAt),
    id: asNonEmptyString(cursor.id),
  };
}

function parseObservationRow(value: unknown): MetalObservationRpcRow {
  const row = asRecord(value);
  const valueDecimal = asNonEmptyString(row.valueDecimal);
  try {
    parseCanonicalDecimal(valueDecimal);
  } catch {
    failInvalidObservationPage();
  }
  const providerObservedAt =
    row.providerObservedAt === null
      ? null
      : asTimestamp(row.providerObservedAt);
  const source = row.source === null ? null : asNonEmptyString(row.source);
  return {
    batchId: asNonEmptyString(row.batchId),
    createdAt: asTimestamp(row.createdAt),
    id: asNonEmptyString(row.id),
    instrumentCode: asNonEmptyString(row.instrumentCode),
    orientation: asNonEmptyString(row.orientation),
    providerObservedAt,
    quality: asNonEmptyString(row.quality),
    source,
    unit: asNonEmptyString(row.unit),
    valueDecimal,
  };
}

function parseObservationPage(value: unknown): MetalObservationPage {
  const page = asRecord(value);
  if (typeof page.hasMore !== "boolean" || !Array.isArray(page.rows)) {
    failInvalidObservationPage();
  }
  const rows = page.rows.map(parseObservationRow);
  const nextCursor =
    page.nextCursor === null ? null : parseObservationCursor(page.nextCursor);
  if (page.hasMore !== (nextCursor !== null)) {
    failInvalidObservationPage();
  }
  if (page.hasMore) {
    const lastRow = rows[rows.length - 1];
    if (
      !lastRow ||
      !nextCursor ||
      nextCursor.createdAt !== lastRow.createdAt ||
      nextCursor.id !== lastRow.id
    ) {
      failInvalidObservationPage();
    }
  }
  return {
    hasMore: page.hasMore,
    nextCursor,
    rows,
    upperWatermark: asTimestamp(page.upperWatermark),
  };
}

function transformObservationRow(
  row: MetalObservationRpcRow
): Record<string, unknown> {
  return transformFromSupabase("market_rate_observations", {
    batch_id: row.batchId,
    created_at: row.createdAt,
    id: row.id,
    instrument_code: row.instrumentCode,
    orientation: row.orientation,
    provider_observed_at: row.providerObservedAt,
    quality: row.quality,
    source: row.source,
    unit: row.unit,
    value_decimal: row.valueDecimal,
  });
}

function normalizeExactTextColumn(
  record: Record<string, unknown>,
  alias: string,
  target: string,
  validate: (value: string) => void
): Record<string, unknown> {
  const value = record[alias];
  if (value !== null && typeof value !== "string") {
    throw new Error(SYNC_PULL_ERROR_CODES.INVALID_EXACT_TEXT);
  }
  if (typeof value === "string") {
    try {
      validate(value);
    } catch {
      throw new Error(SYNC_PULL_ERROR_CODES.INVALID_EXACT_TEXT);
    }
  }
  const normalized = { ...record, [target]: value };
  delete normalized[alias];
  return normalized;
}

function validateCanonicalDecimal(value: string): void {
  parseCanonicalDecimal(value);
}

function normalizePulledExactText(
  table:
    | GenericUserOwnedPullTableName
    | ChildTableName
    | "metal_holding_states",
  record: Record<string, unknown>
): Record<string, unknown> {
  if (table === "assets") {
    return normalizeExactTextColumn(
      record,
      "purchase_price_decimal_text",
      "purchase_price_decimal",
      validateCanonicalDecimal
    );
  }
  if (table === "asset_metals") {
    const weight = normalizeExactTextColumn(
      record,
      "weight_grams_decimal_text",
      "weight_grams_decimal",
      validateCanonicalDecimal
    );
    return normalizeExactTextColumn(
      weight,
      "purity_factor_decimal_text",
      "purity_factor_decimal",
      validateCanonicalDecimal
    );
  }
  if (table === "metal_holding_states") {
    return normalizeExactTextColumn(
      record,
      "financial_revision_text",
      "financial_revision",
      assertCanonicalMetalRevision
    );
  }
  return { ...record };
}

function pullSelect(
  table: GenericUserOwnedPullTableName | ChildTableName | "metal_holding_states"
): string {
  return EXACT_TEXT_SELECTS[table as keyof typeof EXACT_TEXT_SELECTS] ?? "*";
}

async function assertExpectedPullUser(expectedUserId: string): Promise<void> {
  const currentUserId = await getCurrentUserId();
  if (currentUserId !== expectedUserId) {
    throw new Error(SYNC_PULL_ERROR_CODES.AUTH_SCOPE_LOST);
  }
}

type GenericUserOwnedPullTableName = Exclude<
  UserOwnedPullTableName,
  "market_rate_observations"
>;

export async function pullMarketRates(
  daysToKeep = 7,
  upperWatermark?: string
): Promise<SyncTableChangeSet> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  let query = supabase
    .from("market_rates")
    .select("*")
    .gt("created_at", cutoffDate.toISOString())
    .order("created_at", { ascending: false });
  if (upperWatermark) {
    query = query.lte("created_at", upperWatermark);
  }
  const { data, error } = await query;

  if (error) {
    throw createSyncTableError("pull", "market_rates", error);
  }

  if (!data || data.length === 0) {
    return { created: [], updated: [], deleted: [] };
  }

  const activeRecords = data.map((record) =>
    transformFromSupabase("market_rates", record)
  );

  return {
    created: [],
    updated: activeRecords,
    deleted: [],
  };
}

export async function pullMarketRateObservations(
  lastSyncDate: string | null
): Promise<MetalObservationPullResult> {
  const rows: MetalObservationRpcRow[] = [];
  let upperWatermark: string | null = null;
  let cursor: MetalObservationCursor | null = lastSyncDate
    ? { createdAt: lastSyncDate, id: UUID_MAX }
    : null;
  const seenCursors = new Set<string>();
  let shouldPullNextPage = true;

  while (shouldPullNextPage) {
    const { data, error } = await supabase.rpc(METAL_OBSERVATION_RPC, {
      p_after_created_at: cursor?.createdAt ?? null,
      p_after_id: cursor?.id ?? null,
      p_limit: METAL_OBSERVATION_PAGE_SIZE,
      p_upper_watermark: upperWatermark,
    });
    if (error) {
      throw createSyncTableError("pull", "market_rate_observations", error);
    }
    const page = parseObservationPage(data);
    if (upperWatermark !== null && page.upperWatermark !== upperWatermark) {
      failInvalidObservationPage();
    }
    upperWatermark = page.upperWatermark;
    rows.push(...page.rows);
    if (!page.hasMore || page.nextCursor === null) {
      shouldPullNextPage = false;
      continue;
    }

    const cursorKey = `${page.nextCursor.createdAt}\u0000${page.nextCursor.id}`;
    if (seenCursors.has(cursorKey)) failInvalidObservationPage();
    seenCursors.add(cursorKey);
    cursor = page.nextCursor;
  }

  if (upperWatermark === null) failInvalidObservationPage();
  return {
    changes: {
      created: [],
      updated: rows.map(transformObservationRow),
      deleted: [],
    },
    upperWatermark,
  };
}

export async function pullSnapshotTable(
  table: SnapshotTableName,
  userId: string,
  lastSyncDate: string | null,
  upperWatermark: string
): Promise<SyncTableChangeSet> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - SNAPSHOT_RETENTION_DAYS);

    let query = supabase
      .from(table)
      .select("*")
      .eq("user_id", userId)
      .gt("created_at", cutoffDate.toISOString())
      .order("created_at", { ascending: false });

    if (lastSyncDate) {
      query = query.gt("created_at", lastSyncDate);
    }
    query = query.lte("created_at", upperWatermark);

    const { data, error } = await query;

    if (error) {
      throw createSyncTableError("pull", table, error);
    }

    if (!data || data.length === 0) {
      return { created: [], updated: [], deleted: [] };
    }

    const activeRecords = data.map((record) =>
      transformFromSupabase(table, record)
    );

    return {
      created: [],
      updated: activeRecords,
      deleted: [],
    };
  } catch (err) {
    logger.error("sync.pull.snapshot.failed", err, { table });
    throw err;
  }
}

export async function pullUserTable(
  table: GenericUserOwnedPullTableName,
  userId: string,
  lastSyncDate: string | null,
  upperWatermark: string
): Promise<SyncTableChangeSet> {
  let query = supabase
    .from(table)
    .select(pullSelect(table))
    .eq("user_id", userId);

  if (lastSyncDate) {
    query = query.gt("updated_at", lastSyncDate);
  }
  query = query.lte("updated_at", upperWatermark);

  const { data, error } = await query;

  if (error) {
    throw createSyncTableError("pull", table, error);
  }

  if (!data || data.length === 0) {
    return { created: [], updated: [], deleted: [] };
  }

  // PostgREST supports the exact-value `::text` projections above, but the
  // Supabase select-string type parser cannot infer rows containing casts.
  const records = requirePulledRows(data);
  const deleted = records
    .filter((record) => record.deleted === true)
    .map((record) => record.id);

  const activeRecords = records
    .filter((record) => record.deleted !== true)
    .map((record) =>
      transformFromSupabase(table, normalizePulledExactText(table, record))
    );

  return {
    created: [],
    updated: activeRecords,
    deleted,
  };
}

export async function pullChildTable(
  table: ChildTableName,
  childConfig: ChildTableConfig,
  userId: string,
  lastSyncDate: string | null,
  upperWatermark: string
): Promise<SyncTableChangeSet> {
  const parentResult = await supabase
    .from(childConfig.parentTable)
    .select("id")
    .eq("user_id", userId);

  if (parentResult.error) {
    throw createSyncTableError(
      "pull",
      childConfig.parentTable,
      parentResult.error
    );
  }

  if (!parentResult.data || parentResult.data.length === 0) {
    return { created: [], updated: [], deleted: [] };
  }

  const ids = parentResult.data.map((p) => p.id);
  let query = supabase
    .from(table)
    .select(pullSelect(table))
    .in(childConfig.foreignKey, ids);

  if (lastSyncDate) {
    query = query.gt("updated_at", lastSyncDate);
  }
  query = query.lte("updated_at", upperWatermark);

  const { data, error } = await query;

  if (error) {
    throw createSyncTableError("pull", table, error);
  }

  if (!data || data.length === 0) {
    return { created: [], updated: [], deleted: [] };
  }

  // PostgREST supports the exact-value `::text` projections above, but the
  // Supabase select-string type parser cannot infer rows containing casts.
  const records = requirePulledRows(data);
  const deleted = records
    .filter((record) => record.deleted === true)
    .map((record) => record.id);

  const activeRecords = records
    .filter((record) => record.deleted !== true)
    .map((record) =>
      transformFromSupabase(table, normalizePulledExactText(table, record))
    );

  return {
    created: [],
    updated: activeRecords,
    deleted,
  };
}

export async function pullCategories(
  userId: string,
  lastSyncDate: string | null,
  upperWatermark: string
): Promise<SyncTableChangeSet> {
  let query = supabase
    .from("categories")
    .select("*")
    .or(`user_id.eq.${userId},user_id.is.null`);

  if (lastSyncDate) {
    query = query.gt("updated_at", lastSyncDate);
  }
  query = query.lte("updated_at", upperWatermark);

  const { data, error } = await query;

  if (error) {
    throw createSyncTableError("pull", "categories", error);
  }

  if (!data || data.length === 0) {
    return { created: [], updated: [], deleted: [] };
  }

  const deleted = data
    .filter((record) => record.deleted === true)
    .map((record) => record.id);

  const activeRecords = data
    .filter((record) => record.deleted !== true)
    .map((record) => transformFromSupabase("categories", record));

  return {
    created: [],
    updated: activeRecords,
    deleted,
  };
}

export async function pullMetalHoldingStates(
  userId: string,
  lastSyncDate: string | null,
  upperWatermark: string
): Promise<SyncTableChangeSet> {
  const records: PulledRow[] = [];
  let cursorUpdatedAt = lastSyncDate;
  let cursorId: string | null = null;
  let shouldPullNextPage = true;

  while (shouldPullNextPage) {
    let query = supabase
      .from("metal_holding_states")
      .select(pullSelect("metal_holding_states"))
      .eq("user_id", userId);
    if (cursorUpdatedAt && cursorId) {
      query = query.or(
        `updated_at.gt.${cursorUpdatedAt},and(updated_at.eq.${cursorUpdatedAt},id.gt.${cursorId})`
      );
    } else if (cursorUpdatedAt) {
      query = query.gt("updated_at", cursorUpdatedAt);
    }
    query = query
      .lte("updated_at", upperWatermark)
      .order("updated_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(METAL_HOLDING_STATE_PAGE_SIZE);

    const { data, error } = await query;
    if (error) {
      throw createSyncTableError("pull", "metal_holding_states", error);
    }
    const page = requirePulledRows(data ?? []);
    records.push(...page);
    shouldPullNextPage = page.length === METAL_HOLDING_STATE_PAGE_SIZE;
    if (shouldPullNextPage) {
      const lastRecord = page[page.length - 1];
      if (!lastRecord || typeof lastRecord.updated_at !== "string") {
        throw new Error(SYNC_PULL_ERROR_CODES.INVALID_PULL_ROW);
      }
      cursorUpdatedAt = lastRecord.updated_at;
      cursorId = lastRecord.id;
    }
  }

  // PostgREST supports the exact-value `::text` projection above, but the
  // Supabase select-string type parser cannot infer rows containing casts.
  const deleted = records
    .filter((record) => record.deleted === true)
    .map((record) => record.id);
  const updated = records
    .filter((record) => record.deleted !== true)
    .map((record) =>
      transformFromSupabase(
        "metal_holding_states",
        normalizePulledExactText("metal_holding_states", record)
      )
    );
  return { created: [], updated, deleted };
}

export async function pullChanges(
  lastPulledAt: number | null,
  expectedUserId: string
): Promise<SyncPullResult> {
  await assertExpectedPullUser(expectedUserId);

  const changes: AppSyncDatabaseChangeSet = {};
  const lastSyncDate = lastPulledAt
    ? new Date(lastPulledAt).toISOString()
    : null;
  const observationPull = await pullMarketRateObservations(lastSyncDate);
  const { upperWatermark } = observationPull;
  changes.market_rate_observations = observationPull.changes;

  for (const table of SYNCABLE_TABLES) {
    const childConfig = getChildTableConfig(table);

    if (table === "market_rates") {
      changes[table] = await pullMarketRates(7, upperWatermark);
    } else if (table === "market_rate_observations") {
      continue;
    } else if (isSnapshotTable(table)) {
      changes[table] = await pullSnapshotTable(
        table,
        expectedUserId,
        lastSyncDate,
        upperWatermark
      );
    } else if (isServerOwnedUserTable(table)) {
      changes[table] = await pullUserTable(
        table,
        expectedUserId,
        lastSyncDate,
        upperWatermark
      );
    } else if (table === "categories") {
      changes[table] = await pullCategories(
        expectedUserId,
        lastSyncDate,
        upperWatermark
      );
    } else if (childConfig) {
      changes[table] = await pullChildTable(
        table as ChildTableName,
        childConfig,
        expectedUserId,
        lastSyncDate,
        upperWatermark
      );
    } else {
      changes[table] = await pullUserTable(
        table as GenericUserOwnedPullTableName,
        expectedUserId,
        lastSyncDate,
        upperWatermark
      );
    }
  }
  changes.metal_holding_states = await pullMetalHoldingStates(
    expectedUserId,
    lastSyncDate,
    upperWatermark
  );

  await assertExpectedPullUser(expectedUserId);

  return {
    changes,
    timestamp: Date.parse(upperWatermark),
  };
}

export async function runMetalPullStrategy(input: {
  readonly pull: () => Promise<void>;
  readonly commitWatermark: () => Promise<void> | void;
}): Promise<void> {
  await input.pull();
  await input.commitWatermark();
}
