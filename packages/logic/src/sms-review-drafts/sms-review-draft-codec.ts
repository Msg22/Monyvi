import { z } from "zod";

import type { ParsedSmsTransaction } from "../types";

const SMS_REVIEW_DRAFT_VERSION = 1 as const;

const CurrencySchema = z.enum([
  "EGP",
  "SAR",
  "AED",
  "KWD",
  "QAR",
  "BHD",
  "OMR",
  "JOD",
  "IQD",
  "LYD",
  "TND",
  "MAD",
  "DZD",
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CHF",
  "CNY",
  "INR",
  "KRW",
  "KPW",
  "SGD",
  "HKD",
  "MYR",
  "AUD",
  "NZD",
  "CAD",
  "SEK",
  "NOK",
  "DKK",
  "ISK",
  "TRY",
  "RUB",
  "ZAR",
  "BTC",
]);

const ReviewReasonSchema = z.enum([
  "low_confidence",
  "account_needed",
  "category_needed",
  "cash_transfer_review",
  "unsupported_template",
  "ambiguous_amount",
  "partial_template",
  "non_transactional",
]);

const StoredTransactionSchema = z
  .object({
    amount: z.number().finite().positive(),
    currency: CurrencySchema,
    type: z.enum(["EXPENSE", "INCOME"]),
    counterparty: z.string().optional(),
    date: z.string().min(1),
    categoryId: z.string().min(1),
    categoryDisplayName: z.string().min(1),
    confidence: z.number().finite().min(0).max(1),
    originLabel: z.string().min(1),
    source: z.literal("SMS"),
    deduplicationHash: z.string().optional(),
    accountId: z.string().min(1).optional(),
    merchant: z.string().optional(),
    reviewStatus: z.enum(["auto_selectable", "needs_review"]).optional(),
    reviewReasons: z.array(ReviewReasonSchema).optional(),
    smsFingerprint: z.string().min(1),
    senderDisplayName: z.string().min(1),
    rawSmsBody: z.string(),
    isAtmWithdrawal: z.boolean().optional(),
    cardLast4: z.string().optional(),
  })
  .strict();

const StoredPayloadSchema = z
  .object({
    version: z.literal(SMS_REVIEW_DRAFT_VERSION),
    transaction: StoredTransactionSchema,
  })
  .strict();

type StoredTransaction = z.infer<typeof StoredTransactionSchema>;

export type SmsReviewDraftCodecErrorCode =
  | "unsupported_version"
  | "malformed_payload"
  | "invalid_date"
  | "fingerprint_mismatch";

export class SmsReviewDraftCodecError extends Error {
  public readonly code: SmsReviewDraftCodecErrorCode;

  public constructor(code: SmsReviewDraftCodecErrorCode) {
    super(`SMS review draft cannot be read (${code}).`);
    this.name = "SmsReviewDraftCodecError";
    this.code = code;
  }
}

export interface EncodedSmsReviewDraft {
  readonly version: typeof SMS_REVIEW_DRAFT_VERSION;
  readonly json: string;
}

export interface DecodeSmsReviewDraftInput {
  readonly version: number;
  readonly json: string;
  readonly expectedFingerprint: string;
}

function toStoredTransaction(
  transaction: ParsedSmsTransaction
): StoredTransaction {
  return StoredTransactionSchema.parse({
    ...transaction,
    date: transaction.date.toISOString(),
    reviewReasons: transaction.reviewReasons
      ? [...transaction.reviewReasons]
      : undefined,
  });
}

export function encodeSmsReviewDraft(
  transaction: ParsedSmsTransaction
): EncodedSmsReviewDraft {
  try {
    const payload = StoredPayloadSchema.parse({
      version: SMS_REVIEW_DRAFT_VERSION,
      transaction: toStoredTransaction(transaction),
    });

    return {
      version: SMS_REVIEW_DRAFT_VERSION,
      json: JSON.stringify(payload),
    };
  } catch {
    throw new SmsReviewDraftCodecError("malformed_payload");
  }
}

function parseJson(json: string): unknown {
  try {
    return JSON.parse(json) as unknown;
  } catch {
    throw new SmsReviewDraftCodecError("malformed_payload");
  }
}

function assertSupportedVersion(version: number): void {
  if (version !== SMS_REVIEW_DRAFT_VERSION) {
    throw new SmsReviewDraftCodecError("unsupported_version");
  }
}

function restoreTransaction(transaction: StoredTransaction): ParsedSmsTransaction {
  const date = new Date(transaction.date);
  if (Number.isNaN(date.getTime())) {
    throw new SmsReviewDraftCodecError("invalid_date");
  }

  return {
    ...transaction,
    date,
  };
}

export function decodeSmsReviewDraft(
  input: DecodeSmsReviewDraftInput
): ParsedSmsTransaction {
  assertSupportedVersion(input.version);

  const rawPayload = parseJson(input.json);
  if (
    typeof rawPayload === "object" &&
    rawPayload !== null &&
    "version" in rawPayload &&
    typeof rawPayload.version === "number"
  ) {
    assertSupportedVersion(rawPayload.version);
  }

  const parsed = StoredPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    const hasDateIssue = parsed.error.issues.some(
      (issue) => issue.path.join(".") === "transaction.date"
    );
    throw new SmsReviewDraftCodecError(
      hasDateIssue ? "invalid_date" : "malformed_payload"
    );
  }

  const transaction = restoreTransaction(parsed.data.transaction);
  if (transaction.smsFingerprint !== input.expectedFingerprint) {
    throw new SmsReviewDraftCodecError("fingerprint_mismatch");
  }

  return transaction;
}
