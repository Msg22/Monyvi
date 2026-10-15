/** Initial namespace lifetime only; this is not persisted review/edit CAS. */
import type { ParsedSmsTransaction } from "@monyvi/logic";
import type { AccountReviewSession } from "../../../packages/logic/src/account-review/review-schemas";
import { canonicalUuid } from "../../../packages/logic/src/account-review/schema-primitives";

export interface OwnedSmsReviewQueueLease {
  readonly expectedUserId: AccountReviewSession["ownerId"];
  readonly queueId: string;
  readonly sessionId: AccountReviewSession["sessionId"];
  readonly leaseToken: string;
  readonly queueGeneration: string;
}

export type SmsReviewNamespaceDisposition =
  | "no_accepted_rows"
  | "cancelled"
  | "published"
  | "committed";

type ReceiptStatus = "active" | "published" | "settled" | "closed";
interface PublishedPin {
  holders: number;
}
interface NamespaceState {
  readonly ownerId: string;
  readonly queueId: string;
  readonly generation: string;
  readonly pending: Map<string, LeaseReceipt>;
  activeCount: number;
  publishedPin: PublishedPin | null;
  stopLifetime: (() => void) | null;
}
interface LeaseReceipt {
  readonly namespace: NamespaceState;
  readonly token: string;
  status: ReceiptStatus;
  detachAbort: (() => void) | null;
  readonly pendingCandidates: Set<ParsedSmsTransaction>;
}

// An app-local resource bound, not a provider quota or transaction-row limit.
// Publication retires operation authority; pending return/merge receipts also
// have a finite bound and explicit commit/cancel/reset/auth/expiry cleanup.
const MAX_PENDING_RECEIPTS = 128;
const receipts = new WeakMap<OwnedSmsReviewQueueLease, LeaseReceipt>();
const candidates = new WeakMap<ParsedSmsTransaction, LeaseReceipt>();
// This is a private object-identity proof, never a persisted session revision.
const publishedSessions = new WeakMap<AccountReviewSession, LeaseReceipt>();
let current: NamespaceState | null = null;
let sequence = 0n;
let lifecycleEpoch = 0n;

function nextIdentity(prefix: string): string {
  sequence += 1n;
  return `${prefix}:${sequence.toString()}`;
}
function matches(ownerId: string, queueId: string): boolean {
  return current?.ownerId === ownerId && current.queueId === queueId;
}
function stopLifetime(namespace: NamespaceState): void {
  const stop = namespace.stopLifetime;
  namespace.stopLifetime = null;
  stop?.();
}
function detachReceipt(receipt: LeaseReceipt): void {
  const detach = receipt.detachAbort;
  receipt.detachAbort = null;
  detach?.();
}
function invalidateCurrent(): void {
  lifecycleEpoch += 1n;
  const namespace = current;
  current = null;
  if (!namespace) return;
  for (const receipt of namespace.pending.values()) {
    receipt.status = "closed";
    receipt.pendingCandidates.clear();
    detachReceipt(receipt);
  }
  namespace.pending.clear();
  namespace.activeCount = 0;
  namespace.publishedPin = null;
  stopLifetime(namespace);
}

export function observeSmsReviewNamespaceActor(ownerId: string | null): void {
  if (current && current.ownerId !== ownerId) invalidateCurrent();
}
export function invalidateSmsReviewNamespace(
  ownerId: string,
  queueId: string
): void {
  if (matches(ownerId, queueId)) invalidateCurrent();
  else lifecycleEpoch += 1n;
}
export function captureSmsReviewNamespaceEpoch(): string {
  return lifecycleEpoch.toString();
}
export function assertSmsReviewNamespaceEpoch(epoch: string): void {
  if (epoch !== lifecycleEpoch.toString())
    throw new Error("sms_review_namespace_stale");
}
export function hasSmsReviewNamespacePin(
  ownerId: string,
  queueId: string
): boolean {
  return (
    matches(ownerId, queueId) &&
    current !== null &&
    (current.activeCount > 0 || (current.publishedPin?.holders ?? 0) > 0)
  );
}
export function assertSmsReviewNamespaceCapacity(
  ownerId: string,
  queueId: string
): void {
  if (
    matches(ownerId, queueId) &&
    current &&
    current.pending.size >= MAX_PENDING_RECEIPTS
  ) {
    throw new Error("sms_review_namespace_busy");
  }
}

export function registerSmsReviewNamespaceLease(
  ownerId: string,
  queueId: string
): OwnedSmsReviewQueueLease {
  const sessionId = canonicalUuid.parse(queueId);
  assertSmsReviewNamespaceCapacity(ownerId, queueId);
  if (!matches(ownerId, queueId)) {
    if (current) invalidateCurrent();
    current = {
      ownerId,
      queueId,
      generation: nextIdentity("sms-queue"),
      pending: new Map(),
      activeCount: 0,
      publishedPin: null,
      stopLifetime: null,
    };
  }
  const namespace = current;
  if (!namespace) throw new Error("sms_review_namespace_missing");
  const lease: OwnedSmsReviewQueueLease = Object.freeze({
    expectedUserId: ownerId,
    queueId,
    sessionId,
    leaseToken: nextIdentity("sms-operation"),
    queueGeneration: namespace.generation,
  });
  const receipt: LeaseReceipt = {
    namespace,
    token: lease.leaseToken,
    status: "active",
    detachAbort: null,
    pendingCandidates: new Set(),
  };
  namespace.activeCount += 1;
  namespace.pending.set(lease.leaseToken, receipt);
  receipts.set(lease, receipt);
  return lease;
}

