/**
 * Dev-only category reconciliation diagnostics.
 *
 * Compares the local category rows with the **complete current server**
 * system-category snapshot, taken in-app at the category pull boundary with an
 * extra, diagnostic-only full-window pull that never replaces or mutates the
 * real change set, the sync checkpoint or the applied sync output.
 *
 * The canonical member of a duplicated logical category is proven by server
 * membership (row id **and** exact logical identity), never by age or local
 * ordering.
 *
 * Contract:
 * - Dev builds only (`__DEV__` short-circuit before any database, auth or
 *   network work).
 * - Read-only: no WatermelonDB writes, no local-data writes, no server
 *   mutation, no push, no sync checkpoint change.
 * - Emits exactly one structured event as a single JSON string, counts only.
 *   No id, system name, display label, user id, amount or payload is logged.
 * - Failures and timeouts are suppressed: a failed diagnosis never fails or
 *   blocks the ordinary sync and stays retryable.
 *
 * @module dev-category-reconciliation-diagnostics
 */

import type {
  Budget,
  Category,
  RecurringPayment,
  SupabaseDatabase,
  Transaction,
  UserCategorySettings,
} from "@monyvi/db";
import { Q, type Database } from "@nozbe/watermelondb";
import { logger } from "@/utils/logger";
import { getCurrentUserId } from "../supabase";
import { queryAccessibleCategories, queryOwned } from "../user-data-access";
import { pullCategories } from "./pull-strategies";

// ---------------------------------------------------------------------------
// Authoritative types
// ---------------------------------------------------------------------------

type SupabaseCategoriesRow =
  SupabaseDatabase["public"]["Tables"]["categories"]["Row"];

/** Canonical server row fields (generated Supabase row). */
export type ServerCategorySnapshot = Pick<
  SupabaseCategoriesRow,
  | "id"
  | "system_name"
  | "level"
  | "type"
  | "parent_id"
  | "is_system"
  | "user_id"
>;

/** Canonical local row fields (WatermelonDB model). */
export type LocalCategorySnapshot = Pick<
  Category,
  | "id"
  | "systemName"
  | "level"
  | "type"
  | "parentId"
  | "isSystem"
  | "userId"
  | "syncStatus"
>;

/** Category type shared by the local model and the generated server row. */
export type CategoryTypeValue =
  | NonNullable<Category["type"]>
  | NonNullable<SupabaseCategoriesRow["type"]>;

/** Normalized identity used to compare local and server rows. */
export interface CategoryReconciliationIdentity {
  readonly id: string;
  readonly systemName: string;
  readonly level: number;
  readonly type: CategoryTypeValue | null;
  readonly parentId: string | null;
  readonly isSystem: boolean;
  readonly userId: string | null;
}

/** Fields that define the logical identity of a category. */
export interface CategoryLogicalKeyFields {
  readonly systemName: string;
  readonly type: CategoryTypeValue | null;
  readonly level: number;
  readonly parentId: string | null;
}

// ---------------------------------------------------------------------------
// Analysis (pure)
// ---------------------------------------------------------------------------

export interface CategoryReferenceCounts {
  readonly transactions: number;
  readonly budgets: number;
  readonly recurringPayments: number;
  readonly userCategorySettings: number;
  readonly childCategories: number;
}

export interface CategoryReconciliationAnalysis {
  readonly localActiveRowCount: number;
  readonly localSystemScopeL1RowCount: number;
  readonly localSystemScopeL2RowCount: number;
  readonly localUserScopedRowCount: number;
  readonly localUnclassifiedScopeRowCount: number;
  readonly duplicateGroupCount: number;
  readonly duplicateCandidateRowCount: number;
  readonly groupsWithServerCanonicalIdentified: number;
  readonly groupsWithExactlyOneServerMatch: number;
  readonly groupsWithNoServerMatch: number;
  readonly groupsWithMultipleServerMatches: number;
  readonly logicalKeyMismatchGroupCount: number;
  readonly idCollisionGroupCount: number;
  readonly missingFromServerCandidateCount: number;
  readonly singletonsMissingServerCount: number;
  /** Dirty/pending rows among **all** level 2 system-scope candidates. */
  readonly dirtyPendingCandidateCount: number;
  readonly missingFromServerCandidateIds: readonly string[];
}

