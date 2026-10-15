/**
 * #395 T027 split of existing ATM reducer selection invariants.
 * Canonical reviewed parser fixtures + real pure reducer and resolver.
 * No production edits, SUT mocks, fake DTOs, or future T036 commands.
 */
import {
  accountReviewSessionSchema,
  type AccountReviewCommand,
  type AccountReviewGroup,
  type AccountReviewRow,
  type AccountReviewSession,
} from "../schemas";
import { normalizeAccountReviewParserResult } from "../normalization";
import { resolveAccountReviewSession } from "../resolution";
import { reduceAccountReviewCommand } from "../reducer";
import type { AccountReviewOwnedContext } from "../normalization-types";
import {
  COMMAND_IDS, availableAccounts, canonicalCommand, groupByName,
  ownedContext, requireRow, scope, type OwnedCommandAccount,
} from "./review-command-fixtures";
import { makeSmsInput } from "./normalization-fixtures";
import { makeEvidenceSpan, REVIEW_WIRE_IDS } from "./fixtures";

type Result = ReturnType<typeof reduceAccountReviewCommand>;

function execute(
  state: AccountReviewSession,
  command: AccountReviewCommand,
  snapshots: AccountReviewOwnedContext = ownedContext(state),
  nextUndoToken: string | null = null
): Result {
  return reduceAccountReviewCommand({
    state, command, accountSnapshots: snapshots, nextUndoToken, undo: null,
  });
}

function selectRow(
  state: AccountReviewSession, rowId: string,
  disclosedGroup: AccountReviewGroup | null = null
): AccountReviewCommand {
  return canonicalCommand({
    ...scope(state), kind: "select_row", rowId,
    expectedRowRevision: requireRow(state, rowId).revision,
    groupId: disclosedGroup?.groupId ?? null,
    expectedGroupRevision: disclosedGroup?.revision ?? null,
    hasSharedConfirmationDisclosure: disclosedGroup !== null,
  });
}

function onlyRowId(state: AccountReviewSession): string {
  const row = state.rows[0];
  if (!row) throw new Error("Expected exactly one canonical test row");
  return row.rowId;
}

function selectReady(state: AccountReviewSession): AccountReviewCommand {
  return canonicalCommand({
    ...scope(state), kind: "select_ready", filter: state.filter,
  });
}

function groupCommand(
  state: AccountReviewSession, group: AccountReviewGroup,
  kind: "confirm_group" | "remove_group"
): AccountReviewCommand {
  return canonicalCommand({
    ...scope(state), kind, groupId: group.groupId,
    expectedGroupRevision: group.revision,
  });
}

function financialRows(
  state: AccountReviewSession
): ReadonlyArray<Pick<
  AccountReviewRow,
  "rowId" | "amountDecimal" | "transaction" | "currency" |
  "assignment" | "toAssignment" | "reviewReasons" | "selected" | "revision"
>> {
  return state.rows.map((row) => ({
    rowId: row.rowId, amountDecimal: row.amountDecimal,
    transaction: row.transaction, currency: row.currency,
    assignment: row.assignment, toAssignment: row.toAssignment,
    reviewReasons: row.reviewReasons, selected: row.selected, revision: row.revision,
  }));
}

function expectAtomicRejection(
  state: AccountReviewSession, frozen: AccountReviewSession, result: Result
): void {
  // Canonical T027 result has no "accepted" property: effect is the acceptance indicator.
  expect(result.effect !== "none").toBe(false);
  expect(result.effect).toBe("none");
  expect(result.reasonCodes.length).toBeGreaterThan(0);
  expect(result.affectedRowIds).toEqual([]);
  expect(result.affectedGroupIds).toEqual([]);
  expect(result.undoToken).toBeNull();
  expect(result.state).toBe(state);
  expect(result.state).toEqual(frozen);
  expect(state).toEqual(frozen);
  expect(result.state.revision).toBe(frozen.revision);
  expect(result.state.operationGeneration).toBe(frozen.operationGeneration);
  expect(financialRows(result.state)).toEqual(financialRows(frozen));
  expect(result.state.groups).toEqual(frozen.groups);
  expect(result.state.removedEvidenceKeys).toEqual(frozen.removedEvidenceKeys);
}

