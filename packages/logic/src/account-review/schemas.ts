import { z } from "zod";
import Decimal from "decimal.js";

import { parseCanonicalUnsignedIntegerString } from "../financial-actions/action-contracts";
import { MAX_TRANSACTION_AMOUNT } from "../utils/amount-helpers";
import {
  ACCOUNT_REVIEW_ACCOUNT_TYPES,
  ACCOUNT_REVIEW_CURRENCIES,
  ACCOUNT_REVIEW_EXISTING_REASONS,
  ACCOUNT_REVIEW_TRANSACTION_TYPES,
} from "./generated-vocabulary";

/**
 * T009 canonical #395 wire/review schemas.
 *
 * Pure Zod validation, not a model, account resolver, parser adapter, financial
 * writer, sync strategy, or UI projection. All provider objects are closed;
 * malformed advice cannot silently become absent evidence or a saved account.
 * Source-text provenance requiring access to an original SMS body/sender belongs
 * to the T013/T014 adapters; the provider response does not contain those texts.
 */
const canonicalUuid = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  "Expected canonical lowercase UUID"
);
const sourceRef = z.string().min(1).refine(
  (value) => value.trim().length > 0,
  "Source reference must not be blank"
);
const nonblankText = z.string().min(1).refine(
  (value) => value.trim().length > 0,
  "Text must not be blank"
);
const optionalAccountId = canonicalUuid.nullable();
const cardSuffix = z.string().regex(/^[0-9]{4}$/, "Expected four ASCII digits");
const hash = z.string().regex(/^[0-9a-f]{64}$/, "Expected SHA-256");
const recordRevision = z.string().refine((value) => {
  try {
    parseCanonicalUnsignedIntegerString(value);
    return true;
  } catch {
    return false;
  }
}, "Expected canonical unsigned financial/review revision");

const currencyCode = z.enum(ACCOUNT_REVIEW_CURRENCIES);
const accountType = z.enum(ACCOUNT_REVIEW_ACCOUNT_TYPES);
const transactionType = z.enum(ACCOUNT_REVIEW_TRANSACTION_TYPES);
const reviewSource = z.enum(["VOICE", "SMS"]);

const strictUtcTimestamp = z.string().refine((value) => {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}, "Expected real UTC millisecond timestamp");

