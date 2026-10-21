/**
 * WatermelonDB Sync Adapter for Supabase
 * Implements push/pull synchronization between local and cloud databases.
 *
 * Strategy: "Last Write Wins" - most recent updated_at timestamp wins conflicts.
 */

import { Q, type Database } from "@nozbe/watermelondb";
import {
  synchronize,
  MONYVI_SYNC_WRITER_GUARDS,
  type SyncPullResult,
  type SyncPushArgs,
  type SyncPushResult,
  type SyncDatabaseChangeSet,
  type SyncTableChangeSet,
  type SyncRejectedIds,
} from "@nozbe/watermelondb/sync";

import { logger } from "@/utils/logger";

import { getCurrentUserId } from "./supabase";
import { createProtectedHistoricalSync } from "./sync/protected-historical-sync";
import { reconcileRejectedAccountDefaultInSqlite } from "./account-default-intent-local-recovery-commit";
import { productionFinancialActionHashProvider } from "./account-balance-command-production";
import { getCurrentUserDataScope } from "./user-data-access";
import type { Account, FinancialActionGroup } from "@monyvi/db";
import {
  runWithAccountSyncAckExclusion,
  assertAccountSyncAckScopeCurrent,
  verifiedAccountMetadataCoverage,
  verifiedOwnedSyncRowCoverage,
  snapshotDeferredAccountRejections,
  type AccountSyncAckCapability,
  type DeferredAccountRejection,
} from "./sync/account-sync-ack-scope";
import {
  loadAccountActionProtection,
  matchesAcceptedAddAccountPostimage,
  matchesAcceptedAddAccountCorePostimage,
  acceptedAddAccountResidualColumns,
  matchesAcceptedAddAccountImmutableIdentity,
} from "./sync/account-action-protection";
import { prepareOwnedFinancialActionRootPull } from "./sync/financial-action-root-pull";
import { isAdmissiblePendingAccountMetadataPull } from "./sync/account-metadata-patch";
import { isAdmissiblePendingAddPriorDefaultPull } from "./sync/pending-add-default-pull";
import { acceptedAddMembersStillMatch } from "./sync/terminal-account-add-ack";

export const SYNC_ERROR_CODES = {
  AUTH_SCOPE_LOST: "sync_auth_scope_lost",
  LEGACY_METAL_CHAIN_UNSAFE: "sync_legacy_metal_chain_unsafe",
} as const;

async function assertExpectedSyncUser(expectedUserId: string): Promise<void> {
  const currentUserId = await getCurrentUserId();
  if (currentUserId !== expectedUserId) {
    throw new Error(SYNC_ERROR_CODES.AUTH_SCOPE_LOST);
  }
}

const WRITER_HOOK_MARKER = "monyvi/watermelon-sync-writer-guards/0.28.0/v1";

function mustHaveProtectedSdk(): void {
  if (MONYVI_SYNC_WRITER_GUARDS !== WRITER_HOOK_MARKER) {
    throw new Error("account_sync_ack_missing_required_sdk_writer_hooks");
  }
}

async function assertOwnerAndScope(
  capability: AccountSyncAckCapability,
  db: Database,
  ownerId: string
): Promise<void> {
  assertAccountSyncAckScopeCurrent(capability, db, ownerId);
  await assertExpectedSyncUser(ownerId);
  assertAccountSyncAckScopeCurrent(capability, db, ownerId);
}

type PullResult = SyncPullResult;
export interface ProtectedAccountSynchronization {
  readonly database: Database;
  readonly expectedOwnerId: string;
  readonly pullChanges: (lastPulledAt: number | null) => Promise<PullResult>;
  readonly pushChanges: (
    args: SyncPushArgs,
    capability: AccountSyncAckCapability
  ) => Promise<SyncPushResult | void | undefined>;
}

