/**
 * #395 T025 only: canonical in-memory SMS review envelopes for codec/atomic
 * command RED tests. No fake DB, production codec, reducer or writer here.
 */
import {
  accountReviewSessionSchema,
  type AccountReviewGroup,
  type AccountReviewRow,
  type AccountReviewSession,
} from "../../account-review/schemas";
import {
  makeParsedSms,
  NORMALIZATION_IDS,
} from "../../account-review/__tests__/normalization-fixtures";
import type { ParsedSmsTransaction } from "../../types";

export const T025_IDS = Object.freeze({
  owner: NORMALIZATION_IDS.owner,
  foreignOwner: NORMALIZATION_IDS.foreignOwner,
  queue: "00000000-0000-4000-8000-000000002501",
  alternateQueue: "00000000-0000-4000-8000-000000002502",
  rowOne: "00000000-0000-4000-8000-000000002503",
  rowTwo: "00000000-0000-4000-8000-000000002504",
  group: "00000000-0000-4000-8000-000000002505",
  undoToken: "00000000-0000-4000-8000-000000002506",
  fingerprintOne: NORMALIZATION_IDS.smsFingerprint,
  fingerprintTwo: NORMALIZATION_IDS.secondSmsFingerprint,
  evidenceKey: "a".repeat(64),
});

const ORIGINAL_BODIES = ["QNB purchase EGP 50", "QNB purchase EGP 25"] as const;

export function makeT025SmsOriginal(index = 0): ParsedSmsTransaction {
  if (index !== 0 && index !== 1)
    throw new Error("Unknown T025 original index");
  return {
    ...makeParsedSms(),
    smsFingerprint:
      index === 0 ? T025_IDS.fingerprintOne : T025_IDS.fingerprintTwo,
    rawSmsBody: ORIGINAL_BODIES[index],
    amount: index === 0 ? 50 : 25,
    categoryConfirmed: true,
  };
}

function groupForRows(ids: readonly string[]): AccountReviewGroup {
  return {
    groupId: T025_IDS.group,
    evidenceKey: T025_IDS.evidenceKey,
    suggestionRefs: ["t025-qnb-source-suggestion"],
    name: "QNB",
    type: "BANK",
    currency: "EGP",
    institutionId: null,
    providerDisplayName: "QNB",
    cardLast4: null,
    senderNames: ["QNB"],
    linkedRowIds: [...ids],
    status: "pending",
    revision: "0",
    confirmedIdentityRevision: null,
  };
}

function rowForOriginal(
  transaction: ParsedSmsTransaction,
  rowId: string,
  index: number
): AccountReviewRow {
  const body = transaction.rawSmsBody;
  const start = body.indexOf("QNB");
  if (start < 0) throw new Error("Ungrounded SMS row fixture");
  return {
    rowId,
    source: "SMS",
    sourceRef: `t025-original-message-${index + 1}`,
    sourceFingerprint: transaction.smsFingerprint,
    transaction: {
      ...transaction,
      reviewReasons: transaction.reviewReasons
        ? [...transaction.reviewReasons]
        : undefined,
    },
    amountDecimal: String(transaction.amount),
    accountEvidence: {
      state: "explicit",
      name: "QNB",
      type: "BANK",
      institutionId: null,
      providerDisplayName: "QNB",
      cardLast4: null,
      evidenceSpans: [
        {
          sourceRef: `t025-original-message-${index + 1}`,
          field: "body",
          start,
          end: start + 3,
          text: "QNB",
        },
      ],
      candidateAccountIds: [],
    },
    toAccountEvidence: null,
    currency: { state: "known", code: "EGP", origin: "explicit" },
    assignment: {
      state: "suggested",
      accountId: null,
      groupId: T025_IDS.group,
      groupRevision: "0",
      confirmation: "pending",
    },
    toAssignment: null,
    reviewReasons: ["account_group_unconfirmed"],
    selected: false,
    revision: "0",
    hasUserAccountOverride: false,
    hasUserCurrencyOverride: false,
  };
}