function currentReceipt(lease: OwnedSmsReviewQueueLease): LeaseReceipt | null {
  const receipt = receipts.get(lease);
  if (
    !current ||
    !receipt ||
    receipt.namespace !== current ||
    receipt.status === "closed" ||
    lease.expectedUserId !== current.ownerId ||
    lease.queueId !== current.queueId ||
    lease.sessionId !== current.queueId ||
    lease.queueGeneration !== current.generation
  )
    return null;
  return receipt;
}

/** The only supported operationGeneration is a new session's initial "0".
 * This does NOT validate a persisted review revision or a T027 edited state. */
export function assertSmsReviewNamespaceOperation(
  lease: OwnedSmsReviewQueueLease,
  initialOperationGeneration?: AccountReviewSession["operationGeneration"]
): void {
  const receipt = currentReceipt(lease);
  if (
    receipt?.status !== "active" ||
    (initialOperationGeneration !== undefined &&
      initialOperationGeneration !== "0")
  ) {
    throw new Error("sms_review_namespace_stale");
  }
}
/** Bound published receipts cannot claim unrelated writers' commits.
 * An unbound legacy lease may release itself; that is NOT publication proof. */
export function assertSmsReviewNamespaceExplicitCommit(
  lease: OwnedSmsReviewQueueLease
): void {
  const receipt = currentReceipt(lease);
  if (receipt?.status === "published" && receipt.pendingCandidates.size > 0) {
    throw new Error("sms_review_namespace_not_committed");
  }
}

export function isSmsReviewNamespaceReceiptCurrent(
  lease: OwnedSmsReviewQueueLease
): boolean {
  const receipt = currentReceipt(lease);
  return receipt !== null && receipt.status !== "settled";
}
export function installSmsReviewNamespaceLifetime(
  lease: OwnedSmsReviewQueueLease,
  start: () => () => void
): void {
  const receipt = currentReceipt(lease);
  if (!receipt) throw new Error("sms_review_namespace_stale");
  if (!receipt.namespace.stopLifetime) {
    const stop = start();
    if (receipt.namespace === current && receipt.status !== "closed")
      receipt.namespace.stopLifetime = stop;
    else stop();
  }
}
export function attachSmsReviewNamespaceAbortCleanup(
  lease: OwnedSmsReviewQueueLease,
  detach: () => void
): void {
  const receipt = currentReceipt(lease);
  if (!receipt || receipt.status !== "active") {
    detach();
    return;
  }
  detachReceipt(receipt);
  receipt.detachAbort = detach;
}
export function publishSmsReviewNamespace(
  lease: OwnedSmsReviewQueueLease
): void {
  const receipt = currentReceipt(lease);
  if (receipt?.status === "published") return;
  assertSmsReviewNamespaceOperation(lease);
  if (!receipt) throw new Error("sms_review_namespace_stale");
  receipt.namespace.activeCount -= 1;
  const pin = receipt.namespace.publishedPin ?? { holders: 0 };
  pin.holders += 1;
  receipt.namespace.publishedPin = pin;
  receipt.status = "published";
  // Keep the cancellation listener alive through return and caller merge.
}

/** Settle only the exact submitted objects verified by the owned writer.
 * Admitted members were written; terminal members were already saved,
 * dismissed or represented by an owned draft. Neither implies a new financial
 * commit. Unsubmitted siblings and other published receipts remain cancellable. */
export function commitSmsReviewNamespacePublication(
  ownerId: string,
  queueId: string,
  admitted: readonly ParsedSmsTransaction[],
  terminalHandled: readonly ParsedSmsTransaction[] = []
): void {
  const namespace = current;
  if (!namespace || !matches(ownerId, queueId)) return;
  const consumed = new Map<LeaseReceipt, Set<ParsedSmsTransaction>>();
  for (const transaction of [...admitted, ...terminalHandled]) {
    const receipt = candidates.get(transaction);
    if (
      !receipt ||
      receipt.namespace !== namespace ||
      receipt.status !== "published" ||
      !receipt.pendingCandidates.has(transaction)
    )
      continue;
    const members = consumed.get(receipt) ?? new Set<ParsedSmsTransaction>();
    members.add(transaction);
    consumed.set(receipt, members);
  }
  for (const [receipt, members] of consumed) {
    for (const transaction of members)
      receipt.pendingCandidates.delete(transaction);
    if (receipt.pendingCandidates.size > 0) continue;
    receipt.status = "settled";
    detachReceipt(receipt);
    namespace.pending.delete(receipt.token);
    const pin = namespace.publishedPin;
    if (pin) {
      pin.holders -= 1;
      if (pin.holders === 0) namespace.publishedPin = null;
    }
  }
  if (namespace.pending.size === 0) stopLifetime(namespace);
}

