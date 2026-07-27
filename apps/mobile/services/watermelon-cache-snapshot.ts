import type { Model } from "@nozbe/watermelondb";

export interface CachedModelSnapshot {
  readonly model: Model;
  readonly raw: Model["_raw"];
}

/**
 * WatermelonDB mutates cached models during prepareUpdate(), but adapter batch
 * failures do not restore those values. Snapshot the complete raw record so the
 * cache can be returned to its persisted state without creating another write.
 */
export function captureCachedModelSnapshot(model: Model): CachedModelSnapshot {
  return {
    model,
    raw: { ...model._raw },
  };
}

export function restoreCachedModelSnapshot(
  snapshot: CachedModelSnapshot
): void {
  snapshot.model._raw = { ...snapshot.raw };
  snapshot.model._isEditing = false;
  snapshot.model._preparedState = null;
}