export function makeT025ReviewSession(
  queueId: string = T025_IDS.queue,
  originals: readonly ParsedSmsTransaction[] = [makeT025SmsOriginal()],
  ids: readonly string[] = [T025_IDS.rowOne]
): AccountReviewSession {
  if (originals.length === 0 || originals.length !== ids.length) {
    throw new Error("T025 fixtures require reciprocal original/row identities");
  }
  const rows = originals.map((original, index) => {
    const id = ids[index];
    if (!id) throw new Error("Missing T025 draft UUID");
    return rowForOriginal(original, id, index);
  });
  return accountReviewSessionSchema.parse({
    ownerId: T025_IDS.owner,
    source: "SMS",
    sessionId: queueId,
    sourceRevision: "0",
    preferredCurrency: "EGP",
    rows,
    groups: [groupForRows(ids)],
    removedEvidenceKeys: [],
    filter: "all",
    revision: "0",
    operationGeneration: "0",
    saveIntent: null,
  });
}

/** A valid, already-confirmed review before selecting checked rows. */
export function makeT025ConfirmedSession(
  original: AccountReviewSession,
  selectedRowIds: readonly string[] = []
): AccountReviewSession {
  const revision = "1";
  return accountReviewSessionSchema.parse({
    ...original,
    revision,
    operationGeneration: revision,
    groups: original.groups.map((group) => ({
      ...group,
      status: "confirmed",
      revision,
      confirmedIdentityRevision: revision,
    })),
    rows: original.rows.map((row) => ({
      ...row,
      selected: selectedRowIds.includes(row.rowId),
      revision,
      reviewReasons: row.reviewReasons.filter(
        (reason) => reason !== "account_group_unconfirmed"
      ),
      assignment:
        row.assignment.state === "suggested"
          ? {
              ...row.assignment,
              groupRevision: revision,
              confirmation: "confirmed",
            }
          : row.assignment,
    })),
  });
}

/** Exactly the one-row V2 JSON review property, no shadow DTO or Undo lease. */
export function makeT025StoredReview(
  session: AccountReviewSession,
  rowId: string
): Pick<
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
  readonly row: AccountReviewRow;
} {
  const row = session.rows.find((item) => item.rowId === rowId);
  if (!row) throw new Error("T025 row missing from canonical session");
  return {
    ownerId: session.ownerId,
    sessionId: session.sessionId,
    sourceRevision: session.sourceRevision,
    preferredCurrency: session.preferredCurrency,
    reviewRevision: session.revision,
    operationGeneration: session.operationGeneration,
    row,
    groups: session.groups.filter(
      (group) =>
        group.linkedRowIds.includes(rowId) ||
        session.removedEvidenceKeys.includes(group.evidenceKey)
    ),
    removedEvidenceKeys: [...session.removedEvidenceKeys],
  };
}

/** One-row SMS ATM V2 input with optional source and reciprocal Cash destination. */
export function makeT025SmsAtmCodecInput(sourceGroupActive: boolean): {
  readonly transaction: ParsedSmsTransaction;
  readonly review: ReturnType<typeof makeT025StoredReview>;
} {
  const session = makeT025ReviewSession();
  const row = session.rows[0];
  const source = session.groups[0];
  if (!source || row?.source !== "SMS")
    throw new Error("Missing SMS row/group");
  // Preserve canonical mutable review reasons when crossing from parsed SMS.
  const transaction = {
    ...row.transaction,
    reviewReasons: row.transaction.reviewReasons
      ? [...row.transaction.reviewReasons]
      : undefined,
    isAtmWithdrawal: true,
  };
  const cash: AccountReviewGroup = {
    ...source,
    groupId: T025_IDS.alternateQueue,
    evidenceKey: "b".repeat(64),
    suggestionRefs: ["t025-cash-destination"],
    name: "TEST Cash destination",
    type: "CASH",
    providerDisplayName: null,
    cardLast4: null,
    senderNames: [],
    status: "confirmed",
    confirmedIdentityRevision: "0",
  };
  const atmRow: AccountReviewRow = {
    ...row,
    transaction,
    assignment: sourceGroupActive
      ? row.assignment
      : {
          state: "existing",
          accountId: "00000000-0000-4000-8000-000000000102",
          origin: "user",
          currency: "EGP",
          identityRevision: "0",
        },
    toAssignment: {
      state: "suggested",
      accountId: null,
      groupId: cash.groupId,
      groupRevision: cash.revision,
      confirmation: "confirmed",
    },
    reviewReasons: sourceGroupActive ? ["account_group_unconfirmed"] : [],
    selected: false,
  };
  return {
    transaction,
    review: {
      ...makeT025StoredReview(session, row.rowId),
      row: atmRow,
      groups: sourceGroupActive ? [source, cash] : [cash],
    },
  };
}
