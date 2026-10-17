/* GENERATED from canonical T009 Zod. Do not edit. */

import { z } from "zod";

// Canonical source: packages/logic/src/account-review/generated-vocabulary.ts
export const ACCOUNT_REVIEW_ACCOUNT_TYPES = [
  "CASH",
  "BANK",
  "DIGITAL_WALLET",
] as const;

export const ACCOUNT_REVIEW_CURRENCIES = [
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
] as const;

export const ACCOUNT_REVIEW_TRANSACTION_TYPES = ["EXPENSE", "INCOME"] as const;

export const ACCOUNT_REVIEW_TRANSACTION_SOURCES = [
  "MANUAL",
  "VOICE",
  "SMS",
  "RECURRING",
] as const;

export const ACCOUNT_REVIEW_EXISTING_REASONS = [
  "low_confidence",
  "account_needed",
  "category_needed",
  "cash_transfer_review",
  "unsupported_template",
  "ambiguous_amount",
  "partial_template",
  "non_transactional",
] as const;

// Canonical source: packages/logic/src/utils/amount-limits.ts
export const MAX_TRANSACTION_AMOUNT = 1_000_000_000;

export const MAX_BUDGET_AMOUNT = 999_999_999.99;

// Canonical source: packages/logic/src/account-review/schema-primitives.ts
export const canonicalUuid = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    "Expected canonical lowercase UUID"
  );

export const sourceRef = z
  .string()
  .min(1)
  .refine(
    (value) => value.trim().length > 0,
    "Source reference must not be blank"
  );

export const nonblankText = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0, "Text must not be blank");

export const optionalAccountId = canonicalUuid.nullable();

export const cardSuffix = z
  .string()
  .regex(/^[0-9]{4}$/, "Expected four ASCII digits");

export const hash = z.string().regex(/^[0-9a-f]{64}$/, "Expected SHA-256");

export const currencyCode = z.enum(ACCOUNT_REVIEW_CURRENCIES);

export const accountType = z.enum(ACCOUNT_REVIEW_ACCOUNT_TYPES);

export const transactionType = z.enum(ACCOUNT_REVIEW_TRANSACTION_TYPES);

export const reviewSource = z.enum(["VOICE", "SMS"]);

export const strictUtcTimestamp = z.string().refine((value) => {
  if (
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/.test(
      value
    )
  )
    return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}, "Expected real UTC millisecond timestamp");

export const calendarDate = z.string().refine((value) => {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}, "Expected real YYYY-MM-DD");

export const sourceDate = z.union([calendarDate, strictUtcTimestamp]);

export function areDistinct(values: readonly string[]): boolean {
  return values.length === new Set(values).size;
}

export function addIssue(
  ctx: z.RefinementCtx,
  path: Array<string | number>,
  message: string
): void {
  ctx.addIssue({ code: "custom", path, message });
}

export const uuidArray = z
  .array(canonicalUuid)
  .refine(areDistinct, "Duplicate UUID");

export const refArray = z
  .array(sourceRef)
  .refine(areDistinct, "Duplicate reference");

export const textArray = z
  .array(nonblankText)
  .refine(areDistinct, "Duplicate text value");

export const currencyArray = z
  .array(currencyCode)
  .refine(areDistinct, "Duplicate currency");

export const hashArray = z
  .array(hash)
  .refine(areDistinct, "Duplicate evidence key");

// Canonical source: packages/logic/src/account-review/parser-advisory-validation.ts
function validateSpanSource(
  span: AccountReviewEvidenceSpan,
  source: "VOICE" | "SMS",
  originalTranscript: string | null,
  messageId: string | null,
  ctx: z.RefinementCtx,
  rowIndex: number
): void {
  const path = ["transactions", rowIndex, "accountEvidence"];
  if (source === "VOICE") {
    if (span.field !== "transcript") {
      addIssue(ctx, path, "Voice evidence must reference transcript");
    }
    if (
      originalTranscript === null ||
      originalTranscript.slice(span.start, span.end) !== span.text
    ) {
      addIssue(ctx, path, "Voice span mismatches original transcript");
    }
  } else if (span.field === "transcript" || span.sourceRef !== messageId) {
    addIssue(ctx, path, "SMS evidence must reference its own message");
  }
}

