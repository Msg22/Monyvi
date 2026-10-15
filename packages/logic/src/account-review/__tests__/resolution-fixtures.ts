/**
 * #395 T017 synthetic US1 resolution fixtures — no customer data, DB runtime,
 * platform owner, provider call, or copy of canonical currency/account enums.
 */
import {
  accountReviewRequestContextSchema,
  accountReviewSessionSchema,
  type AccountReviewAccountContext,
  type AccountReviewAccountEvidence,
  type AccountReviewAssignment,
  type AccountReviewCurrency,
  type AccountReviewGroup,
  type AccountReviewRequestContext,
  type AccountReviewRow,
  type AccountReviewSession,
} from "../schemas";
import {
  makeAccountEvidence,
  REVIEW_SMS_BODY,
  REVIEW_VOICE_TRANSCRIPT,
} from "./fixtures";

export const R17 = Object.freeze({
  owner: "00000000-0000-4000-8000-000000000101",
  foreignOwner: "00000000-0000-4000-8000-000000000201",
  session: "00000000-0000-4000-8000-000000000106",
  row: "00000000-0000-4000-8000-000000000105",
  group: "00000000-0000-4000-8000-000000000107",
  category: "00000000-0000-4000-8000-000000000108",
  bank: "00000000-0000-4000-8000-000000000102",
  secondBank: "00000000-0000-4000-8000-000000000109",
  thirdBank: "00000000-0000-4000-8000-000000000110",
  wallet: "00000000-0000-4000-8000-000000000111",
  cash: "00000000-0000-4000-8000-000000000103",
  secondCash: "00000000-0000-4000-8000-000000000112",
  missingAccount: "00000000-0000-4000-8000-000000000213",
});

export type ScopedAccount = AccountReviewAccountContext & {
  readonly isDefault: boolean;
};

/** Exact proposed T010-compatible structural input; no mobile import. */
export type ResolutionSnapshots = {
  readonly ownerId: AccountReviewSession["ownerId"];
  readonly preferredCurrency: AccountReviewRequestContext["preferredCurrency"];
  readonly accounts: readonly ScopedAccount[];
  readonly providerContext: AccountReviewRequestContext;
};

export function account(
  id: string,
  changes: Partial<ScopedAccount> = {}
): ScopedAccount {
  return {
    id, name: "QNB", currency: "EGP", type: "BANK",
    institutionId: null, providerDisplayName: "QNB", cardLast4: null,
    senderNames: ["QNB"], isDefault: false, ...changes,
  };
}

function providerAccount(local: ScopedAccount): AccountReviewAccountContext {
  return {
    id: local.id, name: local.name, currency: local.currency, type: local.type,
    institutionId: local.institutionId, providerDisplayName: local.providerDisplayName,
    cardLast4: local.cardLast4, senderNames: [...local.senderNames],
  };
}

export function snapshots(
  accounts: readonly ScopedAccount[],
  ownerId = R17.owner,
  preferredCurrency: AccountReviewRequestContext["preferredCurrency"] = "EGP"
): ResolutionSnapshots {
  const providerContext = accountReviewRequestContextSchema.parse({
    reviewContractVersion: "account-review/v2", preferredCurrency,
    accounts: accounts.map(providerAccount),
  });
  return { ownerId, preferredCurrency, accounts, providerContext };
}

export function absentEvidence(): AccountReviewAccountEvidence {
  return {
    state: "absent", name: null, type: null,
    institutionId: null, providerDisplayName: null, cardLast4: null,
    evidenceSpans: [], candidateAccountIds: [],
  };
}

export function explicitEvidence(
  source: "VOICE" | "SMS" = "VOICE"
): AccountReviewAccountEvidence {
  return makeAccountEvidence(source);
}

export function unresolved(
  reasonCode: Extract<AccountReviewAssignment, { state: "unresolved" }>["reasonCode"] = "account_needed",
  candidateAccountIds: readonly string[] = []
): AccountReviewAssignment {
  return { state: "unresolved", accountId: null, reasonCode, candidateAccountIds: [...candidateAccountIds] };
}

export function existing(
  accountId: string,
  origin: Extract<AccountReviewAssignment, { state: "existing" }>["origin"] = "user",
  currency: Extract<AccountReviewCurrency, { state: "known" }>["code"] = "EGP"
): AccountReviewAssignment {
  return {
    state: "existing", accountId, origin, currency, identityRevision: "0",
  };
}

export function known(
  code: Extract<AccountReviewCurrency, { state: "known" }>["code"] = "EGP",
  origin: Extract<AccountReviewCurrency, { state: "known" }>["origin"] = "explicit"
): AccountReviewCurrency {
  return { state: "known", code, origin };
}

export function unconfirmed(
  reason: Extract<AccountReviewCurrency, { state: "unconfirmed" }>["reason"]
): AccountReviewCurrency {
  return {
    state: "unconfirmed", reason, candidateCodes: [], statedCode: null,
    evidenceSpans: [],
  };
}