export interface CategoryReconciliationDiagnosticsEvent {
  readonly event: "categories.reconciliationDiagnostics";
  readonly phase: "pre_apply";
  readonly snapshotScope: "full";
  readonly snapshotComplete: boolean;
  readonly canonicalProofAvailable: boolean;
  readonly snapshotRowCount: number;
  readonly malformedSnapshotRowCount: number;
  readonly localActiveRowCount: number;
  readonly localSystemScopeL1RowCount: number;
  readonly localSystemScopeL2RowCount: number;
  readonly localUserScopedRowCount: number;
  readonly localUnclassifiedScopeRowCount: number;
  readonly duplicateGroupCount: number;
  readonly duplicateCandidateRowCount: number;
  readonly groupsWithServerCanonicalIdentified: number;
  readonly groupsWithExactlyOneServerMatch: number;
  readonly groupsWithNoServerMatch: number;
  readonly groupsWithMultipleServerMatches: number;
  readonly logicalKeyMismatchGroupCount: number;
  readonly idCollisionGroupCount: number;
  readonly missingFromServerCandidateCount: number;
  readonly singletonsMissingServerCount: number;
  readonly dirtyPendingCandidateCount: number;
  readonly transactionReferenceCount: number;
  readonly budgetReferenceCount: number;
  readonly recurringPaymentReferenceCount: number;
  readonly userCategorySettingsReferenceCount: number;
  readonly childCategoryReferenceCount: number;
  readonly serializedReferencesUnassessed: true;
  readonly referenceScanScope: "watermelon_tables_only";
}

const EMPTY_REFERENCE_COUNTS: CategoryReferenceCounts = {
  transactions: 0,
  budgets: 0,
  recurringPayments: 0,
  userCategorySettings: 0,
  childCategories: 0,
};

/** System scope: the row is flagged system AND carries no owner. */
function isSystemScope(identity: CategoryReconciliationIdentity): boolean {
  return identity.isSystem && identity.userId === null;
}

/** Logical identity of a category, including its parent identity. */
function logicalKeyOf(row: CategoryLogicalKeyFields): string {
  return [
    row.systemName,
    row.type ?? "",
    String(row.level),
    row.parentId ?? "",
  ].join("\u0000");
}

function groupByLogicalKey<T extends CategoryLogicalKeyFields>(
  rows: readonly T[]
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = logicalKeyOf(row);
    const bucket = groups.get(key) ?? [];
    bucket.push(row);
    groups.set(key, bucket);
  }
  return groups;
}

function localIdentity(
  row: LocalCategorySnapshot
): CategoryReconciliationIdentity {
  return {
    id: row.id,
    systemName: row.systemName,
    level: row.level,
    type: row.type ?? null,
    parentId: row.parentId ?? null,
    isSystem: row.isSystem === true,
    userId: row.userId ?? null,
  };
}

function serverIdentity(
  row: ServerCategorySnapshot
): CategoryReconciliationIdentity {
  return {
    id: row.id,
    systemName: row.system_name,
    level: row.level,
    type: row.type ?? null,
    parentId: row.parent_id ?? null,
    isSystem: row.is_system === true,
    userId: row.user_id ?? null,
  };
}

/**
 * Compares local category rows with the complete server snapshot.
 *
 * Only level 2 system-scope rows (no owner) are candidates; level 1 rows and
 * owner-scoped custom rows are preserved and never treated as duplicates. The
 * canonical member of a duplicated group is the row that the server currently
 * lists under the same id **and** the same logical identity.
 */