function validateRowEvidenceConditions(
  row: ResponseRow,
  source: "VOICE" | "SMS",
  ctx: z.RefinementCtx,
  index: number
): void {
  if (source === "SMS" && row.accountEvidence.state === "contextual") {
    addIssue(
      ctx,
      ["transactions", index, "accountEvidence"],
      "Contextual evidence is Voice-only"
    );
  }
  if (
    row.suggestionRef !== null &&
    row.accountEvidence.state !== "explicit" &&
    row.accountEvidence.state !== "contextual"
  ) {
    addIssue(
      ctx,
      ["transactions", index, "suggestionRef"],
      "A suggestion requires explicit account evidence"
    );
  }
  if (source === "VOICE" && row.toAccountEvidence !== null) {
    addIssue(
      ctx,
      ["transactions", index, "toAccountEvidence"],
      "Ordinary Voice transaction cannot invent a transfer endpoint"
    );
  }
  if (
    source === "SMS" &&
    "isAtmWithdrawal" in row &&
    !row.isAtmWithdrawal &&
    row.toAccountEvidence !== null
  ) {
    addIssue(
      ctx,
      ["transactions", index, "toAccountEvidence"],
      "Ordinary SMS transaction cannot invent Cash destination"
    );
  }
}

function validateRowEvidence(
  row: ResponseRow,
  source: "VOICE" | "SMS",
  transcript: string | null,
  ctx: z.RefinementCtx,
  index: number
): void {
  validateRowEvidenceConditions(row, source, ctx, index);
  const messageId = "messageId" in row ? row.messageId : null;
  for (const span of [
    ...row.accountEvidence.evidenceSpans,
    ...(row.toAccountEvidence?.evidenceSpans ?? []),
    ...row.currencyEvidence.evidenceSpans,
  ]) {
    validateSpanSource(span, source, transcript, messageId, ctx, index);
  }
}

function validateSuggestedCore(
  row: ResponseRow,
  suggestion: SuggestedAccount,
  ctx: z.RefinementCtx,
  index: number
): void {
  const evidence = row.accountEvidence;
  if (
    suggestion.currency !== null &&
    row.currencyEvidence.state === "explicit" &&
    suggestion.currency !== row.currencyEvidence.statedCode
  ) {
    addIssue(
      ctx,
      ["transactions", index, "currencyEvidence"],
      "Suggested identity conflicts with explicit currency"
    );
  }
  if (
    suggestion.type !== null &&
    evidence.type !== null &&
    suggestion.type !== evidence.type
  ) {
    addIssue(
      ctx,
      ["transactions", index, "accountEvidence"],
      "Suggested account type conflicts with evidence"
    );
  }
  if (
    evidence.name !== null &&
    suggestion.name.trim().toLowerCase() !== evidence.name.trim().toLowerCase()
  ) {
    addIssue(
      ctx,
      ["transactions", index, "accountEvidence"],
      "Suggested account name conflicts with evidence"
    );
  }
}

function validateSuggestedMetadata(
  row: ResponseRow,
  suggestion: SuggestedAccount,
  ctx: z.RefinementCtx,
  index: number
): void {
  const evidence = row.accountEvidence;
  if (
    suggestion.providerDisplayName !== null &&
    evidence.providerDisplayName !== null &&
    suggestion.providerDisplayName !== evidence.providerDisplayName
  ) {
    addIssue(
      ctx,
      ["transactions", index, "accountEvidence"],
      "Suggested provider conflicts with evidence"
    );
  }
  if (
    suggestion.institutionId !== null &&
    evidence.institutionId !== null &&
    suggestion.institutionId !== evidence.institutionId
  ) {
    addIssue(
      ctx,
      ["transactions", index, "accountEvidence"],
      "Suggested institution conflicts with explicit identity"
    );
  }
  if (suggestion.cardLast4 !== evidence.cardLast4) {
    addIssue(
      ctx,
      ["transactions", index, "accountEvidence"],
      "Unproven or conflicting card identity"
    );
  }
}

