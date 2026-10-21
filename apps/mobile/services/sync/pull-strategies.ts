import type { Database } from "@nozbe/watermelondb";
import {
  INVALID_LEGACY_ID_PULL_ROW,
  remapVerifiedLegacyMetalPullIds,
  type PulledRow,
} from "./metal-dedicated-identity-pull";
import type {
  SyncPullResult,
  SyncTableChangeSet,
} from "@nozbe/watermelondb/sync";

import { logger } from "@/utils/logger";
import { parseCanonicalDecimal } from "@monyvi/logic";

import {
  getCurrentUserId,
  getSupabaseClientOrigin,
  supabase,
} from "../supabase";
import { SYNCABLE_TABLES } from "./config";
import { createSnapshotRetentionCutoffIso } from "./historical-recovery";
import {
  EXACT_TEXT_PULL_ERROR_CODE,
  normalizeDedicatedPullRecord,
  normalizePulledExactText,
  shapeFinancialPullRecords,
} from "./financial-pull-shaping";
import { createSyncTableError } from "./errors";
import {
  PULL_PAGE_SIZE,
  pullAllKeysetPages,
  pullCursorFilter,
  readPullCursor,
} from "./pull-pagination";
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
  INVALID_EXACT_TEXT: EXACT_TEXT_PULL_ERROR_CODE,
  INVALID_METAL_OBSERVATION_PAGE: "sync_invalid_metal_observation_page",
  INVALID_PULL_ROW: INVALID_LEGACY_ID_PULL_ROW,
} as const;

const METAL_OBSERVATION_PAGE_SIZE = 500;
const METAL_OBSERVATION_RPC = "pull_metal_observations_page_v1";
const UUID_MAX = "ffffffff-ffff-ffff-ffff-ffffffffffff";

