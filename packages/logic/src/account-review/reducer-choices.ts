/**
 * T036 pure explicit account-choice and currency transitions.
 * Always use the current owned snapshot; never create accounts or infer an
 * automatic match from the manual chooser's broader eligible alternatives.
 */
import {
  type AccountReviewAssignment,
  type AccountReviewCommand,
  type AccountReviewGroup,
  type AccountReviewReason,
  type AccountReviewRow,
  type AccountReviewSession,
} from "./review-schemas";
import type { AccountReviewOwnedContext } from "./normalization-types";
import {
  eligibleCashDestinations,
  eligibleSourceAccounts,
  type OwnedReviewAccount,
} from "./resolution-candidates";
import { resolveAccountReviewSession } from "./resolution";
import { getAccountReviewAccountCandidates } from "./candidates";
import {
  incrementReviewRevision,
  revisedRow,
  type ReviewTransition,
} from "./reducer-primitives";

type RowChoice = Extract<AccountReviewCommand, { kind: "choose_row_account" }>;
type GroupChoice = Extract<
  AccountReviewCommand,
  { kind: "replace_group_account" }
>;
type CurrencyChoice = Extract<
  AccountReviewCommand,
  { kind: "confirm_row_currency" }
>;

export interface ChoiceTransitionResult {
  readonly transition: ReviewTransition | null;
  readonly reason: AccountReviewReason | null;
}

interface ChoiceRowChanges {
  readonly rows: readonly AccountReviewRow[];
  readonly groups: readonly AccountReviewGroup[];
  readonly removedEvidenceKeys: readonly string[];
  readonly affectedGroupIds: readonly string[];
}

function blocked(reason: AccountReviewReason): ChoiceTransitionResult {
  return { transition: null, reason };
}

function accepted(transition: ReviewTransition): ChoiceTransitionResult {
  return { transition, reason: null };
}

function unresolved(reasonCode: AccountReviewReason): AccountReviewAssignment {
  return {
    state: "unresolved",
    accountId: null,
    reasonCode,
    candidateAccountIds: [],
  };
}

function explicitAssignment(
  account: OwnedReviewAccount,
  revision: string
): AccountReviewAssignment {
  return {
    state: "existing",
    accountId: account.id,
    currency: account.currency,
    origin: "user",
    identityRevision: revision,
  };
}

const SOURCE_BLOCKERS: readonly AccountReviewReason[] = [
  "account_needed",
  "account_match_ambiguous",
  "account_group_unconfirmed",
  "account_identity_uncertain",
  "account_unavailable",
  "account_group_removed",
];

function clearSourceBlockers(
  reasons: readonly AccountReviewReason[]
): AccountReviewReason[] {
  return reasons.filter((reason) => !SOURCE_BLOCKERS.includes(reason));
}

function addReason(
  reasons: readonly AccountReviewReason[],
  reason: AccountReviewReason
): AccountReviewReason[] {
  return reasons.includes(reason) ? [...reasons] : [...reasons, reason];
}

function isAtm(row: AccountReviewRow): boolean {
  return row.source === "SMS" && row.transaction.isAtmWithdrawal === true;
}

/** Check the endpoint we are NOT editing; never silently repair it. */
function oppositeIsCurrent(
  state: AccountReviewSession,
  row: AccountReviewRow,
  role: "source" | "destination",
  snapshots: AccountReviewOwnedContext
): boolean {
  const opposite = role === "source" ? row.toAssignment : row.assignment;
  if (opposite === null || opposite.state === "unresolved") return true;
  if (opposite.state === "suggested") {
    return state.groups.some(
      (group) =>
        group.groupId === opposite.groupId &&
        group.revision === opposite.groupRevision &&
        group.linkedRowIds.includes(row.rowId) &&
        group.currency ===
          (row.currency.state === "known" ? row.currency.code : null) &&
        (role === "source"
          ? group.status === "confirmed" && group.type === "CASH"
          : group.status === opposite.confirmation && group.type !== "CASH")
    );
  }
  const refreshed = resolveAccountReviewSession({
    session: state,
    accountSnapshots: snapshots,
  });
  const freshRow = refreshed.rows.find((item) => item.rowId === row.rowId);
  const freshOpposite =
    role === "source" ? freshRow?.toAssignment : freshRow?.assignment;
  return JSON.stringify(opposite) === JSON.stringify(freshOpposite);
}

