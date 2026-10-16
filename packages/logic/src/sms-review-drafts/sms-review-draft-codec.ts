import { z } from "zod";
import DecimalJs from "decimal.js";

import {
  accountReviewGroupSchema,
  accountReviewRowSchema,
  type AccountReviewGroup,
  type AccountReviewRow,
  type AccountReviewSession,
} from "../account-review/review-schemas";
import {
  canonicalUuid,
  currencyCode,
  hashArray,
  strictUtcTimestamp,
} from "../account-review/schema-primitives";
import { recordRevision } from "../account-review/review-value-primitives";

import type { ParsedSmsTransaction } from "../types";
import { isValidTransactionAmount } from "../utils/amount-helpers";

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

const PendingAccountSchema = z
  .object({
    tempId: z.string().min(1),
    name: z.string().min(1),
    currency: CurrencySchema,
    type: z.enum(["BANK", "DIGITAL_WALLET"]),
    institutionId: z.string().nullable().optional(),
    providerDisplayName: z.string().nullable().optional(),
    senderDisplayName: z.string().min(1),
    cardLast4: z.string().optional(),
  })
  .strict();

const StoredTransactionSchema = z
  .object({
    amount: z.number().refine(isValidTransactionAmount),
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
    categoryConfirmed: z.boolean().optional(),
    smsFingerprint: z.string().min(1),
    senderDisplayName: z.string().min(1),
    rawSmsBody: z.string(),
    isAtmWithdrawal: z.boolean().optional(),
    cardLast4: z.string().optional(),
    toAccountId: z.string().min(1).optional(),
    toAccountName: z.string().min(1).optional(),
    pendingAccount: PendingAccountSchema.optional(),
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
  public constructor(public readonly code: SmsReviewDraftCodecErrorCode) {
    super(`SMS review draft cannot be read (${code}).`);
    this.name = "SmsReviewDraftCodecError";
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

function restoreTransaction(
  transaction: StoredTransaction
): ParsedSmsTransaction {
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

/** V2 has a separate closed envelope; the existing V1 methods stay untouched. */
const SMS_REVIEW_DRAFT_VERSION_V2 = 2 as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

/** Only the persisted JSON date is accepted; Zod then validates canonical row. */
function restoreStoredReviewRow(value: unknown): unknown {
  if (!isPlainObject(value) || !isPlainObject(value.transaction)) return value;
  const parsed = strictUtcTimestamp.safeParse(value.transaction.date);
  if (!parsed.success) return value;
  return {
    ...value,
    transaction: { ...value.transaction, date: new Date(parsed.data) },
  };
}

const storedReviewRowSchema = z.preprocess(
  restoreStoredReviewRow,
  accountReviewRowSchema
);

/** An active group stored beside one row must reciprocally name that row. */
function isReciprocalActiveGroup(
  group: AccountReviewGroup,
  row: AccountReviewRow
): boolean {
  const assignment = row.assignment;
  return (
    assignment.state === "suggested" &&
    assignment.groupId === group.groupId &&
    assignment.groupRevision === group.revision &&
    assignment.confirmation === group.status &&
    row.currency.state === "known" &&
    row.currency.code === group.currency &&
    group.linkedRowIds.includes(row.rowId)
  );
}

const storedSmsReviewSchema = z
  .object({
    ownerId: canonicalUuid,
    sessionId: canonicalUuid,
    sourceRevision: recordRevision,
    preferredCurrency: currencyCode,
    reviewRevision: recordRevision,
    operationGeneration: recordRevision,
    // Original V2 headers have exactly nine fields: only decode defaults
    // their absent filter to all. Every NEW encode below writes this field.
    filter: z.enum(["all", "needs_review", "selected"]).default("all"),
    row: storedReviewRowSchema,
    groups: z.array(accountReviewGroupSchema),
    removedEvidenceKeys: hashArray,
  })
  .strict()
  .superRefine((review, ctx) => {
    const row = review.row;
    if (row.source !== "SMS") {
      ctx.addIssue({
        code: "custom",
        path: ["row", "source"],
        message: "Only SMS review rows can be persisted",
      });
    }
    const ids = new Set<string>();
    let activeMembershipCount = 0;
    for (const [index, group] of review.groups.entries()) {
      if (ids.has(group.groupId)) {
        ctx.addIssue({
          code: "custom",
          path: ["groups", index],
          message: "Duplicate group identity",
        });
      }
      ids.add(group.groupId);
      const tombstoned = review.removedEvidenceKeys.includes(group.evidenceKey);
      if ((group.status === "removed") !== tombstoned) {
        ctx.addIssue({
          code: "custom",
          path: ["groups", index],
          message: "Group removal evidence conflicts with its status",
        });
      }
      if (group.status === "removed") continue;
      activeMembershipCount += 1;
      if (activeMembershipCount > 1 || !isReciprocalActiveGroup(group, row)) {
        ctx.addIssue({
          code: "custom",
          path: ["groups", index],
          message: "Active group must reciprocally match its one stored row",
        });
      }
    }
    const assignment = row.assignment;
    if (assignment.state !== "suggested") return;
    const group = review.groups.find(
      (item) => item.groupId === assignment.groupId
    );
    if (
      !group ||
      group.status === "removed" ||
      group.revision !== assignment.groupRevision ||
      group.status !== assignment.confirmation ||
      group.currency !==
        (row.currency.state === "known" ? row.currency.code : null) ||
      !group.linkedRowIds.includes(row.rowId)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["row", "assignment"],
        message: "Incompatible referenced group snapshot",
      });
    }
  });

/** JSON has three root properties; old nine/new ten local review keys. */
export const smsReviewDraftPayloadV2Schema = z
  .object({
    version: z.literal(SMS_REVIEW_DRAFT_VERSION_V2),
    transaction: StoredTransactionSchema,
    review: storedSmsReviewSchema,
  })
  .strict();

type StoredSmsReviewV2 = z.infer<typeof storedSmsReviewSchema>;
type SmsReviewV2Input = Pick<
  AccountReviewSession,
  | "ownerId"
  | "sessionId"
  | "sourceRevision"
  | "preferredCurrency"
  | "operationGeneration"
  | "groups"
  | "removedEvidenceKeys"
> & {
  readonly reviewRevision: AccountReviewSession["revision"];
  // Optional only for existing internal T025 fixtures. New encoded V2 JSON
  // always materializes filter explicitly; historical bytes are decode-only.
  readonly filter?: AccountReviewSession["filter"];
  readonly row: AccountReviewRow;
};

interface EncodeSmsReviewDraftV2Input {
  readonly transaction: ParsedSmsTransaction;
  readonly review: SmsReviewV2Input;
}

interface DecodeSmsReviewDraftPayloadInput extends DecodeSmsReviewDraftInput {
  readonly expectedOwnerId: string;
  readonly expectedSessionId: string;
  readonly selectionOverride: boolean | null;
}

interface MigrateSmsReviewDraftV1Input extends DecodeSmsReviewDraftPayloadInput {
  readonly rowId: string;
  readonly sourceRevision: string;
  readonly preferredCurrency: AccountReviewSession["preferredCurrency"];
  readonly reviewRevision: string;
  readonly operationGeneration: string;
  readonly filter?: AccountReviewSession["filter"];
}

function storedReviewRow(row: AccountReviewRow): unknown {
  return {
    ...row,
    transaction: {
      ...row.transaction,
      date: row.transaction.date.toISOString(),
    },
  };
}

function sameStoredFinance(
  transaction: z.infer<typeof StoredTransactionSchema>,
  row: AccountReviewRow
): boolean {
  if (row.source !== "SMS") return false;
  const nested = toStoredTransaction(row.transaction);
  return (
    JSON.stringify(nested) === JSON.stringify(transaction) &&
    new DecimalJs(transaction.amount).toFixed() === row.amountDecimal
  );
}

/** A single row validates its own group references, not all remote linked rows. */
function parseConsistentV2(
  value: unknown
): z.infer<typeof smsReviewDraftPayloadV2Schema> {
  const parsed = smsReviewDraftPayloadV2Schema.safeParse(value);
  if (!parsed.success) throw new SmsReviewDraftCodecError("malformed_payload");
  const payload = parsed.data;
  if (!strictUtcTimestamp.safeParse(payload.transaction.date).success) {
    throw new SmsReviewDraftCodecError("invalid_date");
  }
  if (
    payload.review.row.source !== "SMS" ||
    payload.review.row.sourceFingerprint !==
      payload.transaction.smsFingerprint ||
    !sameStoredFinance(payload.transaction, payload.review.row)
  ) {
    throw new SmsReviewDraftCodecError("malformed_payload");
  }
  return payload;
}

export function encodeSmsReviewDraftV2(input: EncodeSmsReviewDraftV2Input): {
  readonly version: 2;
  readonly json: string;
} {
  try {
    const payload = parseConsistentV2({
      version: SMS_REVIEW_DRAFT_VERSION_V2,
      transaction: toStoredTransaction(input.transaction),
      review: {
        ...input.review,
        filter: input.review.filter ?? "all",
        row: storedReviewRow(input.review.row),
      },
    });
    return {
      version: SMS_REVIEW_DRAFT_VERSION_V2,
      json: JSON.stringify(payload),
    };
  } catch {
    throw new SmsReviewDraftCodecError("malformed_payload");
  }
}

export function decodeSmsReviewDraftPayload(
  input: DecodeSmsReviewDraftPayloadInput
): {
  readonly version: 1 | 2;
  readonly transaction: ParsedSmsTransaction;
  readonly review: StoredSmsReviewV2 | null;
} {
  if (input.version === SMS_REVIEW_DRAFT_VERSION) {
    return {
      version: 1,
      transaction: decodeSmsReviewDraft(input),
      review: null,
    };
  }
  if (input.version !== SMS_REVIEW_DRAFT_VERSION_V2) {
    throw new SmsReviewDraftCodecError("unsupported_version");
  }
  const raw = parseJson(input.json);
  if (
    isPlainObject(raw) &&
    typeof raw.version === "number" &&
    raw.version !== input.version
  ) {
    throw new SmsReviewDraftCodecError("unsupported_version");
  }
  const payload = parseConsistentV2(raw);
  if (
    payload.transaction.smsFingerprint !== input.expectedFingerprint ||
    payload.review.row.sourceFingerprint !== input.expectedFingerprint
  ) {
    throw new SmsReviewDraftCodecError("fingerprint_mismatch");
  }
  if (
    payload.review.ownerId !== input.expectedOwnerId ||
    payload.review.sessionId !== input.expectedSessionId
  ) {
    throw new SmsReviewDraftCodecError("malformed_payload");
  }
  return {
    version: SMS_REVIEW_DRAFT_VERSION_V2,
    transaction: restoreTransaction(payload.transaction),
    review: {
      ...payload.review,
      row: {
        ...payload.review.row,
        selected: input.selectionOverride ?? payload.review.row.selected,
      },
    },
  };
}

/** V1 has no trustworthy evidence, original SMS message ID or currency proof. */
function legacyReviewRow(
  transaction: ParsedSmsTransaction,
  input: MigrateSmsReviewDraftV1Input
): AccountReviewRow {
  return accountReviewRowSchema.parse({
    rowId: input.rowId,
    source: "SMS",
    sourceRef: "legacy-local:" + input.rowId,
    sourceFingerprint: transaction.smsFingerprint,
    transaction: {
      ...transaction,
      reviewReasons: transaction.reviewReasons
        ? [...transaction.reviewReasons]
        : undefined,
    },
    amountDecimal: new DecimalJs(transaction.amount).toFixed(),
    accountEvidence: {
      state: "uncertain",
      name: null,
      type: null,
      institutionId: null,
      providerDisplayName: null,
      cardLast4: null,
      evidenceSpans: [],
      candidateAccountIds: [],
    },
    toAccountEvidence: null,
    currency: {
      state: "unconfirmed",
      reason: "legacy_unknown",
      candidateCodes: [],
      statedCode: null,
      evidenceSpans: [],
    },
    assignment: {
      state: "unresolved",
      accountId: null,
      reasonCode: "currency_confirmation_needed",
      candidateAccountIds: [],
    },
    toAssignment: null,
    reviewReasons: [
      ...(transaction.reviewReasons ?? []),
      "currency_confirmation_needed",
    ],
    selected: input.selectionOverride === true,
    revision: input.reviewRevision,
    hasUserAccountOverride: false,
    hasUserCurrencyOverride: false,
  });
}

export function migrateSmsReviewDraftV1ToV2(
  input: MigrateSmsReviewDraftV1Input
): { readonly version: 2; readonly json: string } {
  if (input.version !== SMS_REVIEW_DRAFT_VERSION) {
    throw new SmsReviewDraftCodecError("unsupported_version");
  }
  const transaction = decodeSmsReviewDraft(input);
  try {
    return encodeSmsReviewDraftV2({
      transaction,
      review: {
        ownerId: input.expectedOwnerId,
        sessionId: input.expectedSessionId,
        sourceRevision: input.sourceRevision,
        preferredCurrency: input.preferredCurrency,
        reviewRevision: input.reviewRevision,
        operationGeneration: input.operationGeneration,
        filter: input.filter ?? "all",
        row: legacyReviewRow(transaction, input),
        groups: [],
        removedEvidenceKeys: [],
      },
    });
  } catch {
    // Never rewrite, delete or silently sanitize an unreadable V1 source.
    throw new SmsReviewDraftCodecError("malformed_payload");
  }
}