const calendarDate = z.string().refine((value) => {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Expected real YYYY-MM-DD");

const sourceDate = z.union([calendarDate, strictUtcTimestamp]);

const canonicalDecimal = z.string().refine((value) => {
  if (!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/.test(value) || value.startsWith("-0")) {
    return false;
  }
  const digits = value.replace(/[-.]/g, "");
  const fractional = value.split(".")[1] ?? "";
  if (digits.length > 50 || fractional.length > 18) return false;
  try {
    const amount = new Decimal(value);
    return amount.isFinite() && amount.toFixed() === value;
  } catch {
    return false;
  }
}, "Expected canonical decimal, max 50 digits / 18 fractional digits");

function areDistinct(values: readonly string[]): boolean {
  return values.length === new Set(values).size;
}

function addIssue(ctx: z.RefinementCtx, path: (string | number)[], message: string): void {
  ctx.addIssue({ code: "custom", path, message });
}

const uuidArray = z.array(canonicalUuid).refine(areDistinct, "Duplicate UUID");
const refArray = z.array(sourceRef).refine(areDistinct, "Duplicate reference");
const textArray = z.array(nonblankText).refine(areDistinct, "Duplicate text value");
const currencyArray = z.array(currencyCode).refine(areDistinct, "Duplicate currency");
const hashArray = z.array(hash).refine(areDistinct, "Duplicate evidence key");

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

type ResponseRow = z.infer<typeof voiceRow> | z.infer<typeof smsRow>;
type SuggestedAccount = z.infer<typeof accountReviewSuggestedAccountSchema>;

function validateSpanSource(
  span: z.infer<typeof accountReviewEvidenceSpanSchema>,
  source: "VOICE" | "SMS",
  originalTranscript: string | null,
  messageId: string | null,
  ctx: z.RefinementCtx,
  rowIndex: number
): void {
  if (source === "VOICE") {
    if (span.field !== "transcript") {
      addIssue(ctx, ["transactions", rowIndex, "accountEvidence"], "Voice evidence must reference transcript");
    }
    if (
      originalTranscript === null ||
      originalTranscript.slice(span.start, span.end) !== span.text
    ) {
      addIssue(ctx, ["transactions", rowIndex, "accountEvidence"], "Voice span mismatches original transcript");
    }
  } else if (
    span.field === "transcript" ||
    span.sourceRef !== messageId
  ) {
    addIssue(ctx, ["transactions", rowIndex, "accountEvidence"], "SMS evidence must reference its own message");
  }
  // SMS body/sender substring validation needs the original submitted SMS.
  // That input is deliberately NOT included in a provider success response.
}

function validateAdvisoryEnvelope(
  rows: readonly ResponseRow[],
  suggestions: readonly SuggestedAccount[],
  source: "VOICE" | "SMS",
  transcript: string | null,
  ctx: z.RefinementCtx
): void {
  const refs = rows.map((row) => row.transactionRef);
  if (!areDistinct(refs)) addIssue(ctx, ["transactions"], "Duplicate response-local transaction refs");
  const suggestionRefs = suggestions.map((suggestion) => suggestion.suggestionRef);
  if (!areDistinct(suggestionRefs)) addIssue(ctx, ["suggestedAccounts"], "Duplicate suggestion refs");

  for (const [i, row] of rows.entries()) {
    const messageId = "messageId" in row ? row.messageId : null;
    if (source === "SMS" && row.accountEvidence.state === "contextual") {
      addIssue(ctx, ["transactions", i, "accountEvidence"], "Contextual evidence is Voice-only");
    }
    if (row.suggestionRef !== null && row.accountEvidence.state !== "explicit" &&
      row.accountEvidence.state !== "contextual") {
      addIssue(ctx, ["transactions", i, "suggestionRef"], "A suggestion requires explicit account evidence");
    }
    if (source === "VOICE" && row.toAccountEvidence !== null) {
      addIssue(ctx, ["transactions", i, "toAccountEvidence"], "Ordinary Voice transaction cannot invent a transfer endpoint");
    }
    if (source === "SMS" && "isAtmWithdrawal" in row &&
      !row.isAtmWithdrawal && row.toAccountEvidence !== null) {
      addIssue(ctx, ["transactions", i, "toAccountEvidence"], "Ordinary SMS transaction cannot invent Cash destination");
    }

    for (const span of [
      ...row.accountEvidence.evidenceSpans,
      ...(row.toAccountEvidence?.evidenceSpans ?? []),
      ...row.currencyEvidence.evidenceSpans,
    ]) {
      validateSpanSource(span, source, transcript, messageId, ctx, i);
    }

    if (row.suggestionRef === null) continue;
    const suggestion = suggestions.find((candidate) => candidate.suggestionRef === row.suggestionRef);
    if (!suggestion || !suggestion.transactionRefs.includes(row.transactionRef)) {
      addIssue(ctx, ["transactions", i, "suggestionRef"], "Dangling/nonreciprocal suggestion reference");
      continue;
    }
    if (source === "SMS" && "isAtmWithdrawal" in row && !row.isAtmWithdrawal &&
      suggestion.type === "CASH") {
      addIssue(ctx, ["transactions", i, "suggestionRef"], "Ordinary SMS source excludes Cash");
    }
    if (suggestion.currency !== null &&
      row.currencyEvidence.state === "explicit" &&
      suggestion.currency !== row.currencyEvidence.statedCode) {
      addIssue(ctx, ["transactions", i, "currencyEvidence"], "Suggested identity conflicts with explicit currency");
    }
    if (suggestion.type !== null && row.accountEvidence.type !== null &&
      suggestion.type !== row.accountEvidence.type) {
      addIssue(ctx, ["transactions", i, "accountEvidence"], "Suggested account type conflicts with evidence");
    }
    if (suggestion.name.trim().toLowerCase() !== row.accountEvidence.name?.trim().toLowerCase() &&
      row.accountEvidence.name !== null) {
      addIssue(ctx, ["transactions", i, "accountEvidence"], "Suggested account name conflicts with evidence");
    }
    if (suggestion.providerDisplayName !== null &&
      row.accountEvidence.providerDisplayName !== null &&
      suggestion.providerDisplayName !== row.accountEvidence.providerDisplayName) {
      addIssue(ctx, ["transactions", i, "accountEvidence"], "Suggested provider conflicts with evidence");
    }
    if (suggestion.cardLast4 !== row.accountEvidence.cardLast4) {
      addIssue(ctx, ["transactions", i, "accountEvidence"], "Unproven or conflicting card identity");
    }
  }

  for (const [i, suggestion] of suggestions.entries()) {
    for (const ref of suggestion.transactionRefs) {
      const row = rows.find((item) => item.transactionRef === ref);
      if (!row || row.suggestionRef !== suggestion.suggestionRef) {
        addIssue(ctx, ["suggestedAccounts", i, "transactionRefs"], "Suggestion references an unrelated row");
      }
    }
  }
}

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

/**
 * Review state is separate from provider evidence. Known preferred-currency
 * omission is derived only after validated v2 omitted provenance.
 */
export const accountReviewCurrencySchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("known"),
    code: currencyCode,
    origin: z.enum(["explicit", "preferred_omission", "user"]),
  }).strict(),
  z.object({
    state: z.literal("unconfirmed"),
    reason: z.enum(["ambiguous", "conflicting", "unsupported", "legacy_unknown"]),
    candidateCodes: currencyArray,
    statedCode: z.string().nullable(),
    evidenceSpans: z.array(accountReviewEvidenceSpanSchema),
  }).strict(),
]);

