import type { Database } from "@nozbe/watermelondb";
import * as Crypto from "expo-crypto";
import type {
  SyncPushArgs,
  SyncPushResult,
  SyncRejectedIds,
  SyncTableChangeSet,
} from "@nozbe/watermelondb/sync";

import { logger } from "@/utils/logger";

import {
  commitCanonicalMetalMetadataLocally,
  type MetalMetadataRpcOutcome,
} from "../metal-metadata-service";
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
  changedRecords,
  collectAcknowledgedMetalHoldingIds,
  collectBlockedDedicatedRejectedIds,
  collectRpcHandledMetalHoldingIds,
  collectUnacknowledgedMetalRows,
  excludeHoldingActions,
} from "./metal-row-routing";
import {
  expectedRevisionOrder,
  isCompleteMetalActionGroup,
} from "./metal-complete-group";
import {
  collectAccountFinancialActionPushBundles,
  collectProtectedFinancialActionRowIds,
  isProtectedFinancialActionRow,
  readRejectedIdsForTable,
  stripProtectedAccountFields,
} from "./account-protected-fields";
import {
  createFinancialActionPushCoordinator,
  type FinancialActionPushCoordinator,
} from "../financial-action-sync-service";
import {
  markFinancialActionGroupSyncFailed,
  markFinancialActionGroupSyncPending,
  recordFinancialActionGroupServerOutcome,
} from "../financial-action-foundation-repository";
import { productionFinancialActionReconciliationService } from "../financial-action-reconciliation-production";
import {
  assertPushRecordBelongsToCurrentUser,
  fetchOwnedParentIds,
  isSharedSystemCategoryPushRecord,
  stripMetalActionFragments,
} from "./ownership-guards";
import { getChildTableConfig, isWritableTable } from "./table-predicates";
import { scopePushChangesToUser } from "./push-ownership-service";
import { transformToSupabase } from "./transforms";
import { collectLocalTerminalActionIds } from "./metal-local-terminal-lookup";
import type { SupabaseWriteTable, WritableSupabaseTablesNames } from "./types";

export const GENERIC_SYNC_ERROR_CODES = {
  AUTH_SCOPE_LOST: "sync_push_auth_scope_lost",
  INVALID_ACTION_PUSH_OUTCOME: "sync_invalid_action_push_outcome",
  INVALID_CHANGE_ID: "sync_invalid_change_id",
} as const;

const METAL_ACTION_RPC = "apply_metal_action_v1";
const METAL_METADATA_RPC = "apply_metal_metadata_patch_v1";
const METAL_LINKED_TABLES: readonly string[] = [
  "metal_action_evidence",
  "metal_lifecycle_events",
  "metal_rate_references",
];
const NO_ACKNOWLEDGED_ACTIONS: ReadonlySet<string> = new Set<string>();
const metalOutcomeHashProvider = {
  digestUtf8: (value: string): Promise<string> =>
    Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value),
};

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
  readonly acknowledgedActionIds: ReadonlySet<string>;
}

export type MetalOutcomeCommitter = (
  outcome: MetalRpcOutcome
) => Promise<"accepted" | "reconciled" | "incomplete">;

export type MetalMetadataOutcomeCommitter = (
  outcome: MetalMetadataRpcOutcome
) => Promise<void>;

const ACCOUNT_FINANCIAL_COLUMNS: ReadonlySet<string> = new Set([
  "balance",
  "financial_revision",
]);

function readChangedColumns(record: unknown): readonly string[] {
  if (typeof record !== "object" || record === null) return [];
  const changed = (record as Record<string, unknown>)._changed;
  if (typeof changed !== "string" || changed.length === 0) return [];
  return Object.freeze(changed.split(","));
}

function hasPendingAccountMetadata(record: unknown): boolean {
  return readChangedColumns(record).some(
    (column) => !ACCOUNT_FINANCIAL_COLUMNS.has(column)
  );
}