function validateRowSuggestion(
  row: ResponseRow,
  suggestions: readonly SuggestedAccount[],
  source: "VOICE" | "SMS",
  ctx: z.RefinementCtx,
  index: number
): void {
  if (row.suggestionRef === null) return;
  const suggestion = suggestions.find(
    (candidate) => candidate.suggestionRef === row.suggestionRef
  );
  if (!suggestion || !suggestion.transactionRefs.includes(row.transactionRef)) {
    addIssue(
      ctx,
      ["transactions", index, "suggestionRef"],
      "Dangling/nonreciprocal suggestion reference"
    );
    return;
  }
  if (
    source === "SMS" &&
    "isAtmWithdrawal" in row &&
    !row.isAtmWithdrawal &&
    suggestion.type === "CASH"
  ) {
    addIssue(
      ctx,
      ["transactions", index, "suggestionRef"],
      "Ordinary SMS source excludes Cash"
    );
  }
  validateSuggestedCore(row, suggestion, ctx, index);
  validateSuggestedMetadata(row, suggestion, ctx, index);
}

export function validateAdvisoryEnvelope(
  rows: readonly ResponseRow[],
  suggestions: readonly SuggestedAccount[],
  source: "VOICE" | "SMS",
  transcript: string | null,
  ctx: z.RefinementCtx
): void {
  if (!areDistinct(rows.map((row) => row.transactionRef))) {
    addIssue(
      ctx,
      ["transactions"],
      "Duplicate response-local transaction refs"
    );
  }
  if (!areDistinct(suggestions.map((suggestion) => suggestion.suggestionRef))) {
    addIssue(ctx, ["suggestedAccounts"], "Duplicate suggestion refs");
  }
  for (const [index, row] of rows.entries()) {
    validateRowEvidence(row, source, transcript, ctx, index);
    validateRowSuggestion(row, suggestions, source, ctx, index);
  }
  for (const [index, suggestion] of suggestions.entries()) {
    for (const ref of suggestion.transactionRefs) {
      const row = rows.find((item) => item.transactionRef === ref);
      if (!row || row.suggestionRef !== suggestion.suggestionRef) {
        addIssue(
          ctx,
          ["suggestedAccounts", index, "transactionRefs"],
          "Suggestion references an unrelated row"
        );
      }
    }
  }
}

// Canonical source: packages/logic/src/account-review/parser-schemas.ts
export const accountReviewAccountContextSchema = z
  .object({
    id: canonicalUuid,
    name: nonblankText,
    currency: currencyCode,
    type: accountType,
    institutionId: z.string().nullable(),
    providerDisplayName: z.string().nullable(),
    cardLast4: cardSuffix.nullable(),
    senderNames: textArray,
  })
  .strict();

export const accountReviewRequestContextSchema = z
  .object({
    reviewContractVersion: z.literal("account-review/v2"),
    preferredCurrency: currencyCode,
    accounts: z.array(accountReviewAccountContextSchema),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!areDistinct(value.accounts.map((account) => account.id))) {
      addIssue(ctx, ["accounts"], "Duplicate owned account ID");
    }
  });

export const accountReviewEvidenceSpanSchema = z
  .object({
    sourceRef,
    field: z.enum(["transcript", "body", "sender"]),
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    text: nonblankText,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.end <= value.start) {
      addIssue(ctx, ["end"], "Evidence span end must exceed start");
    }
    if (value.end - value.start !== value.text.length) {
      addIssue(ctx, ["text"], "Evidence text must match UTF-16 span length");
    }
  });

