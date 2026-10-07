import type {
  SyncPushArgs,
  SyncRejectedIds,
  SyncTableChangeSet,
} from "@nozbe/watermelondb/sync";

export function changedRecords(
  changes: SyncPushArgs["changes"],
  table: string
): ReadonlyArray<Record<string, unknown>> {
  const changeSet = (
    changes as unknown as Record<string, SyncTableChangeSet | undefined>
  )[table];
  return changeSet ? [...changeSet.created, ...changeSet.updated] : [];
}

function parseChangeId(value: unknown): string {
  const candidate =
    typeof value === "string"
      ? value
      : (value as { readonly id?: unknown } | null)?.id;
  if (typeof candidate !== "string" || candidate.length === 0) {
    throw new Error("sync_invalid_change_id");
  }
  return candidate;
}

const METAL_LINKED_TABLES: ReadonlyArray<string> = [
  "metal_action_evidence",
  "metal_lifecycle_events",
  "metal_rate_references",
];

function readActionId(record: Record<string, unknown>): string | null {
  const actionId = record.action_id;
  return typeof actionId === "string" ? actionId : null;
}

export function collectHoldingActionIds(
  changes: SyncPushArgs["changes"],
  holdingId: string
): ReadonlySet<string> {
  const actionIds = new Set<string>();
  for (const root of changedRecords(changes, "financial_action_groups")) {
    if (
      root.domain_reference_id === holdingId &&
      typeof root.action_id === "string"
    ) {
      actionIds.add(root.action_id);
    }
  }
  for (const table of METAL_LINKED_TABLES) {
    for (const record of changedRecords(changes, table)) {
      if (
        record.holding_id === holdingId &&
        typeof record.action_id === "string"
      ) {
        actionIds.add(record.action_id);
      }
    }
  }
  for (const state of changedRecords(changes, "metal_holding_states")) {
    const stateHoldingId =
      typeof state.holding_id === "string"
        ? state.holding_id
        : String(state.id);
    if (
      stateHoldingId === holdingId &&
      typeof state.effective_action_id === "string"
    ) {
      actionIds.add(state.effective_action_id);
    }
  }
  return actionIds;
}

export function excludeHoldingActions(
  safeActionIds: ReadonlySet<string>,
  changes: SyncPushArgs["changes"],
  holdingId: string
): ReadonlySet<string> {
  const tainted = collectHoldingActionIds(changes, holdingId);
  return new Set([...safeActionIds].filter((id) => !tainted.has(id)));
}

/**
 * Collect dedicated-table rejected IDs for a partially acknowledged batch.
 * Rows positively attributed to an acknowledged action are dropped from the
 * rejected set; everything else (including unattributable rows) stays dirty.
 */
export function collectBlockedDedicatedRejectedIds(
  changes: SyncPushArgs["changes"],
  acknowledgedActionIds: ReadonlySet<string>
): SyncRejectedIds | undefined {
  const rejected: Record<string, string[]> = {};
  const keep = (table: string, id: string): void => {
    (rejected[table] ??= []).push(id);
  };
  const tableChanges = changes as unknown as Record<
    string,
    SyncTableChangeSet | undefined
  >;
  for (const [table, changeSet] of Object.entries(tableChanges)) {
    if (!changeSet) continue;
    if (table === "financial_action_groups") {
      for (const record of [...changeSet.created, ...changeSet.updated]) {
        const row = record as Record<string, unknown>;
        const actionId = readActionId(row);
        const id = parseChangeId(row);
        if (actionId !== null && acknowledgedActionIds.has(actionId)) continue;
        if (acknowledgedActionIds.has(id)) continue;
        keep(table, id);
      }
      for (const deleted of changeSet.deleted) {
        keep(table, parseChangeId(deleted));
      }
    } else if (table === "metal_holding_states") {
      for (const record of [...changeSet.created, ...changeSet.updated]) {
        const row = record as Record<string, unknown>;
        const effective = row.effective_action_id;
        if (
          typeof effective === "string" &&
          acknowledgedActionIds.has(effective)
        ) {
          continue;
        }
        keep(table, parseChangeId(row));
      }
      for (const deleted of changeSet.deleted) {
        keep(table, parseChangeId(deleted));
      }
    } else if (METAL_LINKED_TABLES.includes(table)) {
      for (const record of [...changeSet.created, ...changeSet.updated]) {
        const row = record as Record<string, unknown>;
        const actionId = readActionId(row);
        if (actionId !== null && acknowledgedActionIds.has(actionId)) continue;
        keep(table, parseChangeId(row));
      }
      for (const deleted of changeSet.deleted) {
        keep(table, parseChangeId(deleted));
      }
    } else if (table === "account_financial_effects") {
      for (const record of [...changeSet.created, ...changeSet.updated]) {
        keep(table, parseChangeId(record));
      }
      for (const deleted of changeSet.deleted) {
        keep(table, parseChangeId(deleted));
      }
    }
  }
  return Object.keys(rejected).length > 0 ? rejected : undefined;
}

