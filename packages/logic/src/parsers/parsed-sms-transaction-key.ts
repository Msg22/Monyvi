import type { ParsedSmsTransaction } from "../types";

export function getParsedSmsTransactionKey(
  transaction: ParsedSmsTransaction
): string {
  return transaction.smsFingerprint;
}
