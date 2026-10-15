/**
 * #395 T024/T034 deterministic, source-backed pure command fixtures.
 * Canonical parser, group identity and Zod only. No runtime or fake DTO.
 */
import {
  accountReviewCommandSchema, accountReviewRequestContextSchema,
  accountReviewSessionSchema, type AccountReviewCommand,
  type AccountReviewGroup, type AccountReviewRow, type AccountReviewSession,
} from "../schemas";
import { deriveAccountReviewGroupIdentity } from "../identity";
import { normalizeAccountReviewParserResult } from "../normalization";
import type { AccountReviewOwnedContext } from "../normalization-types";
import {
  makeTwoIdenticalVoiceInput, makeTwoIdenticalVoiceWithExtraInput,
  makeTwoSmsInput, syntheticHashProvider,
} from "./normalization-fixtures";
import { makeEvidenceSpan, makeRequestAccountContext, REVIEW_WIRE_IDS } from "./fixtures";

export const COMMAND_IDS = Object.freeze({
  cibRow: "00000000-0000-4000-8000-000000009201",
  readyRow: "00000000-0000-4000-8000-000000009202",
  qnbAccount: "00000000-0000-4000-8000-000000009203",
  cibAccount: "00000000-0000-4000-8000-000000009204",
  cashAccount: "00000000-0000-4000-8000-000000009205",
  walletAccount: "00000000-0000-4000-8000-000000009206",
  usdAccount: "00000000-0000-4000-8000-000000009207",
  otherOwner: "00000000-0000-4000-8000-000000009208",
  outsideAccount: "00000000-0000-4000-8000-000000009209",
  undoToken: "00000000-0000-4000-8000-000000009210",
  otherSession: "00000000-0000-4000-8000-000000009211",
});

export type OwnedCommandAccount = AccountReviewOwnedContext["accounts"][number];

export function availableAccounts(): readonly OwnedCommandAccount[] {
  const base = makeRequestAccountContext();
  return [
    {
      ...base, id: COMMAND_IDS.qnbAccount, name: "QNB payroll",
      providerDisplayName: "QNB", cardLast4: "1234",
      senderNames: ["QNB"], isDefault: false,
    },
    {
      ...base, id: COMMAND_IDS.cibAccount, name: "CIB",
      providerDisplayName: "CIB", cardLast4: "5678",
      senderNames: ["CIB"], isDefault: false,
    },
    {
      ...base, id: COMMAND_IDS.cashAccount, name: "Cash",
      type: "CASH", providerDisplayName: null, cardLast4: null,
      senderNames: [], isDefault: true,
    },
    {
      ...base, id: COMMAND_IDS.walletAccount, name: "Wallet",
      type: "DIGITAL_WALLET", providerDisplayName: null,
      cardLast4: null, senderNames: [], isDefault: false,
    },
    {
      ...base, id: COMMAND_IDS.usdAccount, name: "USD bank",
      currency: "USD", providerDisplayName: "USD Bank",
      cardLast4: null, senderNames: [], isDefault: false,
    },
  ];
}

export function ownedContext(
  session: AccountReviewSession, accounts = availableAccounts(),
  preferredCurrency: AccountReviewOwnedContext["preferredCurrency"] = "EGP"
): AccountReviewOwnedContext {
  const providerContext = accountReviewRequestContextSchema.parse({
    reviewContractVersion: "account-review/v2", preferredCurrency,
    accounts: accounts.map(({ isDefault, ...account }) => account),
  });
  return {
    ownerId: session.ownerId, preferredCurrency, accounts, providerContext,
  };
}

export function scope(session: AccountReviewSession): Pick<
  AccountReviewCommand,
  "ownerId" | "sessionId" | "expectedReviewRevision" | "expectedOperationGeneration"
> {
  return {
    ownerId: session.ownerId, sessionId: session.sessionId,
    expectedReviewRevision: session.revision,
    expectedOperationGeneration: session.operationGeneration,
  };
}

export function canonicalCommand(value: AccountReviewCommand): AccountReviewCommand {
  return accountReviewCommandSchema.parse(value);
}

export function groupByName(
  session: AccountReviewSession, name: string
): AccountReviewGroup {
  const group = session.groups.find((candidate) => candidate.name === name);
  if (!group) throw new Error("Missing synthetic group " + name);
  return group;
}