export function closeSmsReviewNamespaceLease(
  lease: OwnedSmsReviewQueueLease
): boolean {
  const receipt = receipts.get(lease);
  if (!receipt || receipt.status === "closed" || receipt.status === "settled")
    return false;
  const wasCurrent = receipt.namespace === current;
  detachReceipt(receipt);
  receipt.pendingCandidates.clear();
  if (receipt.status === "active") receipt.namespace.activeCount -= 1;
  if (receipt.status === "published" && receipt.namespace.publishedPin) {
    receipt.namespace.publishedPin.holders -= 1;
    if (receipt.namespace.publishedPin.holders === 0)
      receipt.namespace.publishedPin = null;
  }
  receipt.status = "closed";
  receipt.namespace.pending.delete(receipt.token);
  if (receipt.namespace.pending.size === 0) stopLifetime(receipt.namespace);
  return wasCurrent;
}
export function bindSmsReviewNamespaceCandidates(
  lease: OwnedSmsReviewQueueLease,
  transactions: readonly ParsedSmsTransaction[]
): void {
  assertSmsReviewNamespaceOperation(lease);
  const receipt = currentReceipt(lease);
  if (!receipt) throw new Error("sms_review_namespace_stale");
  for (const transaction of transactions) {
    const previous = candidates.get(transaction);
    // Only a fully settled receipt in this exact live namespace may relinquish
    // its object identity. Closed/active/published or foreign lineage cannot.
    if (
      previous &&
      previous !== receipt &&
      (previous.status !== "settled" ||
        previous.namespace !== receipt.namespace)
    ) {
      throw new Error("sms_review_namespace_candidate_conflict");
    }
    receipt.pendingCandidates.add(transaction);
    candidates.set(transaction, receipt);
  }
}
/** Associate the actual returned complete session with its published receipt.
 * A session ID alone, or a lookalike DTO, is not a publication proof. */
export function bindSmsReviewNamespacePublishedSession(
  lease: OwnedSmsReviewQueueLease,
  reviewSession: AccountReviewSession
): void {
  const receipt = currentReceipt(lease);
  if (
    receipt?.status !== "published" ||
    reviewSession.ownerId !== lease.expectedUserId ||
    reviewSession.sessionId !== lease.queueId
  ) {
    throw new Error("sms_review_namespace_stale");
  }
  publishedSessions.set(reviewSession, receipt);
}

/** A repeated completion may contain original objects from a previously
 * returned publication. Give the NEW receipt independent object lineage only
 * when the identical completed session proves their prior published owner. */
export function isolateSmsReviewNamespacePublicationCandidates(
  lease: OwnedSmsReviewQueueLease,
  priorSession: AccountReviewSession | undefined,
  transactions: readonly ParsedSmsTransaction[]
): readonly ParsedSmsTransaction[] {
  assertSmsReviewNamespaceOperation(lease);
  const receipt = currentReceipt(lease);
  if (!receipt) throw new Error("sms_review_namespace_stale");
  const priorSessionReceipt = priorSession
    ? publishedSessions.get(priorSession)
    : undefined;
  if (
    priorSessionReceipt &&
    (priorSessionReceipt.status !== "published" ||
      priorSessionReceipt.namespace !== receipt.namespace ||
      priorSession?.ownerId !== lease.expectedUserId ||
      priorSession.sessionId !== lease.queueId)
  ) {
    throw new Error("sms_review_namespace_candidate_conflict");
  }
  let copied = false;
  const independent = transactions.map((transaction) => {
    const previous = candidates.get(transaction);
    if (!previous) return transaction;
    if (previous.status === "settled") {
      if (previous.namespace !== receipt.namespace) {
        throw new Error("sms_review_namespace_candidate_conflict");
      }
      return transaction;
    }
    if (previous.status === "closed") {
      throw new Error("sms_review_namespace_candidate_conflict");
    }
    if (previous === receipt) return transaction;
    if (
      previous.status !== "published" ||
      previous.namespace !== receipt.namespace ||
      previous !== priorSessionReceipt ||
      !previous.pendingCandidates.has(transaction)
    ) {
      throw new Error("sms_review_namespace_candidate_conflict");
    }
    copied = true;
    return { ...transaction };
  });
  return copied ? independent : transactions;
}

export function assertSmsReviewNamespaceMerge(
  ownerId: string,
  queueId: string | null,
  transactions: readonly ParsedSmsTransaction[]
): void {
  for (const transaction of transactions) {
    const receipt = candidates.get(transaction);
    if (
      receipt &&
      (receipt.status === "closed" ||
        receipt.namespace !== current ||
        receipt.namespace.ownerId !== ownerId ||
        receipt.namespace.queueId !== queueId)
    ) {
      throw new Error("sms_review_namespace_stale_merge");
    }
  }
}

/** Candidate lineage is separate from authority to execute another operation. */
export function assertSmsReviewNamespaceCandidateCurrent(
  lease: OwnedSmsReviewQueueLease
): void {
  if (!currentReceipt(lease)) throw new Error("sms_review_namespace_stale");
}
