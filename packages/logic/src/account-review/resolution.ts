/**
 * #395 T019 — pure first-session and refresh account resolution.
 * Financial rows, provider proof, user choices, group state, and Save intent
 * remain immutable. An owning writer must revalidate again at Save.
 */
import {
  accountReviewSessionSchema,
  type AccountReviewAssignment,
  type AccountReviewReason,
  type AccountReviewRow,
  type AccountReviewSession,
} from "./review-schemas";
import type { AccountReviewOwnedContext } from "./normalization-types";
import {
  assertOwnedResolutionContext,
  eligibleCashDestinations,
  eligibleSourceAccounts,
  groundedOwnedCandidates,
  soleEligibleDefault,
  type KnownReviewCode,
  type OwnedReviewAccount,
} from "./resolution-candidates";

export interface ResolveAccountReviewSessionInput {
  readonly session: AccountReviewSession;
  readonly accountSnapshots: AccountReviewOwnedContext;
}

type ReviewRow = AccountReviewRow;

function unresolved(
  reasonCode: AccountReviewReason,
  candidates: readonly OwnedReviewAccount[] = []
): AccountReviewAssignment {
  return {
    state: "unresolved",
    accountId: null,
    reasonCode,
    candidateAccountIds: candidates.map((account) => account.id),
  };
}

function existing(
  account: OwnedReviewAccount,
  origin: "exact" | "default" | "user",
  row: ReviewRow
): AccountReviewAssignment {
  return {
    state: "existing",
    accountId: account.id,
    origin,
    currency: account.currency,
    identityRevision: row.revision,
  };
}

function addReason(
  reasons: readonly AccountReviewReason[],
  reason: AccountReviewReason
): AccountReviewReason[] {
  return reasons.includes(reason) ? [...reasons] : [...reasons, reason];
}

function removeAccountBlockers(
  reasons: readonly AccountReviewReason[]
): AccountReviewReason[] {
  return reasons.filter(
    (reason) =>
      reason !== "account_needed" &&
      reason !== "account_match_ambiguous" &&
      reason !== "account_unavailable" &&
      reason !== "account_identity_uncertain"
  );
}

function unresolvedSource(
  row: ReviewRow,
  reason: AccountReviewReason,
  candidates: readonly OwnedReviewAccount[] = [],
  isStale = false
): ReviewRow {
  return {
    ...row,
    assignment: unresolved(reason, candidates),
    selected: false,
    reviewReasons: isStale
      ? addReason(row.reviewReasons, reason)
      : [...row.reviewReasons],
  };
}

function acceptedSource(
  row: ReviewRow,
  account: OwnedReviewAccount,
  origin: "exact" | "default"
): ReviewRow {
  return {
    ...row,
    assignment: existing(account, origin, row),
    selected: false,
    reviewReasons: removeAccountBlockers(row.reviewReasons),
  };
}

// Match the existing review low-confidence boundary (<= 0.8 needs review).
const REVIEW_EXACT_MATCH_CONFIDENCE_THRESHOLD = 0.8;

function groundedMatchAllowed(row: ReviewRow): boolean {
  return (
    row.transaction.confidence > REVIEW_EXACT_MATCH_CONFIDENCE_THRESHOLD &&
    !row.reviewReasons.includes("low_confidence") &&
    !row.reviewReasons.includes("account_evidence_invalid") &&
    !row.reviewReasons.includes("account_identity_uncertain") &&
    !row.reviewReasons.includes("account_group_removed")
  );
}

function priorAssignmentStillEligible(
  row: ReviewRow,
  eligible: readonly OwnedReviewAccount[],
  allOwned: readonly OwnedReviewAccount[]
): boolean {
  if (row.assignment.state !== "existing") return false;
  const account = eligible.find((item) => item.id === row.assignment.accountId);
  if (
    !account ||
    row.currency.state !== "known" ||
    account.currency !== row.assignment.currency
  )
    return false;
  // Historical destination-only Cash choices can set the row-wide flag.
  // Source assignment provenance, not that flag, is authoritative.
  if (row.assignment.origin === "user") return true;
  if (row.assignment.origin === "default") {
    return (
      row.accountEvidence.state === "absent" &&
      soleEligibleDefault(eligible, allOwned)?.id === account.id
    );
  }
  if (row.source === "SMS" && row.accountEvidence.state === "contextual") {
    return false;
  }
  const candidates = groundedOwnedCandidates(
    row.accountEvidence,
    eligible,
    "source"
  );
  return (
    groundedMatchAllowed(row) &&
    candidates.length === 1 &&
    candidates[0]?.id === account.id
  );
}