function newRejectedIds(): Record<string, string[]> {
  return {};
}
function hold(into: Record<string, string[]>, table: string, id: string): void {
  const group = into[table] ?? [];
  if (!group.includes(id)) group.push(id);
  into[table] = group;
}
/** Narrow an SDK change-map member without fabricating branded table keys. */
function isSyncRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isSyncRecordArray(
  value: unknown
): value is Array<Record<string, unknown>> {
  return Array.isArray(value) && value.every(isSyncRecord);
}
function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item: unknown) => typeof item === "string")
  );
}
interface ValidatedSdkTableChanges {
  readonly created: Array<Record<string, unknown>>;
  readonly updated: Array<Record<string, unknown>>;
  readonly deleted: string[];
}
function sdkTableChanges(
  changes: SyncDatabaseChangeSet,
  table: string
): ValidatedSdkTableChanges | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(changes, table);
  if (!descriptor) return undefined;
  const raw: unknown = descriptor.value;
  if (
    !isSyncRecord(raw) ||
    !isSyncRecordArray(raw.created) ||
    !isSyncRecordArray(raw.updated) ||
    !isStringArray(raw.deleted)
  )
    throw new Error("account_sync_invalid_sdk_table_changes");
  return {
    created: raw.created,
    updated: raw.updated,
    deleted: raw.deleted,
  };
}
function sdkRejectedTableIds(
  rejected: SyncRejectedIds,
  table: string
): readonly string[] {
  const descriptor = Object.getOwnPropertyDescriptor(rejected, table);
  if (!descriptor) return [];
  const raw: unknown = descriptor.value;
  if (!isStringArray(raw))
    throw new Error("account_sync_invalid_sdk_rejected_ids");
  return raw;
}
function setSdkMember(
  destination: SyncDatabaseChangeSet,
  table: string,
  changes: SyncTableChangeSet
): void {
  Object.defineProperty(destination, table, {
    value: changes,
    configurable: true,
    enumerable: true,
    writable: true,
  });
}
function combinedRejections(
  original: SyncRejectedIds,
  additional: Record<string, string[]>
): SyncRejectedIds {
  const combined: SyncRejectedIds = {};
  const insert = (table: string, ids: readonly string[]): void => {
    const retained = sdkRejectedTableIds(combined, table);
    Object.defineProperty(combined, table, {
      value: [...new Set([...retained, ...ids])],
      configurable: true,
      enumerable: true,
      writable: true,
    });
  };
  for (const table of Object.keys(original))
    insert(table, sdkRejectedTableIds(original, table));
  for (const [table, ids] of Object.entries(additional)) insert(table, ids);
  return combined;
}
function capturedRows(
  changes: SyncDatabaseChangeSet,
  table: string
): ReadonlyArray<Readonly<Record<string, unknown>>> {
  const value = sdkTableChanges(changes, table);
  return value ? [...value.created, ...value.updated] : [];
}
function capturedIds(
  changes: SyncDatabaseChangeSet,
  table: string
): readonly string[] {
  return [
    ...capturedRows(changes, table).flatMap((row) =>
      typeof row.id === "string" ? [row.id] : []
    ),
    ...(sdkTableChanges(changes, table)?.deleted ?? []),
  ];
}

function copyAccountRow(
  row: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> {
  return { ...row };
}

/**
 * Same-image omission is permitted only when every cloud field is equal to
 * the current physical Watermelon row. Unknown/missing fields, a newer local
 * edit or a different canonical server image must fail, not advance a pull
 * checkpoint behind the original change.
 */
function identicalRemotePhysicalImage(
  localRaw: Readonly<Record<string, unknown>>,
  remote: Readonly<Record<string, unknown>>
): boolean {
  const physical = Object.entries(localRaw).filter(
    ([key]) => key !== "_status" && key !== "_changed"
  );
  if (physical.length !== Object.keys(remote).length) return false;
  return physical.every(
    ([key, value]) =>
      Object.prototype.hasOwnProperty.call(remote, key) &&
      Object.is(value, remote[key])
  );
}

/**
 * A positive incoming Add receipt is authorized only while the original SDK
 * pull writer holds the original actor/database capability. No ACK authority
 * is derived from a dirty bit, a clock, or a remote "accepted" label alone.
 */
interface BoundIncomingAddAcceptance {
  readonly local: Readonly<Record<string, unknown>>;
  readonly remote: Readonly<Record<string, unknown>>;
}

/** Use the actual SDK captured/pulled raw-row contract, never an untyped hook. */
type SdkConflictRow = SyncTableChangeSet["updated"][number];

function sameCapturedScalars(
  left: Readonly<Record<string, unknown>>,
  right: Readonly<Record<string, unknown>>
): boolean {
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(right, key) &&
        Object.is(left[key], right[key])
    )
  );
}

