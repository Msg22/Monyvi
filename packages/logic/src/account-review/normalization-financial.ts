import { Decimal } from "decimal.js";
import type { ParsedSmsTransaction, ParsedVoiceTransaction } from "../types";
import {
  accountReviewRequestContextSchema,
  accountReviewSmsFinancialRowSchema,
  accountReviewVoiceFinancialRowSchema,
  type AccountReviewSmsFinancialRow,
  type AccountReviewVoiceFinancialRow,
} from "./parser-schemas";
import { canonicalUuid } from "./schema-primitives";
import { recordRevision, canonicalDecimal } from "./review-value-primitives";
import type {
  AccountReviewNormalizationInput,
  SmsReviewNormalizationInput,
  VoiceReviewNormalizationInput,
} from "./normalization-types";

export interface VoiceFinancialEntry {
  readonly source: "VOICE";
  readonly financial: AccountReviewVoiceFinancialRow;
  readonly mapped: ParsedVoiceTransaction;
  readonly financialKey: readonly string[];
  readonly sourceRecordKey: readonly string[];
}

export interface SmsFinancialEntry {
  readonly source: "SMS";
  readonly financial: AccountReviewSmsFinancialRow;
  readonly mapped: ParsedSmsTransaction;
  readonly financialKey: readonly string[];
  readonly sourceRecordKey: readonly string[];
}

export type FinancialEntry = VoiceFinancialEntry | SmsFinancialEntry;

export function canonicalAmount(amount: number): string {
  if (!Number.isFinite(amount))
    throw new Error("account_review_amount_invalid");
  return canonicalDecimal.parse(new Decimal(amount.toString()).toFixed());
}

function validateOriginalDate(sourceDate: string, mappedDate: Date): void {
  if (
    !Number.isFinite(mappedDate.getTime()) ||
    mappedDate.toISOString().slice(0, 10) !== sourceDate.slice(0, 10)
  ) {
    throw new Error("account_review_financial_date_mismatch");
  }
}

function assertMappedFinance(
  financial: AccountReviewVoiceFinancialRow | AccountReviewSmsFinancialRow,
  mapped: ParsedVoiceTransaction | ParsedSmsTransaction,
  categories: ReadonlyMap<string, string>
): void {
  const expectedCategory = categories.get(financial.categorySystemName);
  if (
    !expectedCategory ||
    canonicalUuid.safeParse(expectedCategory).success === false ||
    mapped.categoryId !== expectedCategory ||
    mapped.amount !== financial.amount ||
    mapped.type !== financial.type ||
    !mapped.date ||
    !(mapped.date instanceof Date)
  ) {
    throw new Error("account_review_financial_mapping_mismatch");
  }
  validateOriginalDate(financial.date, mapped.date);
  if (financial.currency !== null && mapped.currency !== financial.currency) {
    throw new Error("account_review_mapped_currency_mismatch");
  }
}

function assertMappedVoiceIdentity(
  financial: AccountReviewVoiceFinancialRow,
  mapped: ParsedVoiceTransaction
): void {
  if (
    mapped.counterparty !== (financial.counterparty ?? undefined) ||
    mapped.note !== financial.description
  ) {
    throw new Error("account_review_voice_financial_identity_mismatch");
  }
}

function voiceFinancial(
  value: AccountReviewVoiceFinancialRow
): AccountReviewVoiceFinancialRow {
  return accountReviewVoiceFinancialRowSchema.parse({
    amount: value.amount,
    type: value.type,
    counterparty: value.counterparty,
    categorySystemName: value.categorySystemName,
    description: value.description,
    accountId: value.accountId,
    currency: value.currency,
    date: value.date,
    confidenceScore: value.confidenceScore,
  });
}

function smsFinancial(
  value: AccountReviewSmsFinancialRow
): AccountReviewSmsFinancialRow {
  return accountReviewSmsFinancialRowSchema.parse({
    messageId: value.messageId,
    amount: value.amount,
    type: value.type,
    counterparty: value.counterparty,
    currency: value.currency,
    date: value.date,
    categorySystemName: value.categorySystemName,
    isAtmWithdrawal: value.isAtmWithdrawal,
    cardLast4: value.cardLast4,
    confidenceScore: value.confidenceScore,
    isTrusted: value.isTrusted,
  });
}

function commonFinancialKey(
  financial: AccountReviewVoiceFinancialRow | AccountReviewSmsFinancialRow
): readonly string[] {
  return [
    canonicalAmount(financial.amount),
    financial.type,
    financial.date.slice(0, 10),
    financial.categorySystemName,
    financial.counterparty ?? "",
    "description" in financial ? financial.description : "",
  ];
}