function resolveAbsentSource(
  row: ReviewRow,
  eligible: readonly OwnedReviewAccount[],
  allOwned: readonly OwnedReviewAccount[]
): ReviewRow {
  // Hard invalid or removed evidence is not a valid absence/default signal.
  if (
    row.assignment.state === "unresolved" &&
    (row.assignment.reasonCode === "account_group_removed" ||
      row.assignment.reasonCode === "account_unavailable")
  ) {
    return { ...row, selected: false };
  }
  if (row.reviewReasons.includes("account_group_removed")) {
    return unresolvedSource(row, "account_group_removed");
  }
  if (row.reviewReasons.includes("account_unavailable")) {
    return unresolvedSource(row, "account_unavailable");
  }
  if (
    row.reviewReasons.includes("account_evidence_invalid") ||
    row.reviewReasons.includes("account_identity_uncertain")
  ) {
    return unresolvedSource(row, "account_evidence_invalid");
  }
  const preferred = soleEligibleDefault(eligible, allOwned);
  return preferred
    ? acceptedSource(row, preferred, "default")
    : unresolvedSource(row, "account_needed");
}

function resolveGroundedSource(
  row: ReviewRow,
  eligible: readonly OwnedReviewAccount[]
): ReviewRow {
  if (!groundedMatchAllowed(row)) {
    return unresolvedSource(row, "account_identity_uncertain");
  }
  const candidates = groundedOwnedCandidates(
    row.accountEvidence,
    eligible,
    "source"
  );
  if (candidates.length === 1 && candidates[0]) {
    return acceptedSource(row, candidates[0], "exact");
  }
  return candidates.length > 1
    ? unresolvedSource(row, "account_match_ambiguous", candidates, true)
    : unresolvedSource(row, "account_needed");
}

function resolveSource(
  row: ReviewRow,
  snapshots: AccountReviewOwnedContext
): ReviewRow {
  if (row.assignment.state === "suggested") return row;
  if (row.currency.state !== "known") {
    return { ...row, selected: false };
  }
  const eligible = eligibleSourceAccounts(
    snapshots.accounts,
    row.source,
    row.currency.code
  );
  if (row.assignment.state === "existing") {
    if (priorAssignmentStillEligible(row, eligible, snapshots.accounts)) {
      return {
        ...row,
        reviewReasons: removeAccountBlockers(row.reviewReasons),
      };
    }
    // A previously eligible automatic default is not a user-selected source.
    // Re-evaluate absent source evidence against the current owned default.
    // Never turn explicit source choice or grounded evidence into absence.
    if (
      row.assignment.origin === "default" &&
      row.accountEvidence.state === "absent"
    ) {
      return resolveAbsentSource(row, eligible, snapshots.accounts);
    }
    return unresolvedSource(row, "account_unavailable", [], true);
  }
  // A previously invalidated explicit user choice cannot silently become default.
  if (row.hasUserAccountOverride) return { ...row, selected: false };
  if (row.accountEvidence.state === "absent") {
    return resolveAbsentSource(row, eligible, snapshots.accounts);
  }
  if (
    row.accountEvidence.state === "explicit" ||
    (row.source === "VOICE" && row.accountEvidence.state === "contextual")
  ) {
    return resolveGroundedSource(row, eligible);
  }
  return unresolvedSource(row, "account_identity_uncertain");
}

function unresolvedDestination(
  row: ReviewRow,
  reason: AccountReviewReason,
  candidates: readonly OwnedReviewAccount[] = [],
  stale = false
): ReviewRow {
  return {
    ...row,
    toAssignment: unresolved(reason, candidates),
    selected: false,
    reviewReasons: stale
      ? addReason(row.reviewReasons, reason)
      : [...row.reviewReasons],
  };
}

function acceptedDestination(
  row: ReviewRow,
  account: OwnedReviewAccount,
  origin: "exact" | "default"
): ReviewRow {
  return {
    ...row,
    toAssignment: existing(account, origin, row),
    selected: false,
  };
}

function matchCashFallback(
  row: ReviewRow,
  cash: readonly OwnedReviewAccount[],
  allOwned: readonly OwnedReviewAccount[]
): ReviewRow {
  const preferred = soleEligibleDefault(cash, allOwned);
  if (preferred) return acceptedDestination(row, preferred, "default");
  if (cash.length === 1 && cash[0]) {
    // The canonical origin enum has no "sole Cash" literal.
    return acceptedDestination(row, cash[0], "exact");
  }
  return unresolvedDestination(row, "cash_transfer_review", cash);
}