async function admitPullInsideWriter(
  database: Database,
  capability: AccountSyncAckCapability,
  ownerId: string,
  incoming: SyncDatabaseChangeSet,
  verifiedIncomingAddRoots: Map<string, BoundIncomingAddAcceptance>
): Promise<SyncDatabaseChangeSet> {
  verifiedIncomingAddRoots.clear();
  await assertOwnerAndScope(capability, database, ownerId);
  const financialRoots = sdkTableChanges(incoming, "financial_action_groups");
  const rootProjection = financialRoots
    ? await prepareOwnedFinancialActionRootPull({
        database,
        expectedOwnerId: ownerId,
        changes: financialRoots,
      })
    : null;
  // Only the actual application writer may combine an incoming positively
  // accepted root with its already prepared, *current* local postimages.
  // The previous local-only catalog cannot infer a lost RPC response.
  const catalog = await loadAccountActionProtection({
    database,
    expectedOwnerId: ownerId,
    capability,
    writerProjectedAcceptedRoots: rootProjection?.updated.map((row) => ({
      ...row,
    })),
  });

  // A prewriter cloud projection carries no authority to replace a live
  // optimistic protected postimage. Every candidate is checked against
  // current physical ownership INSIDE the original SDK application writer.
  const guardedChanges: SyncDatabaseChangeSet = { ...incoming };
  for (const table of [
    "accounts",
    "bank_details",
    "account_sms_senders",
  ] as const) {
    const change = sdkTableChanges(incoming, table);
    if (!change) continue;
    const admittedCreated: Array<Record<string, unknown>> = [];
    const admittedUpdated: Array<Record<string, unknown>> = [];
    for (const kind of ["created", "updated"] as const) {
      for (const raw of change[kind]) {
        if (typeof raw !== "object" || raw === null || Array.isArray(raw))
          throw new Error("account_sync_pull_invalid_postimage");
        const remote: Record<string, unknown> = raw;
        const id = remote.id;
        if (typeof id !== "string")
          throw new Error("account_sync_pull_id_invalid");
        const historical =
          (table === "accounts" &&
            (catalog.createdAccountIds.has(id) ||
              catalog.priorDefaultIds.has(id))) ||
          catalog.createdChildIds[table]?.has(id) === true;
        if (!historical) {
          (kind === "created" ? admittedCreated : admittedUpdated).push(remote);
          continue;
        }
        const local = await database
          .get(table)
          .find(id)
          .catch(() => null);
        if (!local)
          throw new Error("account_sync_pull_missing_owned_postimage");
        // Project the exact own physical fields for read-only admission.
        // No type assertion, inferred authority, or mutation of Watermelon raw.
        const localRaw: Readonly<Record<string, unknown>> = Object.fromEntries(
          Object.entries(local._raw)
        );
        if (table === "accounts" && localRaw.user_id !== ownerId) {
          throw new Error("account_sync_pull_default_conflict");
        }
        if (localRaw._status === "synced") {
          (kind === "created" ? admittedCreated : admittedUpdated).push(remote);
          continue;
        }
        // A pending owned NON-FINANCIAL metadata change (the legitimate Edit
        // default replacement) keeps the local dirty value authoritative until
        // the owner's positive owner-filtered UPDATE is acknowledged, which is
        // what the existing transport already intends. The remote row is
        // handed to the normal SDK resolver UNMODIFIED: it is never omitted
        // and never ACK-ed here, so the SDK's per-dirty-column local-wins
        // rule keeps the pending value.
        if (
          table === "accounts" &&
          isAdmissiblePendingAccountMetadataPull(
            localRaw,
            remote,
            catalog,
            ownerId
          )
        ) {
          (kind === "created" ? admittedCreated : admittedUpdated).push(remote);
          continue;
        }
        // A pending Add owns exactly ONE optimistic prior-default clear. That
        // clear is applied only by the Add's own authoritative RPC, so the
        // UNMODIFIED remote row is handed to the stock SDK dirty-column merge
        // and the pending local flag stays authoritative until the Add's own
        // positive receipt. This is never an acknowledgement.
        if (
          table === "accounts" &&
          isAdmissiblePendingAddPriorDefaultPull({
            local: localRaw,
            remote,
            proof: catalog.pendingAddPriorDefaultProofs.get(id),
            expectedOwnerId: ownerId,
          })
        ) {
          (kind === "created" ? admittedCreated : admittedUpdated).push(remote);
          continue;
        }
        if (
          table === "accounts" &&
          typeof remote.is_default === "boolean" &&
          remote.is_default !== localRaw.is_default
        ) {
          throw new Error("account_sync_pull_default_conflict");
        }
        const creatorOwned =
          (table === "accounts" && catalog.acceptedAccountIds.has(id)) ||
          (table !== "accounts" &&
            typeof localRaw.account_id === "string" &&
            catalog.acceptedAccountIds.has(localRaw.account_id));
        const matchingAccountEcho =
          table === "accounts" &&
          creatorOwned &&
          matchesAcceptedAddAccountPostimage(catalog, remote) &&
          matchesAcceptedAddAccountCorePostimage(catalog, localRaw) &&
          localRaw._status === "created";
        const initialChild = catalog.acceptedChildPostimages[table]?.get(id);
        const cloudChildIsOriginal =
          initialChild !== undefined &&
          creatorOwned &&
          localRaw._status === "created" &&
          remote.account_id === initialChild.account_id &&
          remote.created_at === initialChild.created_at &&
          Object.entries(initialChild).every(
            ([key, value]) => (remote[key] ?? null) === (value ?? null)
          ) &&
          localRaw.account_id === initialChild.account_id &&
          localRaw.created_at === initialChild.created_at;
        const sameImage = identicalRemotePhysicalImage(localRaw, remote);
        const verifiedDefault =
          table === "accounts" &&
          localRaw._status === "updated" &&
          catalog.provedActionOwnedDefaultIds.has(id) &&
          localRaw._changed === "is_default" &&
          remote.is_default === localRaw.is_default &&
          sameImage;
        if (
          !(
            ((matchingAccountEcho || cloudChildIsOriginal) &&
              Object.keys(remote).length ===
                Object.keys(localRaw).filter(
                  (key) => key !== "_status" && key !== "_changed"
                ).length) ||
            verifiedDefault
          )
        ) {
          throw new Error("account_sync_pull_unresolved_local_postimage");
        }
        // Omission is safe only for this positively identical canonical
        // echo. Other data, account edits, root/private evidence or remote
        // tombstones never inherit the omission decision.
      }
    }
    const admittedDeleted: string[] = [];
    for (const rawId of change.deleted) {
      if (typeof rawId !== "string")
        throw new Error("account_sync_pull_id_invalid");
      const protectedId =
        table === "accounts"
          ? catalog.createdAccountIds.has(rawId) ||
            catalog.priorDefaultIds.has(rawId)
          : catalog.createdChildIds[table]?.has(rawId) === true;
      if (protectedId) throw new Error("account_sync_pull_protected_tombstone");
      admittedDeleted.push(rawId);
    }
    setSdkMember(guardedChanges, table, {
      created: admittedCreated,
      updated: admittedUpdated,
      deleted: admittedDeleted,
    });
  }

  await assertOwnerAndScope(capability, database, ownerId);
  // The dedicated pull has already authenticated the incoming immutable
  // tuple; the writer catalog additionally checked the exact SQL091 Add
  // acceptance receipt and current physical ownership. Capture BOTH images
  // before the SDK's ordinary conflict resolver touches locally dirty rows.
  for (const remote of rootProjection?.updated ?? []) {
    if (
      remote.state !== "accepted" ||
      typeof remote.id !== "string" ||
      typeof remote.action_id !== "string"
    )
      continue;
    const proof = catalog.roots.find(
      (root) =>
        root.terminalAccepted &&
        root.physicalRootId === remote.id &&
        root.actionId === remote.action_id &&
        root.ownerId === ownerId &&
        root.payloadHash === remote.payload_hash &&
        root.payloadJson === remote.payload_json
    );
    if (!proof) continue;
    const local = await database
      .get<FinancialActionGroup>("financial_action_groups")
      .find(proof.physicalRootId)
      .catch(() => null);
    if (
      !local ||
      local.userId !== ownerId ||
      local.actionId !== proof.actionId ||
      local.id !== proof.physicalRootId ||
      local.payloadHash !== proof.payloadHash ||
      local.payloadJson !== proof.payloadJson
    ) {
      throw new Error("account_sync_pull_bound_root_changed");
    }
    if (
      !["local_complete", "sync_pending", "sync_failed"].includes(local.state)
    )
      continue;
    const originalRaw = { ...local._raw };
    // The receipt alone cannot establish accepted nonzero Add postimages.
    // Refuse the entire pull before SDK applies it or advances a checkpoint.
    if (
      !(await acceptedAddMembersStillMatch(database, ownerId, local, catalog))
    )
      throw new Error("account_sync_pull_bound_add_members_changed");
    await assertOwnerAndScope(capability, database, ownerId);
    if (!sameCapturedScalars(local._raw, originalRaw))
      throw new Error("account_sync_pull_bound_root_changed");
    verifiedIncomingAddRoots.set(local.id, {
      local: { ...local._raw },
      remote: { ...remote },
    });
  }
  await assertOwnerAndScope(capability, database, ownerId);
  return rootProjection
    ? { ...guardedChanges, financial_action_groups: rootProjection }
    : guardedChanges;
}

