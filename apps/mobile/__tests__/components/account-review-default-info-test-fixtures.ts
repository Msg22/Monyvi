/**
 * #395 T018 — synthetic canonical sessions for presentational Red only.
 * No WatermelonDB, parser/provider, route, Save, or production fixture override.
 * The actual owner-scoped fixture/service remains the T015/T054 boundary.
 */
import {
  accountReviewAccountEvidenceSchema,
  accountReviewReasonSchema,
  accountReviewRowSchema,
  accountReviewGroupSchema,
  accountReviewSessionSchema,
  type AccountReviewAccountEvidence,
  type AccountReviewGroup,
  type AccountReviewRow,
  type AccountReviewSession,
} from "@monyvi/logic";
import manifest from "../../e2e/fixtures/shared-account-review.json";

type Scenario = (typeof manifest.scenes)[number];
type ScenarioRow = Scenario["rows"][number];
type ScenarioGroup = Scenario["groups"][number];

const TEST_DATE_MS = Date.parse("2026-10-15T12:00:00.000Z");
const TEST_CATEGORY_NAME = "Other";

function requireScene(id: "r3-default-only" | "r3-combined-en"): Scenario {
  const scene = manifest.scenes.find((item) => item.id === id);
  if (!scene || scene.source !== "VOICE") {
    throw new Error("Expected a known, Voice-only B1 scenario");
  }
  return scene;
}

function linkedGroup(
  scene: Scenario,
  row: ScenarioRow
): ScenarioGroup | undefined {
  return scene.groups.find((group) => group.groupId === row.groupId);
}

function accountEvidence(
  row: ScenarioRow,
  group: ScenarioGroup | undefined
): AccountReviewAccountEvidence {
  if (!group) {
    return accountReviewAccountEvidenceSchema.parse({
      state: "absent",
      name: null,
      type: null,
      institutionId: null,
      providerDisplayName: null,
      cardLast4: null,
      evidenceSpans: [],
      candidateAccountIds: [],
    });
  }
  return accountReviewAccountEvidenceSchema.parse({
    state: "explicit",
    name: group.name,
    type: group.type,
    institutionId: null,
    providerDisplayName: group.name,
    cardLast4: group.cardLast4,
    candidateAccountIds: [],
    evidenceSpans: [
      {
        sourceRef: row.sourceRef,
        field: "transcript",
        start: 0,
        end: group.name.length,
        text: group.name,
      },
    ],
  });
}

function reviewCurrency(row: ScenarioRow): object {
  return row.currencyCode === null
    ? {
        state: "unconfirmed",
        reason: "conflicting",
        candidateCodes: ["EGP", "USD"],
        statedCode: null,
        evidenceSpans: [],
      }
    : { state: "known", code: row.currencyCode, origin: "explicit" };
}

function rowAssignment(
  row: ScenarioRow,
  group: ScenarioGroup | undefined
): object {
  if (row.accountId !== null) {
    return {
      state: "existing",
      accountId: row.accountId,
      origin: row.accountId === manifest.defaultAccountId ? "default" : "exact",
      currency: row.currencyCode,
      identityRevision: "0",
    };
  }
  if (group && group.status !== "removed" && row.currencyCode !== null) {
    return {
      state: "suggested",
      accountId: null,
      groupId: group.groupId,
      groupRevision: "0",
      confirmation: group.status,
    };
  }
  return {
    state: "unresolved",
    accountId: null,
    reasonCode:
      row.currencyCode === null
        ? "currency_confirmation_needed"
        : "account_needed",
    candidateAccountIds: [],
  };
}

function makeVoiceTransaction(
  row: ScenarioRow,
  scene: Scenario,
  note: string
): object {
  return {
    source: "VOICE",
    amount: Number(row.amountDecimal),
    currency: row.currencyCode ?? "EGP",
    type: "EXPENSE",
    date: new Date(TEST_DATE_MS),
    categoryId: manifest.syntheticCategoryId,
    categoryDisplayName: TEST_CATEGORY_NAME,
    confidence: 0.92,
    originLabel: "Voice",
    note,
    originalTranscript: note,
    detectedLanguage: scene.language,
    aiDetectedCurrency: row.currencyCode,
    ...(row.accountId !== null ? { accountId: row.accountId } : {}),
  };
}

function makeRow(row: ScenarioRow, scene: Scenario): AccountReviewRow {
  const group = linkedGroup(scene, row);
  const reasons: readonly string[] = row.issueTags;
  const note = group
    ? `${group.name} synthetic review transaction`
    : "Synthetic default transaction";
  return accountReviewRowSchema.parse({
    rowId: row.rowId,
    source: "VOICE",
    sourceRef: row.sourceRef,
    sourceFingerprint: null,
    amountDecimal: row.amountDecimal,
    accountEvidence: accountEvidence(row, group),
    currency: reviewCurrency(row),
    assignment: rowAssignment(row, group),
    toAssignment: null,
    reviewReasons: reasons.map((reason) =>
      accountReviewReasonSchema.parse(
        reason === "amount"
          ? "ambiguous_amount"
          : reason === "category"
            ? "category_needed"
            : reason
      )
    ),
    selected: row.selected,
    revision: "0",
    hasUserAccountOverride: false,
    hasUserCurrencyOverride: false,
    transaction: makeVoiceTransaction(row, scene, note),
  });
}

function makeGroup(group: ScenarioGroup, index: number): AccountReviewGroup {
  return accountReviewGroupSchema.parse({
    groupId: group.groupId,
    evidenceKey: String(index + 1).repeat(64),
    suggestionRefs: [`t018:${group.groupId}`],
    name: group.name,
    type: group.type,
    currency: group.currency,
    institutionId: null,
    providerDisplayName: group.name,
    cardLast4: group.cardLast4,
    senderNames: [group.name],
    linkedRowIds: group.linkedRowIds,
    status: group.status,
    revision: "0",
    confirmedIdentityRevision: group.status === "confirmed" ? "0" : null,
  });
}

export function makeDefaultInfoSession(
  id: "r3-default-only" | "r3-combined-en"
): AccountReviewSession {
  const scene = requireScene(id);
  return accountReviewSessionSchema.parse({
    ownerId: "1eea0000-3950-4000-8000-000000009001",
    source: "VOICE",
    sessionId: scene.sessionId,
    sourceRevision: "0",
    preferredCurrency: "EGP",
    rows: scene.rows.map((row) => makeRow(row, scene)),
    groups: scene.groups.map((group, index) => makeGroup(group, index)),
    removedEvidenceKeys: [],
    filter: "all",
    revision: "0",
    operationGeneration: "0",
    saveIntent: null,
  });
}

export function countDefaultAssignments(session: AccountReviewSession): number {
  return session.rows.filter(
    (row) =>
      row.assignment.state === "existing" && row.assignment.origin === "default"
  ).length;
}

export function countSelected(session: AccountReviewSession): number {
  return session.rows.filter((row) => row.selected).length;
}

export function countNeedsReview(session: AccountReviewSession): number {
  return session.rows.filter((row) => row.reviewReasons.length > 0).length;
}