function resolveExistingDestination(
  row: ReviewRow,
  previous: Extract<AccountReviewAssignment, { state: "existing" }>,
  cash: readonly OwnedReviewAccount[],
  allOwned: readonly OwnedReviewAccount[]
): ReviewRow {
  const current = cash.find((item) => item.id === previous.accountId);
  if (!current || current.currency !== previous.currency) {
    return unresolvedDestination(row, "account_unavailable", [], true);
  }
  if (previous.origin === "user") return row;
  if (previous.origin === "default") {
    if (soleEligibleDefault(cash, allOwned)?.id === current.id) return row;
    // Global default flags may drift while the independent sole-Cash
    // destination rule still uniquely allows this same owned account.
    return cash.length === 1
      ? { ...row, toAssignment: existing(current, "exact", row) }
      : unresolvedDestination(row, "account_unavailable", [], true);
  }
  const proof = row.toAccountEvidence;
  const matches =
    proof?.state === "explicit"
      ? groundedOwnedCandidates(proof, cash, "destination")
      : cash;
  return matches.length === 1 && matches[0]?.id === current.id
    ? row
    : unresolvedDestination(row, "account_unavailable", [], true);
}

function resolveAtmDestination(
  row: ReviewRow,
  snapshots: AccountReviewOwnedContext,
  groups: AccountReviewSession["groups"]
): ReviewRow {
  if (row.source !== "SMS" || row.transaction.isAtmWithdrawal !== true)
    return row;
  if (row.currency.state !== "known")
    return {
      ...row,
      toAssignment: unresolved("currency_confirmation_needed"),
      selected: false,
    };
  const code: KnownReviewCode = row.currency.code;
  const cash = eligibleCashDestinations(snapshots.accounts, code).filter(
    (item) =>
      row.assignment.state !== "existing" ||
      item.id !== row.assignment.accountId
  );
  const destinationAssignment = row.toAssignment;
  if (destinationAssignment?.state === "suggested") {
    const linked = groups.find(
      (group) => group.groupId === destinationAssignment.groupId
    );
    if (
      !linked ||
      linked.type !== "CASH" ||
      linked.status !== destinationAssignment.confirmation ||
      linked.currency !== code ||
      linked.revision !== destinationAssignment.groupRevision ||
      !linked.linkedRowIds.includes(row.rowId)
    )
      throw new Error("account_review_cash_destination_group_invalid");
    // A confirmed local draft is an assignment, not an existing Cash account.
    return row;
  }
  const previousDestination = row.toAssignment;
  if (previousDestination?.state === "existing") {
    return resolveExistingDestination(
      row,
      previousDestination,
      cash,
      snapshots.accounts
    );
  }
  const evidence = row.toAccountEvidence;
  if (evidence === null || evidence.state === "absent") {
    if (
      row.reviewReasons.includes("account_evidence_invalid") ||
      (row.toAssignment?.state === "unresolved" &&
        row.toAssignment.reasonCode === "account_evidence_invalid")
    ) {
      return unresolvedDestination(row, "account_evidence_invalid");
    }
    return matchCashFallback(row, cash, snapshots.accounts);
  }
  if (evidence.state !== "explicit") {
    return unresolvedDestination(row, "account_identity_uncertain");
  }
  const candidates = groundedOwnedCandidates(evidence, cash, "destination");
  if (candidates.length === 1 && candidates[0]) {
    return acceptedDestination(row, candidates[0], "exact");
  }
  return unresolvedDestination(
    row,
    candidates.length > 1 ? "account_match_ambiguous" : "account_needed",
    candidates
  );
}

function resolveRow(
  row: ReviewRow,
  context: AccountReviewOwnedContext,
  groups: AccountReviewSession["groups"]
): ReviewRow {
  const sourceResolved = resolveSource(row, context);
  return resolveAtmDestination(sourceResolved, context, groups);
}

/** Pure: no DB, provider, time, IDs, UI, automatic confirmations or Save. */
export function resolveAccountReviewSession(
  input: ResolveAccountReviewSessionInput
): AccountReviewSession {
  const session = accountReviewSessionSchema.parse(input.session);
  assertOwnedResolutionContext(session, input.accountSnapshots);
  const rows = session.rows.map((row) =>
    resolveRow(row, input.accountSnapshots, session.groups)
  );
  return accountReviewSessionSchema.parse({ ...session, rows });
}