function expectAccepted(state: AccountReviewSession, result: Result): void {
  expect(result.effect !== "none").toBe(true);
  expect(result.effect).toBe(state.source === "SMS" ? "persist_sms" : "session_only");
  expect(result.reasonCodes).toEqual([]);
  expect(result.state.revision).not.toBe(state.revision);
  expect(result.state.operationGeneration).not.toBe(state.operationGeneration);
  expect(accountReviewSessionSchema.safeParse(result.state).success).toBe(true);
}

/** Actual tagged ATM parser row/body/spans; no mocked provider or output. */
async function normalizedAtmSource(): Promise<AccountReviewSession> {
  const input = makeSmsInput();
  const original = input.providerResponse.transactions[0];
  const mapped = input.mappedTransactions[0];
  const message = input.submittedMessages[0];
  if (!original || !mapped || !message) throw new Error("Missing canonical SMS source");
  const body = "QNB ATM withdrawal EGP 50";
  const row = {
    ...original, isAtmWithdrawal: true,
    accountEvidence: {
      ...original.accountEvidence,
      evidenceSpans: [
        makeEvidenceSpan(REVIEW_WIRE_IDS.smsMessageId, "body", body, "QNB"),
      ],
    },
    currencyEvidence: {
      ...original.currencyEvidence,
      evidenceSpans: [
        makeEvidenceSpan(REVIEW_WIRE_IDS.smsMessageId, "body", body, "EGP"),
      ],
    },
  };
  const parsed = accountReviewSessionSchema.parse(
    await normalizeAccountReviewParserResult({
      ...input,
      providerResponse: { ...input.providerResponse, transactions: [row] },
      financialRows: [row],
      mappedTransactions: [{ ...mapped, isAtmWithdrawal: true, rawSmsBody: body }],
      submittedMessages: [{ ...message, body }],
    })
  );
  const source = parsed.rows[0];
  if (!source || source.source !== "SMS" ||
      source.currency.state !== "known" || source.currency.code !== "EGP" ||
      source.assignment.state !== "suggested" || parsed.groups.length !== 1) {
    throw new Error("ATM fixture must retain an eligible pending Bank source");
  }
  expect(source.transaction.isAtmWithdrawal).toBe(true);
  return parsed;
}

/**
 * An explicitly reviewed destination is a canonical post-review state (T036
 * commands are intentionally not called). Remove normalizer's independent
 * cash_transfer_review hard reason only for this eligibility boundary test.
 * A forged/stale destination is injected solely to test reducer revalidation;
 * no currently exposed UI path to that state is claimed.
 */
function stagedAtm(
  normalized: AccountReviewSession, destinationAccountId: string,
  sourceMode: "existing" | "pending"
): AccountReviewSession {
  const row = normalized.rows[0];
  if (!row || row.source !== "SMS" || row.assignment.state !== "suggested" ||
      row.currency.state !== "known" || row.currency.code !== "EGP") {
    throw new Error("Missing canonical Bank ATM row");
  }
  const sourceAssignment: AccountReviewRow["assignment"] =
    sourceMode === "pending" ? row.assignment : {
      state: "existing", accountId: COMMAND_IDS.qnbAccount,
      origin: "user", currency: "EGP", identityRevision: "0",
    };
  const staged: AccountReviewRow = {
    ...row, assignment: sourceAssignment, selected: false,
    hasUserAccountOverride: sourceMode === "existing",
    toAssignment: {
      state: "existing", accountId: destinationAccountId,
      origin: "user", currency: "EGP", identityRevision: "0",
    },
    reviewReasons: sourceMode === "pending" ? ["account_group_unconfirmed"] : [],
  };
  return accountReviewSessionSchema.parse({
    ...normalized, rows: [staged],
    groups: sourceMode === "pending" ? normalized.groups : [],
  });
}


type AbsentAtmDestination = "null" | "unresolved";
const absentAtmDestinations: readonly AbsentAtmDestination[] = [
  "null", "unresolved",
];

/** Canonical post-review states based on the original, fully normalized ATM.
 * The independent Bank source and original provider evidence remain unchanged;
 * only a missing/stale Cash destination assignment is under review here. */