export function analyzeCategoryReconciliation(input: {
  readonly localRows: readonly LocalCategorySnapshot[];
  readonly serverRows: readonly ServerCategorySnapshot[];
  readonly serverSnapshotComplete: boolean;
}): CategoryReconciliationAnalysis {
  const localIdentities = input.localRows.map(localIdentity);
  const serverIdentities = input.serverRows.map(serverIdentity);

  const serverSystemRows = serverIdentities.filter((row) => isSystemScope(row));
  const serverById = new Map<string, CategoryReconciliationIdentity>(
    serverSystemRows.map((row) => [row.id, row])
  );
  const serverGroups = groupByLogicalKey(serverSystemRows);

  const localSystemRows = localIdentities.filter((row) => isSystemScope(row));
  const localL1Rows = localSystemRows.filter((row) => row.level === 1);
  const candidateRows = localSystemRows.filter((row) => row.level === 2);
  const localUserScopedRows = localIdentities.filter(
    (row) => row.userId !== null
  );
  const localUnclassifiedRows = localIdentities.filter(
    (row) => row.userId === null && !row.isSystem
  );

  let duplicateGroupCount = 0;
  let duplicateCandidateRowCount = 0;
  let groupsWithServerCanonicalIdentified = 0;
  let groupsWithExactlyOneServerMatch = 0;
  let groupsWithNoServerMatch = 0;
  let groupsWithMultipleServerMatches = 0;
  let logicalKeyMismatchGroupCount = 0;
  let idCollisionGroupCount = 0;
  let missingFromServerCandidateCount = 0;
  let singletonsMissingServerCount = 0;
  let dirtyPendingCandidateCount = 0;
  const missingFromServerCandidateIds: string[] = [];

  const candidatesByKey = groupByLogicalKey(candidateRows);
  for (const [logicalKey, group] of candidatesByKey.entries()) {
    if (group.length === 1) {
      const only = group[0];
      if (only) {
        const serverRow = serverById.get(only.id);
        if (!serverRow || logicalKeyOf(serverRow) !== logicalKey) {
          singletonsMissingServerCount += 1;
        }
      }
      continue;
    }

    duplicateGroupCount += 1;
    duplicateCandidateRowCount += group.length;

    const serverGroup = serverGroups.get(logicalKey);
    const presentLocally = group.filter((row) => {
      const serverRow = serverById.get(row.id);
      return serverRow !== undefined && logicalKeyOf(serverRow) === logicalKey;
    });
    const idCollisions = group.filter((row) => {
      const serverRow = serverById.get(row.id);
      return serverRow !== undefined && logicalKeyOf(serverRow) !== logicalKey;
    });
    if (idCollisions.length > 0) idCollisionGroupCount += 1;

    if (input.serverSnapshotComplete) {
      if (serverGroup === undefined) {
        groupsWithNoServerMatch += 1;
      } else if (serverGroup.length > 1) {
        // The server itself is ambiguous for this logical key: no canonical.
        groupsWithMultipleServerMatches += 1;
      } else if (presentLocally.length === 1) {
        groupsWithExactlyOneServerMatch += 1;
        groupsWithServerCanonicalIdentified += 1;
      } else if (presentLocally.length > 1) {
        groupsWithMultipleServerMatches += 1;
      } else {
        groupsWithNoServerMatch += 1;
        logicalKeyMismatchGroupCount += 1;
      }
    }

    for (const row of group) {
      const serverRow = serverById.get(row.id);
      const proven =
        serverRow !== undefined && logicalKeyOf(serverRow) === logicalKey;
      if (!proven) {
        missingFromServerCandidateCount += 1;
        missingFromServerCandidateIds.push(row.id);
      }
    }
  }

  for (const row of candidateRows) {
    const local = input.localRows.find((entry) => entry.id === row.id);
    if (local && local.syncStatus !== "synced") dirtyPendingCandidateCount += 1;
  }

  return {
    localActiveRowCount: localIdentities.length,
    localSystemScopeL1RowCount: localL1Rows.length,
    localSystemScopeL2RowCount: candidateRows.length,
    localUserScopedRowCount: localUserScopedRows.length,
    localUnclassifiedScopeRowCount: localUnclassifiedRows.length,
    duplicateGroupCount,
    duplicateCandidateRowCount,
    groupsWithServerCanonicalIdentified,
    groupsWithExactlyOneServerMatch,
    groupsWithNoServerMatch,
    groupsWithMultipleServerMatches,
    logicalKeyMismatchGroupCount,
    idCollisionGroupCount,
    missingFromServerCandidateCount,
    singletonsMissingServerCount,
    dirtyPendingCandidateCount,
    missingFromServerCandidateIds,
  };
}

