/**
 * #395 pending Add prior-default pull admission.
 *
 * A pending (not yet accepted) `account.create-default/v1` Add owns exactly ONE
 * optimistic prior-default clear. That clear belongs to the Add action itself:
 * it may only be applied by the Add's own authoritative server RPC, never by an
 * independent metadata UPDATE and never by a locally invented ACK.
 *
 * While that Add is still pending, the cloud legitimately still reports the
 * prior account as default, so the ordinary stock pull guard aborts the whole
 * sync BEFORE the Add RPC can run. This module proves that ONE exact pending
 * Add owns the local prior-default clear and admits the UNMODIFIED remote row
 * of that account into the stock SDK dirty-column merge, so the pending local
 * flag stays authoritative until the Add's own positive receipt arrives.
 *
 * It never acknowledges a row, never writes, never mutates, omits or rewrites a
 * remote row, never relaxes the ordinary metadata planner, the losing/unsafe
 * catalog guards, the protected financial fields or the transport semantics.
 */
import type { AccountCreateDefaultPayload } from "../../../../packages/logic/src/financial-actions/account-create-default";
import type { AccountCreateDefaultLocalRecoverySnapshot } from "../../../../packages/logic/src/financial-actions/account-create-default-local-recovery";

/**
 * Root states that may still own a pending prior-default clear. A terminal,
 * accepted, rejected, stale or reconciling root never owns a pending clear.
 */
export const PENDING_ADD_ROOT_STATES = [
  "local_complete",
  "sync_pending",
  "sync_failed",
] as const;

export type PendingAddRootState = (typeof PENDING_ADD_ROOT_STATES)[number];

export function isPendingAddRootState(
  value: string
): value is PendingAddRootState {
  return (PENDING_ADD_ROOT_STATES as readonly string[]).includes(value);
}

/**
 * A positively proven pending-Add prior-default clear.
 *
 * Every member is bound to the authenticated immutable root, its parsed
 * device-private recovery snapshot and the exact physical local postimage of
 * that one prior-default account.
 */
export interface PendingAddPriorDefaultProof {
  /** The prior-default account whose clear this Add owns. */
  readonly accountId: string;
  readonly ownerId: string;
  readonly actionId: string;
  readonly physicalRootId: string;
  readonly payloadHash: string;
  readonly rootState: PendingAddRootState;
  /** The Add's own prepared postimage hash for that prior-default row. */
  readonly expectedPostimageHash: string;
  /** The proven physical local image of that row, without SDK bookkeeping. */
  readonly provenPhysicalFields: Readonly<Record<string, unknown>>;
}

/** One pending Add root with its parsed private recovery snapshot. */
export interface PendingAddPriorDefaultCandidate {
  readonly actionId: string;
  readonly physicalRootId: string;
  readonly payloadHash: string;
  readonly rootState: PendingAddRootState;
  readonly payload: AccountCreateDefaultPayload;
  readonly snapshot: AccountCreateDefaultLocalRecoverySnapshot;
}

/**
 * The immutable identity an accepted creator bound to one owned account.
 * The financial core may advance; this identity may not.
 */
export interface AcceptedCreatorIdentity {
  readonly ownerId: string;
  readonly type: string;
  readonly currency: string;
  readonly createdAt: number;
}

/** The current physical facts of one owned prior-default row. */
export interface PendingAddPriorDefaultRow {
  readonly id: string;
  readonly userId: string;
  readonly deleted: boolean;
  readonly isDefault: boolean;
  readonly type: string;
  readonly currency: string;
  readonly financialRevision: string;
  readonly createdAt: number;
  readonly status: string;
  readonly changedColumns: readonly string[];
  /** The hash of the physical local postimage, excluding SDK bookkeeping. */
  readonly physicalHash: string;
  /** The physical local image, excluding SDK bookkeeping. */
  readonly physicalFields: Readonly<Record<string, unknown>>;
}

function changedColumns(
  record: Readonly<Record<string, unknown>>
): ReadonlySet<string> {
  if (typeof record._changed !== "string") return new Set<string>();
  return new Set(record._changed.split(",").filter(Boolean));
}

/**
 * Build the positive proof set for pending Adds that own a prior-default
 * clear.
 *
 * A proof exists only when the immutable owned root, its parsed private
 * recovery snapshot and the exact physical local postimage all agree on ONE
 * prior-default account, that account's clear is the Add's own true->false
 * update, and exactly ONE unresolved root claims that account. A legitimate
 * ACCEPTED historical clear is not a competing claim: an accepted creator or
 * an earlier accepted clear never blocks a later genuine pending clear.
 */
