/**
 * __DEV__-only aggregate diagnostics for the shared category snapshot.
 *
 * Purpose: settle whether the shared "Select Category" picker shows a category
 * twice because the observed snapshot contains the same row twice (observer /
 * array level) or because two distinct persisted rows represent the same
 * logical category (data level).
 *
 * Privacy contract: the emitted payload contains COUNTS ONLY. No category id,
 * system name, display label, user id, parent id or any other raw row value is
 * ever logged. Production builds never compute or emit these aggregates.
 *
 * @module dev-category-aggregate-diagnostics
 */

import type { Category } from "@monyvi/db";
import { logger } from "@/utils/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Minimal canonical projection of a category row required by the counter.
 *
 * Derived from the authoritative `Category` model so no canonical union is
 * redefined here. The counter never reads presentation fields.
 */
export type CategoryDiagnosticRow = Pick<
  Category,
  "id" | "level" | "type" | "systemName" | "parentId" | "userId"
>;

/** Per-level aggregate counts (no raw values). */
export interface CategoryLevelAggregate {
  readonly level: number;
  readonly rows: number;
  readonly distinctIds: number;
  readonly duplicateIdKeys: number;
  readonly distinctLogicalSystemKeys: number;
  readonly duplicateLogicalSystemKeys: number;
  readonly systemScopeRows: number;
  readonly userScopedRows: number;
}

/** Row-id length bucket (counts only, never the id itself). */
export interface CategoryIdLengthBucket {
  readonly length: number;
  readonly count: number;
}

/** Aggregate snapshot counts (no raw values). */
export interface CategorySnapshotDiagnostics {
  readonly totalRows: number;
  readonly distinctIds: number;
  readonly duplicateIdKeys: number;
  readonly levels: readonly CategoryLevelAggregate[];
  readonly otherLevelRows: number;
  readonly systemScopeRows: number;
  readonly userScopedRows: number;
  readonly idLengthHistogram: readonly CategoryIdLengthBucket[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countDuplicatedKeys(counts: ReadonlyMap<string, number>): number {
  let duplicated = 0;
  for (const count of counts.values()) {
    if (count > 1) duplicated += 1;
  }
  return duplicated;
}

function sumCounts(counts: ReadonlyMap<string, number>): number {
  let total = 0;
  for (const count of counts.values()) total += count;
  return total;
}

function isUserScoped(row: CategoryDiagnosticRow): boolean {
  const userId: unknown = row.userId;
  return userId !== undefined && userId !== null;
}

/**
 * Canonical logical key of a category row.
 *
 * Internal only: the key is used for counting and is never emitted, logged or
 * returned. Scope is part of the key so a shared system category and a
 * user-scoped category that share a system name are not treated as a duplicate.
 */
function logicalSystemKeyOf(row: CategoryDiagnosticRow): string {
  return [
    isUserScoped(row) ? "user" : "system",
    row.systemName ?? "",
    row.type ?? "",
    String(row.level),
    row.parentId ?? "",
  ].join("\u0000");
}

function emptyLevelAggregate(level: number): CategoryLevelAggregate {
  return {
    level,
    rows: 0,
    distinctIds: 0,
    duplicateIdKeys: 0,
    distinctLogicalSystemKeys: 0,
    duplicateLogicalSystemKeys: 0,
    systemScopeRows: 0,
    userScopedRows: 0,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds count-only aggregates for a category snapshot.
 *
 * @param rows - Authoritative category rows (any order).
 * @returns Counts describing id uniqueness and logical-key uniqueness.
 */
export function buildCategorySnapshotDiagnostics(
  rows: readonly CategoryDiagnosticRow[]
): CategorySnapshotDiagnostics {
  const idCounts = new Map<string, number>();
  const idLengthCounts = new Map<number, number>();
  const levelIdCounts = new Map<number, Map<string, number>>();
  const levelLogicalCounts = new Map<number, Map<string, number>>();
  const levelScopeCounts = new Map<number, { system: number; user: number }>();
  let systemScopeRows = 0;
  let userScopedRows = 0;
  let otherLevelRows = 0;

  for (const row of rows) {
    idCounts.set(row.id, (idCounts.get(row.id) ?? 0) + 1);
    idLengthCounts.set(
      row.id.length,
      (idLengthCounts.get(row.id.length) ?? 0) + 1
    );

    if (isUserScoped(row)) userScopedRows += 1;
    else systemScopeRows += 1;

    if (row.level !== 1 && row.level !== 2) {
      otherLevelRows += 1;
      continue;
    }

    const level = row.level;
    const levelIds = levelIdCounts.get(level) ?? new Map<string, number>();
    levelIds.set(row.id, (levelIds.get(row.id) ?? 0) + 1);
    levelIdCounts.set(level, levelIds);

    const logicalKey = logicalSystemKeyOf(row);
    const levelLogical =
      levelLogicalCounts.get(level) ?? new Map<string, number>();
    levelLogical.set(logicalKey, (levelLogical.get(logicalKey) ?? 0) + 1);
    levelLogicalCounts.set(level, levelLogical);

    const scopeCounts = levelScopeCounts.get(level) ?? { system: 0, user: 0 };
    if (isUserScoped(row)) scopeCounts.user += 1;
    else scopeCounts.system += 1;
    levelScopeCounts.set(level, scopeCounts);
  }

  const levels: CategoryLevelAggregate[] = [1, 2].map((level) => {
    const levelIds = levelIdCounts.get(level);
    const levelLogical = levelLogicalCounts.get(level);
    const scopeCounts = levelScopeCounts.get(level);
    if (!levelIds || !levelLogical || !scopeCounts) {
      return emptyLevelAggregate(level);
    }
    return {
      level,
      rows: sumCounts(levelIds),
      distinctIds: levelIds.size,
      duplicateIdKeys: countDuplicatedKeys(levelIds),
      distinctLogicalSystemKeys: levelLogical.size,
      duplicateLogicalSystemKeys: countDuplicatedKeys(levelLogical),
      systemScopeRows: scopeCounts.system,
      userScopedRows: scopeCounts.user,
    };
  });

  const idLengthHistogram = [...idLengthCounts.entries()]
    .map(([length, count]) => ({ length, count }))
    .sort((a, b) => a.length - b.length);

  return {
    totalRows: rows.length,
    distinctIds: idCounts.size,
    duplicateIdKeys: countDuplicatedKeys(idCounts),
    levels,
    otherLevelRows,
    systemScopeRows,
    userScopedRows,
    idLengthHistogram,
  };
}

/**
 * Emits the aggregate snapshot diagnostics as one dev-only structured event.
 *
 * The event is a single complete JSON string so the whole payload stays
 * readable in the Metro console. No event is produced outside development
 * builds, and the aggregates are not even computed there.
 */
export function emitCategorySnapshotDiagnostics(
  rows: readonly CategoryDiagnosticRow[]
): void {
  if (!__DEV__) return;
  const diagnostics = buildCategorySnapshotDiagnostics(rows);
  logger.debug(
    JSON.stringify({
      event: "categories.snapshotDiagnostics",
      ...diagnostics,
    })
  );
}