export function requireRow(
  session: AccountReviewSession, id: string
): AccountReviewRow {
  const row = session.rows.find((candidate) => candidate.rowId === id);
  if (!row) throw new Error("Missing synthetic row " + id);
  return row;
}

export async function canonicalVoiceReview(
  withExtra = false
): Promise<AccountReviewSession> {
  const input = withExtra ? makeTwoIdenticalVoiceWithExtraInput() : makeTwoIdenticalVoiceInput();
  return accountReviewSessionSchema.parse(await normalizeAccountReviewParserResult(input));
}

/** Real independently normalized owner/source/session controls, never bare
 * mutation of a live review session's identity hashes. */
export async function mismatchedIncomingReview(
  dimension: "owner" | "source" | "session"
): Promise<AccountReviewSession> {
  if (dimension === "source") {
    return accountReviewSessionSchema.parse(
      await normalizeAccountReviewParserResult(makeTwoSmsInput())
    );
  }
  const input = makeTwoIdenticalVoiceInput();
  const altered = dimension === "owner"
    ? {
      ...input, ownerId: COMMAND_IDS.otherOwner,
      reviewAccountSnapshots: {
        ...input.reviewAccountSnapshots, ownerId: COMMAND_IDS.otherOwner,
      },
    }
    : { ...input, sessionId: COMMAND_IDS.otherSession };
  return accountReviewSessionSchema.parse(
    await normalizeAccountReviewParserResult(altered)
  );
}

async function cibGroup(
  parsed: AccountReviewSession
): Promise<AccountReviewGroup> {
  const identity = await deriveAccountReviewGroupIdentity({
    ownerId: parsed.ownerId, sessionId: parsed.sessionId, source: "VOICE",
    identity: {
      name: "CIB", type: "BANK", currency: "EGP",
      institutionId: null, providerDisplayName: "CIB",
      cardLast4: null, senderNames: ["CIB"],
    },
    hashProvider: syntheticHashProvider,
  });
  return {
    ...identity, name: "CIB", type: "BANK", currency: "EGP",
    institutionId: null, providerDisplayName: "CIB",
    cardLast4: null, senderNames: ["CIB"],
    suggestionRefs: ["synthetic-cib-alias"], linkedRowIds: [COMMAND_IDS.cibRow],
    status: "pending", revision: "0", confirmedIdentityRevision: null,
  };
}

function cibRowFor(
  first: Extract<AccountReviewRow, { source: "VOICE" }>,
  group: AccountReviewGroup, transcript: string
): AccountReviewRow {
  return {
    ...first, rowId: COMMAND_IDS.cibRow, sourceRef: "synthetic-cib-row",
    amountDecimal: "20",
    assignment: {
      state: "suggested", accountId: null, groupId: group.groupId,
      groupRevision: "0", confirmation: "pending",
    },
    accountEvidence: {
      state: "explicit", name: "CIB", type: "BANK",
      institutionId: null, providerDisplayName: "CIB",
      cardLast4: null, candidateAccountIds: [],
      evidenceSpans: [
        makeEvidenceSpan(REVIEW_WIRE_IDS.voiceRequestKey, "transcript", transcript, "CIB"),
      ],
    },
    reviewReasons: ["account_group_unconfirmed"], selected: false,
    transaction: {
      ...first.transaction, amount: 20, note: "Synthetic CIB fare",
      originalTranscript: transcript,
    },
  };
}

/** Real QNB three-row producer, plus separately grounded CIB one-row group. */
export async function qnbCibReview(): Promise<AccountReviewSession> {
  const parsed = await canonicalVoiceReview(true);
  const first = parsed.rows[0];
  const qnb = parsed.groups[0];
  if (!first || first.source !== "VOICE" || !qnb ||
      parsed.rows.length !== 3 || qnb.linkedRowIds.length !== 3) {
    throw new Error("Canonical triple QNB fixture is incomplete");
  }
  const transcript = first.transaction.originalTranscript + " and CIB 20 EGP";
  const other = await cibGroup(parsed);
  const rows: readonly AccountReviewRow[] = [
    ...parsed.rows.map((row): AccountReviewRow =>
      row.source === "VOICE"
        ? { ...row, transaction: { ...row.transaction, originalTranscript: transcript } }
        : row
    ),
    cibRowFor(first, other, transcript),
  ];
  return accountReviewSessionSchema.parse({
    ...parsed, rows, groups: [...parsed.groups, other],
  });
}

