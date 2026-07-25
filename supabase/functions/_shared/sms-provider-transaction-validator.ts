import type { ParseSmsProviderTransaction } from "./parse-sms-handler.ts";

const MAX_TRANSACTION_AMOUNT = 1_000_000_000;
const MAX_MESSAGE_ID_LENGTH = 160;
const MAX_COUNTERPARTY_LENGTH = 500;
const CARD_LAST_FOUR_PATTERN = /^\d{4}$/;

export interface SmsProviderTransactionValidationContext {
  readonly supportedCurrencies: readonly string[];
  readonly categoryTree: string;
}

export interface SmsProviderTransactionsValidationResult {
  readonly isValid: boolean;
  readonly transactions: readonly ParseSmsProviderTransaction[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readAllowedCategories(categoryTree: string): ReadonlySet<string> {
  const categories = new Set<string>();
  for (const rawLine of categoryTree.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("L1:")) {
      const value = line.slice(3).trim();
      if (value.length > 0) categories.add(value);
      continue;
    }
    if (line.startsWith("L2:")) {
      line
        .slice(3)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .forEach((value) => categories.add(value));
    }
  }
  return categories;
}

function isValidProviderTransaction(
  value: unknown,
  context: SmsProviderTransactionValidationContext,
  allowedCategories: ReadonlySet<string>
): value is ParseSmsProviderTransaction {
  if (!isRecord(value)) return false;
  return (
    typeof value.messageId === "string" &&
    value.messageId.trim().length > 0 &&
    value.messageId.length <= MAX_MESSAGE_ID_LENGTH &&
    typeof value.amount === "number" &&
    Number.isFinite(value.amount) &&
    value.amount > 0 &&
    value.amount <= MAX_TRANSACTION_AMOUNT &&
    typeof value.currency === "string" &&
    context.supportedCurrencies.includes(value.currency) &&
    (value.type === "EXPENSE" || value.type === "INCOME") &&
    typeof value.counterparty === "string" &&
    value.counterparty.length <= MAX_COUNTERPARTY_LENGTH &&
    typeof value.date === "string" &&
    Number.isFinite(Date.parse(value.date)) &&
    typeof value.categorySystemName === "string" &&
    allowedCategories.has(value.categorySystemName) &&
    typeof value.confidenceScore === "number" &&
    Number.isFinite(value.confidenceScore) &&
    value.confidenceScore >= 0 &&
    value.confidenceScore <= 1 &&
    typeof value.isTrusted === "boolean" &&
    (value.isAtmWithdrawal === undefined ||
      typeof value.isAtmWithdrawal === "boolean") &&
    (value.cardLast4 === undefined ||
      (typeof value.cardLast4 === "string" &&
        CARD_LAST_FOUR_PATTERN.test(value.cardLast4)))
  );
}

export function parseSmsProviderTransactions(
  value: unknown,
  context: SmsProviderTransactionValidationContext
): SmsProviderTransactionsValidationResult {
  if (!isRecord(value) || !Array.isArray(value.transactions)) {
    return { isValid: false, transactions: [] };
  }
  const allowedCategories = readAllowedCategories(context.categoryTree);
  if (
    allowedCategories.size === 0 ||
    context.supportedCurrencies.length === 0
  ) {
    return { isValid: false, transactions: [] };
  }
  if (
    value.transactions.some(
      (transaction) =>
        !isValidProviderTransaction(transaction, context, allowedCategories)
    )
  ) {
    return { isValid: false, transactions: [] };
  }
  return {
    isValid: true,
    transactions: value.transactions as ParseSmsProviderTransaction[],
  };
}
