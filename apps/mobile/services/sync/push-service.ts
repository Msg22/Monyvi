import type { Database } from "@nozbe/watermelondb";
import type {
  SyncPushArgs,
  SyncPushResult,
  SyncRejectedIds,
  SyncTableChangeSet,
} from "@nozbe/watermelondb/sync";

import { logger } from "@/utils/logger";

import {
  commitMetalRpcOutcomeLocally,
  type MetalRpcOutcome,
} from "../metal-reconciliation-service";
import { getCurrentUserId, supabase } from "../supabase";
import {
  DEDICATED_SYNC_TABLES,
  PULL_ONLY_SHARED_TABLES,
  SYNCABLE_TABLES,
  type SyncableTable,
} from "./config";
import { createSyncTableError } from "./errors";
import {
  assertPushRecordBelongsToCurrentUser,
  fetchOwnedParentIds,
  isSharedSystemCategoryPushRecord,
  stripMetalActionFragments,
} from "./ownership-guards";
import { getChildTableConfig, isWritableTable } from "./table-predicates";
import { transformToSupabase } from "./transforms";
import type { SupabaseWriteTable, WritableSupabaseTablesNames } from "./types";

export const GENERIC_SYNC_ERROR_CODES = {
  AUTH_SCOPE_LOST: "sync_push_auth_scope_lost",
  INVALID_CHANGE_ID: "sync_invalid_change_id",
} as const;

const METAL_ACTION_RPC = "apply_metal_action_v1";
const METAL_METADATA_RPC = "apply_metal_metadata_patch_v1";

interface MetalRpcResult {
  readonly data: unknown;
  readonly error: unknown;
}

export type MetalSyncRpc = (
  name: string,
  args: Readonly<Record<string, unknown>>
) => Promise<MetalRpcResult>;

export interface MetalDedicatedPushResult {
  readonly acknowledgeAllDedicatedRows: boolean;
}

export type MetalOutcomeCommitter = (
  outcome: MetalRpcOutcome
) => Promise<"accepted" | "reconciled" | "incomplete">;

function changedRecords(
  changes: SyncPushArgs["changes"],
  table: string
): ReadonlyArray<Record<string, unknown>> {
  const changeSet = (
    changes as unknown as Record<string, SyncTableChangeSet | undefined>
  )[table];
  return changeSet ? [...changeSet.created, ...changeSet.updated] : [];
}

function hasDedicatedDeletes(changes: SyncPushArgs["changes"]): boolean {
  return [...DEDICATED_SYNC_TABLES].some((table) => {
    const changeSet = (
      changes as unknown as Record<string, SyncTableChangeSet | undefined>
    )[table];
    return (changeSet?.deleted.length ?? 0) > 0;
  });
}

function hasDedicatedRows(changes: SyncPushArgs["changes"]): boolean {
  return [...DEDICATED_SYNC_TABLES].some((table) => {
    const changeSet = (
      changes as unknown as Record<string, SyncTableChangeSet | undefined>
    )[table];
    return changeSet
      ? changeSet.created.length +
          changeSet.updated.length +
          changeSet.deleted.length >
          0
      : false;
  });
}

function expectedRevisionOrder(root: Record<string, unknown>): bigint {
  try {
    const envelope = JSON.parse(String(root.payload_json)) as {
      readonly payload?: { readonly expectedHoldingRevision?: unknown };
    };
    const revision = envelope.payload?.expectedHoldingRevision;
    if (revision === null) return -1n;
    return typeof revision === "string"
      ? BigInt(revision)
      : 9223372036854775808n;
  } catch {
    return 9223372036854775808n;
  }
}