async function protectAckInsideWriter(
  database: Database,
  capability: AccountSyncAckCapability,
  ownerId: string,
  captured: SyncDatabaseChangeSet,
  alreadyRejected: SyncRejectedIds
): Promise<SyncRejectedIds> {
  await assertOwnerAndScope(capability, database, ownerId);
  const catalog = await loadAccountActionProtection({
    database,
    expectedOwnerId: ownerId,
    capability,
  });
  const extra = newRejectedIds();
  for (const [table, ids] of Object.entries(catalog.losingIds)) {
    for (const id of ids) {
      if (capturedIds(captured, table).includes(id)) hold(extra, table, id);
    }
  }
  const capturedRootRows = capturedRows(captured, "financial_action_groups");
  const capturedRootIds = new Set(
    capturedIds(captured, "financial_action_groups")
  );
  for (const root of catalog.roots) {
    if (root.terminalAccepted) {
      if (!capturedRootIds.has(root.physicalRootId)) continue;
      const current = await database
        .get<FinancialActionGroup>("financial_action_groups")
        .find(root.physicalRootId)
        .catch(() => null);
      if (!current) {
        hold(extra, "financial_action_groups", root.physicalRootId);
        continue;
      }
      if (
        current.domain !== "accounts" ||
        current.kind !== "create_with_default"
      )
        continue;
      const matches = capturedRootRows.filter(
        (row) => row.id === root.physicalRootId
      );
      const capturedRoot = matches[0];
      const bound =
        matches.length === 1 &&
        capturedRoot !== undefined &&
        root.ownerId === ownerId &&
        current.userId === ownerId &&
        current.actionId === root.actionId &&
        current.payloadHash === root.payloadHash &&
        current.payloadJson === root.payloadJson &&
        current.state === root.state &&
        sameCapturedScalars(current._raw, capturedRoot);
      // This runs in the SDK's final authenticated ACK writer, AFTER push.
      // An accepted receipt never excuses mutated opening effects or children.
      if (
        !bound ||
        !(await acceptedAddMembersStillMatch(
          database,
          ownerId,
          current,
          catalog
        ))
      )
        hold(extra, "financial_action_groups", root.physicalRootId);
      await assertOwnerAndScope(capability, database, ownerId);
      if (!capturedRoot || !sameCapturedScalars(current._raw, capturedRoot))
        hold(extra, "financial_action_groups", root.physicalRootId);
      continue;
    }
    // Reconciled Add compensation uses its separately verified private proof.
    if (root.locallyCompensated) continue;
    if (capturedRootIds.has(root.physicalRootId))
      hold(extra, "financial_action_groups", root.physicalRootId);
  }
  for (const row of capturedRows(captured, "accounts")) {
    if (typeof row.id !== "string") continue;
    const isHistorical =
      catalog.createdAccountIds.has(row.id) ||
      catalog.priorDefaultIds.has(row.id);
    const changed =
      typeof row._changed === "string"
        ? row._changed.split(",").filter(Boolean)
        : [];
    const ordinaryDefaultEdit =
      !isHistorical &&
      row._status === "updated" &&
      changed.includes("is_default");
    if (!isHistorical && !ordinaryDefaultEdit) continue;
    const covered = verifiedAccountMetadataCoverage(
      capability,
      database,
      ownerId,
      row
    );
    const creatorAccepted = catalog.acceptedAccountIds.has(row.id);
    const isCreated = row._status === "created";
    const creatorProof =
      creatorAccepted &&
      matchesAcceptedAddAccountImmutableIdentity(catalog, row) &&
      (matchesAcceptedAddAccountCorePostimage(catalog, row) ||
        (covered.has("balance") && covered.has("financial_revision")));
    const permittedResidual = isCreated
      ? acceptedAddAccountResidualColumns(catalog, row)
      : [];
    const ownsInitialDefaultCorrection =
      catalog.provedActionOwnedDefaultIds.has(row.id) &&
      changed.includes("is_default");
    const complete = isCreated
      ? creatorProof && permittedResidual.every((key) => covered.has(key))
      : changed.every(
          (column) =>
            covered.has(column) ||
            // The verified exact Add-owned prior-default postimage also
            // covers its accompanying automatic updated_at. A stand-alone
            // clock or a newer postimage never receives that authority.
            (ownsInitialDefaultCorrection &&
              (column === "is_default" || column === "updated_at"))
        );
    if (
      !complete ||
      (catalog.unsafeDefaultIds.has(row.id) && changed.includes("is_default"))
    ) {
      hold(extra, "accounts", row.id);
    }
    const current = await database.get<Account>("accounts").find(row.id);
    if (
      current.userId !== ownerId ||
      JSON.stringify(current._raw) !== JSON.stringify(copyAccountRow(row))
    )
      hold(extra, "accounts", row.id);
  }

  // Created child rows contain no _changed fields. The verified original
  // Add child baseline plus positive owner+parent+ID remote residual patches
  // is the only basis for their full SDK created-row ACK.
  for (const table of ["bank_details", "account_sms_senders"] as const) {
    for (const row of capturedRows(captured, table)) {
      if (typeof row.id !== "string") continue;
      const original = catalog.acceptedChildPostimages[table]?.get(row.id);
      if (!original) continue;
      const ownedParent = original.account_id;
      const current = await database.get(table).find(row.id);
      const immutableCorrect =
        typeof ownedParent === "string" &&
        catalog.acceptedAccountIds.has(ownedParent) &&
        row.account_id === ownedParent &&
        row.created_at === original.created_at;
      const covered = verifiedOwnedSyncRowCoverage(
        capability,
        database,
        ownerId,
        table,
        row
      );
      const editable =
        table === "bank_details"
          ? ["account_number", "card_last_4", "deleted"]
          : ["sender_name", "normalized_sender_name", "deleted"];
      const required =
        row._status === "created"
          ? editable.filter(
              (column) => (row[column] ?? null) !== (original[column] ?? null)
            )
          : typeof row._changed === "string"
            ? row._changed.split(",").filter(Boolean)
            : [];
      if (
        !immutableCorrect ||
        !required.every((column) => covered.has(column)) ||
        JSON.stringify(current._raw) !== JSON.stringify(row)
      )
        hold(extra, table, row.id);
    }
  }
  // Losing real tombstones must survive even if the action root has become
  // physically clean, including deleted IDs in SDK's final ACK captured set.
  for (const table of [
    "accounts",
    "bank_details",
    "account_sms_senders",
  ] as const) {
    for (const id of sdkTableChanges(captured, table)?.deleted ?? []) {
      if (
        catalog.losingIds[table]?.has(id) ||
        (table === "accounts" && catalog.createdAccountIds.has(id))
      ) {
        hold(extra, table, id);
      }
    }
  }
  await assertOwnerAndScope(capability, database, ownerId);
  return combinedRejections(alreadyRejected, extra);
}

