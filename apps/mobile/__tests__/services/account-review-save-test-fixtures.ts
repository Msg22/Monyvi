/**
 * T043 canonical test sessions and frozen SaveIntent values.
 * Source-specific transactions are schema-validated; no copied domain DTO.
 * These are synthetic owners/accounts, NOT runtime seeded T015 financial data.
 */
import {
  accountReviewGroupSchema,
  accountReviewRowSchema,
  accountReviewSaveIntentSchema,
  accountReviewSessionSchema,
  type AccountReviewGroup,
  type AccountReviewRow,
  type AccountReviewSaveIntent,
  type AccountReviewSession,
} from "@monyvi/logic";

export function testUuid(n: number): string {
  return "018f0c7a-1234-4abc-8def-" + String(n).padStart(12, "0");
}
export const OWNER = testUuid(1);
export const FOREIGN_OWNER = testUuid(2);
export const BANK = testUuid(3);
export const CASH = testUuid(4);
export const WALLET = testUuid(5);
export const CATEGORY = testUuid(6);
export const INCOME_CATEGORY = testUuid(12);
export const SESSION = testUuid(7);
export const ACTION = testUuid(8);
export const GROUP_QNB = testUuid(9);
export const GROUP_CIB = testUuid(10);
export const GROUP_CASH = testUuid(11);
export const FINGERPRINT_A = "a".repeat(64);
export const FINGERPRINT_B = "b".repeat(64);
export const FINGERPRINT_C = "c".repeat(64);
export const TEST_DATE = new Date("2026-10-15T12:00:00.000Z");

export type SaveScenario =
  | "voice-existing"
  | "voice-shared"
  | "voice-zero-net"
  | "voice-cash"
  | "sms-existing"
  | "sms-new-bank"
  | "sms-shared"
  | "sms-atm"
  | "sms-all-dedup"
  | "sms-mixed";

export interface SaveFixture {
  readonly session: AccountReviewSession;
  readonly intent: AccountReviewSaveIntent;
}

interface RowSpec {
  readonly index: number;
  readonly source: AccountReviewSession["source"];
  readonly amount: string;
  readonly type?: "INCOME" | "EXPENSE";
  readonly selected?: boolean;
  readonly groupId?: string;
  readonly existingAccountId?: string;
  readonly destinationId?: string;
  readonly fingerprint?: string;
}