function collectAcknowledgedAccountIdsWithMetadata(
  changes: SyncPushArgs["changes"],
  handledIds: SyncRejectedIds | undefined,
  rejectedIds: SyncRejectedIds | undefined
): ReadonlySet<string> {
  const handled = new Set(readRejectedIdsForTable(handledIds, "accounts"));
  const rejected = new Set(readRejectedIdsForTable(rejectedIds, "accounts"));
  const allowed = new Set<string>();
  changedRecords(changes, "accounts").forEach((record) => {
    const id = record.id;
    if (typeof id !== "string" || !handled.has(id) || rejected.has(id)) return;
    if (hasPendingAccountMetadata(record)) allowed.add(id);
  });
  return allowed;
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

function parseMetalMetadataRpcOutcome(
  value: unknown,
  holdingId: string
): MetalMetadataRpcOutcome | null {
  const outcome = asRpcObject(value);
  const canonical = asRpcObject(outcome?.canonicalMetadata);
  if (
    !outcome ||
    !["applied", "idempotent", "ignored"].includes(String(outcome.status)) ||
    outcome.holdingId !== holdingId ||
    !canonical ||
    !("name" in canonical) ||
    !("notes" in canonical)
  ) {
    return null;
  }
  return outcome as unknown as MetalMetadataRpcOutcome;
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
  database: Database,
  changes: SyncPushArgs["changes"],
  userId: string,
  rpc: MetalSyncRpc = defaultMetalRpc,
  commitOutcome?: MetalOutcomeCommitter,
  commitMetadataOutcome?: MetalMetadataOutcomeCommitter
): Promise<MetalDedicatedPushResult> {
  if (!hasDedicatedRows(changes)) {
    return {
      acknowledgeAllDedicatedRows: true,
      acknowledgedActionIds: NO_ACKNOWLEDGED_ACTIONS,
    };
  }
  if (hasDedicatedDeletes(changes)) {
    return {
      acknowledgeAllDedicatedRows: false,
      acknowledgedActionIds: NO_ACKNOWLEDGED_ACTIONS,
    };
  }

  const roots = [
    ...changedRecords(changes, "financial_action_groups").filter(
      (root) => root.domain === "metals"
    ),
  ].sort((left: Record<string, unknown>, right: Record<string, unknown>) => {
    const leftRevision = expectedRevisionOrder(left);
    const rightRevision = expectedRevisionOrder(right);
    return leftRevision === rightRevision
      ? 0
      : leftRevision < rightRevision
        ? -1
        : 1;
  });
  const acceptedActionIds = new Set<string>();
  const handledActionIds = new Set<string>();
  const blockedActionIds = new Set<string>();
  for (const root of roots) {
    const actionId = typeof root.action_id === "string" ? root.action_id : null;
    if (
      root.user_id !== userId ||
      actionId === null ||
      typeof root.payload_json !== "string" ||
      typeof root.payload_hash !== "string" ||
      !isCompleteMetalActionGroup(changes, root)
    ) {
      if (actionId === null) {
        return {
          acknowledgeAllDedicatedRows: false,
          acknowledgedActionIds: NO_ACKNOWLEDGED_ACTIONS,
        };
      }
      blockedActionIds.add(actionId);
      continue;
    }
    const { data, error } = await rpc(METAL_ACTION_RPC, {
      p_payload_hash: root.payload_hash,
      p_payload_json: root.payload_json,
    });
    if (error) throw new Error("metal_action_rpc_failed");
    const outcome = parseMetalRpcOutcome(data, actionId, userId);
    if (!outcome) {
      blockedActionIds.add(actionId);
      continue;
    }
    if (commitOutcome) {
      await commitOutcome(outcome);
      handledActionIds.add(actionId);
      if (outcome.status === "accepted" || outcome.status === "idempotent") {
        acceptedActionIds.add(actionId);
      }
    } else if (
      outcome.status === "accepted" ||
      outcome.status === "idempotent"
    ) {
      acceptedActionIds.add(actionId);
      handledActionIds.add(actionId);
    } else {
      blockedActionIds.add(actionId);
    }
  }

  const holdingIdsFromLinkedRows = new Set<string>();
  for (const table of METAL_LINKED_TABLES) {
    for (const record of changedRecords(changes, table)) {
      const holdingId = record.holding_id as string | undefined;
      if (holdingId) {
        holdingIdsFromLinkedRows.add(holdingId);
      }
    }
  }
  const states = changedRecords(changes, "metal_holding_states");
  for (const state of states) {
    const holdingId =
      typeof state.holding_id === "string"
        ? state.holding_id
        : String(state.id);
    holdingIdsFromLinkedRows.add(holdingId);
  }

  const localTerminalActionIds = await collectLocalTerminalActionIds(
    database,
    userId,
    holdingIdsFromLinkedRows
  );
  const safeActionIds = new Set<string>([
    ...handledActionIds,
    ...localTerminalActionIds,
  ]);

  const assets = new Map(
    changedRecords(changes, "assets").map((record) => [
      String(record.id),
      record,
    ])
  );
  const metadataHoldingIds = new Set<string>();
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
      return {
        acknowledgeAllDedicatedRows: false,
        acknowledgedActionIds: excludeHoldingActions(
          safeActionIds,
          changes,
          holdingId
        ),
      };
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
    const outcome = parseMetalMetadataRpcOutcome(data, holdingId);
    if (!outcome || !commitMetadataOutcome) {
      return {
        acknowledgeAllDedicatedRows: false,
        acknowledgedActionIds: excludeHoldingActions(
          safeActionIds,
          changes,
          holdingId
        ),
      };
    }
    try {
      await commitMetadataOutcome(outcome);
    } catch (error) {
      logger.error("sync.push.metal.metadata.commit.failed", error, {
        holdingId,
      });
      return {
        acknowledgeAllDedicatedRows: false,
        acknowledgedActionIds: excludeHoldingActions(
          safeActionIds,
          changes,
          holdingId
        ),
      };
    }
    metadataHoldingIds.add(holdingId);
  }

  const hasUnacceptedLinkedRow = METAL_LINKED_TABLES.some((table) =>
    changedRecords(changes, table).some(
      (record) =>
        typeof record.action_id !== "string" ||
        !safeActionIds.has(record.action_id)
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
        !safeActionIds.has(state.effective_action_id))
    );
  });
  return {
    acknowledgeAllDedicatedRows:
      (roots.length > 0 || metadataHoldingIds.size > 0) &&
      blockedActionIds.size === 0 &&
      !hasUnacceptedLinkedRow &&
      !hasUnacceptedState,
    acknowledgedActionIds: new Set(safeActionIds),
  };
}