// ---------------------------------------------------------------------------
// Runtime seams (injectable for focused tests)
// ---------------------------------------------------------------------------

export interface ServerCategorySnapshotResult {
  readonly rows: readonly ServerCategorySnapshot[];
  readonly malformedRowCount: number;
  /** True only for a successful full-window pull without malformed rows. */
  readonly complete: boolean;
}

export interface CategoryReconciliationDiagnosticsDeps {
  readonly isDev: boolean;
  readonly loadLocalCategories: () => Promise<readonly LocalCategorySnapshot[]>;
  readonly loadServerSnapshot: () => Promise<ServerCategorySnapshotResult>;
  readonly countReferences: (
    candidateIds: readonly string[]
  ) => Promise<CategoryReferenceCounts>;
  readonly getOwnerId: () => Promise<string | null>;
  readonly emit: (event: string) => void;
}

export interface CategoryReconciliationDiagnosticsOptions {
  readonly userId: string;
}

const completedFingerprints = new Set<string>();
const pendingFingerprints = new Set<string>();

/**
 * Stable, internal fingerprint of the local candidate snapshot.
 *
 * A deterministic canonical string over the owner plus the sorted candidate
 * rows (id, logical identity and sync status), so an unchanged local snapshot
 * is read once and a status change produces a fresh key. It never leaves the
 * module and is never logged.
 */
function fingerprintOf(
  userId: string,
  candidates: readonly LocalCategorySnapshot[]
): string {
  const entries = candidates
    .map((row) =>
      JSON.stringify({
        id: row.id,
        systemName: row.systemName,
        type: row.type ?? null,
        level: row.level,
        parentId: row.parentId ?? null,
        isSystem: row.isSystem === true,
        userId: row.userId ?? null,
        syncStatus: row.syncStatus,
      })
    )
    .sort();
  return JSON.stringify([userId, entries]);
}

/**
 * Runs one reconciliation diagnosis and emits a single counts-only event.
 *
 * Never throws; a failure stays retryable because no completion marker is
 * recorded.
 */