/**
 * Keep the original evidence/group ID and revise every remaining reciprocal
 * member. The caller's affectedRowIds is the clicked row; affectedGroupIds
 * identifies the group whose linked snapshots all require atomic treatment.
 */
function detachSourceGroup(
  state: AccountReviewSession,
  original: AccountReviewRow,
  replacement: AccountReviewRow
): ChoiceRowChanges {
  const assignment = original.assignment;
  if (assignment.state !== "suggested") {
    return {
      rows: state.rows.map((row) =>
        row.rowId === original.rowId ? replacement : row
      ),
      groups: state.groups,
      removedEvidenceKeys: state.removedEvidenceKeys,
      affectedGroupIds: [],
    };
  }

  const group = state.groups.find(
    (item) => item.groupId === assignment.groupId
  );
  if (!group || group.status === "removed") {
    throw new Error("account_review_choice_missing_reciprocal_group");
  }
  const remaining = group.linkedRowIds.filter((id) => id !== original.rowId);
  const revision = incrementReviewRevision(group.revision);
  const emptied = remaining.length === 0;
  const changed: AccountReviewGroup = {
    ...group,
    revision,
    // The tombstone preserves historical linkage and stable evidence identity.
    linkedRowIds: emptied ? group.linkedRowIds : remaining,
    status: emptied ? "removed" : group.status,
    confirmedIdentityRevision:
      group.status === "confirmed" && !emptied
        ? revision
        : group.confirmedIdentityRevision,
  };
  const rows = state.rows.map((row): AccountReviewRow => {
    if (row.rowId === original.rowId) return replacement;
    if (!remaining.includes(row.rowId)) return row;
    if (row.assignment.state !== "suggested") {
      throw new Error("account_review_choice_missing_member_assignment");
    }
    return revisedRow({
      ...row,
      assignment: { ...row.assignment, groupRevision: revision },
    });
  });
  return {
    rows,
    groups: state.groups.map((item) =>
      item.groupId === group.groupId ? changed : item
    ),
    removedEvidenceKeys: emptied
      ? [...new Set([...state.removedEvidenceKeys, group.evidenceKey])]
      : state.removedEvidenceKeys,
    affectedGroupIds: [group.groupId],
  };
}

/** An ATM Cash choice changes destination; SMS Bank/Wallet changes source. */
function chooseRow(
  state: AccountReviewSession,
  command: RowChoice,
  snapshots: AccountReviewOwnedContext
): ChoiceTransitionResult {
  const row = state.rows.find((item) => item.rowId === command.rowId);
  if (!row) return blocked("account_unavailable");
  if (row.revision !== command.expectedRowRevision) {
    return blocked("review_revision_stale");
  }
  if (row.currency.state !== "known")
    return blocked("currency_confirmation_needed");
  const role =
    isAtm(row) &&
    snapshots.accounts.some(
      (account) => account.id === command.accountId && account.type === "CASH"
    )
      ? "destination"
      : "source";
  const account = getAccountReviewAccountCandidates({
    session: state,
    rowId: row.rowId,
    role,
    accountSnapshots: snapshots,
  }).find((item) => item.id === command.accountId);
  if (!account) return blocked("account_unavailable");
  if (!oppositeIsCurrent(state, row, role, snapshots)) {
    return blocked("account_unavailable");
  }

  const revision = incrementReviewRevision(row.revision);
  const chosen = explicitAssignment(account, revision);
  if (role === "destination") {
    return accepted({
      rows: state.rows.map(
        (item): AccountReviewRow =>
          item.rowId === row.rowId
            ? {
                ...item,
                revision,
                toAssignment: chosen,
                selected: false,
                hasUserAccountOverride: true,
                reviewReasons: item.reviewReasons.filter(
                  (reason) => reason !== "cash_transfer_review"
                ),
              }
            : item
      ),
      groups: state.groups,
      affectedRowIds: [row.rowId],
      affectedGroupIds: [],
    });
  }
  const replacement: AccountReviewRow = {
    ...row,
    revision,
    assignment: chosen,
    selected: false,
    hasUserAccountOverride: true,
    reviewReasons: clearSourceBlockers(row.reviewReasons),
  };
  const changed = detachSourceGroup(state, row, replacement);
  return accepted({
    ...changed,
    affectedRowIds: [row.rowId],
  });
}