/**
 * The ONLY production SDK hook factory. Real synchronize() owns both writer
 * boundaries and the final raw-record equality/ACK; no engine mock or monkey
 * patch is installed here.
 */
export async function synchronizeWithProtectedAccountActions(
  input: ProtectedAccountSynchronization
): Promise<readonly DeferredAccountRejection[]> {
  mustHaveProtectedSdk();
  const { database, expectedOwnerId } = input;
  return runWithAccountSyncAckExclusion(
    database,
    expectedOwnerId,
    async (capability): Promise<readonly DeferredAccountRejection[]> => {
      const verifiedIncomingAddRoots = new Map<
        string,
        BoundIncomingAddAcceptance
      >();
      await assertOwnerAndScope(capability, database, expectedOwnerId);
      await synchronize({
        database,
        pullChanges: ({ lastPulledAt }) =>
          input.pullChanges(lastPulledAt ?? null),
        pushChanges: (args) => input.pushChanges(args, capability),
        sendCreatedAsUpdated: true,
        beforeApplyRemoteChangesInWriter: (changes) =>
          admitPullInsideWriter(
            database,
            capability,
            expectedOwnerId,
            changes,
            verifiedIncomingAddRoots
          ),
        conflictResolver: (
          table: string,
          local: SdkConflictRow,
          remote: SdkConflictRow,
          resolved: SdkConflictRow
        ): SdkConflictRow => {
          if (table !== "financial_action_groups") return resolved;
          const localCandidate: unknown = local;
          if (
            !isSyncRecord(localCandidate) ||
            typeof localCandidate.id !== "string"
          )
            return resolved;
          const proof = verifiedIncomingAddRoots.get(localCandidate.id);
          if (!proof) return resolved;
          const remoteCandidate: unknown = remote;
          if (!isSyncRecord(remoteCandidate))
            throw new Error("account_sync_pull_bound_root_conflict");
          const acceptedOutcomeJson: unknown = remoteCandidate.outcome_json;
          assertAccountSyncAckScopeCurrent(
            capability,
            database,
            expectedOwnerId
          );
          if (
            !sameCapturedScalars(localCandidate, proof.local) ||
            !sameCapturedScalars(remoteCandidate, proof.remote) ||
            localCandidate.user_id !== expectedOwnerId ||
            localCandidate.action_id !== remoteCandidate.action_id ||
            localCandidate.payload_hash !== remoteCandidate.payload_hash ||
            localCandidate.payload_json !== remoteCandidate.payload_json ||
            remoteCandidate.state !== "accepted" ||
            remoteCandidate.server_outcome !== "accepted" ||
            remoteCandidate.rejection_code !== null ||
            (acceptedOutcomeJson !== null &&
              typeof acceptedOutcomeJson !== "string") ||
            resolved.local_recovery_snapshot_json !==
              localCandidate.local_recovery_snapshot_json
          )
            throw new Error("account_sync_pull_bound_root_conflict");
          // Only the verified terminal outcome fields cross together.
          // Retain SDK conflict status/dirty bits, original device-private
          // evidence, and the stock final captured-row equality test.
          return {
            ...resolved,
            state: "accepted",
            server_outcome: "accepted",
            outcome_json: acceptedOutcomeJson,
            rejection_code: null,
          };
        },
        beforePullCheckpointInWriter: () =>
          assertOwnerAndScope(capability, database, expectedOwnerId),
        beforeMarkLocalChangesAsSyncedInWriter: (changes, rejectedIds) =>
          protectAckInsideWriter(
            database,
            capability,
            expectedOwnerId,
            changes,
            rejectedIds
          ),
      });
      await assertOwnerAndScope(capability, database, expectedOwnerId);
      return snapshotDeferredAccountRejections(
        capability,
        database,
        expectedOwnerId
      );
    }
  );
}

