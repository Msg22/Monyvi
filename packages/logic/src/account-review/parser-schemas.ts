import { z } from "zod";
import { MAX_TRANSACTION_AMOUNT } from "../utils/amount-limits";
import { validateAdvisoryEnvelope } from "./parser-advisory-validation";
import {
  canonicalUuid, sourceRef, nonblankText, optionalAccountId, cardSuffix, currencyCode,
  accountType, transactionType, sourceDate, areDistinct, uuidArray, refArray,
  textArray, currencyArray, addIssue,
} from "./schema-primitives";

/** Closed, versioned T004 provider and account-context schemas. */
export const accountReviewAccountContextSchema = z.object({
  id: canonicalUuid,
  name: nonblankText,
  currency: currencyCode,
  type: accountType,
  institutionId: z.string().nullable(),
  providerDisplayName: z.string().nullable(),
  cardLast4: cardSuffix.nullable(),
  senderNames: textArray,
}).strict();

export const accountReviewRequestContextSchema = z.object({
  reviewContractVersion: z.literal("account-review/v2"),
  preferredCurrency: currencyCode,
  accounts: z.array(accountReviewAccountContextSchema),
}).strict().superRefine((value, ctx) => {
  if (!areDistinct(value.accounts.map((account) => account.id))) {
    addIssue(ctx, ["accounts"], "Duplicate owned account ID");
  }
});

export const accountReviewEvidenceSpanSchema = z.object({
  sourceRef,
  field: z.enum(["transcript", "body", "sender"]),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  text: nonblankText,
}).strict().superRefine((value, ctx) => {
  if (value.end <= value.start) {
    addIssue(ctx, ["end"], "Evidence span end must exceed start");
  }
  if (value.end - value.start !== value.text.length) {
    addIssue(ctx, ["text"], "Evidence text must match UTF-16 span length");
  }
});

export const accountReviewAccountEvidenceSchema = z.object({
  state: z.enum(["absent", "explicit", "contextual", "uncertain"]),
  name: z.string().nullable(),
  type: accountType.nullable(),
  institutionId: z.string().nullable(),
  providerDisplayName: z.string().nullable(),
  cardLast4: cardSuffix.nullable(),
  evidenceSpans: z.array(accountReviewEvidenceSpanSchema),
  candidateAccountIds: uuidArray,
}).strict().superRefine((value, ctx) => {
  if (value.state === "absent") {
    const hasIdentity = [
      value.name, value.type, value.institutionId,
      value.providerDisplayName, value.cardLast4,
    ].some((part) => part !== null);
    if (hasIdentity || value.evidenceSpans.length !== 0 || value.candidateAccountIds.length !== 0) {
      addIssue(ctx, ["state"], "Absent identity cannot carry inferred evidence");
    }
  } else if (value.state === "explicit" || value.state === "contextual") {
    if (value.evidenceSpans.length === 0) {
      addIssue(ctx, ["evidenceSpans"], "Explicit/contextual identity requires grounded evidence");
    }
    const hasIdentity = [
      value.name, value.type, value.institutionId,
      value.providerDisplayName, value.cardLast4,
    ].some((part) => part !== null && part !== "");
    if (!hasIdentity) {
      addIssue(ctx, ["name"], "Grounded identity cannot be entirely empty");
    }
  }
});

export const accountReviewCurrencyEvidenceSchema = z.object({
  state: z.enum([
    "omitted", "explicit", "ambiguous",
    "conflicting", "unsupported", "unknown",
  ]),
  statedCode: z.string().nullable(),
  candidateCodes: currencyArray,
  evidenceSpans: z.array(accountReviewEvidenceSpanSchema),
}).strict().superRefine((value, ctx) => {
  if (value.state === "omitted" &&
    (value.statedCode !== null ||
      value.candidateCodes.length > 0 ||
      value.evidenceSpans.length > 0)) {
    addIssue(ctx, ["state"], "Currency omission cannot carry asserted evidence");
  }
  if (value.state === "explicit" &&
    (value.statedCode === null ||
      value.candidateCodes.length !== 1 ||
      value.candidateCodes[0] !== value.statedCode ||
      value.evidenceSpans.length === 0)) {
    addIssue(ctx, ["state"], "Explicit currency needs one matching supported code and span");
  }
  if (value.state === "unsupported" &&
    (value.statedCode === null || value.statedCode.trim().length === 0)) {
    addIssue(ctx, ["statedCode"], "Unsupported currency must preserve observed code");
  }
});