export const ACCOUNT_REVIEW_REASON_CODES = [
  ...ACCOUNT_REVIEW_EXISTING_REASONS,
  "currency_confirmation_needed",
  "account_match_ambiguous",
  "account_identity_uncertain",
  "account_unavailable",
  "account_group_removed",
  "account_group_unconfirmed",
  "account_evidence_invalid",
  "account_group_snapshot_conflict",
  "review_revision_stale",
  "review_owner_changed",
  "review_source_changed",
  "review_undo_invalid",
  "review_shared_disclosure_required",
  "review_group_count_stale",
] as const;

export const accountReviewReasonSchema = z.enum(ACCOUNT_REVIEW_REASON_CODES);
const reasonArray = z.array(accountReviewReasonSchema).refine(areDistinct, "Duplicate review reason");

export const accountReviewAssignmentSchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("unresolved"),
    accountId: z.null(),
    reasonCode: accountReviewReasonSchema,
    candidateAccountIds: uuidArray,
  }).strict(),
  z.object({
    state: z.literal("existing"),
    accountId: canonicalUuid,
    origin: z.enum(["exact", "default", "user"]),
    currency: currencyCode,
    identityRevision: recordRevision,
  }).strict(),
  z.object({
    state: z.literal("suggested"),
    accountId: z.null(),
    groupId: canonicalUuid,
    groupRevision: recordRevision,
    confirmation: z.enum(["pending", "confirmed"]),
  }).strict(),
]);

const reviewTransactionBase = {
  amount: z.number().finite().positive().max(MAX_TRANSACTION_AMOUNT),
  currency: currencyCode,
  type: transactionType,
  counterparty: z.string().optional(),
  date: z.date(),
  categoryId: canonicalUuid,
  categoryDisplayName: z.string(),
  confidence: z.number().finite().min(0).max(1),
  originLabel: z.string(),
  deduplicationHash: z.string().optional(),
  accountId: canonicalUuid.optional(),
  merchant: z.string().nullable().optional(),
  reviewStatus: z.enum(["auto_selectable", "needs_review"]).optional(),
  reviewReasons: reasonArray.optional(),
};

