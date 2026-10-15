/**
 * #395 T015 — canonical synthetic review state (in-memory, read-only).
 * Roles/categories must already be validated against the current owner.
 * This is not an AI/provider interpretation and never invokes financial Save.
 */
import * as Crypto from "expo-crypto";
import {
  accountReviewAccountEvidenceSchema,
  accountReviewAssignmentSchema,
  accountReviewCurrencySchema,
  accountReviewGroupSchema,
  accountReviewReasonSchema,
  accountReviewRowSchema,
  accountReviewSessionSchema,
  computeSmsFingerprint,
  type AccountReviewAccountContext,
  type AccountReviewAccountEvidence,
  type AccountReviewAssignment,
  type AccountReviewCurrency,
  type AccountReviewGroup,
  type AccountReviewReason,
  type AccountReviewRow,
  type AccountReviewSession,
} from "@monyvi/logic";
import manifest from "../e2e/fixtures/shared-account-review.json";
import { requireGroupIdentity, type FixtureBindings } from "./account-review-fixture-role-service";

type FixtureScene = (typeof manifest.scenes)[number];
type FixtureRow = FixtureScene["rows"][number];
type FixtureGroup = FixtureScene["groups"][number];

interface FixtureIds {
  readonly sessionId: string;
  readonly rows: ReadonlyMap<string, string>;
  readonly groups: ReadonlyMap<string, string>;
}

const FIXTURE_DATE = "2026-10-15T12:00:00.000Z";
const FIXTURE_REVISION = "0";

function scopedSeed(ownerId: string, scene: FixtureScene, kind: string, value: string): string {
  return JSON.stringify(["monyvi-account-review-fixture/v1", ownerId, scene.id, kind, value]);
}

function sha256(input: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);
}

async function scopedUuid(seed: string): Promise<string> {
  const digest = await sha256(seed);
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    "4" + digest.slice(13, 16),
    "8" + digest.slice(17, 20),
    digest.slice(20, 32),
  ].join("-");
}

async function makeIdentities(scene: FixtureScene, ownerId: string): Promise<FixtureIds> {
  const rowAliases: readonly FixtureRow[] = scene.rows;
  const groupAliases: readonly FixtureGroup[] = scene.groups;
  const [sessionId, rows, groups] = await Promise.all([
    scopedUuid(scopedSeed(ownerId, scene, "session", scene.sessionId)),
    Promise.all(rowAliases.map(async (row) => [
      row.rowId,
      await scopedUuid(scopedSeed(ownerId, scene, "row", row.rowId)),
    ] as const)),
    Promise.all(groupAliases.map(async (group) => [
      group.groupId,
      await scopedUuid(scopedSeed(ownerId, scene, "group", group.groupId)),
    ] as const)),
  ]);
  return { sessionId, rows: new Map(rows), groups: new Map(groups) };
}

function requireBoundId(bindings: FixtureIds["rows"], ref: string): string {
  const id = bindings.get(ref);
  if (id === undefined) throw new Error("ACCOUNT_REVIEW_FIXTURE_SOURCE_REF_MISSING");
  return id;
}

function requireAccount(
  bindings: FixtureBindings,
  descriptorId: string
): NonNullable<ReturnType<FixtureBindings["accountByDescriptorId"]["get"]>> {
  const account = bindings.accountByDescriptorId.get(descriptorId);
  if (account === undefined) {
    throw new Error("ACCOUNT_REVIEW_FIXTURE_ACCOUNT_REF_UNAVAILABLE");
  }
  return account;
}

function resolveGroup(scene: FixtureScene, row: FixtureRow): FixtureGroup | null {
  if (row.groupId === null) return null;
  const groups: readonly FixtureGroup[] = scene.groups;
  const group = groups.find((candidate) => candidate.groupId === row.groupId);
  if (group === undefined || !group.linkedRowIds.includes(row.rowId)) {
    throw new Error("ACCOUNT_REVIEW_FIXTURE_GROUP_REF_UNAVAILABLE");
  }
  return group;
}

function fixtureIdentityLabel(
  scene: FixtureScene,
  row: FixtureRow,
  group: FixtureGroup | null,
  bindings: FixtureBindings
): string {
  if (group !== null) return group.name;
  if (row.accountId === null) return "Synthetic transaction";
  const account = requireAccount(bindings, row.accountId);
  return scene.source === "VOICE" && account.id ===
    bindings.accountByDescriptorId.get(manifest.defaultAccountId)?.id
    ? "Synthetic transaction"
    : account.name;
}

