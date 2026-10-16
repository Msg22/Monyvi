/** Device-local Undo authority bound to one authenticated review lifetime.
 * Nothing in this module is serialized to SMS drafts, effects or the outbox. */
import type { SmsReviewQueue } from "@monyvi/db";
import type { ReviewUndoLease } from "../../../packages/logic/src/account-review/reducer";
import { subscribeToCoordinatedAuthStateChange } from "./supabase";
import { subscribeToSmsReviewNamespaceInvalidation } from "./sms-review-namespace-state";

export interface AccountReviewUndoLifetime {
  readonly ownerId: string;
  readonly epoch: bigint;
}

export class AccountReviewUndoLifetimeInvalidatedError extends Error {
  constructor() {
    super("review_undo_invalid");
  }
}

let epoch = 0n;
let ownerId: string | null = null;
let commandsInFlight = 0;
let undoByQueue = new WeakMap<SmsReviewQueue, ReviewUndoLease>();
let activeUndoQueueId: string | null = null;
let detachAuth: (() => void) | null = null;
let detachNamespace: (() => void) | null = null;
let registeringListeners = false;

function detachIfIdle(): void {
  if (commandsInFlight !== 0 || activeUndoQueueId !== null) return;
  const stopAuth = detachAuth;
  const stopNamespace = detachNamespace;
  detachAuth = null;
  detachNamespace = null;
  ownerId = null;
  try {
    stopNamespace?.();
  } finally {
    stopAuth?.();
  }
}

function invalidateLifetime(): void {
  epoch += 1n;
  undoByQueue = new WeakMap<SmsReviewQueue, ReviewUndoLease>();
  activeUndoQueueId = null;
  ownerId = null;
  detachIfIdle();
}

function observeAuthIdentity(
  expectedOwnerId: string,
  event: string,
  nextOwner: string | null
): void {
  if (
    event === "SIGNED_OUT" ||
    (nextOwner !== null && nextOwner !== (ownerId ?? expectedOwnerId))
  ) {
    invalidateLifetime();
  }
}

function observeDisposedQueue(disposedOwner: string, disposedQueue: string): void {
  if (ownerId === disposedOwner && activeUndoQueueId === disposedQueue)
    invalidateLifetime();
}

/** Stage both subscriptions before changing owner or command counts. */
function ensureLifetimeListeners(expectedOwnerId: string): void {
  if (detachAuth && detachNamespace) return;
  if (registeringListeners)
    throw new AccountReviewUndoLifetimeInvalidatedError();
  registeringListeners = true;
  const startingEpoch = epoch;
  let stopAuth: (() => void) | null = null;
  let stopNamespace: (() => void) | null = null;
  try {
    const { data: { subscription } } = subscribeToCoordinatedAuthStateChange(
      (event, session): void =>
        observeAuthIdentity(expectedOwnerId, event, session?.user.id ?? null)
    );
    stopAuth = (): void => subscription.unsubscribe();
    stopNamespace = subscribeToSmsReviewNamespaceInvalidation(
      observeDisposedQueue
    );
    if (epoch !== startingEpoch)
      throw new AccountReviewUndoLifetimeInvalidatedError();
    detachAuth = stopAuth;
    detachNamespace = stopNamespace;
  } catch (error) {
    try {
      stopNamespace?.();
    } finally {
      stopAuth?.();
    }
    throw error;
  } finally {
    registeringListeners = false;
  }
}

export function beginAccountReviewUndoLifetime(
  expectedOwnerId: string
): AccountReviewUndoLifetime {
  if (ownerId !== null && ownerId !== expectedOwnerId) invalidateLifetime();
  ensureLifetimeListeners(expectedOwnerId);
  ownerId = expectedOwnerId;
  commandsInFlight += 1;
  return { ownerId: expectedOwnerId, epoch };
}

export function endAccountReviewUndoLifetime(): void {
  commandsInFlight -= 1;
  if (commandsInFlight < 0) throw new Error("review_undo_lifetime_unbalanced");
  detachIfIdle();
}

export function isAccountReviewUndoLifetimeCurrent(
  lifetime: AccountReviewUndoLifetime
): boolean {
  return lifetime.epoch === epoch && lifetime.ownerId === ownerId;
}

/** Model identity is required; a newly created queue never inherits Undo. */
export function currentAccountReviewUndo(
  lifetime: AccountReviewUndoLifetime,
  queue: SmsReviewQueue
): ReviewUndoLease | null {
  if (!isAccountReviewUndoLifetimeCurrent(lifetime)) return null;
  if (activeUndoQueueId !== null && activeUndoQueueId !== queue.id) {
    undoByQueue = new WeakMap<SmsReviewQueue, ReviewUndoLease>();
    activeUndoQueueId = null;
  }
  const lease = undoByQueue.get(queue) ?? null;
  if (!lease) {
    activeUndoQueueId = null;
    detachIfIdle();
  }
  return lease;
}

export function retainAccountReviewUndo(
  lifetime: AccountReviewUndoLifetime,
  queue: SmsReviewQueue,
  lease: ReviewUndoLease | null
): void {
  if (!isAccountReviewUndoLifetimeCurrent(lifetime)) return;
  if (activeUndoQueueId !== null && activeUndoQueueId !== queue.id)
    undoByQueue = new WeakMap<SmsReviewQueue, ReviewUndoLease>();
  if (lease === null) undoByQueue.delete(queue);
  else undoByQueue.set(queue, lease);
  activeUndoQueueId = lease === null ? null : queue.id;
  detachIfIdle();
}