export async function runCategoryReconciliationDiagnostics(
  deps: CategoryReconciliationDiagnosticsDeps,
  options: CategoryReconciliationDiagnosticsOptions
): Promise<void> {
  if (!deps.isDev) return;

  let fingerprint: string | null = null;
  try {
    const ownerBefore = await deps.getOwnerId();
    if (ownerBefore === null || ownerBefore !== options.userId) return;

    const localRows = await deps.loadLocalCategories();
    const candidateRows = localRows.filter(
      (row) =>
        row.isSystem === true &&
        (row.userId ?? null) === null &&
        row.level === 2
    );
    const candidateGroups = groupByLogicalKey(
      candidateRows.map((row) => ({
        systemName: row.systemName,
        type: row.type ?? null,
        level: row.level,
        parentId: row.parentId ?? null,
      }))
    );
    let hasDuplicates = false;
    for (const group of candidateGroups.values()) {
      if (group.length > 1) {
        hasDuplicates = true;
        break;
      }
    }
    if (!hasDuplicates) return;

    fingerprint = fingerprintOf(options.userId, candidateRows);
    if (completedFingerprints.has(fingerprint)) return;
    if (pendingFingerprints.has(fingerprint)) return;
    pendingFingerprints.add(fingerprint);

    const server = await deps.loadServerSnapshot();
    const analysis = analyzeCategoryReconciliation({
      localRows,
      serverRows: server.rows,
      serverSnapshotComplete: server.complete,
    });
    const referenceCounts =
      analysis.missingFromServerCandidateIds.length > 0
        ? await deps.countReferences(analysis.missingFromServerCandidateIds)
        : EMPTY_REFERENCE_COUNTS;

    const ownerAfter = await deps.getOwnerId();
    if (ownerAfter === null || ownerAfter !== options.userId) return;

    const event: CategoryReconciliationDiagnosticsEvent = {
      event: "categories.reconciliationDiagnostics",
      phase: "pre_apply",
      snapshotScope: "full",
      snapshotComplete: server.complete,
      canonicalProofAvailable: server.complete,
      snapshotRowCount: server.rows.length,
      malformedSnapshotRowCount: server.malformedRowCount,
      localActiveRowCount: analysis.localActiveRowCount,
      localSystemScopeL1RowCount: analysis.localSystemScopeL1RowCount,
      localSystemScopeL2RowCount: analysis.localSystemScopeL2RowCount,
      localUserScopedRowCount: analysis.localUserScopedRowCount,
      localUnclassifiedScopeRowCount: analysis.localUnclassifiedScopeRowCount,
      duplicateGroupCount: analysis.duplicateGroupCount,
      duplicateCandidateRowCount: analysis.duplicateCandidateRowCount,
      groupsWithServerCanonicalIdentified:
        analysis.groupsWithServerCanonicalIdentified,
      groupsWithExactlyOneServerMatch: analysis.groupsWithExactlyOneServerMatch,
      groupsWithNoServerMatch: analysis.groupsWithNoServerMatch,
      groupsWithMultipleServerMatches: analysis.groupsWithMultipleServerMatches,
      logicalKeyMismatchGroupCount: analysis.logicalKeyMismatchGroupCount,
      idCollisionGroupCount: analysis.idCollisionGroupCount,
      missingFromServerCandidateCount: analysis.missingFromServerCandidateCount,
      singletonsMissingServerCount: analysis.singletonsMissingServerCount,
      dirtyPendingCandidateCount: analysis.dirtyPendingCandidateCount,
      transactionReferenceCount: referenceCounts.transactions,
      budgetReferenceCount: referenceCounts.budgets,
      recurringPaymentReferenceCount: referenceCounts.recurringPayments,
      userCategorySettingsReferenceCount: referenceCounts.userCategorySettings,
      childCategoryReferenceCount: referenceCounts.childCategories,
      serializedReferencesUnassessed: true,
      referenceScanScope: "watermelon_tables_only",
    };

    deps.emit(JSON.stringify(event));
    // Only complete, well formed evidence is promoted: an incomplete snapshot
    // stays retryable inside the same session.
    if (server.complete && server.malformedRowCount === 0) {
      completedFingerprints.add(fingerprint);
    }
  } catch {
    // Suppressed: a failed diagnosis never breaks the ordinary sync and stays
    // retryable because no completion marker is recorded.
  } finally {
    if (fingerprint !== null) pendingFingerprints.delete(fingerprint);
  }
}

// ---------------------------------------------------------------------------
// Production wiring
// ---------------------------------------------------------------------------

