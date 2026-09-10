import type { SyncTableChangeSet } from "@nozbe/watermelondb/sync";

/**
 * Prevents a server asset fragment from overwriting local-only Metals metadata
 * unless the same pull carries its clock-coupled holding-state fragment.
 *
 * Sync change-set records already expose the canonical raw-record index
 * signature, so no double assertion or domain-model coercion is required.
 */
export function protectMetalMetadataPullFragments(
  assetChanges: SyncTableChangeSet,
  holdingStateChanges: SyncTableChangeSet
): SyncTableChangeSet {
  const clockCoupledHoldingIds = new Set(
    [...holdingStateChanges.created, ...holdingStateChanges.updated]
      .map((record) =>
        typeof record.holding_id === "string" ? record.holding_id : record.id
      )
      .filter((id): id is string => typeof id === "string")
  );

  const protectRecord = (
    record: SyncTableChangeSet["created"][number]
  ): SyncTableChangeSet["created"][number] => {
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

  return {
    created: assetChanges.created.map(protectRecord),
    updated: assetChanges.updated.map(protectRecord),
    deleted: [...assetChanges.deleted],
  };
}
