/**
 * #395 T069 Account metadata transport and action push coordination.
 * Extracted helper to isolate transport and preserve push-service line budget.
 */
import type { Database } from "@nozbe/watermelondb";
import type {
  SyncPushArgs,
  SyncRejectedIds,
  SyncTableChangeSet,
} from "@nozbe/watermelondb/sync";
import { supabase } from "../supabase";
import {
  createFinancialActionPushCoordinator,
  type FinancialActionPushCoordinator,
} from "../financial-action-sync-service";
import {
  getFinancialActionGroup,
  markFinancialActionGroupSyncFailed,
  markFinancialActionGroupSyncPending,
  recordFinancialActionGroupServerOutcome,
} from "../financial-action-foundation-repository";
import { productionFinancialActionReconciliationService } from "../financial-action-reconciliation-production";
import {
  collectAccountFinancialActionPushBundles,
  readRejectedIdsForTable,
} from "./account-protected-fields";
import {
  loadAccountActionProtection,
  type AccountActionProtection,
} from "./account-action-protection";
import {
  recordDeferredAccountRejection,
  type AccountSyncAckCapability,
} from "./account-sync-ack-scope";
import {
  isAccountMetadataPatchCandidate,
  planAccountMetadataPatch,
  pushAccountMetadataPatch,
  verifyAcceptedCreatedAccountFinancialReadback,
  type ReadCurrentAccountFinancialFields,
  pushAcceptedAccountChildMetadataPatch,
} from "./account-metadata-patch";
import type { SupabaseWriteTable, WritableSupabaseTablesNames } from "./types";
import { GENERIC_SYNC_ERROR_CODES } from "./errors";

const ACCOUNT_FINANCIAL_ACTION_RPC = "apply_account_financial_action_v1";
const productionCoordinators = new WeakMap<
  Database,
  FinancialActionPushCoordinator
>();

interface FinancialActionRpcClient {
  readonly rpc: (
    functionName: string,
    args: Readonly<Record<string, string>>
  ) => Promise<{
    readonly data: unknown;
    readonly error: { readonly message?: string } | null;
  }>;
}

export function getProductionFinancialActionPushCoordinator(
  database: Database
): FinancialActionPushCoordinator {
  const previous = productionCoordinators.get(database);
  if (previous) return previous;
  const coordinator = createFinancialActionPushCoordinator({
    database,
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
        throw new Error(error.message ?? "account_financial_action_rpc_failed");
      }
      return data;
    },
    markFinancialActionGroupSyncFailed,
    markFinancialActionGroupSyncPending,
    getFinancialActionGroup,
    reconcileFinancialActionGroup: (actionId) =>
      productionFinancialActionReconciliationService.reconcileRejectedAction(
        actionId
      ),
    recordFinancialActionGroupServerOutcome,
  });
  productionCoordinators.set(database, coordinator);
  return coordinator;
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

