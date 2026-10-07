import type { ParseSmsProviderTransaction } from "./sms-ai/sms-ai-provider.ts";

const MAX_TRANSACTION_AMOUNT = 1_000_000_000;
const MAX_MESSAGE_ID_LENGTH = 160;
const MAX_COUNTERPARTY_LENGTH = 500;
const CARD_LAST_FOUR_PATTERN = /^\d{4}$/;

export interface SmsProviderTransactionValidationContext {
  readonly supportedCurrencies: readonly string[];
  readonly categoryTree: string;
  readonly submittedMessageIds?: readonly string[];
}

export interface SmsProviderTransactionsValidationResult {
  readonly isValid: boolean;
  readonly transactions: readonly ParseSmsProviderTransaction[];
  readonly invalidMessageIds: readonly string[];
  readonly hasUncorrelatedInvalidEntries: boolean;
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

function normalizeProviderTransaction(value: unknown): unknown {
  if (!isRecord(value) || value.cardLast4 !== "") return value;

  const normalized = { ...value };
  delete normalized.cardLast4;
  return normalized;
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

function readMessageId(value: unknown): string | null {
  if (!isRecord(value) || typeof value.messageId !== "string") return null;
  return value.messageId.trim().length > 0 ? value.messageId : null;
}

export function parseSmsProviderTransactions(
  value: unknown,
  context: SmsProviderTransactionValidationContext
): SmsProviderTransactionsValidationResult {
  if (!isRecord(value) || !Array.isArray(value.transactions)) {
    return {
      isValid: false,
      transactions: [],
      invalidMessageIds: [],
      hasUncorrelatedInvalidEntries: false,
    };
  }

  const allowedCategories = readAllowedCategories(context.categoryTree);
  if (
    allowedCategories.size === 0 ||
    context.supportedCurrencies.length === 0
  ) {
    return {
      isValid: false,
      transactions: [],
      invalidMessageIds: [],
      hasUncorrelatedInvalidEntries: false,
    };
  }

  const submittedMessageIds =
    context.submittedMessageIds === undefined
      ? null
      : new Set(context.submittedMessageIds);
  const normalizedTransactions = value.transactions.map(
    normalizeProviderTransaction
  );
  const identityCounts = new Map<string, number>();
  for (const transaction of normalizedTransactions) {
    const messageId = readMessageId(transaction);
    if (messageId === null) continue;
    identityCounts.set(messageId, (identityCounts.get(messageId) ?? 0) + 1);
  }

  const transactions: ParseSmsProviderTransaction[] = [];
  const invalidMessageIds = new Set<string>();
  let hasUncorrelatedInvalidEntries = false;

  for (const transaction of normalizedTransactions) {
    const messageId = readMessageId(transaction);
    const isKnownIdentity =
      messageId !== null &&
      (submittedMessageIds === null || submittedMessageIds.has(messageId));
    const isDuplicateIdentity =
      messageId !== null && (identityCounts.get(messageId) ?? 0) > 1;

    if (
      isKnownIdentity &&
      !isDuplicateIdentity &&
      isValidProviderTransaction(transaction, context, allowedCategories)
    ) {
      transactions.push(transaction);
      continue;
    }

    if (
      messageId !== null &&
      submittedMessageIds !== null &&
      submittedMessageIds.has(messageId)
    ) {
      invalidMessageIds.add(messageId);
    } else if (
      messageId !== null &&
      submittedMessageIds === null &&
      isDuplicateIdentity
    ) {
      invalidMessageIds.add(messageId);
    } else {
      hasUncorrelatedInvalidEntries = true;
    }
  }

  return {
    isValid: true,
    transactions,
    invalidMessageIds: [...invalidMessageIds],
    hasUncorrelatedInvalidEntries,
  };
}