export const accountReviewAccountEvidenceSchema = z
  .object({
    state: z.enum(["absent", "explicit", "contextual", "uncertain"]),
    name: z.string().nullable(),
    type: accountType.nullable(),
    institutionId: z.string().nullable(),
    providerDisplayName: z.string().nullable(),
    cardLast4: cardSuffix.nullable(),
    evidenceSpans: z.array(accountReviewEvidenceSpanSchema),
    candidateAccountIds: uuidArray,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.state === "absent") {
      const hasIdentity = [
        value.name,
        value.type,
        value.institutionId,
        value.providerDisplayName,
        value.cardLast4,
      ].some((part) => part !== null);
      if (
        hasIdentity ||
        value.evidenceSpans.length !== 0 ||
        value.candidateAccountIds.length !== 0
      ) {
        addIssue(
          ctx,
          ["state"],
          "Absent identity cannot carry inferred evidence"
        );
      }
    } else if (value.state === "explicit" || value.state === "contextual") {
      if (value.evidenceSpans.length === 0) {
        addIssue(
          ctx,
          ["evidenceSpans"],
          "Explicit/contextual identity requires grounded evidence"
        );
      }
      const hasIdentity = [
        value.name,
        value.type,
        value.institutionId,
        value.providerDisplayName,
        value.cardLast4,
      ].some((part) => part !== null && part !== "");
      if (!hasIdentity) {
        addIssue(ctx, ["name"], "Grounded identity cannot be entirely empty");
      }
    }
  });

export const accountReviewCurrencyEvidenceSchema = z
  .object({
    state: z.enum([
      "omitted",
      "explicit",
      "ambiguous",
      "conflicting",
      "unsupported",
      "unknown",
    ]),
    statedCode: z.string().nullable(),
    candidateCodes: currencyArray,
    evidenceSpans: z.array(accountReviewEvidenceSpanSchema),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.state === "omitted" &&
      (value.statedCode !== null ||
        value.candidateCodes.length > 0 ||
        value.evidenceSpans.length > 0)
    ) {
      addIssue(
        ctx,
        ["state"],
        "Currency omission cannot carry asserted evidence"
      );
    }
    if (
      value.state === "explicit" &&
      (value.statedCode === null ||
        value.candidateCodes.length !== 1 ||
        value.candidateCodes[0] !== value.statedCode ||
        value.evidenceSpans.length === 0)
    ) {
      addIssue(
        ctx,
        ["state"],
        "Explicit currency needs one matching supported code and span"
      );
    }
    if (
      value.state === "unsupported" &&
      (value.statedCode === null || value.statedCode.trim().length === 0)
    ) {
      addIssue(
        ctx,
        ["statedCode"],
        "Unsupported currency must preserve observed code"
      );
    }
  });

export const accountReviewSuggestedAccountSchema = z
  .object({
    suggestionRef: sourceRef,
    name: nonblankText,
    type: accountType.nullable(),
    currency: currencyCode.nullable(),
    institutionId: z.string().nullable(),
    providerDisplayName: z.string().nullable(),
    cardLast4: cardSuffix.nullable(),
    senderNames: textArray,
    transactionRefs: refArray,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.transactionRefs.length === 0) {
      addIssue(
        ctx,
        ["transactionRefs"],
        "Unused suggestions cannot create accounts"
      );
    }
  });

const parserFinancialFields = {
  amount: z.number().finite().positive().max(MAX_TRANSACTION_AMOUNT),
  type: transactionType,
  counterparty: z.string().nullable(),
  categorySystemName: nonblankText,
  currency: z.string().nullable(),
  date: sourceDate,
  confidenceScore: z.number().finite().min(0).max(1),
};

export const accountReviewVoiceFinancialRowSchema = z
  .object({
    ...parserFinancialFields,
    description: z.string(),
    accountId: optionalAccountId,
  })
  .strict();

export const accountReviewSmsFinancialRowSchema = z
  .object({
    messageId: sourceRef,
    amount: parserFinancialFields.amount,
    currency: parserFinancialFields.currency,
    type: transactionType,
    counterparty: z.string(),
    date: sourceDate,
    categorySystemName: nonblankText,
    isAtmWithdrawal: z.boolean().optional().default(false),
    cardLast4: cardSuffix.optional(),
    confidenceScore: parserFinancialFields.confidenceScore,
    isTrusted: z.boolean(),
  })
  .strict();