export async function resolveAccountActionAcknowledgements(
  database: Database,
  ownerId: string,
  capability: AccountSyncAckCapability,
  changes: SyncPushArgs["changes"],
  catalog: AccountActionProtection,
  coordinator: FinancialActionPushCoordinator | undefined
): Promise<{
  readonly handledIds: SyncRejectedIds | undefined;
  readonly rejectedIds: SyncRejectedIds | undefined;
}> {
  const bundles = collectAccountFinancialActionPushBundles(changes, catalog);
  if (bundles.length === 0) {
    return { handledIds: undefined, rejectedIds: undefined };
  }
  const resolvedCoordinator =
    coordinator ?? getProductionFinancialActionPushCoordinator(database);
  const { decisions } = await resolvedCoordinator.coordinatePush(
    bundles.map((bundle) => bundle.candidate),
    capability
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
  if (rejectedBundles.length > 0) {
    const durable = await loadAccountActionProtection({
      database,
      expectedOwnerId: ownerId,
      capability,
    });
    for (const bundle of rejectedBundles) {
      if (!bundle.candidate.payloadJson.includes('"account.create-default/v1"'))
        continue;
      const binding = durable.roots.find(
        (root) =>
          root.actionId === bundle.candidate.actionId &&
          root.ownerId === ownerId &&
          root.payloadHash === bundle.candidate.payloadHash &&
          root.payloadJson === bundle.candidate.payloadJson &&
          ["rejected_compensating", "reconciliation_incomplete"].includes(
            root.state
          )
      );
      if (binding) {
        recordDeferredAccountRejection(capability, database, ownerId, {
          physicalRootId: binding.physicalRootId,
          ownerId,
          actionId: binding.actionId,
          payloadHash: binding.payloadHash,
          payloadJson: binding.payloadJson,
        });
      }
    }
  }
  return {
    handledIds: mergeBundleRowIds(bundles),
    rejectedIds: mergeBundleRowIds(rejectedBundles),
  };
}

export function isAccountOrChildMetadataExcludedFromGenericUpsert(
  table: string,
  record: Record<string, unknown>,
  history: AccountActionProtection
): boolean {
  if (
    table === "accounts" &&
    typeof record.id === "string" &&
    (history.createdAccountIds.has(record.id) ||
      history.priorDefaultIds.has(record.id) ||
      isAccountMetadataPatchCandidate(table, record, history))
  ) {
    return true;
  }
  if (
    typeof record.id === "string" &&
    history.losingIds[table]?.has(record.id)
  ) {
    return true;
  }
  if (
    typeof record.id === "string" &&
    history.createdChildIds[table]?.has(record.id)
  ) {
    return true;
  }
  return false;
}

/** The production typed owner-scoped read is separate from the write-only
 * metadata table API. Selected fields are inferred from generated Supabase
 * accounts Row, not from a fabricated read method on SupabaseWriteTable. */
const readCurrentAccountFinancialFields: ReadCurrentAccountFinancialFields =
  async (ownerId, accountId) =>
    supabase
      .from("accounts")
      .select("id,user_id,type,currency,created_at,balance,financial_revision")
      .eq("id", accountId)
      .eq("user_id", ownerId)
      .maybeSingle();

export async function pushTableAccountMetadataPatches(input: {
  readonly database: Database;
  readonly capability: AccountSyncAckCapability;
  readonly userId: string;
  readonly table: string;
  readonly tableChanges: SyncTableChangeSet;
  readonly history: AccountActionProtection;
  readonly getSupabaseWriteTable: (
    table: WritableSupabaseTablesNames
  ) => SupabaseWriteTable;
}): Promise<ReadonlySet<string>> {
  const {
    database,
    capability,
    userId,
    table,
    tableChanges,
    history,
    getSupabaseWriteTable,
  } = input;
  // Only the existing authenticated exact current-financial verifier can
  // certify a still-created accepted Add account for financial field ACK.
  const verifiedCreatedFinancialAccountIds = new Set<string>();

  if (table === "accounts") {
    const patches = [...tableChanges.created, ...tableChanges.updated]
      .filter(
        (record) =>
          isAccountMetadataPatchCandidate(table, record, history) &&
          typeof record.id === "string" &&
          !history.losingIds.accounts?.has(record.id)
      )
      .flatMap((record) => {
        const patch = planAccountMetadataPatch(record, history);
        return patch ? [{ record, patch }] : [];
      });
    const defaultPriority = (
      patch: NonNullable<(typeof patches)[number]["patch"]>
    ): number => (patch.clearsDefault ? 0 : patch.setsDefaultTrue ? 2 : 1);
    patches.sort((left, right) => {
      const priority =
        defaultPriority(left.patch) - defaultPriority(right.patch);
      if (priority !== 0) return priority;
      const leftId = left.patch.accountId;
      const rightId = right.patch.accountId;
      return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
    });
    for (const { record } of patches) {
      await pushAccountMetadataPatch({
        database,
        capability,
        expectedOwnerId: userId,
        record,
        protection: history,
        accountsTable: getSupabaseWriteTable("accounts"),
      });
    }
    // Distinct from metadata UPDATE admission: an ordinary financial Save can
    // advance the still-created local Add account before its first SDK ACK.
    // The remote account's owner-bound current balance/revision must match
    // exactly before those two *account* fields become ACK-eligible.
    for (const record of [...tableChanges.created, ...tableChanges.updated]) {
      if (
        typeof record.id !== "string" ||
        !history.acceptedAccountIds.has(record.id) ||
        record._status !== "created"
      )
        continue;
      if (
        await verifyAcceptedCreatedAccountFinancialReadback({
          database,
          capability,
          expectedOwnerId: userId,
          record,
          protection: history,
          readCurrentAccountFinancialFields,
        })
      )
        verifiedCreatedFinancialAccountIds.add(record.id);
    }
  }
  if (table === "bank_details" || table === "account_sms_senders") {
    for (const record of [...tableChanges.created, ...tableChanges.updated]) {
      if (
        typeof record.id !== "string" ||
        !history.acceptedChildPostimages[table]?.has(record.id)
      ) {
        continue;
      }
      if (history.losingIds[table]?.has(record.id)) continue;
      await pushAcceptedAccountChildMetadataPatch({
        database,
        capability,
        expectedOwnerId: userId,
        table,
        record,
        protection: history,
        remoteTable: getSupabaseWriteTable(table),
      });
    }
  }
  return verifiedCreatedFinancialAccountIds;
}
