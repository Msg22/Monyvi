import type { Transaction } from "@monyvi/db";

export const TRANSACTION_COMMIT_STATE_UNAVAILABLE_ERROR_CODE =
  "TRANSACTION_COMMIT_STATE_UNAVAILABLE";

export interface TransactionCommitIdentity {
  readonly accountId: string;
  readonly amount: number;
  readonly currency: string;
  readonly categoryId: string;
  readonly counterparty?: string;
  readonly note?: string;
  readonly type: string;
  readonly date?: Date;
  readonly linkedRecurringId?: string;
  readonly source: string;
  readonly smsFingerprint?: string;
}

export interface PendingTransactionCommit {
  readonly accountScopeKey: string;
  readonly operationKey: string;
  readonly transaction: Transaction;
  readonly wasTransactionPersisted: () => Promise<boolean | null>;
  readonly restoreCachedState: () => void;
}

const pendingTransactionCommits = new Map<string, PendingTransactionCommit>();

export function createTransactionAccountScopeKey(
  userId: string,
  accountId: string
): string {
  return JSON.stringify([userId, accountId]);
}

export function createTransactionOperationKey(
  identity: TransactionCommitIdentity
): string {
  return JSON.stringify([
    identity.accountId,
    identity.amount,
    identity.currency,
    identity.categoryId,
    identity.counterparty ?? null,
    identity.note ?? null,
    identity.type,
    identity.linkedRecurringId ? null : (identity.date?.getTime() ?? null),
    identity.linkedRecurringId ?? null,
    identity.source,
    identity.smsFingerprint ?? null,
  ]);
}

export function rememberIndeterminateTransactionCommit(
  pendingCommit: PendingTransactionCommit
): void {
  pendingTransactionCommits.set(pendingCommit.accountScopeKey, pendingCommit);
}

export async function resolvePendingTransactionCommit(
  accountScopeKey: string,
  operationKey: string
): Promise<Transaction | null> {
  const pendingCommit = pendingTransactionCommits.get(accountScopeKey);
  if (!pendingCommit) {
    return null;
  }

  const wasTransactionPersisted = await pendingCommit.wasTransactionPersisted();
  if (wasTransactionPersisted === null) {
    throw new Error(TRANSACTION_COMMIT_STATE_UNAVAILABLE_ERROR_CODE);
  }

  if (wasTransactionPersisted === false) {
    pendingCommit.restoreCachedState();
    pendingTransactionCommits.delete(accountScopeKey);
    return null;
  }

  pendingTransactionCommits.delete(accountScopeKey);
  return pendingCommit.operationKey === operationKey
    ? pendingCommit.transaction
    : null;
}