function fixtureSourceText(
  scene: FixtureScene,
  row: FixtureRow,
  label: string
): string {
  const currencyText = row.currencyCode ?? "currency needs confirmation";
  return `${scene.source} ${label} ${row.amountDecimal} ${currencyText} (${row.sourceRef})`;
}

function makeAbsentAccountEvidence(): AccountReviewAccountEvidence {
  return accountReviewAccountEvidenceSchema.parse({
    state: "absent", name: null, type: null, institutionId: null,
    providerDisplayName: null, cardLast4: null, evidenceSpans: [],
    candidateAccountIds: [],
  });
}

function makeGroundedAccountEvidence(
  scene: FixtureScene,
  row: FixtureRow,
  account: AccountReviewAccountContext,
  sourceText: string,
  label: string
): AccountReviewAccountEvidence {
  const start = sourceText.indexOf(label);
  if (start < 0) throw new Error("ACCOUNT_REVIEW_FIXTURE_EVIDENCE_UNGROUNDED");
  return accountReviewAccountEvidenceSchema.parse({
    state: "explicit", name: label, type: account.type,
    institutionId: account.institutionId,
    providerDisplayName: account.providerDisplayName,
    cardLast4: account.cardLast4,
    evidenceSpans: [{
      sourceRef: row.sourceRef,
      field: scene.source === "VOICE" ? "transcript" : "body",
      start, end: start + label.length, text: label,
    }],
    candidateAccountIds: [],
  });
}

function makeAccountEvidence(
  scene: FixtureScene,
  row: FixtureRow,
  group: FixtureGroup | null,
  bindings: FixtureBindings,
  sourceText: string,
  label: string
): AccountReviewAccountEvidence {
  const isSilentDefault = scene.source === "VOICE" &&
    row.accountId === manifest.defaultAccountId;
  if ((row.accountId === null && group === null) || isSilentDefault) {
    return makeAbsentAccountEvidence();
  }
  const account = group !== null
    ? requireGroupIdentity(bindings, group)
    : requireAccount(bindings, row.accountId ?? "");
  return makeGroundedAccountEvidence(scene, row, account, sourceText, label);
}

function makeReviewCurrency(
  scene: FixtureScene,
  row: FixtureRow,
  bindings: FixtureBindings
): AccountReviewCurrency {
  if ("currencyEvidenceState" in row && row.currencyEvidenceState === "omitted") {
    return accountReviewCurrencySchema.parse({
      state: "known", code: bindings.snapshots.preferredCurrency,
      origin: "preferred_omission",
    });
  }
  if (row.currencyCode === null) {
    return accountReviewCurrencySchema.parse({
      state: "unconfirmed",
      reason: scene.id === "r3-currency-conflict" ? "conflicting" : "legacy_unknown",
      candidateCodes: [], statedCode: null, evidenceSpans: [],
    });
  }
  return accountReviewCurrencySchema.parse({
    state: "known", code: row.currencyCode, origin: "explicit",
  });
}

function makeReviewReasons(row: FixtureRow): readonly AccountReviewReason[] {
  const tags: readonly string[] = row.issueTags;
  return tags.map((tag): AccountReviewReason =>
    accountReviewReasonSchema.parse(
      tag === "amount" ? "ambiguous_amount" :
      tag === "category" ? "category_needed" : tag
    )
  );
}

function makeExistingAssignment(
  bindings: FixtureBindings,
  descriptorId: string,
  origin: "default" | "exact",
  currency: AccountReviewCurrency
): AccountReviewAssignment {
  const account = requireAccount(bindings, descriptorId);
  if (currency.state !== "known" || account.currency !== currency.code) {
    throw new Error("ACCOUNT_REVIEW_FIXTURE_ACCOUNT_CURRENCY_CONFLICT");
  }
  return accountReviewAssignmentSchema.parse({
    state: "existing", accountId: account.id, origin,
    currency: account.currency, identityRevision: FIXTURE_REVISION,
  });
}

function makeSuggestedAssignment(
  group: FixtureGroup,
  ids: FixtureIds
): AccountReviewAssignment {
  return accountReviewAssignmentSchema.parse({
    state: "suggested", accountId: null,
    groupId: requireBoundId(ids.groups, group.groupId),
    groupRevision: FIXTURE_REVISION, confirmation: group.status,
  });
}

function makeUnresolvedAssignment(
  currency: AccountReviewCurrency,
  reasons: readonly AccountReviewReason[]
): AccountReviewAssignment {
  return accountReviewAssignmentSchema.parse({
    state: "unresolved", accountId: null,
    reasonCode: currency.state === "unconfirmed"
      ? "currency_confirmation_needed" : (reasons[0] ?? "account_needed"),
    candidateAccountIds: [],
  });
}

