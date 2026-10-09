import { Q, type Database } from "@nozbe/watermelondb";
import type { SyncPullResult } from "@nozbe/watermelondb/sync";

import { SNAPSHOT_RETENTION_DAYS } from "./config";
import type { SnapshotTableName } from "./types";

export const HISTORICAL_RECOVERY_VERSION = "issue255-v1";

const RECEIPT_PREFIX = "__monyvi_sync_historical_recovery";
const RECEIPT_VALUE = "complete";

function receiptKey(userId: string): string {
  return `${RECEIPT_PREFIX}:${HISTORICAL_RECOVERY_VERSION}:${userId}`;
}

export async function isHistoricalRecoveryRequired(
  database: Database,
  userId: string
): Promise<boolean> {
  return (
    (await database.adapter.getLocal(receiptKey(userId))) !== RECEIPT_VALUE
  );
}

export async function markHistoricalRecoveryComplete(
  database: Database,
  userId: string
): Promise<void> {
  await database.adapter.setLocal(receiptKey(userId), RECEIPT_VALUE);
}

export async function removeHistoricalRecoveryReceipt(
  database: Database,
  userId: string
): Promise<void> {
  await database.adapter.removeLocal(receiptKey(userId));
}

export function createSnapshotRetentionCutoffIso(
  reference = new Date()
): string {
  const cutoff = new Date(reference.getTime());
  cutoff.setDate(cutoff.getDate() - SNAPSHOT_RETENTION_DAYS);
  return cutoff.toISOString();
}

/** Installed WatermelonDB 0.28 Flow API; distributed TS omits this pull-result option. */
interface HistoricalSnapshotPullStrategy {
  readonly default: "incremental";
  readonly override: Record<SnapshotTableName, "replacement">;
  readonly experimentalQueryRecordsForReplacement: Record<
    SnapshotTableName,
    () => Array<ReturnType<typeof Q.where>>
  >;
}
export type HistoricalRecoveryPullResult = SyncPullResult & {
  readonly experimentalStrategy?: HistoricalSnapshotPullStrategy;
};

export function createHistoricalSnapshotPullStrategy(
  userId: string,
  retentionCutoffIso: string,
  upperWatermark: string
): HistoricalSnapshotPullStrategy {
  const cutoffMs = Date.parse(retentionCutoffIso);
  const upperMs = Date.parse(upperWatermark);
  if (!Number.isFinite(cutoffMs) || !Number.isFinite(upperMs)) {
    throw new Error("sync_historical_recovery_invalid_snapshot");
  }
  // The SDK invokes this inside its apply writer. Explicit journal IDs remain authoritative.
  const query = (): Array<ReturnType<typeof Q.where>> => [
    Q.where("user_id", userId),
    Q.where("created_at", Q.gt(cutoffMs)),
    Q.where("created_at", Q.lte(upperMs)),
    Q.where("_status", "synced"),
  ];
  return {
    default: "incremental",
    override: {
      daily_snapshot_assets: "replacement",
      daily_snapshot_balance: "replacement",
      daily_snapshot_net_worth: "replacement",
    },
    experimentalQueryRecordsForReplacement: {
      daily_snapshot_assets: query,
      daily_snapshot_balance: query,
      daily_snapshot_net_worth: query,
    },
  };
}
