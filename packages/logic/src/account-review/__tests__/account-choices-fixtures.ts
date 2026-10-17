/**
 * Private T034/T036 tests-only canonical choice fixtures.
 * No DB/provider/clock/side effects; no shadow DTOs or fake reducer outcomes.
 */
import { MAX_CANONICAL_UNSIGNED_INTEGER_STRING } from "../../financial-actions/canonical-unsigned-revision";
import {
  accountReviewSessionSchema,
  type AccountReviewCommand,
  type AccountReviewSession,
} from "../schemas";
import { normalizeAccountReviewParserResult } from "../normalization";
import { reduceAccountReviewCommand } from "../reducer";
import { getAccountReviewAccountCandidates } from "../candidates";
import type { AccountReviewOwnedContext } from "../normalization-types";
import { makeSmsInput } from "./normalization-fixtures";
import {
  COMMAND_IDS,
  availableAccounts,
  canonicalCommand,
  groupByName,
  ownedContext,
  requireRow,
  reviewWithReadyRow,
  scope,
  type OwnedCommandAccount,
} from "./review-command-fixtures";

export function replaceGroup(
  state: AccountReviewSession,
  name: string,
  accountId: string
): AccountReviewCommand {
  const group = groupByName(state, name);
  return canonicalCommand({
    ...scope(state),
    kind: "replace_group_account",
    groupId: group.groupId,
    expectedGroupRevision: group.revision,
    accountId,
    disclosedLinkedRowCount: group.linkedRowIds.length,
  });
}

export function confirmCurrency(
  state: AccountReviewSession,
  rowId: string,
  currency: Extract<
    AccountReviewCommand,
    { kind: "confirm_row_currency" }
  >["currency"]
): AccountReviewCommand {
  return canonicalCommand({
    ...scope(state),
    kind: "confirm_row_currency",
    rowId,
    expectedRowRevision: requireRow(state, rowId).revision,
    currency,
  });
}

export async function smsAtmReview(): Promise<AccountReviewSession> {
  const state = accountReviewSessionSchema.parse(
    await normalizeAccountReviewParserResult(makeSmsInput())
  );
  const first = state.rows[0];
  if (!first || first.source !== "SMS") throw new Error("Missing SMS ATM row");
  return accountReviewSessionSchema.parse({
    ...state,
    rows: [
      {
        ...first,
        transaction: { ...first.transaction, isAtmWithdrawal: true },
        toAssignment: {
          state: "unresolved",
          accountId: null,
          reasonCode: "cash_transfer_review",
          candidateAccountIds: [],
        },
      },
    ],
  });
}

/** Missing/deleted is represented by omission from the *active* snapshot. */
export function changedOwnedAccounts(
  state: AccountReviewSession,
  accountId: string,
  change: "removed" | "wrong_type" | "wrong_currency"
): AccountReviewOwnedContext {
  const accounts: readonly OwnedCommandAccount[] = availableAccounts()
    .filter((account) => change !== "removed" || account.id !== accountId)
    .map((account): OwnedCommandAccount => {
      if (account.id !== accountId) return account;
      if (change === "wrong_type") {
        return {
          ...account,
          type: account.type === "CASH" ? "BANK" : "CASH",
        };
      }
      if (change === "wrong_currency") {
        return { ...account, currency: "USD" };
      }
      return account;
    });
  return ownedContext(state, accounts);
}

export function makeOverflowReview(
  state: AccountReviewSession,
  rowId: string,
  which: "review" | "operation" | "row" | "group"
): AccountReviewSession {
  const group = groupByName(state, "QNB");
  const max = MAX_CANONICAL_UNSIGNED_INTEGER_STRING;
  return accountReviewSessionSchema.parse({
    ...state,
    revision: which === "review" ? max : state.revision,
    operationGeneration:
      which === "operation" ? max : state.operationGeneration,
    groups: state.groups.map((item) =>
      which === "group" && item.groupId === group.groupId
        ? { ...item, revision: max }
        : item
    ),
    rows: state.rows.map((item) => ({
      ...item,
      revision: which === "row" && item.rowId === rowId ? max : item.revision,
      assignment:
        which === "group" &&
        item.assignment.state === "suggested" &&
        item.assignment.groupId === group.groupId
          ? { ...item.assignment, groupRevision: max }
          : item.assignment,
    })),
  });
}

/** Construct the frozen Save boundary using an actual pure selection. */
export async function saveLockedReview(): Promise<AccountReviewSession> {
  const state = await reviewWithReadyRow();
  const command = canonicalCommand({
    ...scope(state),
    kind: "select_ready",
    filter: "all",
  });
  const selected = reduceAccountReviewCommand({
    state,
    command,
    accountSnapshots: ownedContext(state),
    nextUndoToken: null,
    undo: null,
  });
  const ready = requireRow(selected.state, COMMAND_IDS.readyRow);
  if (selected.reasonCodes.length !== 0 || !ready.selected) {
    throw new Error("Canonical ready selection could not be frozen");
  }
  return accountReviewSessionSchema.parse({
    ...selected.state,
    saveIntent: {
      actionId: COMMAND_IDS.undoToken,
      ownerId: selected.state.ownerId,
      source: selected.state.source,
      sessionId: selected.state.sessionId,
      expectedReviewRevision: selected.state.revision,
      expectedOperationGeneration: selected.state.operationGeneration,
      selectedRows: [{ rowId: ready.rowId, revision: ready.revision }],
      confirmedGroups: [],
      plannedEntityIds: [],
      occurredAt: "2026-10-15T12:00:00.000Z",
    },
  });
}

/** Common pure command/test receipts, shared without importing a test suite. */
export function choiceList(
  session: AccountReviewSession,
  rowId: string,
  role: "source" | "destination",
  accountSnapshots: AccountReviewOwnedContext = ownedContext(session)
): readonly OwnedCommandAccount[] {
  return getAccountReviewAccountCandidates({
    session,
    rowId,
    role,
    accountSnapshots,
  });
}

export function apply(
  state: AccountReviewSession,
  command: AccountReviewCommand,
  accountSnapshots: AccountReviewOwnedContext = ownedContext(state)
): ReturnType<typeof reduceAccountReviewCommand> {
  return reduceAccountReviewCommand({
    state,
    command,
    accountSnapshots,
    nextUndoToken: null,
    undo: null,
  });
}

export function choose(
  state: AccountReviewSession,
  rowId: string,
  accountId: string
): AccountReviewCommand {
  const row = requireRow(state, rowId);
  return canonicalCommand({
    ...scope(state),
    kind: "choose_row_account",
    rowId,
    expectedRowRevision: row.revision,
    accountId,
  });
}

export function assertUnchangedFailure(
  actual: ReturnType<typeof reduceAccountReviewCommand>,
  before: AccountReviewSession
): void {
  expect(actual.state).toEqual(before);
  expect(actual.effect).toBe("none");
  expect(actual.affectedRowIds).toEqual([]);
  expect(actual.affectedGroupIds).toEqual([]);
  expect(actual.reasonCodes.length).toBeGreaterThan(0);
}