function makeAssignment(
  scene: FixtureScene,
  row: FixtureRow,
  group: FixtureGroup | null,
  ids: FixtureIds,
  bindings: FixtureBindings,
  currency: AccountReviewCurrency,
  reasons: readonly AccountReviewReason[]
): AccountReviewAssignment {
  if (currency.state === "known" && row.accountId !== null) {
    if (scene.source === "SMS" &&
        requireAccount(bindings, row.accountId).type === "CASH") {
      throw new Error("ACCOUNT_REVIEW_FIXTURE_SMS_CASH_SOURCE_FORBIDDEN");
    }
    return makeExistingAssignment(bindings, row.accountId,
      scene.source === "VOICE" && row.accountId === manifest.defaultAccountId
        ? "default" : "exact", currency);
  }
  if (currency.state === "known" && group !== null && group.status !== "removed") {
    return makeSuggestedAssignment(group, ids);
  }
  return makeUnresolvedAssignment(currency, reasons);
}

function makeDestination(
  scene: FixtureScene,
  row: FixtureRow,
  bindings: FixtureBindings,
  currency: AccountReviewCurrency
): AccountReviewAssignment | null {
  if (row.toAccountId === null) return null;
  if (scene.source !== "SMS" || !row.isAtmWithdrawal) {
    throw new Error("ACCOUNT_REVIEW_FIXTURE_INVALID_DESTINATION");
  }
  const account = requireAccount(bindings, row.toAccountId);
  if (account.type !== "CASH" || account.id ===
      (row.accountId === null ? null : requireAccount(bindings, row.accountId).id)) {
    throw new Error("ACCOUNT_REVIEW_FIXTURE_INVALID_CASH_DESTINATION");
  }
  return makeExistingAssignment(bindings, row.toAccountId, "exact", currency);
}

function makeRow(
  scene: FixtureScene,
  row: FixtureRow,
  bindings: FixtureBindings,
  ids: FixtureIds
): Promise<AccountReviewRow> {
  const group = resolveGroup(scene, row);
  const label = fixtureIdentityLabel(scene, row, group, bindings);
  const sourceText = fixtureSourceText(scene, row, label);
  const evidence = makeAccountEvidence(scene, row, group, bindings, sourceText, label);
  const currency = makeReviewCurrency(scene, row, bindings);
  const reasons = makeReviewReasons(row);
  const assignment = makeAssignment(scene, row, group, ids, bindings, currency, reasons);
  const toAssignment = makeDestination(scene, row, bindings, currency);
  if (row.selected && (reasons.length > 0 || currency.state !== "known")) {
    throw new Error("ACCOUNT_REVIEW_FIXTURE_SELECTED_UNRESOLVED");
  }
  const state: RowState = { evidence, currency, assignment, toAssignment, reasons };
  if (scene.source === "SMS") {
    return makeSmsReviewRow(scene, row, bindings, ids, sourceText, state);
  }
  return Promise.resolve(
    makeVoiceReviewRow(scene, row, bindings, ids, sourceText, state)
  );
}

interface RowState {
  readonly evidence: AccountReviewAccountEvidence;
  readonly currency: AccountReviewCurrency;
  readonly assignment: AccountReviewAssignment;
  readonly toAssignment: AccountReviewAssignment | null;
  readonly reasons: readonly AccountReviewReason[];
}

function makeRowBase(row: FixtureRow, ids: FixtureIds, state: RowState): object {
  return {
    rowId: requireBoundId(ids.rows, row.rowId),
    sourceRef: row.sourceRef, amountDecimal: row.amountDecimal,
    accountEvidence: state.evidence, currency: state.currency,
    assignment: state.assignment, toAssignment: state.toAssignment,
    reviewReasons: state.reasons, selected: row.selected,
    revision: FIXTURE_REVISION,
    hasUserAccountOverride: false, hasUserCurrencyOverride: false,
  };
}

function makeVoiceReviewRow(
  scene: FixtureScene, row: FixtureRow, bindings: FixtureBindings,
  ids: FixtureIds, sourceText: string, state: RowState
): AccountReviewRow {
  return accountReviewRowSchema.parse({
    ...makeRowBase(row, ids, state),
    source: "VOICE", sourceFingerprint: null,
    transaction: {
      amount: Number(row.amountDecimal),
      currency: row.currencyCode ?? bindings.snapshots.preferredCurrency,
      type: "EXPENSE", date: new Date(FIXTURE_DATE), source: "VOICE",
      categoryId: bindings.category.id, categoryDisplayName: bindings.category.displayName,
      confidence: 1, originLabel: "Synthetic Voice",
      note: sourceText, originalTranscript: sourceText,
      detectedLanguage: scene.language, aiDetectedCurrency:
        state.currency.state === "known" && state.currency.origin === "explicit"
          ? state.currency.code : null,
    },
  });
}