function accountEvidence(spec: RowSpec): object {
  const hasGroup = spec.groupId !== undefined;
  const name = spec.groupId === GROUP_CASH ? "Cash" :
    spec.groupId === GROUP_CIB ? "CIB" : "QNB";
  const field = spec.source === "VOICE" ? "transcript" : "body";
  return {
    state: hasGroup ? "explicit" : "absent",
    name: hasGroup ? name : null,
    type: hasGroup ? (spec.groupId === GROUP_CASH ? "CASH" : "BANK") : null,
    institutionId: hasGroup && spec.groupId !== GROUP_CASH
      ? name.toLowerCase() : null,
    providerDisplayName: hasGroup ? name : null,
    cardLast4: hasGroup && spec.groupId !== GROUP_CASH
      ? spec.groupId === GROUP_CIB ? "5566" : "0007" : null,
    evidenceSpans: hasGroup ? [{
      sourceRef: "fixture:" + spec.index,
      field, start: 0, end: name.length, text: name,
    }] : [],
    candidateAccountIds: [],
  };
}
function assignment(spec: RowSpec): object {
  if (spec.groupId !== undefined) return {
    state: "suggested", accountId: null, groupId: spec.groupId,
    groupRevision: "0", confirmation: "confirmed",
  };
  if (spec.existingAccountId !== undefined) return {
    state: "existing", accountId: spec.existingAccountId,
    origin: "user", currency: "EGP", identityRevision: "0",
  };
  return {
    state: "unresolved", accountId: null,
    reasonCode: "account_unavailable", candidateAccountIds: [],
  };
}
function transaction(spec: RowSpec): object {
  const label = spec.groupId === GROUP_CIB ? "CIB Lunch" :
    spec.groupId === GROUP_CASH ? "Cash Lunch" : "QNB Lunch";
  const common = {
    amount: Number(spec.amount), currency: "EGP",
    type: spec.type ?? "EXPENSE",
    categoryId: spec.type === "INCOME" ? INCOME_CATEGORY : CATEGORY,
    date: new Date(TEST_DATE), categoryDisplayName: "Food",
    confidence: 1, originLabel: "Synthetic bank", counterparty: "Lunch",
  };
  if (spec.source === "VOICE") return {
    ...common, source: "VOICE", note: label, originalTranscript: label,
    detectedLanguage: "en", aiDetectedCurrency: "EGP",
  };
  return {
    ...common, source: "SMS", smsFingerprint: spec.fingerprint ?? FINGERPRINT_A,
    rawSmsBody: label, senderDisplayName:
      spec.groupId === GROUP_CIB ? "CIB" : "QNB",
    ...(spec.destinationId === undefined ? {} : {
      isAtmWithdrawal: true, toAccountId: spec.destinationId,
    }),
  };
}
function row(spec: RowSpec): AccountReviewRow {
  return accountReviewRowSchema.parse({
    rowId: testUuid(100 + spec.index), source: spec.source,
    sourceRef: "fixture:" + spec.index,
    sourceFingerprint: spec.source === "SMS"
      ? spec.fingerprint ?? FINGERPRINT_A : null,
    amountDecimal: spec.amount,
    accountEvidence: accountEvidence(spec),
    currency: { state: "known", code: "EGP", origin: "explicit" },
    assignment: assignment(spec),
    toAssignment: spec.destinationId === undefined ? null : {
      state: "existing", accountId: spec.destinationId,
      origin: "user", currency: "EGP", identityRevision: "0",
    },
    reviewReasons: [], selected: spec.selected ?? true,
    revision: "0", hasUserAccountOverride: false,
    hasUserCurrencyOverride: false, transaction: transaction(spec),
  });
}
function group(groupId: string, rows: readonly AccountReviewRow[]): AccountReviewGroup {
  const cash = groupId === GROUP_CASH;
  const name = groupId === GROUP_CIB ? "CIB" : cash ? "Cash" : "QNB";
  return accountReviewGroupSchema.parse({
    groupId, evidenceKey: cash ? "c".repeat(64) :
      groupId === GROUP_CIB ? "e".repeat(64) : "d".repeat(64),
    suggestionRefs: ["synthetic:" + name], name,
    type: cash ? "CASH" : "BANK", currency: "EGP",
    institutionId: cash ? null : name.toLowerCase(),
    providerDisplayName: name, cardLast4: cash ? null :
      groupId === GROUP_CIB ? "5566" : "0007",
    senderNames: cash ? [] : [name],
    linkedRowIds: rows.filter((item) =>
      item.assignment.state === "suggested" &&
      item.assignment.groupId === groupId
    ).map((item) => item.rowId),
    status: "confirmed", revision: "0", confirmedIdentityRevision: "0",
  });
}
function scenarioRows(name: SaveScenario): readonly AccountReviewRow[] {
  const voice = name.startsWith("voice");
  const source = voice ? "VOICE" : "SMS";
  if (name === "voice-zero-net") return [
    row({ index: 1, source, amount: "20.01", type: "INCOME", existingAccountId: BANK }),
    row({ index: 2, source, amount: "20.01", type: "EXPENSE", existingAccountId: BANK }),
  ];
  if (name === "sms-new-bank") return [
    row({ index: 1, source, amount: "20.01", type: "INCOME", groupId: GROUP_QNB, fingerprint: FINGERPRINT_A }),
    row({ index: 2, source, amount: "5.01", type: "EXPENSE", groupId: GROUP_QNB, fingerprint: FINGERPRINT_B }),
  ];
  if (name === "sms-shared") return [
    row({ index: 1, source, amount: "20.01", groupId: GROUP_QNB,
      fingerprint: FINGERPRINT_A }),
    row({ index: 2, source, amount: "5.01", groupId: GROUP_QNB,
      selected: false, fingerprint: FINGERPRINT_B }),
    row({ index: 3, source, amount: "8", groupId: GROUP_QNB,
      selected: false, fingerprint: FINGERPRINT_C }),
    row({ index: 4, source, amount: "3", groupId: GROUP_CIB,
      selected: false, fingerprint: "e".repeat(64) }),
  ];
  if (name === "sms-atm") return [
    row({ index: 1, source, amount: "25.05", existingAccountId: BANK,
      destinationId: CASH, fingerprint: FINGERPRINT_C }),
  ];
  if (name === "voice-cash") return [
    row({ index: 1, source, amount: "11", groupId: GROUP_CASH }),
  ];
  if (name === "voice-shared") return [
    row({ index: 1, source, amount: "20.01", groupId: GROUP_QNB }),
    row({ index: 2, source, amount: "5.01", groupId: GROUP_QNB, selected: false }),
    row({ index: 3, source, amount: "10", groupId: GROUP_QNB, selected: false }),
    row({ index: 4, source, amount: "8", groupId: GROUP_CIB, selected: false }),
    row({ index: 5, source, amount: "3", existingAccountId: CASH }),
    row({ index: 6, source, amount: "2", existingAccountId: CASH, selected: false }),
    row({ index: 7, source, amount: "5", existingAccountId: CASH, selected: false }),
  ];
  if (name === "sms-mixed") return [
    row({ index: 1, source, amount: "10", existingAccountId: BANK, fingerprint: FINGERPRINT_A }),
    row({ index: 2, source, amount: "5", existingAccountId: BANK, fingerprint: FINGERPRINT_B }),
  ];
  const fingerprint = name === "sms-all-dedup" ? FINGERPRINT_A : FINGERPRINT_B;
  return [row({ index: 1, source, amount: "10", existingAccountId: BANK, fingerprint })];
}
export function freezeSaveIntent(session: AccountReviewSession): AccountReviewSaveIntent {
  const selected = session.rows.filter((item) => item.selected);
  const groups = session.groups.filter((item) =>
    selected.some((r) => r.assignment.state === "suggested" &&
      r.assignment.groupId === item.groupId)
  );
  const ids = selected.map((item, index) => ({
    entity: item.source === "SMS" && item.transaction.isAtmWithdrawal === true
      ? "transfer" : "transaction",
    localRef: item.rowId, id: testUuid(500 + index),
  }));
  const newIds = groups.flatMap((item, index) => {
    const account = { entity: "account", localRef: testUuid(600 + index),
      id: testUuid(700 + index) };
    if (item.type === "CASH") return [account];
    return [account, {
      entity: "bank_details", localRef: testUuid(620 + index),
      id: testUuid(720 + index),
    }, {
      entity: "account_sms_sender", localRef: testUuid(640 + index),
      id: testUuid(740 + index),
    }];
  });
  return accountReviewSaveIntentSchema.parse({
    actionId: ACTION, ownerId: session.ownerId, source: session.source,
    sessionId: session.sessionId, expectedReviewRevision: session.revision,
    expectedOperationGeneration: session.operationGeneration,
    selectedRows: selected.map((item) => ({rowId: item.rowId, revision: item.revision})),
    confirmedGroups: groups.map((item) => ({
      groupId: item.groupId, revision: item.revision, evidenceKey: item.evidenceKey,
    })), plannedEntityIds: [...ids, ...newIds],
    occurredAt: "2026-10-15T12:00:00.000Z",
  });
}
export function makeSaveFixture(name: SaveScenario = "voice-existing"): SaveFixture {
  const rows = scenarioRows(name);
  const groupIds = [...new Set(rows.flatMap((r) =>
    r.assignment.state === "suggested" ? [r.assignment.groupId] : []
  ))];
  const groups = groupIds.map((id) => group(id, rows));
  const source = name.startsWith("voice") ? "VOICE" : "SMS";
  const session = accountReviewSessionSchema.parse({
    ownerId: OWNER, source, sessionId: SESSION, sourceRevision: "0",
    preferredCurrency: "EGP", rows, groups, removedEvidenceKeys: [],
    filter: "all", revision: "0", operationGeneration: "0", saveIntent: null,
  });
  const intent = freezeSaveIntent(session);
  return { session: accountReviewSessionSchema.parse({
    ...session, saveIntent: intent,
  }), intent };
}
export function changeSession(
  fixture: SaveFixture,
  mutate: (session: AccountReviewSession) => AccountReviewSession
): SaveFixture {
  return { ...fixture, session: accountReviewSessionSchema.parse(mutate(fixture.session)) };
}
export function changeIntent(
  fixture: SaveFixture,
  mutate: (intent: AccountReviewSaveIntent) => AccountReviewSaveIntent
): SaveFixture {
  return { ...fixture, intent: accountReviewSaveIntentSchema.parse(mutate(fixture.intent)) };
}