function withAbsentAtmDestination(
  reviewed: AccountReviewSession, absence: AbsentAtmDestination
): AccountReviewSession {
  const first = reviewed.rows[0];
  if (!first || first.source !== "SMS" ||
      first.transaction.isAtmWithdrawal !== true) {
    throw new Error("Expected normalized SMS ATM review");
  }
  const missing: AccountReviewRow["toAssignment"] = absence === "null"
    ? null
    : {
      state: "unresolved", accountId: null,
      reasonCode: "cash_transfer_review", candidateAccountIds: [],
    };
  return accountReviewSessionSchema.parse({
    ...reviewed,
    rows: reviewed.rows.map((row): AccountReviewRow => row.rowId === first.rowId
      ? { ...row, toAssignment: missing } : row),
  });
}

/** The same fresh owned snapshots MUST actually resolve the destination.
 * Do not mock the resolver or synthesize a reducer outcome. */
function expectRealCashFallback(
  state: AccountReviewSession
): AccountReviewOwnedContext {
  expect(accountReviewSessionSchema.safeParse(state).success).toBe(true);
  const originalWire = makeSmsInput().providerResponse.transactions[0];
  expect(originalWire?.toAccountEvidence).toBeNull();
  const before = requireRow(state, onlyRowId(state));
  expect(before.toAssignment === null ||
    before.toAssignment.state === "unresolved").toBe(true);
  const context = ownedContext(state);
  const cash = context.accounts.find((account) =>
    account.id === COMMAND_IDS.cashAccount
  );
  expect(cash).toMatchObject({
    type: "CASH", currency: "EGP", isDefault: true,
  });
  const resolved = resolveAccountReviewSession({
    session: state, accountSnapshots: context,
  });
  const row = requireRow(resolved, before.rowId);
  expect(row.toAssignment).toMatchObject({
    state: "existing", accountId: COMMAND_IDS.cashAccount,
    currency: "EGP",
  });
  expect(row.selected).toBe(false);
  expect(row.amountDecimal).toBe(before.amountDecimal);
  expect(row.transaction).toEqual(before.transaction);
  expect(state.rows).toContainEqual(before);
  return context;
}

/** Both fail-closed rejection and a fully valid selected Cash destination are
 * safe. Never require automatic destination selection or a new UX action. */
function expectSafeAtmSelectionOrAtomicRejection(
  state: AccountReviewSession, context: AccountReviewOwnedContext,
  result: Result, snapshot: AccountReviewSession
): void {
  if (result.effect === "none") {
    expectAtomicRejection(state, snapshot, result);
    return;
  }
  expectAccepted(state, result);
  const before = requireRow(state, onlyRowId(state));
  const after = requireRow(result.state, before.rowId);
  expect(after.selected).toBe(true);
  if (after.source !== "SMS" ||
      after.transaction.isAtmWithdrawal !== true ||
      after.currency.state !== "known" ||
      after.toAssignment?.state !== "existing") {
    throw new Error("Selected ATM row lacks a canonical existing Cash destination");
  }
  const destinationId = after.toAssignment.accountId;
  const destination = context.accounts.find((account) =>
    account.id === destinationId
  );
  expect(destination).toBeDefined();
  expect(destination?.type).toBe("CASH");
  expect(destination?.currency).toBe(after.currency.code);
  expect(after.toAssignment.currency).toBe(after.currency.code);
  if (after.assignment.state === "existing") {
    expect(after.assignment.accountId).not.toBe(after.toAssignment.accountId);
  } else if (after.assignment.state === "suggested") {
    const sourceGroupId = after.assignment.groupId;
    const sourceGroup = result.state.groups.find((group) =>
      group.groupId === sourceGroupId
    );
    expect(sourceGroup?.type).toBe("BANK");
    expect(sourceGroup?.status).toBe("confirmed");
  } else {
    throw new Error("Selected ATM source is unresolved");
  }
  // An old Cash review blocker must not survive a successful selection.
  expect(after.reviewReasons).not.toContain("cash_transfer_review");
  expect(after.reviewReasons).toEqual([]);
  expect(after.transaction).toEqual(before.transaction);
  expect(after.amountDecimal).toBe(before.amountDecimal);
  expect(after.sourceFingerprint).toBe(before.sourceFingerprint);
  expect(result.state.rows.map((row) => row.rowId))
    .toEqual(state.rows.map((row) => row.rowId));
  expect(state).toEqual(snapshot);
}