const ACCOUNT_FINANCIAL_ACTION_RPC = "apply_account_financial_action_v1";
let productionFinancialActionPushCoordinator:
  | FinancialActionPushCoordinator
  | undefined;

interface FinancialActionRpcClient {
  readonly rpc: (
    functionName: string,
    args: Readonly<Record<string, string>>
  ) => Promise<{
    readonly data: unknown;
    readonly error: { readonly message?: string } | null;
  }>;
}

function getProductionFinancialActionPushCoordinator(): FinancialActionPushCoordinator {
  if (productionFinancialActionPushCoordinator) {
    return productionFinancialActionPushCoordinator;
  }
  productionFinancialActionPushCoordinator =
    createFinancialActionPushCoordinator({
      invokeAccountFinancialActionRpc: async ({
        payloadHash,
        payloadJson,
      }): Promise<unknown> => {
        const { data, error } = await (
          supabase as unknown as FinancialActionRpcClient
        ).rpc(ACCOUNT_FINANCIAL_ACTION_RPC, {
          p_payload_hash: payloadHash,
          p_payload_json: payloadJson,
        });
        if (error) {
          throw new Error(
            error.message ?? "account_financial_action_rpc_failed"
          );
        }
        return data;
      },
      markFinancialActionGroupSyncFailed,
      markFinancialActionGroupSyncPending,
      reconcileFinancialActionGroup: (actionId) =>
        productionFinancialActionReconciliationService.reconcileRejectedAction(
          actionId
        ),
      recordFinancialActionGroupServerOutcome,
    });
  return productionFinancialActionPushCoordinator;
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

function mergeRejectedIds(
  left: SyncRejectedIds | undefined,
  right: SyncRejectedIds | undefined
): SyncRejectedIds | undefined {
  const tables = new Set([
    ...Object.keys(left ?? {}),
    ...Object.keys(right ?? {}),
  ]);
  if (tables.size === 0) return undefined;
  return Object.fromEntries(
    [...tables].map((table) => [
      table,
      [
        ...new Set([
          ...readRejectedIdsForTable(left, table),
          ...readRejectedIdsForTable(right, table),
        ]),
      ],
    ])
  );
}

function subtractRejectedIds(
  source: SyncRejectedIds | undefined,
  removed: SyncRejectedIds | undefined
): SyncRejectedIds | undefined {
  if (!source) return undefined;
  const remaining = Object.fromEntries(
    Object.keys(source).flatMap((table) => {
      const removedIds = new Set(readRejectedIdsForTable(removed, table));
      const ids = readRejectedIdsForTable(source, table).filter(
        (id) => !removedIds.has(id)
      );
      return ids.length > 0 ? [[table, ids]] : [];
    })
  );
  return Object.keys(remaining).length > 0 ? remaining : undefined;
}

function mergeBundleRowIds(
  bundles: ReadonlyArray<{
    readonly rowIds: Readonly<Record<string, readonly string[]>>;
  }>
): SyncRejectedIds | undefined {
  return bundles.reduce<SyncRejectedIds | undefined>(
    (result, bundle) => mergeRejectedIds(result, bundle.rowIds),
    undefined
  );
}

async function resolveAccountActionAcknowledgements(
  changes: SyncPushArgs["changes"],
  coordinator: FinancialActionPushCoordinator | undefined
): Promise<{
  readonly handledIds: SyncRejectedIds | undefined;
  readonly rejectedIds: SyncRejectedIds | undefined;
}> {
  const bundles = collectAccountFinancialActionPushBundles(changes);
  if (bundles.length === 0) {
    return { handledIds: undefined, rejectedIds: undefined };
  }
  const resolvedCoordinator =
    coordinator ?? getProductionFinancialActionPushCoordinator();
  const { decisions } = await resolvedCoordinator.coordinatePush(
    bundles.map((bundle) => bundle.candidate)
  );
  const decisionByActionId = new Map(
    decisions.map((decision) => [decision.actionId, decision])
  );
  if (
    decisionByActionId.size !== bundles.length ||
    bundles.some((bundle) => !decisionByActionId.has(bundle.candidate.actionId))
  ) {
    throw new Error(GENERIC_SYNC_ERROR_CODES.INVALID_ACTION_PUSH_OUTCOME);
  }
  const rejectedBundles = bundles.filter(
    (bundle) =>
      decisionByActionId.get(bundle.candidate.actionId)?.disposition !==
      "acknowledge"
  );
  return {
    handledIds: mergeBundleRowIds(bundles),
    rejectedIds: mergeBundleRowIds(rejectedBundles),
  };
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
  expectedUserId?: string,
  financialActionPushCoordinator?: FinancialActionPushCoordinator
): Promise<SyncPushResult | undefined | void> {
  const userId = await assertExpectedPushUser(expectedUserId);
  const scoped = await scopePushChangesToUser(
    database,
    pushArgs.changes,
    userId
  );
  await assertExpectedPushUser(userId);
  const { changes } = scoped;
  const dedicatedPush = await pushMetalDedicatedChanges(
    database,
    changes,
    userId,
    defaultMetalRpc,
    (outcome) =>
      commitMetalRpcOutcomeLocally(
        database,
        outcome,
        userId,
        metalOutcomeHashProvider
      ),
    (outcome) =>
      database.write(() =>
        commitCanonicalMetalMetadataLocally(database, outcome, userId)
      )
  );
  const protectedFinancialActionIds = mergeRejectedIds(
    dedicatedPush.acknowledgeAllDedicatedRows
      ? undefined
      : collectBlockedDedicatedRejectedIds(
          changes,
          dedicatedPush.acknowledgedActionIds
        ),
    collectProtectedFinancialActionRowIds(changes)
  );
  const accountActionAcknowledgements =
    await resolveAccountActionAcknowledgements(
      changes,
      financialActionPushCoordinator
    );
  const handledMetalHoldingIds = dedicatedPush.acknowledgeAllDedicatedRows
    ? collectRpcHandledMetalHoldingIds(changes, true)
    : collectAcknowledgedMetalHoldingIds(
        changes,
        dedicatedPush.acknowledgedActionIds
      );
  const actionRejectedIds = mergeRejectedIds(
    mergeRejectedIds(
      subtractRejectedIds(
        protectedFinancialActionIds,
        accountActionAcknowledgements.handledIds
      ),
      accountActionAcknowledgements.rejectedIds
    ),
    collectUnacknowledgedMetalRows(changes, handledMetalHoldingIds)
  );
  const returnedRejectedIds = mergeRejectedIds(
    actionRejectedIds,
    scoped.rejectedIds
  );
  const metadataOnlyAccountIds = collectAcknowledgedAccountIdsWithMetadata(
    changes,
    accountActionAcknowledgements.handledIds,
    accountActionAcknowledgements.rejectedIds
  );

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

    // Metal child rows are committed by the action/metadata RPC, never by table upsert.
    if (table === "asset_metals") continue;

    if (!isWritableTable(table)) {
      continue;
    }

    const childConfig = getChildTableConfig(table);
    const isChildTable = childConfig !== undefined;

    try {
      const hasActiveChildWrites =
        isChildTable &&
        (tableChanges.created.some((record) => !isDeletedRecord(record)) ||
          tableChanges.updated.some((record) => !isDeletedRecord(record)));
      const hasDeletedChildWrites =
        isChildTable &&
        [...tableChanges.created, ...tableChanges.updated].some(
          isDeletedRecord
        );
      const hasChildDeletes = isChildTable && tableChanges.deleted.length > 0;
      const activeParentIds =
        childConfig && hasActiveChildWrites
          ? await fetchOwnedParentIds(database, childConfig.parentTable, userId)
          : null;
      const localDeleteParentIds =
        childConfig && (hasChildDeletes || hasDeletedChildWrites)
          ? await fetchOwnedParentIds(
              database,
              childConfig.parentTable,
              userId,
              {
                includeDeleted: true,
              }
            )
          : null;
      const deleteParentIds = childConfig
        ? [
            ...new Set([
              ...(localDeleteParentIds ?? []),
              ...(scoped.tombstoneParentIds.get(table) ?? []),
            ]),
          ]
        : null;

      const upsertRecords = async (
        records: ReadonlyArray<Record<string, unknown>>
      ): Promise<void> => {
        const pushableRecords = records.filter((record) => {
          if (table === "assets" && record.type === "METAL") return false;
          if (!isPushableRecord(table, record)) return false;
          if (
            !isProtectedFinancialActionRow(
              protectedFinancialActionIds,
              table,
              record
            )
          ) {
            return true;
          }
          if (table !== "accounts") return false;
          const id = record.id;
          return typeof id === "string" && metadataOnlyAccountIds.has(id);
        });
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
            stripProtectedAccountFields(
              table,
              stripMetalActionFragments(table, record)
            ),
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

      const genericDeletedIds = tableChanges.deleted.filter(
        (recordId) =>
          !(
            table === "assets" &&
            handledMetalHoldingIds.has(parseChangeId(recordId))
          ) &&
          !isProtectedFinancialActionRow(
            protectedFinancialActionIds,
            table,
            recordId
          )
      );
      if (genericDeletedIds.length > 0) {
        let query = getSupabaseWriteTable(table).update({
          deleted: true,
          updated_at: new Date().toISOString(),
        });

        if (childConfig && deleteParentIds) {
          query = query.in(childConfig.foreignKey, deleteParentIds);
        } else if (!isChildTable) {
          query = query.eq("user_id", userId);
        }

        const { error } = await query.in("id", genericDeletedIds);
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

  return returnedRejectedIds
    ? { experimentalRejectedIds: returnedRejectedIds }
    : undefined;
}