const localSmsTransaction = z.object({
  ...reviewTransactionBase,
  source: z.literal("SMS"),
  smsFingerprint: nonblankText,
  senderDisplayName: z.string(),
  rawSmsBody: z.string(),
  isAtmWithdrawal: z.boolean().optional(),
  cardLast4: cardSuffix.optional(),
  toAccountId: canonicalUuid.optional(),
  toAccountName: z.string().optional(),
  pendingAccount: z.object({
    tempId: sourceRef,
    name: nonblankText,
    currency: currencyCode,
    type: z.enum(["BANK", "DIGITAL_WALLET"]),
    institutionId: z.string().nullable().optional(),
    providerDisplayName: z.string().nullable().optional(),
    senderDisplayName: z.string(),
    cardLast4: cardSuffix.optional(),
  }).strict().optional(),
  categoryConfirmed: z.boolean().optional(),
}).strict();

const localVoiceTransaction = z.object({
  ...reviewTransactionBase,
  source: z.literal("VOICE"),
  note: z.string(),
  originalTranscript: z.string(),
  detectedLanguage: nonblankText,
  aiDetectedCurrency: currencyCode.nullable(),
}).strict();

const commonReviewRow = {
  rowId: canonicalUuid,
  sourceRef,
  amountDecimal: canonicalDecimal.refine(
    (value) => new Decimal(value).greaterThan(0) &&
      new Decimal(value).lessThanOrEqualTo(MAX_TRANSACTION_AMOUNT),
    "Review amount must be positive and within accepted maximum"
  ),
  accountEvidence: accountReviewAccountEvidenceSchema,
  currency: accountReviewCurrencySchema,
  assignment: accountReviewAssignmentSchema,
  toAssignment: accountReviewAssignmentSchema.nullable(),
  reviewReasons: reasonArray,
  selected: z.boolean(),
  revision: recordRevision,
  hasUserAccountOverride: z.boolean(),
  hasUserCurrencyOverride: z.boolean(),
};

export const accountReviewRowSchema = z.discriminatedUnion("source", [
  z.object({
    ...commonReviewRow,
    source: z.literal("VOICE"),
    sourceFingerprint: z.null(),
    transaction: localVoiceTransaction,
  }).strict(),
  z.object({
    ...commonReviewRow,
    source: z.literal("SMS"),
    sourceFingerprint: nonblankText,
    transaction: localSmsTransaction,
  }).strict(),
]).superRefine((row, ctx) => {
  if (row.currency.state === "unconfirmed" && row.assignment.state !== "unresolved") {
    addIssue(ctx, ["assignment"], "Unconfirmed currency cannot authorize an account");
  }
  if (row.assignment.state === "existing" && row.currency.state === "known" &&
    row.assignment.currency !== row.currency.code) {
    addIssue(ctx, ["assignment"], "Account and review currency disagree");
  }
  if (row.source === "SMS" &&
    row.sourceFingerprint !== row.transaction.smsFingerprint) {
    addIssue(ctx, ["sourceFingerprint"], "SMS fingerprint must match original source");
  }
});

export const accountReviewGroupSchema = z.object({
  groupId: canonicalUuid,
  evidenceKey: hash,
  suggestionRefs: refArray,
  name: nonblankText,
  type: accountType.nullable(),
  currency: currencyCode,
  institutionId: z.string().nullable(),
  providerDisplayName: z.string().nullable(),
  cardLast4: cardSuffix.nullable(),
  senderNames: textArray,
  linkedRowIds: uuidArray,
  status: z.enum(["pending", "confirmed", "removed"]),
  revision: recordRevision,
  confirmedIdentityRevision: recordRevision.nullable(),
}).strict().superRefine((group, ctx) => {
  if (group.status === "confirmed" &&
    group.confirmedIdentityRevision !== group.revision) {
    addIssue(ctx, ["confirmedIdentityRevision"], "Confirmed group must match current identity revision");
  }
  // Removal is a durable tombstone and may preserve the last confirmed
  // identity revision for a scoped Undo; only new pending groups have none.
  if (group.status === "pending" && group.confirmedIdentityRevision !== null) {
    addIssue(ctx, ["confirmedIdentityRevision"], "Pending group needs reconfirmation");
  }
});

