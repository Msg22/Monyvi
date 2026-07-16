import type { ParsedSmsTransaction } from "../types";

export function getParsedSmsTransactionKey(
  transaction: ParsedSmsTransaction
): string {
  return JSON.stringify({
    smsFingerprint: transaction.smsFingerprint,
    amount: transaction.amount,
    currency: transaction.currency,
    type: transaction.type,
    counterparty: transaction.counterparty ?? null,
    date: transaction.date.getTime(),
    categoryId: transaction.categoryId,
    categoryDisplayName: transaction.categoryDisplayName,
    isAtmWithdrawal: transaction.isAtmWithdrawal === true,
    cardLast4: transaction.cardLast4 ?? null,
  });
}
