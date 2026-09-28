import type {
  SyncPushArgs,
  SyncRejectedIds,
  SyncTableChangeSet,
} from "@nozbe/watermelondb/sync";

function changedRecords(
  changes: SyncPushArgs["changes"],
  table: string
): ReadonlyArray<Record<string, unknown>> {
  const changeSet = (
    changes as unknown as Record<string, SyncTableChangeSet | undefined>
  )[table];
  return changeSet ? [...changeSet.created, ...changeSet.updated] : [];
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