const saveEntityId = z.object({
  entity: z.enum([
    "account", "account_sms_sender", "bank_details", "transaction", "transfer",
  ]),
  localRef: canonicalUuid,
  id: canonicalUuid,
}).strict();

export const accountReviewSaveIntentSchema = z.object({
  actionId: canonicalUuid,
  ownerId: canonicalUuid,
  source: reviewSource,
  sessionId: canonicalUuid,
  expectedReviewRevision: recordRevision,
  expectedOperationGeneration: recordRevision,
  selectedRows: z.array(z.object({
    rowId: canonicalUuid,
    revision: recordRevision,
  }).strict()).min(1),
  confirmedGroups: z.array(z.object({
    groupId: canonicalUuid,
    revision: recordRevision,
    evidenceKey: hash,
  }).strict()),
  plannedEntityIds: z.array(saveEntityId),
  occurredAt: strictUtcTimestamp,
}).strict().superRefine((intent, ctx) => {
  if (!areDistinct(intent.selectedRows.map((row) => row.rowId))) {
    addIssue(ctx, ["selectedRows"], "Repeated selected source row");
  }
  if (!areDistinct(intent.confirmedGroups.map((group) => group.groupId))) {
    addIssue(ctx, ["confirmedGroups"], "Repeated shared confirmation");
  }
  if (!areDistinct(intent.plannedEntityIds.map((entity) => entity.id)) ||
    !areDistinct(intent.plannedEntityIds.map((entity) => entity.localRef))) {
    addIssue(ctx, ["plannedEntityIds"], "Entity IDs and planning aliases must be unique");
  }
});

export const accountReviewSessionSchema = z.object({
  ownerId: canonicalUuid,
  source: reviewSource,
  sessionId: canonicalUuid,
  sourceRevision: recordRevision,
  preferredCurrency: currencyCode,
  rows: z.array(accountReviewRowSchema),
  groups: z.array(accountReviewGroupSchema),
  removedEvidenceKeys: hashArray,
  filter: z.enum(["all", "needs_review", "selected"]),
  revision: recordRevision,
  operationGeneration: recordRevision,
  saveIntent: accountReviewSaveIntentSchema.nullable(),
}).strict().superRefine((session, ctx) => {
  if (!areDistinct(session.rows.map((row) => row.rowId))) {
    addIssue(ctx, ["rows"], "Duplicate review row identity");
  }
  if (!areDistinct(session.groups.map((group) => group.groupId))) {
    addIssue(ctx, ["groups"], "Duplicate group identity");
  }
  for (const [i, row] of session.rows.entries()) {
    if (row.source !== session.source) {
      addIssue(ctx, ["rows", i, "source"], "Review row has wrong session source");
    }
    if (row.assignment.state === "suggested") {
      const suggestedAssignment = row.assignment;
      const group = session.groups.find((item) => item.groupId === suggestedAssignment.groupId);
      if (!group ||
        !group.linkedRowIds.includes(row.rowId) ||
        group.revision !== suggestedAssignment.groupRevision ||
        group.status !== suggestedAssignment.confirmation) {
        addIssue(ctx, ["rows", i, "assignment"], "Stale or missing linked group");
      }
    }
  }
  for (const [i, group] of session.groups.entries()) {
    if (!areDistinct(group.linkedRowIds) ||
      group.linkedRowIds.some((id) => !session.rows.some((row) => row.rowId === id))) {
      addIssue(ctx, ["groups", i, "linkedRowIds"], "Group links missing session rows");
    }
  }
  if (session.saveIntent !== null &&
    (session.saveIntent.ownerId !== session.ownerId ||
      session.saveIntent.sessionId !== session.sessionId ||
      session.saveIntent.source !== session.source)) {
    addIssue(ctx, ["saveIntent"], "Save intent scope changed");
  }
});

