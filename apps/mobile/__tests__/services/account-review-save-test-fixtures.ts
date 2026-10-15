/**
 * T043 canonical test sessions and frozen SaveIntent values.
 * Source-specific transactions are schema-validated; no copied domain DTO.
 * These are synthetic owners/accounts, NOT runtime seeded T015 financial data.
 */
import { createHash } from "node:crypto";
import { uuidV8FromSha256 } from "../../../../packages/logic/src/account-review/identity";
import { normalizeAccountSmsSender } from "../../services/account-sms-sender-service";
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
export const GROUP_WALLET = testUuid(13);
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
  | "sms-new-wallet"
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

function groupName(groupId: string | undefined): string {
  if (groupId === GROUP_CASH) return "Cash";
  if (groupId === GROUP_CIB) return "CIB";
  if (groupId === GROUP_WALLET) return "Wallet";
  return "QNB";
}
function groupType(groupId: string): "CASH" | "BANK" | "DIGITAL_WALLET" {
  if (groupId === GROUP_CASH) return "CASH";
  return groupId === GROUP_WALLET ? "DIGITAL_WALLET" : "BANK";
}
function accountEvidence(spec: RowSpec): object {
  const hasGroup = spec.groupId !== undefined;
  const name = groupName(spec.groupId);
  const bank = spec.groupId === GROUP_QNB || spec.groupId === GROUP_CIB;
  const field = spec.source === "VOICE" ? "transcript" : "body";
  return {
    state: hasGroup ? "explicit" : "absent",
    name: hasGroup ? name : null,
    type: hasGroup ? groupType(spec.groupId) : null,
    institutionId: bank ? name.toLowerCase() : null,
    providerDisplayName: hasGroup ? name : null,
    cardLast4: bank ? spec.groupId === GROUP_CIB ? "5566" : "0007" : null,
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
  const label = groupName(spec.groupId) + " Lunch";
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
      spec.groupId === GROUP_WALLET ? "Wally Pay" :
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
  const type = groupType(groupId);
  const bank = type === "BANK";
  const name = groupName(groupId);
  return accountReviewGroupSchema.parse({
    groupId, evidenceKey: groupId === GROUP_CASH ? "c".repeat(64) :
      groupId === GROUP_CIB ? "e".repeat(64) : "d".repeat(64),
    suggestionRefs: ["synthetic:" + name], name, type, currency: "EGP",
    institutionId: bank ? name.toLowerCase() : null,
    providerDisplayName: name,
    cardLast4: bank ? groupId === GROUP_CIB ? "5566" : "0007" : null,
    senderNames: groupId === GROUP_WALLET
      ? ["  Wally   Pay ", "WALLY Pay", "wally pay "]
      : bank ? [name] : [],
    linkedRowIds: rows.filter((item) =>
      item.assignment.state === "suggested" &&
      item.assignment.groupId === groupId
    ).map((item) => item.rowId),
    status: "confirmed", revision: "0", confirmedIdentityRevision: "0",
  });
}
function voiceSharedRows(): readonly AccountReviewRow[] {
  return [
    row({ index: 1, source: "VOICE", amount: "20.01", groupId: GROUP_QNB }),
    row({ index: 2, source: "VOICE", amount: "5.01", groupId: GROUP_QNB, selected: false }),
    row({ index: 3, source: "VOICE", amount: "10", groupId: GROUP_QNB, selected: false }),
    row({ index: 4, source: "VOICE", amount: "8", groupId: GROUP_CIB, selected: false }),
    row({ index: 5, source: "VOICE", amount: "3", existingAccountId: CASH }),
    row({ index: 6, source: "VOICE", amount: "2", existingAccountId: CASH, selected: false }),
    row({ index: 7, source: "VOICE", amount: "5", existingAccountId: CASH, selected: false }),
  ];
}
function smsSharedRows(): readonly AccountReviewRow[] {
  return [
    row({ index: 1, source: "SMS", amount: "20.01",
      groupId: GROUP_QNB, fingerprint: FINGERPRINT_A }),
    row({ index: 2, source: "SMS", amount: "5.01",
      groupId: GROUP_QNB, selected: false, fingerprint: FINGERPRINT_B }),
    row({ index: 3, source: "SMS", amount: "8",
      groupId: GROUP_QNB, selected: false, fingerprint: FINGERPRINT_C }),
    row({ index: 4, source: "SMS", amount: "3",
      groupId: GROUP_CIB, selected: false, fingerprint: "e".repeat(64) }),
  ];
}
function voiceZeroNetRows(): readonly AccountReviewRow[] {
  return [
    row({ index: 1, source: "VOICE", amount: "20.01",
      type: "INCOME", existingAccountId: BANK }),
    row({ index: 2, source: "VOICE", amount: "20.01",
      type: "EXPENSE", existingAccountId: BANK }),
  ];
}
function smsNewBankRows(): readonly AccountReviewRow[] {
  return [
    row({ index: 1, source: "SMS", amount: "20.01",
      type: "INCOME", groupId: GROUP_QNB, fingerprint: FINGERPRINT_A }),
    row({ index: 2, source: "SMS", amount: "5.01",
      type: "EXPENSE", groupId: GROUP_QNB, fingerprint: FINGERPRINT_B }),
  ];
}
function smsNewWalletRows(): readonly AccountReviewRow[] {
  return [
    row({ index: 1, source: "SMS", amount: "10", type: "INCOME",
      groupId: GROUP_WALLET, fingerprint: FINGERPRINT_A }),
  ];
}
function smsMixedRows(): readonly AccountReviewRow[] {
  return [
    row({ index: 1, source: "SMS", amount: "10",
      existingAccountId: BANK, fingerprint: FINGERPRINT_A }),
    row({ index: 2, source: "SMS", amount: "5",
      existingAccountId: BANK, fingerprint: FINGERPRINT_B }),
  ];
}
function scenarioRows(name: SaveScenario): readonly AccountReviewRow[] {
  if (name === "voice-shared") return voiceSharedRows();
  if (name === "sms-shared") return smsSharedRows();
  if (name === "voice-zero-net") return voiceZeroNetRows();
  if (name === "sms-new-bank") return smsNewBankRows();
  if (name === "sms-new-wallet") return smsNewWalletRows();
  if (name === "sms-mixed") return smsMixedRows();
  if (name === "voice-cash") return [
    row({ index: 1, source: "VOICE", amount: "11", groupId: GROUP_CASH }),
  ];
  if (name === "sms-atm") return [
    row({ index: 1, source: "SMS", amount: "25.05",
      existingAccountId: BANK, destinationId: CASH, fingerprint: FINGERPRINT_C }),
  ];
  const source = name.startsWith("voice") ? "VOICE" : "SMS";
  const fingerprint = FINGERPRINT_B;
  return [row({ index: 1, source, amount: "10",
    existingAccountId: BANK, fingerprint })];
}
/** Test-only Node hash input, with Core's existing pure UUIDv8 projection. */
export function expectedChildLocalRef(
  ownerId: string, sessionId: string, groupId: string,
  kind: "bank_details" | "account_sms_sender",
  normalizedSender?: string
): string {
  if (kind === "account_sms_sender" && !normalizedSender) {
    throw new Error("Missing normalized sender for child alias");
  }
  const preimage = kind === "bank_details"
    ? ["account-review-localref/v1", ownerId, sessionId, groupId, kind]
    : ["account-review-localref/v1", ownerId, sessionId, groupId,
      kind, normalizedSender];
  const digest = createHash("sha256").update(JSON.stringify(preimage), "utf8")
    .digest("hex");
  return uuidV8FromSha256(digest);
}
/** The existing mobile sender normalizer owns dedup equivalence. */
export function uniquePlannedSenderAliases(
  senderNames: readonly string[]
): readonly string[] {
  const seen = new Set<string>();
  const aliases: string[] = [];
  for (const senderName of senderNames) {
    const normalized = normalizeAccountSmsSender(senderName);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    aliases.push(normalized);
  }
  return aliases;
}
function plannedGroupChildren(
  group: AccountReviewGroup, index: number, ownerId: string, sessionId: string
): AccountReviewSaveIntent["plannedEntityIds"] {
  if (group.type === "CASH") return [];
  const children: Array<AccountReviewSaveIntent["plannedEntityIds"][number]> = [];
  if (group.type === "BANK") children.push({
    entity: "bank_details",
    localRef: expectedChildLocalRef(ownerId, sessionId, group.groupId, "bank_details"),
    id: testUuid(720 + index),
  });
  for (const [senderIndex, normalized] of
    uniquePlannedSenderAliases(group.senderNames).entries()) {
    children.push({
      entity: "account_sms_sender",
      localRef: expectedChildLocalRef(
        ownerId, sessionId, group.groupId, "account_sms_sender", normalized
      ),
      id: testUuid(740 + index * 10 + senderIndex),
    });
  }
  return children;
}
function plannedAccountIds(
  groups: readonly AccountReviewGroup[],
  ownerId: string, sessionId: string
): AccountReviewSaveIntent["plannedEntityIds"] {
  return groups.flatMap((group, index) => {
    if (group.type === null) throw new Error("Unconfirmed account type");
    const account = {
      entity: "account" as const,
      localRef: group.groupId,
      id: testUuid(700 + index),
    };
    return [account, ...plannedGroupChildren(group, index, ownerId, sessionId)];
  });
}
export function freezeSaveIntent(session: AccountReviewSession): AccountReviewSaveIntent {
  const selected = session.rows.filter((item) => item.selected);
  const groups = session.groups.filter((item) =>
    selected.some((r) => r.assignment.state === "suggested" &&
      r.assignment.groupId === item.groupId)
  );
  const plannedRows: AccountReviewSaveIntent["plannedEntityIds"] =
    selected.map((item, index) => ({
      entity: item.source === "SMS" && item.transaction.isAtmWithdrawal === true
        ? "transfer" : "transaction",
      localRef: item.rowId, id: testUuid(500 + index),
    }));
  return accountReviewSaveIntentSchema.parse({
    actionId: ACTION, ownerId: session.ownerId, source: session.source,
    sessionId: session.sessionId, expectedReviewRevision: session.revision,
    expectedOperationGeneration: session.operationGeneration,
    selectedRows: selected.map((item) => ({ rowId: item.rowId, revision: item.revision })),
    confirmedGroups: groups.map((item) => ({
      groupId: item.groupId, revision: item.revision, evidenceKey: item.evidenceKey,
    })),
    plannedEntityIds: [
      ...plannedRows,
      ...plannedAccountIds(groups, session.ownerId, session.sessionId),
    ],
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
export function selectedSmsFingerprint(fixture: SaveFixture): string {
  const selected = fixture.session.rows.filter((row) => row.selected);
  if (selected.length !== 1 || selected[0]?.source !== "SMS") {
    throw new Error("Expected exactly one selected SMS source row");
  }
  return selected[0].sourceFingerprint;
}
/** A valid new selection/generation that intentionally keeps the prior action ID. */
export function changedSelectedSharedQnb(fixture: SaveFixture): SaveFixture {
  const qnb = fixture.session.rows.filter((row) =>
    row.assignment.state === "suggested" &&
    row.assignment.groupId === GROUP_QNB
  );
  const chosen = qnb.find((row) => row.selected);
  const replacement = qnb.find((row) => !row.selected);
  if (!chosen || !replacement) throw new Error("Shared QNB needs a swappable row");
  const rows = fixture.session.rows.map((row) => {
    if (row.rowId === chosen.rowId) return {
      ...row, selected: false, revision: "1",
    };
    if (row.rowId === replacement.rowId) return {
      ...row, selected: true, revision: "1",
    };
    return row;
  });
  const next = accountReviewSessionSchema.parse({
    ...fixture.session, revision: "1", operationGeneration: "1",
    rows, saveIntent: null,
  });
  const intent = freezeSaveIntent(next);
  if (intent.actionId !== fixture.intent.actionId) {
    throw new Error("Changed selection must retain the frozen action ID");
  }
  return {
    session: accountReviewSessionSchema.parse({ ...next, saveIntent: intent }),
    intent,
  };
}