/**
 * Internal post-SDK-ACK entry. A queued action ID is only a hint: the original
 * physical root/owner/bytes/hash are mandatory through the dedicated writer.
 */
export async function applyDeferredRejections(
  database: Database,
  ownerId: string,
  hints: readonly DeferredAccountRejection[]
): Promise<void> {
  for (const hint of hints) {
    await assertExpectedSyncUser(ownerId);
    // The hint is not an authority; independently locate the original owner,
    // physical local root ID and immutable payload bytes/hash after ACK.
    const scope = await getCurrentUserDataScope();
    if (scope.userId !== ownerId)
      throw new Error(SYNC_ERROR_CODES.AUTH_SCOPE_LOST);
    const found = await scope
      .queryOwned(
        database.get<FinancialActionGroup>("financial_action_groups"),
        Q.where("action_id", hint.actionId)
      )
      .fetch();
    if (
      found.length !== 1 ||
      found[0]?.id !== hint.physicalRootId ||
      found[0]?.userId !== ownerId ||
      found[0]?.payloadHash !== hint.payloadHash ||
      found[0]?.payloadJson !== hint.payloadJson ||
      !["rejected_compensating", "reconciliation_incomplete"].includes(
        found[0]?.state ?? ""
      )
    )
      continue;
    // Dedicated compensation acquires its own exclusive capability in the
    // recovery owner's implementation, AFTER this synchronize scope released.
    try {
      await reconcileRejectedAccountDefaultInSqlite({
        database,
        hashProvider: productionFinancialActionHashProvider,
        actionId: hint.actionId,
        expectedOwnerId: hint.ownerId,
        expectedPhysicalRootId: hint.physicalRootId,
        expectedPayloadHash: hint.payloadHash,
        expectedPayloadJson: hint.payloadJson,
      });
    } catch {
      logger.warn("sync.addRecoveryDeferred", { actionId: hint.actionId });
    }
  }
}

/** Keep the #395 guarded SDK writer as the ONLY sync path.
 * PR385's full-pull receipt is stamped only after this protected operation.
 */
const mainSync = createProtectedHistoricalSync({
  synchronize: synchronizeWithProtectedAccountActions,
  applyDeferred: applyDeferredRejections,
  assertOwner: assertExpectedSyncUser,
});
/** Current in-flight sync promise, awaited by logout before scope reset. */
export const getActiveSyncPromise = mainSync.getActiveSyncPromise;
/** Protected WatermelonDB SDK sync with PR385's retryable historical receipt. */
export const syncDatabase = mainSync.syncDatabase;

/**
 * Get the last sync timestamp.
 */
export function getLastSyncTimestamp(): number | null {
  return null;
}