function makeSmsFinancialSnapshot(
  row: FixtureRow,
  bindings: FixtureBindings,
  sourceText: string,
  sender: string,
  smsFingerprint: string
): object {
  // The required legacy currency is not v2 certainty. Canonical row.currency
  // independently remains unconfirmed and blocks assignment/Save when unknown.
  return {
    amount: Number(row.amountDecimal),
    currency: row.currencyCode ?? bindings.snapshots.preferredCurrency,
    type: "EXPENSE", date: new Date(FIXTURE_DATE), source: "SMS",
    categoryId: bindings.category.id, categoryDisplayName: bindings.category.displayName,
    confidence: 1, originLabel: sender,
    smsFingerprint, senderDisplayName: sender, rawSmsBody: sourceText,
    deduplicationHash: smsFingerprint, isAtmWithdrawal: row.isAtmWithdrawal,
    ...(row.accountId !== null
      ? { accountId: requireAccount(bindings, row.accountId).id } : {}),
    ...(row.toAccountId !== null
      ? { toAccountId: requireAccount(bindings, row.toAccountId).id } : {}),
  };
}

async function makeSmsReviewRow(
  scene: FixtureScene, row: FixtureRow, bindings: FixtureBindings,
  ids: FixtureIds, sourceText: string, state: RowState
): Promise<AccountReviewRow> {
  const group = resolveGroup(scene, row);
  const sender = group?.name ?? (row.accountId !== null
    ? requireAccount(bindings, row.accountId).providerDisplayName ?? "Synthetic SMS"
    : "Synthetic SMS");
  const smsFingerprint = await computeSmsFingerprint({
    sender, body: sourceText, receivedAtMs: Date.parse(FIXTURE_DATE),
  });
  return accountReviewRowSchema.parse({
    ...makeRowBase(row, ids, state),
    source: "SMS", sourceFingerprint: smsFingerprint,
    transaction: makeSmsFinancialSnapshot(row, bindings, sourceText, sender, smsFingerprint),
  });
}

async function makeGroup(
  scene: FixtureScene,
  group: FixtureGroup,
  bindings: FixtureBindings,
  ids: FixtureIds
): Promise<AccountReviewGroup> {
  const account = requireGroupIdentity(bindings, group);
  const evidenceKey = await sha256(scopedSeed(bindings.ownerId, scene, "evidence",
    [group.name, group.type, group.currency, group.cardLast4, group.groupId].join("|")));
  return accountReviewGroupSchema.parse({
    groupId: requireBoundId(ids.groups, group.groupId),
    evidenceKey, suggestionRefs: [`fixture:${scene.id}:${group.groupId}`],
    name: group.name, type: group.type, currency: group.currency,
    institutionId: account.institutionId,
    providerDisplayName: account.providerDisplayName, cardLast4: group.cardLast4,
    senderNames: [...account.senderNames],
    linkedRowIds: group.linkedRowIds.map((id) => requireBoundId(ids.rows, id)),
    status: group.status, revision: FIXTURE_REVISION,
    confirmedIdentityRevision: group.status === "confirmed" ? FIXTURE_REVISION : null,
  });
}

/** Build the exact canonical session, never a reduced review/fixture DTO. */
export async function buildFixtureReviewSession(
  scene: FixtureScene,
  bindings: FixtureBindings
): Promise<AccountReviewSession> {
  const ids = await makeIdentities(scene, bindings.ownerId);
  const rows: readonly FixtureRow[] = scene.rows;
  const groups: readonly FixtureGroup[] = scene.groups;
  const [reviewRows, reviewGroups] = await Promise.all([
    Promise.all(rows.map((row) => makeRow(scene, row, bindings, ids))),
    Promise.all(groups.map((group) => makeGroup(scene, group, bindings, ids))),
  ]);
  return accountReviewSessionSchema.parse({
    ownerId: bindings.ownerId, source: scene.source, sessionId: ids.sessionId,
    sourceRevision: FIXTURE_REVISION, preferredCurrency: bindings.snapshots.preferredCurrency,
    rows: reviewRows, groups: reviewGroups,
    removedEvidenceKeys: reviewGroups.filter((group) => group.status === "removed")
      .map((group) => group.evidenceKey),
    filter: "all", revision: FIXTURE_REVISION, operationGeneration: FIXTURE_REVISION,
    saveIntent: null,
  });
}