describe("#395 T027 ATM destination eligibility, separately from source Bank", () => {

  it.each(absentAtmDestinations)(
    "direct existing Bank ATM selection with %s destination must resolve or reject atomically",
    async (absence) => {
      const staged = stagedAtm(
        await normalizedAtmSource(), COMMAND_IDS.cashAccount, "existing"
      );
      const state = withAbsentAtmDestination(staged, absence);
      const row = requireRow(state, onlyRowId(state));
      expect(row.source).toBe("SMS");
      expect(row.reviewReasons).toEqual([]);
      const context = expectRealCashFallback(state);
      const frozen = structuredClone(state);
      const result = execute(state, selectRow(state, row.rowId), context);
      expectSafeAtmSelectionOrAtomicRejection(state, context, result, frozen);
    }
  );

  it("direct confirmed Bank-group ATM selection cannot retain a null destination", async () => {
    const pending = withAbsentAtmDestination(
      stagedAtm(await normalizedAtmSource(), COMMAND_IDS.cashAccount, "pending"),
      "null"
    );
    const bank = groupByName(pending, "QNB");
    const confirmation = execute(pending, groupCommand(pending, bank, "confirm_group"));
    expectAccepted(pending, confirmation);
    const state = confirmation.state;
    const row = requireRow(state, onlyRowId(state));
    expect(row.assignment).toMatchObject({
      state: "suggested", confirmation: "confirmed",
    });
    expect(row.toAssignment).toBeNull();
    expect(row.reviewReasons).toEqual([]);
    const context = expectRealCashFallback(state);
    const frozen = structuredClone(state);
    const result = execute(state, selectRow(state, row.rowId), context);
    expectSafeAtmSelectionOrAtomicRejection(state, context, result, frozen);
    if (result.effect === "none") {
      expect(groupByName(result.state, "QNB"))
        .toEqual(groupByName(state, "QNB"));
    }
  });

  it.each(absentAtmDestinations)(
    "disclosed pending Bank ATM click with %s Cash destination must not select an incomplete row",
    async (absence) => {
      const staged = stagedAtm(
        await normalizedAtmSource(), COMMAND_IDS.cashAccount, "pending"
      );
      const state = withAbsentAtmDestination(staged, absence);
      const bank = groupByName(state, "QNB");
      expect(bank.status).toBe("pending");
      const row = requireRow(state, onlyRowId(state));
      expect(row.assignment).toMatchObject({
        state: "suggested", confirmation: "pending",
      });
      expect(row.reviewReasons).toEqual(["account_group_unconfirmed"]);
      const context = expectRealCashFallback(state);
      const frozen = structuredClone(state);
      const result = execute(state, selectRow(state, row.rowId, bank), context);
      expectSafeAtmSelectionOrAtomicRejection(state, context, result, frozen);
      if (result.effect === "none") {
        expect(groupByName(result.state, "QNB")).toEqual(bank);
      } else {
        expect(groupByName(result.state, "QNB").status).toBe("confirmed");
      }
    }
  );

  it.each(absentAtmDestinations)(
    "select_ready with %s ATM destination must skip or resolve without persisting incomplete Cash",
    async (absence) => {
      const staged = stagedAtm(
        await normalizedAtmSource(), COMMAND_IDS.cashAccount, "existing"
      );
      const state = withAbsentAtmDestination(staged, absence);
      const context = expectRealCashFallback(state);
      const frozen = structuredClone(state);
      const result = execute(state, selectReady(state), context);
      expectSafeAtmSelectionOrAtomicRejection(state, context, result, frozen);
    }
  );

  it("a retained cash_transfer_review reason must never be selected unresolved", async () => {
    const staged = withAbsentAtmDestination(
      stagedAtm(await normalizedAtmSource(), COMMAND_IDS.cashAccount, "existing"),
      "null"
    );
    const state = accountReviewSessionSchema.parse({
      ...staged,
      rows: staged.rows.map((row): AccountReviewRow => ({
        ...row, reviewReasons: ["cash_transfer_review"],
      })),
    });
    const context = expectRealCashFallback(state);
    for (const command of [selectRow(state, onlyRowId(state)), selectReady(state)]) {
      const frozen = structuredClone(state);
      const result = execute(state, command, context);
      expectSafeAtmSelectionOrAtomicRejection(state, context, result, frozen);
    }
  });

  it.each([
    ["foreign account", COMMAND_IDS.outsideAccount],
    ["owned non-Cash Wallet", COMMAND_IDS.walletAccount],
  ])("rejects %s as an ATM destination for direct and bulk selection", async (_label, id) => {
    const input = await normalizedAtmSource();
    const state = stagedAtm(input, id, "existing");
    expect(accountReviewSessionSchema.safeParse(state).success).toBe(true);
    for (const command of [selectRow(state, onlyRowId(state)), selectReady(state)]) {
      const frozen = structuredClone(state);
      const result = execute(state, command);
      expectAtomicRejection(state, frozen, result);
    }
  });

  it("rejects a stale EGP destination projection whose owned Cash currency is USD", async () => {
    const input = await normalizedAtmSource();
    const state = stagedAtm(input, COMMAND_IDS.usdAccount, "existing");
    const accounts: readonly OwnedCommandAccount[] = availableAccounts().map(
      (account): OwnedCommandAccount => account.id === COMMAND_IDS.usdAccount
        ? {
          ...account, name: "USD cash", type: "CASH", providerDisplayName: null,
          cardLast4: null, senderNames: [],
        }
        : account
    );
    const snapshots = ownedContext(state, accounts);
    expect(snapshots.accounts.find((account) =>
      account.id === COMMAND_IDS.usdAccount)?.currency).toBe("USD");
    expect(accountReviewSessionSchema.safeParse(state).success).toBe(true);
    const frozen = structuredClone(state);
    expectAtomicRejection(
      state, frozen, execute(state, selectRow(state, onlyRowId(state)), snapshots)
    );
  });

  it("accepts owned distinct same-currency Cash destination after reviewed ATM choice", async () => {
    const input = await normalizedAtmSource();
    const state = stagedAtm(input, COMMAND_IDS.cashAccount, "existing");
    const row = state.rows[0];
    if (!row || row.source !== "SMS") {
      throw new Error("Missing SMS ATM destination row");
    }
    expect(row.transaction.isAtmWithdrawal).toBe(true);
    expect(row.reviewReasons).toEqual([]);
    for (const command of [selectRow(state, row.rowId), selectReady(state)]) {
      const result = execute(state, command);
      expectAccepted(state, result);
      expect(requireRow(result.state, row.rowId).selected).toBe(true);
      expect(requireRow(result.state, row.rowId).toAssignment).toMatchObject({
        state: "existing", accountId: COMMAND_IDS.cashAccount,
      });
    }
  });

  it("does not let a pending Bank group click confirm/select through an ineligible ATM destination", async () => {
    const input = await normalizedAtmSource();
    const state = stagedAtm(input, COMMAND_IDS.walletAccount, "pending");
    const bank = groupByName(state, "QNB");
    const row = state.rows[0];
    if (!row) throw new Error("Missing pending ATM row");
    expect(bank.status).toBe("pending");
    expect(row.reviewReasons).toEqual(["account_group_unconfirmed"]);
    const frozen = structuredClone(state);
    const result = execute(state, selectRow(state, row.rowId, bank));
    expectAtomicRejection(state, frozen, result);
    expect(groupByName(result.state, "QNB").status).toBe("pending");
    expect(requireRow(result.state, row.rowId).selected).toBe(false);
  });

  it("preserves pending Bank-group disclosure with a genuinely eligible Cash destination", async () => {
    const input = await normalizedAtmSource();
    const state = stagedAtm(input, COMMAND_IDS.cashAccount, "pending");
    const bank = groupByName(state, "QNB");
    const row = state.rows[0];
    if (!row) throw new Error("Missing pending ATM row");
    const result = execute(state, selectRow(state, row.rowId, bank));
    expectAccepted(state, result);
    expect(groupByName(result.state, "QNB").status).toBe("confirmed");
    expect(requireRow(result.state, row.rowId).selected).toBe(true);
  });

  it("leaves mismatched declared ATM destination currency to the canonical schema", async () => {
    const state = stagedAtm(
      await normalizedAtmSource(), COMMAND_IDS.cashAccount, "existing"
    );
    const row = state.rows[0];
    if (!row || row.toAssignment?.state !== "existing") {
      throw new Error("Missing existing Cash destination");
    }
    expect(accountReviewSessionSchema.safeParse({
      ...state,
      rows: [{
        ...row, toAssignment: { ...row.toAssignment, currency: "USD" },
      }],
    }).success).toBe(false);
    // This is not classified as a missing reducer behavior.
  });
});

