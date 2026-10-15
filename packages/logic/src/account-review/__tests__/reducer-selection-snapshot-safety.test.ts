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
import { makeSmsInput, makeTwoSmsInput } from "./normalization-fixtures";
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

/** A genuine two-message QNB SMS group: one ATM withdrawal and one ordinary
 * purchase. Both provider rows are correlated with their actual submitted SMS
 * bodies and their own evidence spans before the canonical normalizer runs. */
async function normalizedSharedAtmAndPurchase(): Promise<AccountReviewSession> {
  const input = makeTwoSmsInput();
  const original = input.providerResponse.transactions[0];
  const mapped = input.mappedTransactions[0];
  const message = input.submittedMessages[0];
  if (!original || !mapped || !message) {
    throw new Error("Missing two-message SMS fixture source");
  }
  const body = "QNB ATM withdrawal EGP 50";
  const atm = {
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
  const transactions = [atm, ...input.providerResponse.transactions.slice(1)];
  const session = accountReviewSessionSchema.parse(
    await normalizeAccountReviewParserResult({
      ...input,
      financialRows: transactions,
      providerResponse: { ...input.providerResponse, transactions },
      mappedTransactions: [
        { ...mapped, isAtmWithdrawal: true, rawSmsBody: body },
        ...input.mappedTransactions.slice(1),
      ],
      submittedMessages: [
        { ...message, body },
        ...input.submittedMessages.slice(1),
      ],
    })
  );
  const group = groupByName(session, "QNB");
  const atmRows = session.rows.filter((row) =>
    row.source === "SMS" && row.transaction.isAtmWithdrawal === true
  );
  if (atmRows.length !== 1 || group.linkedRowIds.length !== 2) {
    throw new Error("Canonical QNB shared ATM/purchase group incomplete");
  }
  return session;
}

/** Select a genuinely reviewed ATM before the ownership snapshot changes.
 * Group confirmation and the row checkbox use real reducer commands. */
async function selectedSharedAtm(): Promise<{
  readonly state: AccountReviewSession;
  readonly atmRowId: string;
  readonly siblingRowId: string;
}> {
  const normalized = await normalizedSharedAtmAndPurchase();
  const original = normalized.rows.find((row) =>
    row.source === "SMS" && row.transaction.isAtmWithdrawal === true
  );
  if (!original || original.source !== "SMS" ||
      original.assignment.state !== "suggested") {
    throw new Error("Missing canonical ATM Bank source");
  }
  const pending = accountReviewSessionSchema.parse({
    ...normalized,
    rows: normalized.rows.map((row): AccountReviewRow =>
      row.rowId === original.rowId
        ? {
            ...original,
            toAssignment: {
              state: "existing", accountId: COMMAND_IDS.cashAccount,
              origin: "user", currency: "EGP", identityRevision: "0",
            },
            reviewReasons: original.reviewReasons.filter(
              (reason) => reason !== "cash_transfer_review"
            ),
          }
        : row
    ),
  });
  const bank = groupByName(pending, "QNB");
  expect(bank.status).toBe("pending");
  const confirmation = execute(
    pending, groupCommand(pending, bank, "confirm_group")
  );
  expectAccepted(pending, confirmation);
  const stateAfterConfirmation = confirmation.state;
  const selected = execute(
    stateAfterConfirmation, selectRow(stateAfterConfirmation, original.rowId)
  );
  expectAccepted(stateAfterConfirmation, selected);
  const state = selected.state;
  const siblings = state.rows.filter((row) => row.rowId !== original.rowId);
  if (siblings.length !== 1 || !siblings[0]) {
    throw new Error("Expected one independent ordinary SMS sibling");
  }
  expect(requireRow(state, original.rowId).selected).toBe(true);
  expect(siblings[0].selected).toBe(false);
  expect(groupByName(state, "QNB").status).toBe("confirmed");
  return {
    state, atmRowId: original.rowId, siblingRowId: siblings[0].rowId,
  };
}

function nicknameOnlyEdit(
  state: AccountReviewSession, group: AccountReviewGroup
): AccountReviewCommand {
  if (group.type === null) throw new Error("Expected typed Bank group");
  return canonicalCommand({
    ...scope(state), kind: "edit_group",
    groupId: group.groupId, expectedGroupRevision: group.revision,
    identity: {
      name: "QNB Confirmed ATM", type: group.type,
      institutionId: group.institutionId,
      providerDisplayName: group.providerDisplayName,
      cardLast4: group.cardLast4, senderNames: [...group.senderNames],
    },
    reconfirm: true,
  });
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


describe("#395 T027 group edit preserves only freshly eligible ATM selection", () => {
  it("atomically rejects or unchecks a selected ATM when its Cash account was deleted", async () => {
    const { state, atmRowId, siblingRowId } = await selectedSharedAtm();
    const group = groupByName(state, "QNB");
    const selectedBefore = requireRow(state, atmRowId);
    const siblingBefore = requireRow(state, siblingRowId);
    expect(selectedBefore.toAssignment).toMatchObject({
      state: "existing", accountId: COMMAND_IDS.cashAccount,
      currency: "EGP",
    });
    expect(siblingBefore.source).toBe("SMS");
    if (siblingBefore.source !== "SMS") {
      throw new Error("Expected an unrelated SMS purchase");
    }
    expect(siblingBefore.transaction.isAtmWithdrawal).toBe(false);
    expect(siblingBefore.selected).toBe(false);

    // Account deletion removes it from the fresh *owned active* snapshot.
    // Do not mutate an immutable account's type/currency to simulate deletion.
    const remaining = availableAccounts().filter((account) =>
      account.id !== COMMAND_IDS.cashAccount
    );
    const freshContext = ownedContext(state, remaining);
    expect(freshContext.accounts.some((account) =>
      account.id === COMMAND_IDS.cashAccount)).toBe(false);
    expect(freshContext.accounts.find((account) =>
      account.id === COMMAND_IDS.qnbAccount)).toMatchObject({
      type: "BANK", currency: "EGP",
    });
    const refreshed = resolveAccountReviewSession({
      session: state, accountSnapshots: freshContext,
    });
    expect(accountReviewSessionSchema.safeParse(refreshed).success).toBe(true);
    const invalidated = requireRow(refreshed, atmRowId);
    expect(invalidated.selected).toBe(false);
    expect(invalidated.toAssignment).toMatchObject({
      state: "unresolved", reasonCode: "account_unavailable",
    });
    expect(invalidated.reviewReasons).toContain("account_unavailable");
    expect(requireRow(refreshed, siblingRowId).selected).toBe(false);
    expect(requireRow(refreshed, siblingRowId).transaction)
      .toEqual(siblingBefore.transaction);

    const frozen = structuredClone(state);
    const command = nicknameOnlyEdit(state, group);
    expect(command).toMatchObject({
      kind: "edit_group", reconfirm: true,
    });
    const outcome = execute(state, command, freshContext);
    if (outcome.effect === "none") {
      expectAtomicRejection(state, frozen, outcome);
      expect(requireRow(outcome.state, siblingRowId)).toEqual(siblingBefore);
      return;
    }

    expectAccepted(state, outcome);
    const renamedGroup = outcome.state.groups.find(
      (candidate) => candidate.groupId === group.groupId
    );
    expect(renamedGroup).toMatchObject({
      groupId: group.groupId,
      name: "QNB Confirmed ATM", status: "confirmed",
      type: group.type, currency: group.currency,
      institutionId: group.institutionId,
      providerDisplayName: group.providerDisplayName,
      cardLast4: group.cardLast4,
    });
    const afterAtm = requireRow(outcome.state, atmRowId);
    expect(afterAtm.selected).toBe(false);
    expect(outcome.state.rows.filter((row) => row.selected)).toEqual([]);
    const afterSibling = requireRow(outcome.state, siblingRowId);
    expect(afterSibling.selected).toBe(false);
    expect(afterSibling.transaction).toEqual(siblingBefore.transaction);
    expect(afterSibling.amountDecimal).toBe(siblingBefore.amountDecimal);
    expect(afterSibling.currency).toEqual(siblingBefore.currency);
    expect(outcome.state.rows.map((row) => row.rowId))
      .toEqual(state.rows.map((row) => row.rowId));
    expect(outcome.state.rows.map((row) => row.amountDecimal))
      .toEqual(state.rows.map((row) => row.amountDecimal));
    expect(state).toEqual(frozen);
  });

  it("keeps one selected ATM and one unchecked purchase when fresh owned Cash remains eligible", async () => {
    const { state, atmRowId, siblingRowId } = await selectedSharedAtm();
    const group = groupByName(state, "QNB");
    const snapshots = ownedContext(state);
    const activeCash = snapshots.accounts.find((account) =>
      account.id === COMMAND_IDS.cashAccount
    );
    expect(activeCash).toMatchObject({
      type: "CASH", currency: "EGP",
    });
    const fresh = resolveAccountReviewSession({
      session: state, accountSnapshots: snapshots,
    });
    const stillEligible = requireRow(fresh, atmRowId);
    expect(stillEligible.selected).toBe(true);
    expect(stillEligible.toAssignment).toMatchObject({
      state: "existing", accountId: COMMAND_IDS.cashAccount,
      currency: "EGP",
    });
    expect(stillEligible.reviewReasons).toEqual([]);
    const beforeSibling = requireRow(state, siblingRowId);
    const frozen = structuredClone(state);
    const result = execute(state, nicknameOnlyEdit(state, group), snapshots);
    expectAccepted(state, result);
    const updated = result.state.groups.find(
      (candidate) => candidate.groupId === group.groupId
    );
    if (!updated) throw new Error("Missing renamed canonical group ID");
    expect(updated.groupId).toBe(group.groupId);
    expect(updated.name).toBe("QNB Confirmed ATM");
    expect(updated.status).toBe("confirmed");
    expect(updated.revision).not.toBe(group.revision);
    expect(updated.confirmedIdentityRevision).toBe(updated.revision);
    expect(result.state.rows.filter((row) => row.selected)
      .map((row) => row.rowId)).toEqual([atmRowId]);
    expect(requireRow(result.state, atmRowId).toAssignment)
      .toEqual(requireRow(state, atmRowId).toAssignment);
    expect(requireRow(result.state, siblingRowId).selected).toBe(false);
    expect(requireRow(result.state, siblingRowId).transaction)
      .toEqual(beforeSibling.transaction);
    expect(result.state.rows.map((row) => row.amountDecimal))
      .toEqual(state.rows.map((row) => row.amountDecimal));
    expect(state).toEqual(frozen);
  });
});