const commandBase = {
  ownerId: canonicalUuid,
  sessionId: canonicalUuid,
  expectedReviewRevision: recordRevision,
  expectedOperationGeneration: recordRevision,
};

const groupCommand = { ...commandBase, groupId: canonicalUuid, expectedGroupRevision: recordRevision };
const rowCommand = { ...commandBase, rowId: canonicalUuid, expectedRowRevision: recordRevision };

export const accountReviewCommandSchema = z.discriminatedUnion("kind", [
  z.object({ ...groupCommand, kind: z.literal("confirm_group") }).strict(),
  z.object({ ...groupCommand, kind: z.literal("remove_group") }).strict(),
  z.object({
    ...rowCommand, kind: z.literal("select_row"),
    groupId: canonicalUuid.nullable(),
    expectedGroupRevision: recordRevision.nullable(),
    hasSharedConfirmationDisclosure: z.boolean(),
  }).strict(),
  z.object({
    ...rowCommand, kind: z.literal("set_row_selected"),
    selected: z.literal(false),
  }).strict(),
  z.object({
    ...groupCommand, kind: z.literal("edit_group"),
    identity: z.object({
      name: nonblankText,
      type: accountType,
      institutionId: z.string().nullable(),
      providerDisplayName: z.string().nullable(),
      cardLast4: cardSuffix.nullable(),
      senderNames: textArray,
    }).strict(),
    reconfirm: z.literal(true),
  }).strict(),
  z.object({ ...rowCommand, kind: z.literal("choose_row_account"), accountId: canonicalUuid }).strict(),
  z.object({
    ...groupCommand, kind: z.literal("replace_group_account"),
    accountId: canonicalUuid,
    disclosedLinkedRowCount: z.number().int().nonnegative(),
  }).strict(),
  z.object({
    ...rowCommand, kind: z.literal("confirm_row_currency"),
    currency: currencyCode,
  }).strict(),
  z.object({
    ...commandBase, kind: z.literal("select_ready"),
    filter: z.enum(["all", "needs_review", "selected"]),
  }).strict(),
  z.object({
    ...commandBase, kind: z.literal("clear_selection"),
    filter: z.enum(["all", "needs_review", "selected"]),
  }).strict(),
  z.object({
    ...commandBase, kind: z.literal("undo_removal"),
    undoToken: canonicalUuid,
  }).strict(),
]).superRefine((command, ctx) => {
  if (command.kind !== "select_row") return;
  const groupAndRevisionBothSet = command.groupId !== null &&
    command.expectedGroupRevision !== null;
  const groupAndRevisionBothNull = command.groupId === null &&
    command.expectedGroupRevision === null;
  if (!groupAndRevisionBothSet && !groupAndRevisionBothNull) {
    addIssue(ctx, ["expectedGroupRevision"], "Group ID and revision must be paired");
  }
  if (groupAndRevisionBothSet && !command.hasSharedConfirmationDisclosure) {
    addIssue(ctx, ["hasSharedConfirmationDisclosure"], "Shared selection needs explicit disclosure");
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
export type AccountReviewCurrency = z.infer<typeof accountReviewCurrencySchema>;
export type AccountReviewReason = z.infer<typeof accountReviewReasonSchema>;
export type AccountReviewAssignment = z.infer<typeof accountReviewAssignmentSchema>;
export type AccountReviewRow = z.infer<typeof accountReviewRowSchema>;
export type AccountReviewGroup = z.infer<typeof accountReviewGroupSchema>;
export type AccountReviewSaveIntent = z.infer<typeof accountReviewSaveIntentSchema>;
export type AccountReviewSession = z.infer<typeof accountReviewSessionSchema>;
export type AccountReviewCommand = z.infer<typeof accountReviewCommandSchema>;