function asRpcObject(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

function parseMetalRpcOutcome(
  value: unknown,
  actionId: string,
  userId: string
): MetalRpcOutcome | null {
  const outcome = asRpcObject(value);
  if (!outcome || outcome.actionId !== actionId) return null;
  if (outcome.status === "accepted" || outcome.status === "idempotent") {
    return {
      ...(outcome as unknown as Extract<
        MetalRpcOutcome,
        { readonly status: "accepted" | "idempotent" }
      >),
      userId,
      payloadHashMatches: true,
    };
  }
  if (outcome.status === "stale" || outcome.status === "rejected") {
    return {
      ...(outcome as unknown as Extract<
        MetalRpcOutcome,
        { readonly status: "stale" | "rejected" }
      >),
      userId,
      payloadHashMatches: true,
    };
  }
  return null;
}

function isCompleteMetalActionGroup(
  changes: SyncPushArgs["changes"],
  root: Record<string, unknown>
): boolean {
  try {
    const envelope = JSON.parse(String(root.payload_json)) as {
      readonly actionId: string;
      readonly domainReferenceId: string;
      readonly kind: string;
      readonly payload: {
        readonly holdingId: string;
        readonly rateSnapshots?: ReadonlyArray<{
          readonly referenceId: string;
        }>;
        readonly materialCorrection?: {
          readonly rateSnapshots?: ReadonlyArray<{
            readonly referenceId: string;
          }>;
        } | null;
      };
      readonly userId: string;
    };
    if (
      envelope.actionId !== root.action_id ||
      envelope.userId !== root.user_id ||
      envelope.domainReferenceId !== envelope.payload.holdingId
    ) {
      return false;
    }
    const matchesActionRow = (record: Record<string, unknown>): boolean =>
      record.action_id === envelope.actionId &&
      record.user_id === envelope.userId &&
      record.holding_id === envelope.payload.holdingId;
    const evidence = changedRecords(changes, "metal_action_evidence").filter(
      matchesActionRow
    );
    const events = changedRecords(changes, "metal_lifecycle_events").filter(
      matchesActionRow
    );
    const states = changedRecords(changes, "metal_holding_states").filter(
      (record) =>
        record.user_id === envelope.userId &&
        (record.holding_id === envelope.payload.holdingId ||
          record.id === envelope.payload.holdingId)
    );
    const snapshots =
      envelope.payload.materialCorrection?.rateSnapshots ??
      envelope.payload.rateSnapshots ??
      [];
    const expectedRateIds = new Set(
      snapshots.map((snapshot) => snapshot.referenceId)
    );
    const rates = changedRecords(changes, "metal_rate_references").filter(
      matchesActionRow
    );
    return (
      evidence.length === 1 &&
      evidence[0]?.kind === envelope.kind &&
      events.length === 1 &&
      events[0]?.kind === envelope.kind &&
      states.length === 1 &&
      rates.length === expectedRateIds.size &&
      rates.every(
        (record) =>
          typeof record.id === "string" && expectedRateIds.has(record.id)
      )
    );
  } catch {
    return false;
  }
}

function defaultMetalRpc(
  name: string,
  args: Readonly<Record<string, unknown>>
): Promise<MetalRpcResult> {
  const client = supabase as unknown as {
    readonly rpc: MetalSyncRpc;
  };
  return client.rpc(name, args);
}

function metalMetadataField(
  state: Record<string, unknown>,
  asset: Record<string, unknown>,
  field: "name" | "notes"
): Readonly<Record<string, unknown>> | null | false {
  const writtenAt = state[`${field}_written_at`];
  const writerId = state[`${field}_writer_id`];
  if (writtenAt === null || writtenAt === undefined) {
    return writerId === null || writerId === undefined ? null : false;
  }
  const value = asset[field];
  if (
    typeof writtenAt !== "number" ||
    !Number.isSafeInteger(writtenAt) ||
    typeof writerId !== "string" ||
    (field === "name"
      ? typeof value !== "string"
      : value !== null && typeof value !== "string")
  ) {
    return false;
  }
  return { value, writtenAt, writerId };
}

export async function pushMetalDedicatedChanges(
  changes: SyncPushArgs["changes"],
  userId: string,
  rpc: MetalSyncRpc = defaultMetalRpc,
  commitOutcome?: MetalOutcomeCommitter
): Promise<MetalDedicatedPushResult> {
  if (!hasDedicatedRows(changes)) {
    return { acknowledgeAllDedicatedRows: true };
  }
  if (hasDedicatedDeletes(changes)) {
    return { acknowledgeAllDedicatedRows: false };
  }

  const roots = [...changedRecords(changes, "financial_action_groups")].sort(
    (left: Record<string, unknown>, right: Record<string, unknown>) => {
      const leftRevision = expectedRevisionOrder(left);
      const rightRevision = expectedRevisionOrder(right);
      return leftRevision === rightRevision
        ? 0
        : leftRevision < rightRevision
          ? -1
          : 1;
    }
  );
  const acceptedActionIds = new Set<string>();
  const handledActionIds = new Set<string>();
  for (const root of roots) {
    if (
      root.user_id !== userId ||
      typeof root.action_id !== "string" ||
      typeof root.payload_json !== "string" ||
      typeof root.payload_hash !== "string" ||
      !isCompleteMetalActionGroup(changes, root)
    ) {
      return { acknowledgeAllDedicatedRows: false };
    }
    const { data, error } = await rpc(METAL_ACTION_RPC, {
      p_payload_hash: root.payload_hash,
      p_payload_json: root.payload_json,
    });
    if (error) throw new Error("metal_action_rpc_failed");
    const outcome = parseMetalRpcOutcome(data, root.action_id, userId);
    if (!outcome) {
      return { acknowledgeAllDedicatedRows: false };
    }
    if (commitOutcome) {
      await commitOutcome(outcome);
      handledActionIds.add(root.action_id);
      if (outcome.status === "accepted" || outcome.status === "idempotent") {
        acceptedActionIds.add(root.action_id);
      }
    } else if (
      outcome.status === "accepted" ||
      outcome.status === "idempotent"
    ) {
      acceptedActionIds.add(root.action_id);
      handledActionIds.add(root.action_id);
    } else {
      return { acknowledgeAllDedicatedRows: false };
    }
  }

  const assets = new Map(
    changedRecords(changes, "assets").map((record) => [
      String(record.id),
      record,
    ])
  );
  const metadataHoldingIds = new Set<string>();
  const states = changedRecords(changes, "metal_holding_states");
  for (const state of states) {
    const holdingId =
      typeof state.holding_id === "string"
        ? state.holding_id
        : String(state.id);
    const asset = assets.get(holdingId);
    if (
      typeof state.effective_action_id === "string" &&
      handledActionIds.has(state.effective_action_id) &&
      !acceptedActionIds.has(state.effective_action_id)
    ) {
      metadataHoldingIds.add(holdingId);
      continue;
    }
    const name = asset ? metalMetadataField(state, asset, "name") : null;
    const notes = asset ? metalMetadataField(state, asset, "notes") : null;
    if (name === false || notes === false) {
      return { acknowledgeAllDedicatedRows: false };
    }
    const fields = {
      ...(name ? { name } : {}),
      ...(notes ? { notes } : {}),
    };
    if (Object.keys(fields).length === 0) continue;
    const { data, error } = await rpc(METAL_METADATA_RPC, {
      p_holding_id: holdingId,
      p_patch: { fields },
    });
    if (error) throw new Error("metal_metadata_rpc_failed");
    const outcome = asRpcObject(data);
    if (
      !outcome ||
      !["applied", "idempotent", "ignored"].includes(String(outcome.status)) ||
      outcome.holdingId !== holdingId
    ) {
      return { acknowledgeAllDedicatedRows: false };
    }
    metadataHoldingIds.add(holdingId);
  }

  const linkedTables = [
    "metal_action_evidence",
    "metal_lifecycle_events",
    "metal_rate_references",
  ];
  const hasUnacceptedLinkedRow = linkedTables.some((table) =>
    changedRecords(changes, table).some(
      (record) =>
        typeof record.action_id !== "string" ||
        !handledActionIds.has(record.action_id)
    )
  );
  const hasUnacceptedState = states.some((state) => {
    const holdingId =
      typeof state.holding_id === "string"
        ? state.holding_id
        : String(state.id);
    return (
      !metadataHoldingIds.has(holdingId) &&
      (typeof state.effective_action_id !== "string" ||
        !handledActionIds.has(state.effective_action_id))
    );
  });
  return {
    acknowledgeAllDedicatedRows:
      (roots.length > 0 || metadataHoldingIds.size > 0) &&
      !hasUnacceptedLinkedRow &&
      !hasUnacceptedState,
  };
}

async function assertExpectedPushUser(
  expectedUserId?: string
): Promise<string> {
  const currentUserId = await getCurrentUserId();
  if (
    !currentUserId ||
    (expectedUserId !== undefined && currentUserId !== expectedUserId)
  ) {
    throw new Error(GENERIC_SYNC_ERROR_CODES.AUTH_SCOPE_LOST);
  }
  return expectedUserId ?? currentUserId;
}

function parseChangeId(value: unknown): string {
  const candidate =
    typeof value === "string"
      ? value
      : (value as { readonly id?: unknown } | null)?.id;
  if (typeof candidate !== "string" || candidate.length === 0) {
    throw new Error(GENERIC_SYNC_ERROR_CODES.INVALID_CHANGE_ID);
  }
  return candidate;
}

function collectDedicatedRejectedIds(
  changes: SyncPushArgs["changes"]
): SyncRejectedIds | undefined {
  const rejectedIds: Record<string, string[]> = {};
  for (const [table, changeSet] of Object.entries(changes)) {
    if (!DEDICATED_SYNC_TABLES.has(table)) continue;

    const tableChanges = changeSet as SyncTableChangeSet;
    const tableRejectedIds = [
      ...tableChanges.created.map((record: unknown): string =>
        parseChangeId(record)
      ),
      ...tableChanges.updated.map((record: unknown): string =>
        parseChangeId(record)
      ),
      ...tableChanges.deleted.map((recordId: unknown): string =>
        parseChangeId(recordId)
      ),
    ];
    if (tableRejectedIds.length > 0) {
      rejectedIds[table] = [...new Set(tableRejectedIds)];
    }
  }

  return Object.keys(rejectedIds).length > 0 ? rejectedIds : undefined;
}

function comparePushTableOrder(
  [leftTableName]: readonly [string, unknown],
  [rightTableName]: readonly [string, unknown]
): number {
  const leftChildConfig = getChildTableConfig(leftTableName as SyncableTable);
  const rightChildConfig = getChildTableConfig(rightTableName as SyncableTable);

  if (leftChildConfig?.parentTable === rightTableName) {
    return 1;
  }

  if (rightChildConfig?.parentTable === leftTableName) {
    return -1;
  }

  return 0;
}

function isDeletedRecord(record: unknown): boolean {
  return (record as Record<string, unknown>).deleted === true;
}

function getSupabaseWriteTable(
  table: WritableSupabaseTablesNames
): SupabaseWriteTable {
  return supabase.from(table) as unknown as SupabaseWriteTable;
}

function isPushableRecord(
  table: SyncableTable,
  record: Record<string, unknown>
): boolean {
  return !isSharedSystemCategoryPushRecord(table, record);
}

function getUpsertConflictColumn(table: SyncableTable): "id" | "user_id" {
  return table === "profiles" ? "user_id" : "id";
}

export async function pushChanges(
  database: Database,
  pushArgs: SyncPushArgs,
  expectedUserId?: string
): Promise<SyncPushResult | undefined | void> {
  const userId = await assertExpectedPushUser(expectedUserId);
  const dedicatedPush = await pushMetalDedicatedChanges(
    pushArgs.changes,
    userId,
    defaultMetalRpc,
    (outcome) => commitMetalRpcOutcomeLocally(database, outcome, userId)
  );
  const dedicatedRejectedIds = dedicatedPush.acknowledgeAllDedicatedRows
    ? undefined
    : collectDedicatedRejectedIds(pushArgs.changes);

  const { changes } = pushArgs;
  for (const [tableName, rawTableChanges] of Object.entries(changes).sort(
    comparePushTableOrder
  )) {
    const table = tableName as SyncableTable;
    if (!SYNCABLE_TABLES.includes(tableName as SyncableTable)) {
      continue;
    }
    if (PULL_ONLY_SHARED_TABLES.has(tableName)) {
      continue;
    }
    const tableChanges = rawTableChanges as SyncTableChangeSet;

    if (!isWritableTable(table)) {
      continue;
    }

    const childConfig = getChildTableConfig(table);
    const isChildTable = childConfig !== undefined;

    try {
      const hasActiveChildWrites =
        isChildTable &&
        (tableChanges.created.length > 0 ||
          tableChanges.updated.some((record) => !isDeletedRecord(record)));
      const hasDeletedChildUpdates =
        isChildTable && tableChanges.updated.some(isDeletedRecord);
      const hasChildDeletes = isChildTable && tableChanges.deleted.length > 0;
      const activeParentIds =
        childConfig && hasActiveChildWrites
          ? await fetchOwnedParentIds(database, childConfig.parentTable, userId)
          : null;
      const deleteParentIds =
        childConfig && (hasChildDeletes || hasDeletedChildUpdates)
          ? await fetchOwnedParentIds(
              database,
              childConfig.parentTable,
              userId,
              {
                includeDeleted: true,
              }
            )
          : null;

      const upsertRecords = async (
        records: ReadonlyArray<Record<string, unknown>>
      ): Promise<void> => {
        const pushableRecords = records.filter((record) =>
          isPushableRecord(table, record)
        );
        if (pushableRecords.length === 0) {
          return;
        }

        const transformedRecords = pushableRecords.map((record) => {
          assertPushRecordBelongsToCurrentUser(
            table,
            record,
            userId,
            childConfig,
            isDeletedRecord(record) ? deleteParentIds : activeParentIds
          );
          return transformToSupabase(
            table,
            stripMetalActionFragments(table, record),
            userId,
            isChildTable
          );
        });

        const { error } = await getSupabaseWriteTable(table).upsert(
          transformedRecords,
          { onConflict: getUpsertConflictColumn(table) }
        );
        if (error) {
          throw createSyncTableError("upsert", table, error);
        }
      };

      const softDeletedUpdates = tableChanges.updated.filter(isDeletedRecord);
      const activeUpdates = tableChanges.updated.filter(
        (record) => !isDeletedRecord(record)
      );

      if (softDeletedUpdates.length > 0) {
        await upsertRecords(softDeletedUpdates);
      }

      if (tableChanges.deleted.length > 0) {
        let query = getSupabaseWriteTable(table).update({
          deleted: true,
          updated_at: new Date().toISOString(),
        });

        if (childConfig && deleteParentIds) {
          query = query.in(childConfig.foreignKey, deleteParentIds);
        } else if (!isChildTable) {
          query = query.eq("user_id", userId);
        }

        const { error } = await query.in("id", tableChanges.deleted);
        if (error) {
          throw createSyncTableError("delete", table, error);
        }
      }

      if (tableChanges.created.length > 0) {
        await upsertRecords(tableChanges.created);
      }

      if (activeUpdates.length > 0) {
        await upsertRecords(activeUpdates);
      }
    } catch (err) {
      logger.error("sync.push.table.failed", err, { table });
      throw err;
    }
  }

  await assertExpectedPushUser(userId);

  return dedicatedRejectedIds
    ? { experimentalRejectedIds: dedicatedRejectedIds }
    : undefined;
}

export async function runMetalPushStrategy(input: {
  readonly push: () => Promise<void>;
  readonly markSynced: () => Promise<void> | void;
}): Promise<void> {
  await input.push();
  await input.markSynced();
}