function ownedContextMatches(input: AccountReviewNormalizationInput): boolean {
  const context = accountReviewRequestContextSchema.parse(
    input.reviewAccountSnapshots.providerContext
  );
  const accounts = input.reviewAccountSnapshots.accounts;
  if (
    context.preferredCurrency !==
      input.reviewAccountSnapshots.preferredCurrency ||
    accounts.length !== context.accounts.length ||
    new Set(accounts.map((account) => account.id)).size !== accounts.length
  ) {
    return false;
  }
  return accounts.every((account) => {
    const provided = context.accounts.find((item) => item.id === account.id);
    return (
      provided !== undefined &&
      typeof account.isDefault === "boolean" &&
      provided.name === account.name &&
      provided.currency === account.currency &&
      provided.type === account.type &&
      provided.institutionId === account.institutionId &&
      provided.providerDisplayName === account.providerDisplayName &&
      provided.cardLast4 === account.cardLast4 &&
      JSON.stringify(provided.senderNames) ===
        JSON.stringify(account.senderNames)
    );
  });
}

export function validateNormalizationContext(
  input: AccountReviewNormalizationInput
): void {
  canonicalUuid.parse(input.ownerId);
  canonicalUuid.parse(input.sessionId);
  recordRevision.parse(input.sourceRevision);
  if (
    !input.requestKey.trim() ||
    input.ownerId !== input.reviewAccountSnapshots.ownerId ||
    !ownedContextMatches(input)
  ) {
    throw new Error("account_review_owned_scope_invalid");
  }
}

function makeVoiceEntries(
  input: VoiceReviewNormalizationInput
): VoiceFinancialEntry[] {
  const remaining = [...input.mappedTransactions];
  return input.financialRows.map((raw): VoiceFinancialEntry => {
    const financial = voiceFinancial(raw);
    const index = remaining.findIndex((mapped) => {
      try {
        assertMappedFinance(financial, mapped, input.categoryIdsBySystemName);
        assertMappedVoiceIdentity(financial, mapped);
        return true;
      } catch {
        return false;
      }
    });
    if (index < 0) throw new Error("account_review_voice_mapping_missing");
    const mapped = remaining.splice(index, 1)[0];
    if (!mapped || mapped.originalTranscript !== input.originalTranscript) {
      throw new Error("account_review_voice_source_mismatch");
    }
    return {
      source: "VOICE",
      financial,
      mapped,
      sourceRecordKey: [input.requestKey],
      financialKey: commonFinancialKey(financial),
    };
  });
}

function indexSmsSources(
  input: SmsReviewNormalizationInput
): ReadonlyMap<
  string,
  SmsReviewNormalizationInput["submittedMessages"][number]
> {
  const messageIds = new Set<string>();
  const fingerprints = new Set<string>();
  const messageById = new Map<
    string,
    SmsReviewNormalizationInput["submittedMessages"][number]
  >();
  for (const item of input.submittedMessages) {
    if (
      !item.id.trim() ||
      !item.smsFingerprint.trim() ||
      messageIds.has(item.id) ||
      fingerprints.has(item.smsFingerprint)
    ) {
      throw new Error("account_review_sms_source_duplicate");
    }
    messageIds.add(item.id);
    fingerprints.add(item.smsFingerprint);
    messageById.set(item.id, item);
  }
  return messageById;
}

function makeSmsEntries(
  input: SmsReviewNormalizationInput
): SmsFinancialEntry[] {
  const messageById = indexSmsSources(input);
  const usedMessageIds = new Set<string>();
  return input.financialRows.map((raw): SmsFinancialEntry => {
    const financial = smsFinancial(raw);
    const source = messageById.get(financial.messageId);
    if (!source || usedMessageIds.has(financial.messageId)) {
      throw new Error("account_review_sms_message_not_submitted");
    }
    usedMessageIds.add(financial.messageId);
    const mapped = input.mappedTransactions.find(
      (item) => item.smsFingerprint === source.smsFingerprint
    );
    if (
      !mapped ||
      mapped.rawSmsBody !== source.body ||
      (mapped.isAtmWithdrawal === true) !== (financial.isAtmWithdrawal === true)
    ) {
      throw new Error("account_review_sms_fingerprint_or_source_mismatch");
    }
    assertMappedFinance(financial, mapped, input.categoryIdsBySystemName);
    return {
      source: "SMS",
      financial,
      mapped,
      sourceRecordKey: [source.id, source.smsFingerprint],
      financialKey: commonFinancialKey(financial),
    };
  });
}

export function collectFinancialEntries(
  input: AccountReviewNormalizationInput
): FinancialEntry[] {
  validateNormalizationContext(input);
  if (input.financialRows.length !== input.mappedTransactions.length) {
    throw new Error("account_review_financial_cardinality_mismatch");
  }
  return input.source === "VOICE"
    ? makeVoiceEntries(input)
    : makeSmsEntries(input);
}
