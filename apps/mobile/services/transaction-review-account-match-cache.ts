import type { ReviewableTransaction } from "@monyvi/logic";

import type { PendingAccount } from "./pending-account-service";
import type { AccountMatch } from "./sms-account-matcher";

function getTransactionRiskIdentity(
  transaction: ReviewableTransaction
): string {
  const reviewFields = transaction as {
    readonly accountId?: string | null;
    readonly isAtmWithdrawal?: boolean;
    readonly toAccountId?: string | null;
  };
  return [
    transaction.confidence,
    transaction.categoryId ?? "",
    transaction.reviewStatus ?? "",
    [...(transaction.reviewReasons ?? [])].sort().join(","),
    reviewFields.accountId ?? "",
    reviewFields.toAccountId ?? "",
    reviewFields.isAtmWithdrawal === true ? "atm" : "not-atm",
  ].join(":");
}

export function getTransactionParsedContentIdentity(
  transaction: ReviewableTransaction
): string {
  const sourceFields = transaction as ReviewableTransaction & {
    readonly smsFingerprint?: string;
    readonly senderDisplayName?: string;
    readonly rawSmsBody?: string;
    readonly cardLast4?: string;
    readonly toAccountName?: string;
    readonly pendingAccount?: PendingAccount;
    readonly note?: string;
    readonly originalTranscript?: string;
    readonly detectedLanguage?: string;
    readonly aiDetectedCurrency?: string | null;
  };
  return JSON.stringify({
    accountAndRisk: getTransactionRiskIdentity(transaction),
    amount: transaction.amount,
    cardLast4: sourceFields.cardLast4 ?? null,
    categoryDisplayName: transaction.categoryDisplayName,
    counterparty: transaction.counterparty ?? null,
    currency: transaction.currency,
    date: transaction.date.getTime(),
    deduplicationHash: transaction.deduplicationHash ?? null,
    detectedLanguage: sourceFields.detectedLanguage ?? null,
    aiDetectedCurrency: sourceFields.aiDetectedCurrency ?? null,
    merchant: transaction.merchant ?? null,
    note: sourceFields.note ?? null,
    originalTranscript: sourceFields.originalTranscript ?? null,
    originLabel: transaction.originLabel,
    rawSmsBody: sourceFields.rawSmsBody ?? null,
    senderDisplayName: sourceFields.senderDisplayName ?? null,
    smsFingerprint: sourceFields.smsFingerprint ?? null,
    toAccountName: sourceFields.toAccountName ?? null,
    pendingAccount: sourceFields.pendingAccount ?? null,
    source: transaction.source,
    type: transaction.type,
  });
}

export function readTransactionAccountMatchCache(
  transactionKeys: readonly string[],
  cache: ReadonlyMap<string, AccountMatch>
): ReadonlyMap<number, AccountMatch> {
  const matches = new Map<number, AccountMatch>();
  transactionKeys.forEach((key, index) => {
    const cached = cache.get(key);
    if (cached) matches.set(index, cached);
  });
  return matches;
}

export function mergeTransactionAccountMatchCache(
  transactionKeys: readonly string[],
  matches: ReadonlyMap<number, AccountMatch>,
  cache: ReadonlyMap<string, AccountMatch>
): ReadonlyMap<string, AccountMatch> {
  const next = new Map(cache);
  matches.forEach((match, index) => {
    const key = transactionKeys[index];
    if (key) next.set(key, match);
  });
  return next;
}