export async function buildPendingAddPriorDefaultProofs(input: {
  readonly candidates: readonly PendingAddPriorDefaultCandidate[];
  /**
   * Unresolved (not accepted, not compensated) prior-default clear claims,
   * keyed by the claimed account id.
   */
  readonly unresolvedClaims: ReadonlyMap<string, readonly string[]>;
  /** Accounts that are a losing or unresolved creation, never a prior default. */
  readonly losingAccountIds: ReadonlySet<string>;
  readonly acceptedCreatorIdentities: ReadonlyMap<
    string,
    AcceptedCreatorIdentity
  >;
  readonly expectedOwnerId: string;
  readonly loadPriorAccount: (
    accountId: string
  ) => Promise<PendingAddPriorDefaultRow | null>;
}): Promise<ReadonlyMap<string, PendingAddPriorDefaultProof>> {
  const proofs = new Map<string, PendingAddPriorDefaultProof>();
  for (const candidate of input.candidates) {
    const prior = candidate.snapshot.priorDefault;
    if (prior === null) continue;
    const priorId = prior.accountId;
    // Exactly ONE unresolved root may own this prior-default clear, and it
    // must be this candidate's own bound root.
    const claims = input.unresolvedClaims.get(priorId) ?? [];
    if (claims.length !== 1 || claims[0] !== candidate.actionId) continue;
    // A losing or unresolved creation is never a legitimate prior default.
    if (input.losingAccountIds.has(priorId)) continue;
    const clears = candidate.payload.domainMutation.records.filter(
      (record) => record.entity === "account_default"
    );
    if (clears.length !== 1) continue;
    const clear = clears[0];
    if (
      !clear ||
      clear.after.id !== priorId ||
      clear.after.isDefault !== false ||
      clear.expectedIsDefault !== true
    )
      continue;
    if (
      candidate.payload.expectedDefaultSnapshot.defaultAccount?.accountId !==
      priorId
    )
      continue;
    if (
      prior.preimage.isDefault !== true ||
      prior.postimage.isDefault !== false ||
      prior.transportPostimage.status !== "updated" ||
      !prior.transportPostimage.changedColumns.includes("is_default") ||
      prior.transportPostimage.changedColumns.some(
        (column) => column !== "is_default" && column !== "updated_at"
      )
    )
      continue;
    const row = await input.loadPriorAccount(priorId);
    if (
      !row ||
      row.id !== priorId ||
      row.userId !== input.expectedOwnerId ||
      row.deleted ||
      row.status !== "updated" ||
      row.currency !== prior.postimage.currency ||
      row.financialRevision !== prior.postimage.financialRevision ||
      row.isDefault !== false
    )
      continue;
    // An accepted creator keeps its immutable identity. Its financial core may
    // legitimately advance; only the current captured private postimage and
    // the current physical image may pin the values.
    const creator = input.acceptedCreatorIdentities.get(priorId);
    if (
      creator &&
      (row.userId !== creator.ownerId ||
        row.type !== creator.type ||
        row.currency !== creator.currency ||
        row.createdAt !== creator.createdAt)
    )
      continue;
    const dirty = row.changedColumns;
    if (!dirty.includes("is_default")) continue;
    if (
      dirty.some((column) => column !== "is_default" && column !== "updated_at")
    )
      continue;
    if (row.physicalHash !== prior.expectedPostimageHash) continue;
    proofs.set(
      priorId,
      Object.freeze({
        accountId: priorId,
        ownerId: input.expectedOwnerId,
        actionId: candidate.actionId,
        physicalRootId: candidate.physicalRootId,
        payloadHash: candidate.payloadHash,
        rootState: candidate.rootState,
        expectedPostimageHash: prior.expectedPostimageHash,
        provenPhysicalFields: row.physicalFields,
      })
    );
  }
  return proofs;
}

/**
 * Narrow admission of a pending Add's own prior-default clear.
 *
 * The remote row must be the SAME physical owned row with the SAME key shape
 * and identical values for every field that is not a pending dirty column. The
 * pending default flag may be either boolean on the UNMODIFIED remote row: the
 * genuine pending mismatch, or the server echo of the same clear. The remote
 * row is handed unchanged to the stock SDK dirty-column merge and the pending
 * local flag stays authoritative until the Add's own positive receipt. Equality
 * is never an acknowledgement.
 */
export function isAdmissiblePendingAddPriorDefaultPull(input: {
  readonly local: Readonly<Record<string, unknown>>;
  readonly remote: Readonly<Record<string, unknown>>;
  readonly proof: PendingAddPriorDefaultProof | undefined;
  readonly expectedOwnerId: string;
}): boolean {
  const { local, remote, proof, expectedOwnerId } = input;
  if (!proof) return false;
  if (proof.ownerId !== expectedOwnerId) return false;
  if (local.id !== proof.accountId) return false;
  if (remote.id !== proof.accountId) return false;
  if (local.user_id !== expectedOwnerId) return false;
  if (remote.user_id !== expectedOwnerId) return false;
  // Only an UPDATED row can carry the pending optimistic clear.
  if (local._status !== "updated") return false;
  if (local.deleted !== false) return false;
  if (remote.deleted !== false) return false;
  const dirty = changedColumns(local);
  if (!dirty.has("is_default")) return false;
  for (const column of dirty) {
    if (column !== "is_default" && column !== "updated_at") return false;
  }
  // The pending local flag is the Add's own clear target. The cloud may still
  // hold the captured default or may already echo the same clear; both are the
  // same unchanged physical row.
  if (local.is_default !== false) return false;
  if (typeof remote.is_default !== "boolean") return false;
  // The remote row must be the same physical row: identical key shape and
  // identical values for every field that is not a pending dirty column.
  const provenKeys = Object.keys(proof.provenPhysicalFields).sort();
  const remoteKeys = Object.keys(remote).sort();
  if (provenKeys.length !== remoteKeys.length) return false;
  for (const key of provenKeys) {
    if (!remoteKeys.includes(key)) return false;
    if (key === "is_default" || key === "updated_at") continue;
    if (remote[key] !== proof.provenPhysicalFields[key]) return false;
  }
  // The proven local image must still be the current local image: any later
  // user edit invalidates the proof and keeps the ordinary guards in force.
  for (const key of provenKeys) {
    if (local[key] !== proof.provenPhysicalFields[key]) return false;
  }
  return true;
}