function findReplaceableGroup(
  state: AccountReviewSession,
  command: GroupChoice
): AccountReviewGroup | AccountReviewReason {
  const group = state.groups.find((item) => item.groupId === command.groupId);
  if (!group) return "account_group_snapshot_conflict";
  if (group.revision !== command.expectedGroupRevision) {
    return "review_revision_stale";
  }
  if (group.status === "removed") return "account_group_removed";
  if (group.linkedRowIds.length !== command.disclosedLinkedRowCount) {
    return "review_group_count_stale";
  }
  if (group.linkedRowIds.length === 0) return "account_group_snapshot_conflict";
  return group;
}

function groupMemberIsCompatible(
  state: AccountReviewSession,
  row: AccountReviewRow,
  account: OwnedReviewAccount,
  snapshots: AccountReviewOwnedContext,
  group: AccountReviewGroup
): boolean {
  if (
    row.currency.state !== "known" ||
    row.currency.code !== group.currency ||
    row.assignment.state !== "suggested" ||
    row.assignment.groupId !== group.groupId ||
    row.assignment.groupRevision !== group.revision
  ) {
    return false;
  }
  if (!oppositeIsCurrent(state, row, "source", snapshots)) return false;
  return getAccountReviewAccountCandidates({
    session: state,
    rowId: row.rowId,
    role: "source",
    accountSnapshots: snapshots,
  }).some((candidate) => candidate.id === account.id);
}

/** An explicitly disclosed group command changes only its linked source rows. */
function replaceGroup(
  state: AccountReviewSession,
  command: GroupChoice,
  snapshots: AccountReviewOwnedContext
): ChoiceTransitionResult {
  const groupOrReason = findReplaceableGroup(state, command);
  if (typeof groupOrReason === "string") return blocked(groupOrReason);
  const group = groupOrReason;
  const account = snapshots.accounts.find(
    (item) => item.id === command.accountId
  );
  if (!account || (group.type !== null && group.type !== account.type)) {
    return blocked("account_unavailable");
  }
  const memberIds = new Set(group.linkedRowIds);
  const members = state.rows.filter((row) => memberIds.has(row.rowId));
  if (
    members.length !== memberIds.size ||
    !members.every((row) =>
      groupMemberIsCompatible(state, row, account, snapshots, group)
    )
  ) {
    return blocked("account_group_snapshot_conflict");
  }

  const rows = state.rows.map((row): AccountReviewRow => {
    if (!memberIds.has(row.rowId)) return row;
    const revision = incrementReviewRevision(row.revision);
    const reasons = clearSourceBlockers(row.reviewReasons);
    return {
      ...row,
      revision,
      assignment: explicitAssignment(account, revision),
      hasUserAccountOverride: true,
      // Previously valid, explicitly selected members remain selected.
      selected:
        row.selected && group.status === "confirmed" && reasons.length === 0,
      reviewReasons: reasons,
    };
  });
  const tombstone: AccountReviewGroup = {
    ...group,
    revision: incrementReviewRevision(group.revision),
    status: "removed",
  };
  return accepted({
    rows,
    groups: state.groups.map((item) =>
      item.groupId === group.groupId ? tombstone : item
    ),
    removedEvidenceKeys: [
      ...new Set([...state.removedEvidenceKeys, group.evidenceKey]),
    ],
    affectedRowIds: [...group.linkedRowIds],
    affectedGroupIds: [group.groupId],
  });
}

function stillEligibleSource(
  row: AccountReviewRow,
  code: CurrencyChoice["currency"],
  snapshots: AccountReviewOwnedContext,
  refreshed: AccountReviewRow | undefined
): boolean {
  if (row.assignment.state !== "existing") return false;
  return (
    row.assignment.currency === code &&
    eligibleSourceAccounts(snapshots.accounts, row.source, code).some(
      (account) => account.id === row.assignment.accountId
    ) &&
    JSON.stringify(refreshed?.assignment) === JSON.stringify(row.assignment)
  );
}

function stillEligibleDestination(
  row: AccountReviewRow,
  code: CurrencyChoice["currency"],
  snapshots: AccountReviewOwnedContext,
  refreshed: AccountReviewRow | undefined
): boolean {
  if (row.toAssignment?.state !== "existing") return false;
  return (
    row.toAssignment.currency === code &&
    eligibleCashDestinations(snapshots.accounts, code).some(
      (account) => account.id === row.toAssignment?.accountId
    ) &&
    JSON.stringify(refreshed?.toAssignment) === JSON.stringify(row.toAssignment)
  );
}

/**
 * Keep legacy parser transaction reasons untouched. Review-only blockers
 * belong to AccountReviewRow, never ParsedVoice/Sms transaction metadata.
 * Narrow each source before building the canonical revised row.
 */