function hasKey(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function readStringOrNull(
  record: Record<string, unknown>,
  key: string
): string | null | undefined {
  if (!hasKey(record, key)) return undefined;
  const value = record[key];
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

function readCategoryType(
  record: Record<string, unknown>,
  key: string
): CategoryTypeValue | null | undefined {
  if (!hasKey(record, key)) return undefined;
  const value = record[key];
  if (value === null) return null;
  if (value === "EXPENSE" || value === "INCOME") return value;
  return undefined;
}

/**
 * Normalizes one pulled server row against the generated categories row.
 *
 * A missing or mistyped required field makes the row malformed; it is never
 * silently coerced.
 */
export function normalizeServerCategoryRow(
  record: Record<string, unknown>
): ServerCategorySnapshot | null {
  const id = readStringOrNull(record, "id");
  const systemName = readStringOrNull(record, "system_name");
  const parentId = readStringOrNull(record, "parent_id");
  const userId = readStringOrNull(record, "user_id");
  const type = readCategoryType(record, "type");
  if (
    id === undefined ||
    systemName === undefined ||
    parentId === undefined ||
    userId === undefined ||
    type === undefined
  ) {
    return null;
  }
  if (id === null || systemName === null) return null;
  const level = record["level"];
  if (typeof level !== "number" || !Number.isFinite(level)) return null;
  const isSystem = record["is_system"];
  if (typeof isSystem !== "boolean") return null;
  return {
    id,
    system_name: systemName,
    level,
    type,
    parent_id: parentId,
    is_system: isSystem,
    user_id: userId,
  };
}

async function loadLocalCategories(
  database: Database,
  userId: string
): Promise<readonly LocalCategorySnapshot[]> {
  const rows = await queryAccessibleCategories(
    database.get<Category>("categories"),
    userId,
    Q.where("deleted", false)
  ).fetch();
  return rows.map((row) => ({
    id: row.id,
    systemName: row.systemName,
    level: row.level,
    type: row.type,
    parentId: row.parentId,
    isSystem: row.isSystem === true,
    userId: row.userId,
    syncStatus: row.syncStatus,
  }));
}

async function loadServerSnapshot(
  userId: string,
  upperWatermark: string,
  timeoutMs: number
): Promise<ServerCategorySnapshotResult> {
  const pullPromise = pullCategories(userId, null, upperWatermark).then(
    (changeSet) => {
      const updated = changeSet.updated ?? [];
      const rows: ServerCategorySnapshot[] = [];
      let malformedRowCount = 0;
      for (const record of updated) {
        const normalized = normalizeServerCategoryRow(record);
        if (normalized === null) malformedRowCount += 1;
        else rows.push(normalized);
      }
      return {
        rows,
        malformedRowCount,
        complete: malformedRowCount === 0,
      } satisfies ServerCategorySnapshotResult;
    }
  );

  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    const result = await Promise.race([pullPromise, timeoutPromise]);
    if (result === null)
      throw new Error("category_reconciliation_snapshot_timeout");
    return result;
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

async function countReferences(
  database: Database,
  userId: string,
  candidateIds: readonly string[]
): Promise<CategoryReferenceCounts> {
  if (candidateIds.length === 0) return EMPTY_REFERENCE_COUNTS;
  const referenced = Q.where("category_id", Q.oneOf([...candidateIds]));
  const [transactions, budgets, recurringPayments, userCategorySettings] =
    await Promise.all([
      queryOwned(
        database.get<Transaction>("transactions"),
        userId,
        referenced
      ).fetchCount(),
      queryOwned(
        database.get<Budget>("budgets"),
        userId,
        referenced
      ).fetchCount(),
      queryOwned(
        database.get<RecurringPayment>("recurring_payments"),
        userId,
        referenced
      ).fetchCount(),
      queryOwned(
        database.get<UserCategorySettings>("user_category_settings"),
        userId,
        referenced
      ).fetchCount(),
    ]);
  const childCategories = await queryAccessibleCategories(
    database.get<Category>("categories"),
    userId,
    Q.where("parent_id", Q.oneOf([...candidateIds]))
  ).fetchCount();
  return {
    transactions,
    budgets,
    recurringPayments,
    userCategorySettings,
    childCategories,
  };
}

const SNAPSHOT_TIMEOUT_MS = 15000;

/**
 * Dev entry point used by the category pull boundary.
 *
 * Emits the reconciliation diagnostics for the current owner without touching
 * the real change set, the sync checkpoint or the applied sync output.
 */
export async function emitCategoryReconciliationDiagnostics(options: {
  readonly database: Database | undefined;
  readonly userId: string;
  readonly upperWatermark: string;
}): Promise<void> {
  if (!__DEV__) return;
  const database = options.database;
  if (database === undefined) return;

  const deps: CategoryReconciliationDiagnosticsDeps = {
    isDev: true,
    loadLocalCategories: () => loadLocalCategories(database, options.userId),
    loadServerSnapshot: () =>
      loadServerSnapshot(
        options.userId,
        options.upperWatermark,
        SNAPSHOT_TIMEOUT_MS
      ),
    countReferences: (candidateIds) =>
      countReferences(database, options.userId, candidateIds),
    getOwnerId: () => getCurrentUserId(),
    emit: (event) => logger.debug(event),
  };

  await runCategoryReconciliationDiagnostics(deps, {
    userId: options.userId,
  });
}