/**
 * Collect holding IDs tied to acknowledged actions only, so generic
 * assets/asset_metals rows of valid groups clear while malformed groups'
 * rows stay dirty. A holding clears only when every changed action tied to
 * it is acknowledged: holding-level rows cannot be attributed to a single
 * action, so one dirty group keeps the whole holding dirty.
 */
export function collectAcknowledgedMetalHoldingIds(
  changes: SyncPushArgs["changes"],
  acknowledgedActionIds: ReadonlySet<string>
): ReadonlySet<string> {
  const actionsByHolding = new Map<string, Set<string>>();
  const taintedHoldings = new Set<string>();
  const tieHolding = (holding: unknown, action: unknown): void => {
    if (typeof holding !== "string") return;
    if (typeof action !== "string") {
      taintedHoldings.add(holding);
      return;
    }
    let actions = actionsByHolding.get(holding);
    if (!actions) {
      actions = new Set<string>();
      actionsByHolding.set(holding, actions);
    }
    actions.add(action);
  };
  for (const root of changedRecords(changes, "financial_action_groups")) {
    if (root.domain !== "metals") continue;
    tieHolding(root.domain_reference_id, root.action_id);
  }
  for (const table of METAL_LINKED_TABLES) {
    for (const record of changedRecords(changes, table)) {
      tieHolding(record.holding_id, record.action_id);
    }
  }
  for (const state of changedRecords(changes, "metal_holding_states")) {
    const stateHolding =
      typeof state.holding_id === "string"
        ? state.holding_id
        : typeof state.id === "string"
          ? state.id
          : null;
    tieHolding(stateHolding, state.effective_action_id);
  }
  const holdingIds = new Set<string>();
  for (const [holding, actions] of actionsByHolding) {
    if (
      actions.size > 0 &&
      !taintedHoldings.has(holding) &&
      [...actions].every((action) => acknowledgedActionIds.has(action))
    ) {
      holdingIds.add(holding);
    }
  }
  return holdingIds;
}
export function collectRpcHandledMetalHoldingIds(
  changes: SyncPushArgs["changes"],
  didAcknowledge: boolean
): ReadonlySet<string> {
  if (!didAcknowledge) return new Set();
  const holdingIds = new Set<string>();
  for (const root of changedRecords(changes, "financial_action_groups")) {
    if (
      root.domain === "metals" &&
      typeof root.domain_reference_id === "string"
    ) {
      holdingIds.add(root.domain_reference_id);
    }
  }
  for (const state of changedRecords(changes, "metal_holding_states")) {
    if (typeof state.holding_id === "string") holdingIds.add(state.holding_id);
  }
  return holdingIds;
}

export function collectUnacknowledgedMetalRows(
  changes: SyncPushArgs["changes"],
  handledHoldingIds: ReadonlySet<string>
): SyncRejectedIds | undefined {
  const rejected: Record<string, string[]> = {};
  for (const asset of changedRecords(changes, "assets")) {
    if (
      asset.type === "METAL" &&
      typeof asset.id === "string" &&
      !handledHoldingIds.has(asset.id)
    ) {
      (rejected.assets ??= []).push(asset.id);
    }
  }
  for (const metal of changedRecords(changes, "asset_metals")) {
    if (
      typeof metal.id === "string" &&
      !handledHoldingIds.has(String(metal.asset_id))
    ) {
      (rejected.asset_metals ??= []).push(metal.id);
    }
  }
  const metalChanges = (
    changes as unknown as Record<string, SyncTableChangeSet | undefined>
  ).asset_metals;
  for (const deleted of metalChanges?.deleted ?? []) {
    if (typeof deleted !== "string" || deleted.length === 0) {
      throw new Error("sync_invalid_change_id");
    }
    if (!handledHoldingIds.has(deleted)) {
      (rejected.asset_metals ??= []).push(deleted);
    }
  }
  return Object.keys(rejected).length > 0 ? rejected : undefined;
}