function withCorrectedTransactionCurrency(
  row: AccountReviewRow,
  currency: CurrencyChoice["currency"],
  updates: Pick<
    AccountReviewRow,
    "assignment" | "toAssignment" | "reviewReasons" | "selected"
  >
): AccountReviewRow {
  const reviewCurrency: AccountReviewRow["currency"] = {
    state: "known",
    code: currency,
    origin: "user",
  };
  if (row.source === "VOICE") {
    return revisedRow({
      ...row,
      ...updates,
      currency: reviewCurrency,
      transaction: { ...row.transaction, currency },
      hasUserCurrencyOverride: true,
    });
  }
  return revisedRow({
    ...row,
    ...updates,
    currency: reviewCurrency,
    transaction: { ...row.transaction, currency },
    hasUserCurrencyOverride: true,
  });
}

/** Confirmation changes the denomination, never the original numeric value. */
function confirmCurrency(
  state: AccountReviewSession,
  command: CurrencyChoice,
  snapshots: AccountReviewOwnedContext
): ChoiceTransitionResult {
  const row = state.rows.find((item) => item.rowId === command.rowId);
  if (!row) return blocked("account_unavailable");
  if (row.revision !== command.expectedRowRevision) {
    return blocked("review_revision_stale");
  }

  const oldCode = row.currency.state === "known" ? row.currency.code : null;
  const currencyChanged = oldCode !== command.currency;
  const refreshed = resolveAccountReviewSession({
    session: state,
    accountSnapshots: snapshots,
  }).rows.find((item) => item.rowId === row.rowId);
  const assignment = row.assignment;
  const sourceGroup =
    assignment.state === "suggested"
      ? state.groups.find((item) => item.groupId === assignment.groupId)
      : null;
  const keepGroup =
    sourceGroup !== null &&
    sourceGroup !== undefined &&
    sourceGroup.currency === command.currency;

  const source =
    keepGroup ||
    stillEligibleSource(row, command.currency, snapshots, refreshed)
      ? row.assignment
      : unresolved("account_needed");
  const keepCash =
    isAtm(row) &&
    stillEligibleDestination(row, command.currency, snapshots, refreshed);
  const destination = !isAtm(row)
    ? row.toAssignment
    : keepCash
      ? row.toAssignment
      : unresolved("cash_transfer_review");

  let reasons: AccountReviewReason[] = row.reviewReasons.filter(
    (reason) => reason !== "currency_confirmation_needed"
  );
  if (!keepGroup) {
    reasons = reasons.filter(
      (reason) => reason !== "account_group_unconfirmed"
    );
  }
  if (source.state === "unresolved") {
    reasons = addReason(reasons, "account_needed");
  } else if (
    source.state === "suggested" &&
    source.confirmation === "pending"
  ) {
    reasons = addReason(reasons, "account_group_unconfirmed");
  } else {
    reasons = clearSourceBlockers(reasons);
  }
  if (isAtm(row) && destination?.state !== "existing") {
    reasons = addReason(reasons, "cash_transfer_review");
  } else if (isAtm(row)) {
    reasons = reasons.filter((reason) => reason !== "cash_transfer_review");
  }

  const replacement = withCorrectedTransactionCurrency(row, command.currency, {
    assignment: source,
    toAssignment: destination,
    reviewReasons: reasons,
    selected:
      row.selected &&
      !currencyChanged &&
      source.state !== "unresolved" &&
      (!isAtm(row) || destination?.state === "existing") &&
      reasons.length === 0,
  });
  const changed =
    keepGroup || row.assignment.state !== "suggested"
      ? {
          rows: state.rows.map((item) =>
            item.rowId === row.rowId ? replacement : item
          ),
          groups: state.groups,
          removedEvidenceKeys: state.removedEvidenceKeys,
          affectedGroupIds: [],
        }
      : detachSourceGroup(state, row, replacement);
  return accepted({ ...changed, affectedRowIds: [row.rowId] });
}

export function reduceChoiceCommand(
  state: AccountReviewSession,
  command: RowChoice | GroupChoice | CurrencyChoice,
  accountSnapshots: AccountReviewOwnedContext
): ChoiceTransitionResult {
  switch (command.kind) {
    case "choose_row_account":
      return chooseRow(state, command, accountSnapshots);
    case "replace_group_account":
      return replaceGroup(state, command, accountSnapshots);
    case "confirm_row_currency":
      return confirmCurrency(state, command, accountSnapshots);
  }
}