/** One ready independent item; pending QNB group remains unconfirmed. */
export async function reviewWithReadyRow(): Promise<AccountReviewSession> {
  const parsed = await qnbCibReview();
  const cibGroup = groupByName(parsed, "CIB");
  const cibRow = requireRow(parsed, COMMAND_IDS.cibRow);
  if (cibRow.source !== "VOICE") throw new Error("Expected synthetic Voice row");
  const ready: AccountReviewRow = {
    ...cibRow, rowId: COMMAND_IDS.readyRow, sourceRef: "ready-account-row",
    amountDecimal: "33", reviewReasons: [], selected: false,
    accountEvidence: {
      ...cibRow.accountEvidence, state: "absent", name: null, type: null,
      institutionId: null, providerDisplayName: null,
      cardLast4: null, evidenceSpans: [], candidateAccountIds: [],
    },
    assignment: {
      state: "existing", accountId: COMMAND_IDS.cibAccount, origin: "user",
      currency: "EGP", identityRevision: "0",
    },
    hasUserAccountOverride: true,
    transaction: { ...cibRow.transaction, amount: 33 },
  };
  return accountReviewSessionSchema.parse({
    ...parsed,
    rows: [
      ...parsed.rows.filter((row) => row.rowId !== COMMAND_IDS.cibRow),
      ready,
    ],
    groups: parsed.groups.filter((group) => group.groupId !== cibGroup.groupId),
  });
}

/** A later independent CIB account choice already completed by a writer.
 * This is a canonical fixture, NOT a call to future T036 reducer behavior. */
export function laterCibUserChoiceReview(
  afterRemoval: AccountReviewSession
): AccountReviewSession {
  const cib = groupByName(afterRemoval, "CIB");
  const previous = requireRow(afterRemoval, COMMAND_IDS.cibRow);
  if (previous.source !== "VOICE" ||
      previous.assignment.state !== "suggested" ||
      previous.assignment.groupId !== cib.groupId) {
    throw new Error("Expected unedited CIB group member");
  }
  const bump = (value: string): string => (BigInt(value) + 1n).toString();
  return accountReviewSessionSchema.parse({
    ...afterRemoval,
    revision: bump(afterRemoval.revision),
    operationGeneration: bump(afterRemoval.operationGeneration),
    groups: afterRemoval.groups.filter((group) => group.groupId !== cib.groupId),
    rows: afterRemoval.rows.map((row): AccountReviewRow => {
      if (row.rowId !== previous.rowId) return row;
      if (row.source !== "VOICE") throw new Error("Expected CIB Voice row");
      const revision = bump(row.revision);
      return {
        ...row, revision, selected: false, hasUserAccountOverride: true,
        assignment: {
          state: "existing", accountId: COMMAND_IDS.cibAccount, origin: "user",
          currency: "EGP", identityRevision: revision,
        },
        reviewReasons: row.reviewReasons.filter(
          (reason) => reason !== "account_group_unconfirmed"
        ),
      };
    }),
  });
}

/** An unconfirmed original currency cannot be considered a preferred omission. */
export async function unconfirmedCurrencyReview(
  reason: Extract<AccountReviewRow["currency"], { state: "unconfirmed" }>["reason"]
): Promise<AccountReviewSession> {
  const parsed = await canonicalVoiceReview();
  const first = parsed.rows[0];
  if (!first) throw new Error("No canonical currency fixture row");
  return accountReviewSessionSchema.parse({
    ...parsed, groups: [],
    rows: [{
      ...first,
      assignment: {
        state: "unresolved", accountId: null,
        reasonCode: "currency_confirmation_needed", candidateAccountIds: [],
      },
      currency: {
        state: "unconfirmed", reason, candidateCodes: [],
        statedCode: null, evidenceSpans: [],
      },
      reviewReasons: ["currency_confirmation_needed", "account_needed"],
      selected: false,
    }],
  });
}