const parserEvidenceFields = {
  transactionRef: sourceRef,
  suggestionRef: sourceRef.nullable(),
  accountEvidence: accountReviewAccountEvidenceSchema,
  toAccountEvidence: accountReviewAccountEvidenceSchema.nullable(),
  currencyEvidence: accountReviewCurrencyEvidenceSchema,
};

const voiceRow =
  accountReviewVoiceFinancialRowSchema.extend(parserEvidenceFields);

const smsRow = accountReviewSmsFinancialRowSchema.extend(parserEvidenceFields);

export type ResponseRow = z.infer<typeof voiceRow> | z.infer<typeof smsRow>;

export type SuggestedAccount = z.infer<
  typeof accountReviewSuggestedAccountSchema
>;

export const accountReviewVoiceResponseV2Schema = z
  .object({
    reviewContractVersion: z.literal("account-review/v2"),
    transcript: z.string(),
    original_transcript: z.string(),
    detected_language: nonblankText,
    transactions: z.array(voiceRow),
    suggestedAccounts: z.array(accountReviewSuggestedAccountSchema),
  })
  .strict()
  .superRefine((value, ctx) => {
    validateAdvisoryEnvelope(
      value.transactions,
      value.suggestedAccounts,
      "VOICE",
      value.original_transcript,
      ctx
    );
  });

export const accountReviewSmsResponseV2Schema = z
  .object({
    reviewContractVersion: z.literal("account-review/v2"),
    transactions: z.array(smsRow),
    suggestedAccounts: z.array(accountReviewSuggestedAccountSchema),
    completionStatus: z
      .enum(["complete", "truncated", "safety_stopped", "failed"])
      .optional(),
    negativeFingerprints: z.array(nonblankText).refine(areDistinct).optional(),
    terminalFingerprints: z.array(nonblankText).refine(areDistinct).optional(),
    unresolvedFingerprints: z
      .array(nonblankText)
      .refine(areDistinct)
      .optional(),
    retryRequestMode: z.literal("fresh").optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    validateAdvisoryEnvelope(
      value.transactions,
      value.suggestedAccounts,
      "SMS",
      null,
      ctx
    );
    const statuses = [
      ...(value.negativeFingerprints ?? []),
      ...(value.terminalFingerprints ?? []),
      ...(value.unresolvedFingerprints ?? []),
    ];
    if (!areDistinct(statuses)) {
      addIssue(
        ctx,
        ["negativeFingerprints"],
        "Fingerprint cannot have multiple terminal states"
      );
    }
  });

export type AccountReviewAccountContext = z.infer<
  typeof accountReviewAccountContextSchema
>;

export type AccountReviewRequestContext = z.infer<
  typeof accountReviewRequestContextSchema
>;

export type AccountReviewEvidenceSpan = z.infer<
  typeof accountReviewEvidenceSpanSchema
>;

export type AccountReviewAccountEvidence = z.infer<
  typeof accountReviewAccountEvidenceSchema
>;

export type AccountReviewCurrencyEvidence = z.infer<
  typeof accountReviewCurrencyEvidenceSchema
>;

export type AccountReviewSuggestedAccount = z.infer<
  typeof accountReviewSuggestedAccountSchema
>;

export type AccountReviewVoiceFinancialRow = z.infer<
  typeof accountReviewVoiceFinancialRowSchema
>;

export type AccountReviewSmsFinancialRow = z.infer<
  typeof accountReviewSmsFinancialRowSchema
>;

export type AccountReviewVoiceResponseV2 = z.infer<
  typeof accountReviewVoiceResponseV2Schema
>;

export type AccountReviewSmsResponseV2 = z.infer<
  typeof accountReviewSmsResponseV2Schema
>;
