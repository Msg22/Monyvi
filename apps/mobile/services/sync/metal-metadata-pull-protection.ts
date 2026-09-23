import type { SyncTableChangeSet } from "@nozbe/watermelondb/sync";

/**
 * Prevents a server asset fragment from overwriting local-only Metals metadata
 * unless the same pull carries its clock-coupled holding-state fragment.
 */
export function protectMetalMetadataPullFragments(
  assetChanges: SyncTableChangeSet,
  holdingStateChanges: SyncTableChangeSet
): SyncTableChangeSet {
  const holdingStateRecords = [
    ...Array.from<unknown>(holdingStateChanges.created),
    ...Array.from<unknown>(holdingStateChanges.updated),
  ].map(requireSyncRecord);
  const clockCoupledHoldingIds = new Set(
    holdingStateRecords
      .map((record) => {
        if (typeof record.holding_id === "string") {
          return record.holding_id;
        }
        return typeof record.id === "string" ? record.id : null;
      })
      .filter((id): id is string => id !== null)
  );

  const protectRecord = (value: unknown): Record<string, unknown> => {
    const record = requireSyncRecord(value);
    const recordId = typeof record.id === "string" ? record.id : null;
    if (
      record.type !== "METAL" ||
      recordId === null ||
      clockCoupledHoldingIds.has(recordId)
    ) {
      return { ...record };
    }

    const protectedRecord = { ...record };
    delete protectedRecord.name;
    delete protectedRecord.notes;
    return protectedRecord;
  };

  return {
    created: Array.from<unknown>(assetChanges.created).map(protectRecord),
    updated: Array.from<unknown>(assetChanges.updated).map(protectRecord),
    deleted: Array.from<unknown>(assetChanges.deleted).map(requireSyncId),
  };
}

function requireSyncRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("sync_invalid_record");
  }
  return Object.fromEntries(Object.entries(value));
}

function requireSyncId(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("sync_invalid_record_id");
  }
  return value;
}
