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
import {
  getAccountReviewAccountCandidates,
  getExplicitAccountCurrencyOptions,
} from "./candidates";
import {
  manualRowAccountDraftRef,
  normalizeGroundedIdentity,
  uuidV8FromSha256,
} from "./identity";
import {
  incrementReviewRevision,
  revisedRow,
  type ReviewTransition,
} from "./reducer-primitives";

type RowChoice = Extract<AccountReviewCommand, { kind: "choose_row_account" }>;
type ManualRowDraft = Extract<
  AccountReviewCommand,
  { kind: "create_row_account_draft" }
>;
type ExplicitAccountCurrencyChoice = Extract<
  AccountReviewCommand,
  { kind: "confirm_row_account_and_currency" }
>;
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

/** Detach only the endpoint being replaced, revising any other members.
 * Cash destination drafts are always row-only; source groups may be shared. */
function detachRoleGroup(
  state: AccountReviewSession,
  original: AccountReviewRow,
  replacement: AccountReviewRow,
  role: "source" | "destination"
): ChoiceRowChanges {
  const assignment =
    role === "source" ? original.assignment : original.toAssignment;
  if (assignment?.state !== "suggested") {
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
  if (!group || group.status === "removed")
    throw new Error("account_review_choice_missing_reciprocal_group");
  if (role === "destination" && group.linkedRowIds.length !== 1)
    throw new Error("account_review_cash_destination_not_row_only");

  const remaining = group.linkedRowIds.filter((id) => id !== original.rowId);
  const revision = incrementReviewRevision(group.revision);
  const emptied = remaining.length === 0;
  const changed: AccountReviewGroup = {
    ...group,
    revision,
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
    const current = role === "source" ? row.assignment : row.toAssignment;
    if (current?.state !== "suggested" || current.groupId !== group.groupId)
      throw new Error("account_review_choice_missing_member_assignment");
    return revisedRow({
      ...row,
      ...(role === "source"
        ? { assignment: { ...current, groupRevision: revision } }
        : { toAssignment: { ...current, groupRevision: revision } }),
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

/** Coordinate source and destination detachments as one reducer transition. */
function detachChangedGroups(
  state: AccountReviewSession,
  original: AccountReviewRow,
  replacement: AccountReviewRow
): ChoiceRowChanges {
  let working: ChoiceRowChanges = {
    rows: state.rows,
    groups: state.groups,
    removedEvidenceKeys: state.removedEvidenceKeys,
    affectedGroupIds: [],
  };
  for (const role of ["source", "destination"] as const) {
    const oldEndpoint =
      role === "source" ? original.assignment : original.toAssignment;
    const nextEndpoint =
      role === "source" ? replacement.assignment : replacement.toAssignment;
    if (
      oldEndpoint?.state !== "suggested" ||
      JSON.stringify(oldEndpoint) === JSON.stringify(nextEndpoint)
    )
      continue;
    const changed = detachRoleGroup(
      {
        ...state,
        rows: [...working.rows],
        groups: [...working.groups],
        removedEvidenceKeys: [...working.removedEvidenceKeys],
      },
      original,
      replacement,
      role
    );
    working = {
      ...changed,
      affectedGroupIds: [
        ...new Set([...working.affectedGroupIds, ...changed.affectedGroupIds]),
      ],
    };
  }
  if (working.rows === state.rows) {
    working = {
      ...working,
      rows: state.rows.map((item) =>
        item.rowId === original.rowId ? replacement : item
      ),
    };
  }
  return working;
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
    // Linked destination drafts use explicit disclosed group replacement.
    if (row.toAssignment?.state === "suggested")
      return blocked("account_group_snapshot_conflict");
    return accepted({
      rows: state.rows.map(
        (item): AccountReviewRow =>
          item.rowId === row.rowId
            ? {
                ...item,
                revision,
                toAssignment: chosen,
                selected: false,
                // A Cash-only destination choice is not a manual source choice.
                // The Cash assignment's own origin:"user" is its authority.
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
  const changed = detachChangedGroups(state, row, replacement);
  return accepted({
    ...changed,
    affectedRowIds: [row.rowId],
  });
}

/** One explicit source-only draft. Other rows/selections remain untouched. */
function createRowDraft(
  state: AccountReviewSession,
  command: ManualRowDraft,
  snapshots: AccountReviewOwnedContext
): ChoiceTransitionResult {
  const row = state.rows.find((item) => item.rowId === command.rowId);
  if (!row) return blocked("account_unavailable");
  if (row.revision !== command.expectedRowRevision)
    return blocked("review_revision_stale");
  if (row.currency.state !== "known")
    return blocked("currency_confirmation_needed");
  const confirmedCurrency = row.currency.code;
  const role = command.role;
  if (
    row.selected ||
    (role === "source"
      ? row.assignment.state !== "unresolved" ||
        (state.source === "SMS" && command.identity.type === "CASH")
      : !isAtm(row) ||
        command.identity.type !== "CASH" ||
        row.toAssignment?.state !== "unresolved")
  )
    return blocked("account_group_snapshot_conflict");
  if (!oppositeIsCurrent(state, row, role, snapshots))
    return blocked("account_unavailable");
  // Fresh owned eligibility inside the serialized SMS writer, not UI hints.
  if (
    getAccountReviewAccountCandidates({
      session: state,
      rowId: row.rowId,
      role,
      accountSnapshots: snapshots,
    }).length > 0
  )
    return blocked("account_unavailable");
  const { nonce, groupId, evidenceKey } = command.manualDraft;
  if (uuidV8FromSha256(evidenceKey) !== groupId)
    return blocked("account_group_snapshot_conflict");
  if (
    state.groups.some(
      (group) =>
        group.groupId === groupId ||
        group.evidenceKey === evidenceKey ||
        (group.status !== "removed" &&
          group.currency === confirmedCurrency &&
          group.institutionId === null &&
          normalizeGroundedIdentity(group.name) ===
            normalizeGroundedIdentity(command.identity.name))
    ) ||
    state.removedEvidenceKeys.includes(evidenceKey)
  )
    return blocked("account_group_snapshot_conflict");

  const group: AccountReviewGroup = {
    groupId,
    evidenceKey,
    suggestionRefs: [manualRowAccountDraftRef(row.rowId, nonce)],
    name: command.identity.name.trim(),
    type: command.identity.type,
    currency: confirmedCurrency,
    institutionId: null,
    providerDisplayName: null,
    cardLast4: null,
    senderNames: [],
    linkedRowIds: [row.rowId],
    status: "confirmed",
    revision: "0",
    confirmedIdentityRevision: "0",
  };
  const nextRevision = incrementReviewRevision(row.revision);
  return accepted({
    rows: state.rows.map((item) =>
      item.rowId === row.rowId
        ? {
            ...item,
            revision: nextRevision,
            ...(role === "destination"
              ? {
                  toAssignment: {
                    state: "suggested" as const,
                    accountId: null,
                    groupId,
                    groupRevision: group.revision,
                    confirmation: "confirmed" as const,
                  },
                  reviewReasons: item.reviewReasons.filter(
                    (reason) => reason !== "cash_transfer_review"
                  ),
                }
              : {
                  assignment: {
                    state: "suggested" as const,
                    accountId: null,
                    groupId,
                    groupRevision: group.revision,
                    confirmation: "confirmed" as const,
                  },
                  reviewReasons: clearSourceBlockers(item.reviewReasons),
                  hasUserAccountOverride: true,
                }),
            selected: false,
          }
        : item
    ),
    groups: [...state.groups, group],
    affectedRowIds: [row.rowId],
    affectedGroupIds: [groupId],
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
  const role =
    state.source === "SMS" && group.type === "CASH" ? "destination" : "source";
  const target = role === "destination" ? row.toAssignment : row.assignment;
  if (
    row.currency.state !== "known" ||
    row.currency.code !== group.currency ||
    target?.state !== "suggested" ||
    target.groupId !== group.groupId ||
    target.groupRevision !== group.revision ||
    (role === "destination" && (!isAtm(row) || account.type !== "CASH")) ||
    (role === "source" && row.source === "SMS" && account.type === "CASH")
  )
    return false;
  if (!oppositeIsCurrent(state, row, role, snapshots)) return false;
  return getAccountReviewAccountCandidates({
    session: state,
    rowId: row.rowId,
    role,
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

  const isDestination = state.source === "SMS" && group.type === "CASH";
  const rows = state.rows.map((row): AccountReviewRow => {
    if (!memberIds.has(row.rowId)) return row;
    const revision = incrementReviewRevision(row.revision);
    const reasons = isDestination
      ? row.reviewReasons.filter((reason) => reason !== "cash_transfer_review")
      : clearSourceBlockers(row.reviewReasons);
    return {
      ...row,
      revision,
      ...(isDestination
        ? { toAssignment: explicitAssignment(account, revision) }
        : {
            assignment: explicitAssignment(account, revision),
            hasUserAccountOverride: true,
          }),
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

/** An existing or linked account is kept only if its current currency/role
 * stays eligible. Never rerun automatic default matching for this override. */
function endpointEligibleAtCurrency(
  state: AccountReviewSession,
  row: AccountReviewRow,
  assignment: AccountReviewAssignment | null,
  role: "source" | "destination",
  code: CurrencyChoice["currency"],
  snapshots: AccountReviewOwnedContext,
  refreshed: AccountReviewRow | undefined
): boolean {
  if (!assignment || assignment.state === "unresolved") return false;
  if (assignment.state === "existing") {
    const eligible =
      role === "source"
        ? eligibleSourceAccounts(snapshots.accounts, row.source, code)
        : eligibleCashDestinations(snapshots.accounts, code);
    const opposite = role === "source" ? row.toAssignment : row.assignment;
    const freshEndpoint =
      role === "source" ? refreshed?.assignment : refreshed?.toAssignment;
    return eligible.some(
      (account) =>
        account.id === assignment.accountId &&
        assignment.currency === account.currency &&
        JSON.stringify(freshEndpoint) === JSON.stringify(assignment) &&
        (opposite?.state !== "existing" || opposite.accountId !== account.id)
    );
  }
  return state.groups.some(
    (group) =>
      group.groupId === assignment.groupId &&
      group.status === assignment.confirmation &&
      group.revision === assignment.groupRevision &&
      group.currency === code &&
      group.linkedRowIds.includes(row.rowId) &&
      (role === "destination"
        ? isAtm(row) && group.type === "CASH"
        : row.source === "VOICE" || group.type !== "CASH")
  );
}

/** Single explicit currency confirmation, retaining valid endpoint groups. */
function confirmCurrency(
  state: AccountReviewSession,
  command: CurrencyChoice,
  snapshots: AccountReviewOwnedContext
): ChoiceTransitionResult {
  const row = state.rows.find((item) => item.rowId === command.rowId);
  if (!row) return blocked("account_unavailable");
  if (row.revision !== command.expectedRowRevision)
    return blocked("review_revision_stale");

  const oldCode = row.currency.state === "known" ? row.currency.code : null;
  const refreshed = resolveAccountReviewSession({
    session: state,
    accountSnapshots: snapshots,
  }).rows.find((item) => item.rowId === row.rowId);
  const source = endpointEligibleAtCurrency(
    state,
    row,
    row.assignment,
    "source",
    command.currency,
    snapshots,
    refreshed
  )
    ? row.assignment
    : unresolved("account_needed");
  const destination = !isAtm(row)
    ? row.toAssignment
    : endpointEligibleAtCurrency(
          state,
          row,
          row.toAssignment,
          "destination",
          command.currency,
          snapshots,
          refreshed
        )
      ? row.toAssignment
      : unresolved("cash_transfer_review");
  let reasons: AccountReviewRow["reviewReasons"] = row.reviewReasons.filter(
    (reason) => reason !== "currency_confirmation_needed"
  );
  reasons =
    source.state === "unresolved"
      ? addReason(
          reasons.filter((reason) => reason !== "account_group_unconfirmed"),
          "account_needed"
        )
      : source.state === "suggested" && source.confirmation === "pending"
        ? addReason(reasons, "account_group_unconfirmed")
        : clearSourceBlockers(reasons);
  if (isAtm(row)) {
    reasons =
      destination?.state === "unresolved"
        ? addReason(reasons, "cash_transfer_review")
        : reasons.filter((reason) => reason !== "cash_transfer_review");
  }
  const replacement = withCorrectedTransactionCurrency(row, command.currency, {
    assignment: source,
    toAssignment: destination,
    reviewReasons: reasons,
    selected:
      row.selected &&
      oldCode === command.currency &&
      source.state !== "unresolved" &&
      (!isAtm(row) ||
        destination?.state === "existing" ||
        (destination?.state === "suggested" &&
          destination.confirmation === "confirmed")) &&
      reasons.length === 0,
  });
  return accepted({
    ...detachChangedGroups(state, row, replacement),
    affectedRowIds: [row.rowId],
  });
}

/** User explicitly accepts the selected OWNED account's authoritative currency.
 * No separate currency command or intermediate persisted financial state. */
function confirmAccountAndCurrency(
  state: AccountReviewSession,
  command: ExplicitAccountCurrencyChoice,
  snapshots: AccountReviewOwnedContext
): ChoiceTransitionResult {
  const row = state.rows.find((item) => item.rowId === command.rowId);
  if (!row) return blocked("account_unavailable");
  if (row.revision !== command.expectedRowRevision)
    return blocked("review_revision_stale");
  if (command.role === "destination" && !isAtm(row))
    return blocked("account_unavailable");

  const account = snapshots.accounts.find(
    (candidate) => candidate.id === command.accountId
  );
  if (!account || account.currency !== command.acknowledgedCurrency)
    return blocked("account_unavailable");
  const expected = command.expectedAccountIdentity;
  if (
    account.name !== expected.name ||
    account.type !== expected.type ||
    account.currency !== expected.currency ||
    account.institutionId !== expected.institutionId ||
    account.providerDisplayName !== expected.providerDisplayName ||
    account.cardLast4 !== expected.cardLast4
  )
    return blocked("account_unavailable");
  if (
    !getExplicitAccountCurrencyOptions({
      session: state,
      rowId: row.rowId,
      role: command.role,
      ownedAccounts: snapshots.accounts,
    }).some((candidate) => candidate.id === account.id)
  )
    return blocked("account_unavailable");

  const code = account.currency;
  const refreshed = resolveAccountReviewSession({
    session: state,
    accountSnapshots: snapshots,
  }).rows.find((item) => item.rowId === row.rowId);
  const nextRevision = incrementReviewRevision(row.revision);
  const explicit = explicitAssignment(account, nextRevision);
  const source =
    command.role === "source"
      ? explicit
      : endpointEligibleAtCurrency(
            state,
            row,
            row.assignment,
            "source",
            code,
            snapshots,
            refreshed
          )
        ? row.assignment
        : unresolved("account_needed");
  const destination = !isAtm(row)
    ? null
    : command.role === "destination"
      ? explicit
      : endpointEligibleAtCurrency(
            state,
            row,
            row.toAssignment,
            "destination",
            code,
            snapshots,
            refreshed
          )
        ? row.toAssignment
        : unresolved("cash_transfer_review");

  let reasons: AccountReviewRow["reviewReasons"] = row.reviewReasons.filter(
    (reason) => reason !== "currency_confirmation_needed"
  );
  if (source.state === "unresolved") {
    reasons = addReason(
      reasons.filter((reason) => !SOURCE_BLOCKERS.includes(reason)),
      "account_needed"
    );
  } else if (
    source.state === "suggested" &&
    source.confirmation === "pending"
  ) {
    reasons = addReason(reasons, "account_group_unconfirmed");
  } else {
    reasons = clearSourceBlockers(reasons);
  }
  if (isAtm(row)) {
    reasons =
      destination?.state === "unresolved"
        ? addReason(reasons, "cash_transfer_review")
        : reasons.filter((reason) => reason !== "cash_transfer_review");
  }
  const updated = withCorrectedTransactionCurrency(row, code, {
    assignment: source,
    toAssignment: destination,
    reviewReasons: reasons,
    selected: false,
  });
  // Existing amount, amountDecimal, category, provenance and source identity
  // remain untouched. No conversion and no automatic account selection.
  const replacement: AccountReviewRow =
    command.role === "source"
      ? { ...updated, hasUserAccountOverride: true }
      : updated;
  return accepted({
    ...detachChangedGroups(state, row, replacement),
    affectedRowIds: [row.rowId],
  });
}

export function reduceChoiceCommand(
  state: AccountReviewSession,
  command:
    | RowChoice
    | ManualRowDraft
    | ExplicitAccountCurrencyChoice
    | GroupChoice
    | CurrencyChoice,
  accountSnapshots: AccountReviewOwnedContext
): ChoiceTransitionResult {
  switch (command.kind) {
    case "choose_row_account":
      return chooseRow(state, command, accountSnapshots);
    case "create_row_account_draft":
      return createRowDraft(state, command, accountSnapshots);
    case "confirm_row_account_and_currency":
      return confirmAccountAndCurrency(state, command, accountSnapshots);
    case "replace_group_account":
      return replaceGroup(state, command, accountSnapshots);
    case "confirm_row_currency":
      return confirmCurrency(state, command, accountSnapshots);
  }
}
