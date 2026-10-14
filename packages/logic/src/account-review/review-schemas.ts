import { z } from "zod";
import Decimal from "decimal.js";
import { MAX_TRANSACTION_AMOUNT } from "../utils/amount-helpers";
import { ACCOUNT_REVIEW_EXISTING_REASONS } from "./generated-vocabulary";
import { accountReviewAccountEvidenceSchema, accountReviewEvidenceSpanSchema } from "./parser-schemas";
import {
  canonicalUuid, sourceRef, nonblankText, cardSuffix, hash, recordRevision,
  currencyCode, accountType, transactionType, reviewSource, canonicalDecimal,
  areDistinct, addIssue, uuidArray, refArray, textArray, currencyArray,
  hashArray, strictUtcTimestamp,
} from "./schema-primitives";

/** Local-only T004 review state, commands and immutable save-intent shapes. */
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
  merchant: z.string().optional(),
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

const accountReviewRowBaseSchema = z.discriminatedUnion("source", [
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
]);

function validateReviewDestination(
  row: z.infer<typeof accountReviewRowBaseSchema>,
  ctx: z.RefinementCtx
): void {
  if (row.source === "VOICE" || !row.transaction.isAtmWithdrawal) {
    if (row.toAssignment !== null) {
      addIssue(ctx, ["toAssignment"], "Ordinary review row cannot have a transfer destination");
    }
    return;
  }
  if (row.toAssignment === null) return;
  if (row.currency.state !== "known") {
    addIssue(ctx, ["toAssignment"], "ATM destination requires confirmed review currency");
    return;
  }
  if (row.toAssignment.state === "existing") {
    if (row.toAssignment.currency !== row.currency.code) {
      addIssue(ctx, ["toAssignment"], "ATM destination currency differs from confirmed row");
    }
    if (row.assignment.state === "existing" &&
        row.assignment.accountId === row.toAssignment.accountId) {
      addIssue(ctx, ["toAssignment"], "ATM source and destination must be distinct");
    }
  }
}

export const accountReviewRowSchema = accountReviewRowBaseSchema.superRefine((row, ctx) => {
  validateReviewDestination(row, ctx);
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

function validateSessionRows(
  rows: readonly z.infer<typeof accountReviewRowSchema>[],
  groups: readonly z.infer<typeof accountReviewGroupSchema>[],
  source: "VOICE" | "SMS",
  ctx: z.RefinementCtx
): void {
  const groupById = new Map<string, z.infer<typeof accountReviewGroupSchema>>();
  for (const group of groups) groupById.set(group.groupId, group);
  for (const [index, row] of rows.entries()) {
    if (row.source !== source) {
      addIssue(ctx, ["rows", index, "source"], "Review row has wrong session source");
    }
    if (row.assignment.state !== "suggested") continue;
    const assignment = row.assignment;
    const group = groupById.get(assignment.groupId);
    if (!group || !group.linkedRowIds.includes(row.rowId) ||
        group.revision !== assignment.groupRevision ||
        group.status !== assignment.confirmation) {
      addIssue(ctx, ["rows", index, "assignment"], "Stale or missing linked group");
    }
  }
}

/** Removed tombstones retain provenance, but never own current live rows. */
function validateActiveGroupRow(
  row: z.infer<typeof accountReviewRowSchema> | undefined,
  group: z.infer<typeof accountReviewGroupSchema>,
  ctx: z.RefinementCtx,
  groupIndex: number
): void {
  if (!row || row.assignment.state !== "suggested" ||
      row.assignment.groupId !== group.groupId ||
      row.assignment.groupRevision !== group.revision ||
      row.assignment.confirmation !== group.status) {
    addIssue(ctx, ["groups", groupIndex, "linkedRowIds"], "Active group must have reciprocal row assignment");
  }
  if (!row || row.currency.state !== "known" ||
      row.currency.code !== group.currency) {
    addIssue(ctx, ["groups", groupIndex, "currency"], "Active group requires matching known row currency");
  }
}

/** Only live groups own rows; removed tombstones preserve inert history. */
function validateActiveGroupMembership(
  rows: readonly z.infer<typeof accountReviewRowSchema>[],
  groups: readonly z.infer<typeof accountReviewGroupSchema>[],
  ctx: z.RefinementCtx
): void {
  const rowById = new Map<string, z.infer<typeof accountReviewRowSchema>>();
  for (const row of rows) rowById.set(row.rowId, row);
  const activeRowIds = new Set<string>();
  for (const [index, group] of groups.entries()) {
    if (group.status === "removed") continue;
    for (const id of group.linkedRowIds) {
      if (activeRowIds.has(id)) {
        addIssue(ctx, ["groups", index, "linkedRowIds"], "Row belongs to multiple active groups");
      }
      activeRowIds.add(id);
      validateActiveGroupRow(rowById.get(id), group, ctx, index);
    }
  }
}

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
  validateSessionRows(session.rows, session.groups, session.source, ctx);
  validateActiveGroupMembership(session.rows, session.groups, ctx);
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

export type AccountReviewCurrency = z.infer<typeof accountReviewCurrencySchema>;
export type AccountReviewReason = z.infer<typeof accountReviewReasonSchema>;
export type AccountReviewAssignment = z.infer<typeof accountReviewAssignmentSchema>;
export type AccountReviewRow = z.infer<typeof accountReviewRowSchema>;
export type AccountReviewGroup = z.infer<typeof accountReviewGroupSchema>;
export type AccountReviewSaveIntent = z.infer<typeof accountReviewSaveIntentSchema>;
export type AccountReviewSession = z.infer<typeof accountReviewSessionSchema>;
export type AccountReviewCommand = z.infer<typeof accountReviewCommandSchema>;