export interface MetalObservationCursor {
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

const METAL_DEDICATED_PULL_TABLES = [
  "account_financial_effects",
  "financial_action_groups",
  "metal_action_evidence",
  "metal_lifecycle_events",
  "metal_rate_references",
  "metal_holding_states",
] as const;
type MetalDedicatedPullTable = (typeof METAL_DEDICATED_PULL_TABLES)[number];

export function protectMetalMetadataPullFragments(
  assetChanges: SyncTableChangeSet,
  holdingStateChanges: SyncTableChangeSet
): SyncTableChangeSet {
  const holdingCreates =
    holdingStateChanges.created as unknown as ReadonlyArray<
      Record<string, unknown>
    >;
  const holdingUpdates =
    holdingStateChanges.updated as unknown as ReadonlyArray<
      Record<string, unknown>
    >;
  const clockCoupledHoldingIds = new Set(
    [...holdingCreates, ...holdingUpdates]
      .map((record) =>
        typeof record.holding_id === "string" ? record.holding_id : record.id
      )
      .filter((id): id is string => typeof id === "string")
  );
  const protectRecord = (
    record: Record<string, unknown>
  ): Record<string, unknown> => {
    if (
      record.type !== "METAL" ||
      clockCoupledHoldingIds.has(String(record.id))
    ) {
      return { ...record };
    }
    const protectedRecord = { ...record };
    delete protectedRecord.name;
    delete protectedRecord.notes;
    return protectedRecord;
  };

  const assetCreates = assetChanges.created as unknown as ReadonlyArray<
    Record<string, unknown>
  >;
  const assetUpdates = assetChanges.updated as unknown as ReadonlyArray<
    Record<string, unknown>
  >;
  return {
    created: assetCreates.map(protectRecord),
    updated: assetUpdates.map(protectRecord),
    deleted: (assetChanges.deleted as unknown as readonly string[]).slice(),
  };
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
  accounts: "*,financial_revision_text:financial_revision::text",
  account_financial_effects:
    "*,accepted_account_revision_text:accepted_account_revision::text,amount_minor_units_text:amount_minor_units::text",
  assets: "*,purchase_price_decimal_text:purchase_price_decimal::text",
  asset_metals:
    "*,weight_grams_decimal_text:weight_grams_decimal::text,purity_factor_decimal_text:purity_factor_decimal::text",
  financial_action_groups:
    "*,account_guards_json_text:account_guards_json::text,outcome_json_text:outcome_json::text,payload_json_text:payload_json::text",
  metal_action_evidence:
    "*,canonical_holding_revision_text:canonical_holding_revision::text,domain_payload_json_text:domain_payload_json::text,expected_holding_revision_text:expected_holding_revision::text",
  metal_holding_states: "*,financial_revision_text:financial_revision::text",
  metal_lifecycle_events: "*,payload_json_text:payload_json::text",
  metal_rate_references: "*,value_decimal_text:value_decimal::text",
  recurring_payments: "*,financial_revision_text:financial_revision::text",
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

function pullSelect(
  table:
    | GenericUserOwnedPullTableName
    | ChildTableName
    | MetalDedicatedPullTable
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
  start: string | MetalObservationCursor | null
): Promise<MetalObservationPullResult> {
  const rows: MetalObservationRpcRow[] = [];
  let upperWatermark: string | null = null;
  let cursor: MetalObservationCursor | null =
    typeof start === "string" ? { createdAt: start, id: UUID_MAX } : start;
  const seenCursors = new Set<string>();
  let shouldPullNextPage = true;

  while (shouldPullNextPage) {
    const { data, error } = await supabase.rpc(METAL_OBSERVATION_RPC, {
      // pull_metal_observations_page_v1 declares p_upper_watermark,
      // p_after_created_at, and p_after_id as DEFAULT NULL, so omitting a
      // cursor arg is equivalent to sending NULL. The SQL rejects a cursor
      // where only one of p_after_created_at/p_after_id is present, so they are
      // always omitted or sent together.
      ...(cursor === null
        ? {}
        : { p_after_created_at: cursor.createdAt, p_after_id: cursor.id }),
      p_limit: METAL_OBSERVATION_PAGE_SIZE,
      ...(upperWatermark === null ? {} : { p_upper_watermark: upperWatermark }),
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
  upperWatermark: string,
  retentionCutoffIso = createSnapshotRetentionCutoffIso()
): Promise<SyncTableChangeSet> {
  try {
    const data = await pullAllKeysetPages(
      async (cursor) => {
        let query = supabase
          .from(table)
          .select("*", { count: "exact" })
          .eq("user_id", userId)
          .gt("created_at", retentionCutoffIso)
          .lte("created_at", upperWatermark)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(PULL_PAGE_SIZE);
        if (lastSyncDate) query = query.gt("created_at", lastSyncDate);
        if (cursor) query = query.or(pullCursorFilter("created_at", cursor));
        const { data: rows, error, count } = await query;
        if (error) throw createSyncTableError("pull", table, error);
        return { rows: rows ?? [], count };
      },
      (row) => readPullCursor(row, "created_at")
    );

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
  const records = await pullAllKeysetPages(
    async (cursor) => {
      let query = supabase
        .from(table)
        .select(pullSelect(table), { count: "exact" })
        .eq("user_id", userId)
        .lte("updated_at", upperWatermark)
        .order("updated_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(PULL_PAGE_SIZE);
      if (lastSyncDate) query = query.gt("updated_at", lastSyncDate);
      if (cursor) query = query.or(pullCursorFilter("updated_at", cursor));
      const { data, error, count } = await query;
      if (error) throw createSyncTableError("pull", table, error);
      return { rows: requirePulledRows(data ?? []), count };
    },
    (row) => readPullCursor(row, "updated_at")
  );
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
  const records = await pullAllKeysetPages(
    async (cursor) => {
      const select = `${pullSelect(table)},sync_owner:${childConfig.parentTable}!inner(user_id)`;
      let query = supabase
        .from(table)
        .select(select, { count: "exact" })
        .eq("sync_owner.user_id", userId)
        .lte("updated_at", upperWatermark)
        .order("updated_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(PULL_PAGE_SIZE);
      if (lastSyncDate) query = query.gt("updated_at", lastSyncDate);
      if (cursor) query = query.or(pullCursorFilter("updated_at", cursor));
      const { data, error, count } = await query;
      if (error) throw createSyncTableError("pull", table, error);
      const rows = requirePulledRows(data ?? []).map((record) => {
        const { sync_owner: owner, ...row } = record;
        if (
          typeof owner !== "object" ||
          owner === null ||
          !("user_id" in owner) ||
          owner.user_id !== userId
        ) {
          throw new Error(SYNC_PULL_ERROR_CODES.INVALID_PULL_ROW);
        }
        return row;
      });
      return { rows, count };
    },
    (row) => readPullCursor(row, "updated_at")
  );
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

/**
 * Catalogue snapshot captured together with the categories pull.
 *
 * It is produced from the same network read as the pull (no extra request) and
 * is handed to the catalogue service, which commits it only after the SDK
 * applied the rows and the ids were verified locally.
 */
export interface PulledCategoryCatalogueSnapshot {
  readonly origin: string | null;
  readonly ownerId: string;
  readonly capturedAt: number;
  readonly complete: boolean;
  readonly systemIds: readonly string[];
  readonly customOwnerIds: readonly string[];
}

export type PulledCategoryChangeSet = SyncTableChangeSet & {
  readonly catalogueAttempt?: PulledCategoryCatalogueSnapshot;
};

export function readCatalogueScope(
  rows: ReadonlyArray<Record<string, unknown>>,
  ownerId: string
): { readonly systemIds: string[]; readonly customOwnerIds: string[] } {
  const systemIds: string[] = [];
  const customOwnerIds: string[] = [];
  for (const row of rows) {
    // Tombstoned rows are not part of the active catalogue.
    if (row["deleted"] === true) continue;
    const id = row["id"];
    if (typeof id !== "string") continue;
    const userId = row["user_id"];
    const isSystem = row["is_system"];
    const ownerScoped = userId !== null && userId !== undefined;
    if (ownerScoped) {
      if (userId === ownerId) customOwnerIds.push(id);
      continue;
    }
    if (isSystem === true) systemIds.push(id);
  }
  return { systemIds, customOwnerIds };
}

/**
 * Resolves the runtime backend origin defensively.
 *
 * When the origin cannot be resolved the catalogue attempt stays incomplete
 * and no manifest is committed; the pull itself is never affected.
 */
function readCatalogueOriginSafely(): string | null {
  try {
    return getSupabaseClientOrigin();
  } catch {
    return null;
  }
}

/**
 * A catalogue snapshot is complete only for a full window pull.
 *
 * An incremental (cursor) pull describes a change set, never the whole
 * catalogue, so it may never authorize a selection manifest.
 */
export function resolveCatalogueCompleteness(
  lastSyncDate: string | null
): boolean {
  return lastSyncDate === null;
}

export async function pullCategories(
  userId: string,
  lastSyncDate: string | null,
  upperWatermark: string
): Promise<PulledCategoryChangeSet> {
  const data = await pullAllKeysetPages(
    async (cursor) => {
      let query = supabase
        .from("categories")
        .select("*", { count: "exact" })
        .or(`user_id.eq.${userId},user_id.is.null`)
        .lte("updated_at", upperWatermark)
        .order("updated_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(PULL_PAGE_SIZE);
      if (lastSyncDate) query = query.gt("updated_at", lastSyncDate);
      if (cursor) query = query.or(pullCursorFilter("updated_at", cursor));
      const { data: rows, error, count } = await query;
      if (error) throw createSyncTableError("pull", "categories", error);
      return { rows: rows ?? [], count };
    },
    (row) => readPullCursor(row, "updated_at")
  );

  const deleted = data
    .filter((record) => record.deleted === true)
    .map((record) => record.id);

  const activeRecords = data
    .filter((record) => record.deleted !== true)
    .map((record) => transformFromSupabase("categories", record));

  // The catalogue snapshot reuses this very network read: no second request.
  // Only a complete full window may claim completeness; an incremental
  // (cursor) pull never describes the whole catalogue.
  const scope = readCatalogueScope(data, userId);
  const catalogueAttempt: PulledCategoryCatalogueSnapshot = {
    origin: readCatalogueOriginSafely(),
    ownerId: userId,
    capturedAt: Date.now(),
    complete: resolveCatalogueCompleteness(lastSyncDate),
    systemIds: scope.systemIds,
    customOwnerIds: scope.customOwnerIds,
  };

  return {
    created: [],
    updated: activeRecords,
    deleted,
    catalogueAttempt,
  };
}

export async function pullMetalDedicatedTable(
  table: MetalDedicatedPullTable,
  userId: string,
  lastSyncDate: string | null,
  upperWatermark: string,
  database?: Database
): Promise<SyncTableChangeSet> {
  const records = await pullAllKeysetPages(
    async (cursor) => {
      let query = supabase
        .from(table)
        .select(pullSelect(table), { count: "exact" })
        .eq("user_id", userId)
        .lte("updated_at", upperWatermark)
        .order("updated_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(PULL_PAGE_SIZE);
      if (lastSyncDate) query = query.gt("updated_at", lastSyncDate);
      if (cursor) query = query.or(pullCursorFilter("updated_at", cursor));
      const { data, error, count } = await query;
      if (error) throw createSyncTableError("pull", table, error);
      return { rows: requirePulledRows(data ?? []), count };
    },
    (row) => readPullCursor(row, "updated_at")
  );

  // Financial roots are *decoded* here, but their local physical IDs,
  // private evidence, terminal state and delete authority belong to the
  // ACTUAL synchronize() application writer. Do not consult local roots or
  // remap IDs in this network callback; the database-bound SDK writer hook
  // calls prepareOwnedFinancialActionRootPull against current local rows.
  //
  // Keep deleted root records as full incoming candidates (not string-only
  // deleted IDs), so that hook can verify action/owner/hash identity and
  // remap a legacy physical ID before deciding whether to delete. A
  // partial or malformed root tombstone fails closed in the writer instead
  // of silently dropping a protected root and advancing the checkpoint.
  if (table === "financial_action_groups") {
    if (!database && records.length > 0) {
      throw new Error("financial_action_root_pull_database_required");
    }
    // PR385 suppresses unresolved roots by default. Existing internal opt-in
    // admits a bounded AccountAdd candidate or a claimed accepted registered
    // Review candidate to the actual SDK writer. Only that writer validates
    // SQL091/SQL090 receipts, immutable ownership and private physical evidence
    // before applying/ACKing; nonterminal Review roots remain withheld.
    const admissible = await shapeFinancialPullRecords(
      table,
      records,
      userId,
      database,
      { admitAcceptedAddToProtectedWriter: true }
    );
    return {
      created: [],
      updated: admissible.map((record) =>
        transformFromSupabase(
          table,
          normalizeDedicatedPullRecord(table, record)
        )
      ),
      deleted: [],
    };
  }

  // Preserve current Main's exact-value casts and legacy Metal identity
  // reconciliation. These Metal event/evidence remaps are independent of
  // the owned financial-root/private-state authorization performed above.
  // Other dedicated tombstones need only verified row identity; PostgREST
  // may omit their exact-text aliases. Live rows validate every alias.
  const protectedRecords = await shapeFinancialPullRecords(
    table,
    records,
    userId,
    database
  );
  const normalizedRecords = protectedRecords.map((record) =>
    record.deleted === true
      ? record
      : (normalizeDedicatedPullRecord(table, record) as PulledRow)
  );
  const remappedRecords =
    table === "metal_action_evidence" || table === "metal_lifecycle_events"
      ? await remapVerifiedLegacyMetalPullIds(
          table,
          normalizedRecords,
          userId,
          database
        )
      : normalizedRecords;
  const deleted = remappedRecords
    .filter((record) => record.deleted === true)
    .map((record) => record.id);
  const updated = remappedRecords
    .filter((record) => record.deleted !== true)
    .map((record) => transformFromSupabase(table, record));
  return { created: [], updated, deleted };
}

export async function pullMetalHoldingStates(
  userId: string,
  lastSyncDate: string | null,
  upperWatermark: string
): Promise<SyncTableChangeSet> {
  return pullMetalDedicatedTable(
    "metal_holding_states",
    userId,
    lastSyncDate,
    upperWatermark
  );
}

export async function pullChanges(
  lastPulledAt: number | null,
  expectedUserId: string,
  database?: Database
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
  let holdingStateChanges: SyncTableChangeSet | null = null;
  for (const table of METAL_DEDICATED_PULL_TABLES) {
    const dedicatedChanges = await pullMetalDedicatedTable(
      table,
      expectedUserId,
      lastSyncDate,
      upperWatermark,
      database
    );
    changes[table] = dedicatedChanges;
    if (table === "metal_holding_states") {
      holdingStateChanges = dedicatedChanges;
    }
  }
  if (changes.assets && holdingStateChanges) {
    changes.assets = protectMetalMetadataPullFragments(
      changes.assets,
      holdingStateChanges
    );
  }

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