function parsedVoice(): Extract<AccountReviewRow, { source: "VOICE" }>["transaction"] {
  return {
    source: "VOICE", amount: 50, currency: "EGP", type: "EXPENSE",
    date: new Date("2026-10-14T12:00:00.000Z"),
    categoryId: R17.category, categoryDisplayName: "Food",
    confidence: 0.98, originLabel: "Voice", note: "Synthetic lunch",
    originalTranscript: REVIEW_VOICE_TRANSCRIPT, detectedLanguage: "en",
    aiDetectedCurrency: "EGP",
  };
}

function parsedSms(): Extract<AccountReviewRow, { source: "SMS" }>["transaction"] {
  return {
    source: "SMS", amount: 50, currency: "EGP", type: "EXPENSE",
    date: new Date("2026-10-14T12:00:00.000Z"),
    categoryId: R17.category, categoryDisplayName: "Food",
    confidence: 0.98, originLabel: "QNB",
    smsFingerprint: "synthetic-fingerprint-017",
    senderDisplayName: "QNB", rawSmsBody: REVIEW_SMS_BODY,
    isAtmWithdrawal: false,
  };
}

function rowFields(): Pick<
  AccountReviewRow, "rowId" | "amountDecimal" | "accountEvidence" |
  "currency" | "assignment" | "toAssignment" | "reviewReasons" |
  "selected" | "revision" | "hasUserAccountOverride" |
  "hasUserCurrencyOverride"
> {
  return {
    rowId: R17.row, amountDecimal: "50", accountEvidence: absentEvidence(),
    currency: known(), assignment: unresolved(), toAssignment: null,
    reviewReasons: ["account_needed"], selected: false, revision: "0",
    hasUserAccountOverride: false, hasUserCurrencyOverride: false,
  };
}

export function voiceRow(): Extract<AccountReviewRow, { source: "VOICE" }> {
  return {
    ...rowFields(),
    source: "VOICE", sourceRef: "synthetic-voice-row",
    sourceFingerprint: null, transaction: parsedVoice(),
  };
}

export function smsRow(): Extract<AccountReviewRow, { source: "SMS" }> {
  return {
    ...rowFields(),
    source: "SMS", sourceRef: "synthetic-sms-row",
    sourceFingerprint: "synthetic-fingerprint-017",
    transaction: parsedSms(),
  };
}

export function session(
  source: AccountReviewSession["source"] = "VOICE"
): AccountReviewSession {
  const row = source === "VOICE" ? voiceRow() : smsRow();
  return accountReviewSessionSchema.parse({
    ownerId: R17.owner, sessionId: R17.session, source,
    sourceRevision: "0", preferredCurrency: "EGP",
    rows: [row], groups: [], removedEvidenceKeys: [], filter: "all",
    revision: "0", operationGeneration: "0", saveIntent: null,
  });
}

export function rowOf(review: AccountReviewSession): AccountReviewRow {
  const row = review.rows[0];
  if (!row) throw new Error("Synthetic session missing its first row");
  return row;
}

export function withRow(
  review: AccountReviewSession,
  next: (row: AccountReviewRow) => AccountReviewRow
): AccountReviewSession {
  return accountReviewSessionSchema.parse({
    ...review, rows: [next(rowOf(review))],
  });
}

export function pendingSession(
  source: AccountReviewSession["source"] = "VOICE"
): AccountReviewSession {
  const base = session(source);
  const original = rowOf(base);
  const assignment: AccountReviewAssignment = {
    state: "suggested", accountId: null, groupId: R17.group,
    groupRevision: "0", confirmation: "pending",
  };
  const group: AccountReviewGroup = {
    groupId: R17.group, evidenceKey: "e".repeat(64),
    suggestionRefs: ["synthetic-suggestion"], name: "QNB",
    type: "BANK", currency: "EGP", institutionId: null,
    providerDisplayName: "QNB", cardLast4: null,
    senderNames: ["QNB"], linkedRowIds: [original.rowId],
    status: "pending", revision: "0", confirmedIdentityRevision: null,
  };
  return accountReviewSessionSchema.parse({
    ...base, rows: [{ ...original, accountEvidence: explicitEvidence(source), assignment }],
    groups: [group],
  });
}

export function atmSession(
  sourceAccountId: string = R17.bank
): AccountReviewSession {
  const base = session("SMS");
  return withRow(base, (row) => {
    if (row.source !== "SMS") throw new Error("Expected SMS row");
    return {
      ...row,
      accountEvidence: explicitEvidence("SMS"),
      assignment: existing(sourceAccountId, "user"),
      hasUserAccountOverride: true,
      transaction: { ...row.transaction, isAtmWithdrawal: true },
      toAssignment: unresolved("cash_transfer_review"),
      reviewReasons: ["cash_transfer_review"],
    };
  });
}