export const accountReviewSuggestedAccountSchema = z.object({
  suggestionRef: sourceRef,
  name: nonblankText,
  type: accountType.nullable(),
  currency: currencyCode.nullable(),
  institutionId: z.string().nullable(),
  providerDisplayName: z.string().nullable(),
  cardLast4: cardSuffix.nullable(),
  senderNames: textArray,
  transactionRefs: refArray,
}).strict().superRefine((value, ctx) => {
  if (value.transactionRefs.length === 0) {
    addIssue(ctx, ["transactionRefs"], "Unused suggestions cannot create accounts");
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

export const accountReviewVoiceFinancialRowSchema = z.object({
  ...parserFinancialFields,
  description: z.string(),
  accountId: optionalAccountId,
}).strict();

export const accountReviewSmsFinancialRowSchema = z.object({
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
}).strict();

const parserEvidenceFields = {
  transactionRef: sourceRef,
  suggestionRef: sourceRef.nullable(),
  accountEvidence: accountReviewAccountEvidenceSchema,
  toAccountEvidence: accountReviewAccountEvidenceSchema.nullable(),
  currencyEvidence: accountReviewCurrencyEvidenceSchema,
};

const voiceRow = accountReviewVoiceFinancialRowSchema.extend(parserEvidenceFields);
const smsRow = accountReviewSmsFinancialRowSchema.extend(parserEvidenceFields);

export type ResponseRow = z.infer<typeof voiceRow> | z.infer<typeof smsRow>;
export type SuggestedAccount = z.infer<typeof accountReviewSuggestedAccountSchema>;

export const accountReviewVoiceResponseV2Schema = z.object({
  reviewContractVersion: z.literal("account-review/v2"),
  transcript: z.string(),
  original_transcript: z.string(),
  detected_language: nonblankText,
  transactions: z.array(voiceRow),
  suggestedAccounts: z.array(accountReviewSuggestedAccountSchema),
}).strict().superRefine((value, ctx) => {
  validateAdvisoryEnvelope(
    value.transactions, value.suggestedAccounts,
    "VOICE", value.original_transcript, ctx
  );
});

export const accountReviewSmsResponseV2Schema = z.object({
  reviewContractVersion: z.literal("account-review/v2"),
  transactions: z.array(smsRow),
  suggestedAccounts: z.array(accountReviewSuggestedAccountSchema),
  completionStatus: z.enum(["complete", "truncated", "safety_stopped", "failed"]).optional(),
  negativeFingerprints: z.array(nonblankText).refine(areDistinct).optional(),
  terminalFingerprints: z.array(nonblankText).refine(areDistinct).optional(),
  unresolvedFingerprints: z.array(nonblankText).refine(areDistinct).optional(),
  retryRequestMode: z.literal("fresh").optional(),
}).strict().superRefine((value, ctx) => {
  validateAdvisoryEnvelope(value.transactions, value.suggestedAccounts, "SMS", null, ctx);
  const statuses = [
    ...(value.negativeFingerprints ?? []),
    ...(value.terminalFingerprints ?? []),
    ...(value.unresolvedFingerprints ?? []),
  ];
  if (!areDistinct(statuses)) {
    addIssue(ctx, ["negativeFingerprints"], "Fingerprint cannot have multiple terminal states");
  }
});

export type AccountReviewAccountContext = z.infer<typeof accountReviewAccountContextSchema>;
export type AccountReviewRequestContext = z.infer<typeof accountReviewRequestContextSchema>;
export type AccountReviewEvidenceSpan = z.infer<typeof accountReviewEvidenceSpanSchema>;
export type AccountReviewAccountEvidence = z.infer<typeof accountReviewAccountEvidenceSchema>;
export type AccountReviewCurrencyEvidence = z.infer<typeof accountReviewCurrencyEvidenceSchema>;
export type AccountReviewSuggestedAccount = z.infer<typeof accountReviewSuggestedAccountSchema>;
export type AccountReviewVoiceFinancialRow = z.infer<typeof accountReviewVoiceFinancialRowSchema>;
export type AccountReviewSmsFinancialRow = z.infer<typeof accountReviewSmsFinancialRowSchema>;
export type AccountReviewVoiceResponseV2 = z.infer<typeof accountReviewVoiceResponseV2Schema>;
export type AccountReviewSmsResponseV2 = z.infer<typeof accountReviewSmsResponseV2Schema>;
