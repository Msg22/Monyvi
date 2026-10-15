/**
 * #395 T019 — deterministic owned-account eligibility and grounded candidates.
 * These are read-only, caller-owned snapshots; only a future writer may certify
 * persisted ownership or commit a user-selected account.
 */
import {
  accountReviewRequestContextSchema,
  type AccountReviewAccountEvidence,
} from "./parser-schemas";
import type { AccountReviewOwnedContext } from "./normalization-types";
import type { AccountReviewCurrency, AccountReviewSession } from "./review-schemas";
import { normalizeGroundedIdentity } from "./identity";

export type OwnedReviewAccount = AccountReviewOwnedContext["accounts"][number];
export type KnownReviewCode = Extract<
  AccountReviewCurrency, { state: "known" }
>["code"];

function sameText(left: string | null, right: string | null): boolean {
  return left !== null && right !== null &&
    left.trim().length > 0 && right.trim().length > 0 &&
    normalizeGroundedIdentity(left) === normalizeGroundedIdentity(right);
}

function projectionMatches(
  account: OwnedReviewAccount,
  projected: AccountReviewOwnedContext["providerContext"]["accounts"][number]
): boolean {
  return account.id === projected.id && account.name === projected.name &&
    account.currency === projected.currency && account.type === projected.type &&
    account.institutionId === projected.institutionId &&
    account.providerDisplayName === projected.providerDisplayName &&
    account.cardLast4 === projected.cardLast4 &&
    account.senderNames.length === projected.senderNames.length &&
    account.senderNames.every((name, i) => name === projected.senderNames[i]);
}

/** Reject stale/foreign/contradictory scoped snapshots, not metadata edits
 * relative to a *different*, earlier parser snapshot. */
export function assertOwnedResolutionContext(
  session: AccountReviewSession,
  snapshots: AccountReviewOwnedContext
): void {
  const provider = accountReviewRequestContextSchema.parse(snapshots.providerContext);
  if (session.ownerId !== snapshots.ownerId ||
      session.preferredCurrency !== snapshots.preferredCurrency ||
      provider.preferredCurrency !== snapshots.preferredCurrency ||
      snapshots.accounts.length !== provider.accounts.length ||
      new Set(snapshots.accounts.map((a) => a.id)).size !== snapshots.accounts.length ||
      snapshots.accounts.some((a) => typeof a.isDefault !== "boolean")) {
    throw new Error("account_review_resolution_owned_context_invalid");
  }
  if (!snapshots.accounts.every((account) => {
    const item = provider.accounts.find((other) => other.id === account.id);
    return item !== undefined && projectionMatches(account, item);
  })) {
    throw new Error("account_review_resolution_owned_context_invalid");
  }
}

/** Ordinary SMS source is Bank/Wallet only; Voice can use grounded Cash. */
export function eligibleSourceAccounts(
  accounts: readonly OwnedReviewAccount[],
  source: AccountReviewSession["source"],
  code: KnownReviewCode
): readonly OwnedReviewAccount[] {
  return accounts.filter((account) =>
    account.currency === code &&
    (source === "VOICE" ||
      account.type === "BANK" || account.type === "DIGITAL_WALLET")
  );
}

export function eligibleCashDestinations(
  accounts: readonly OwnedReviewAccount[], code: KnownReviewCode
): readonly OwnedReviewAccount[] {
  return accounts.filter((account) =>
    account.type === "CASH" && account.currency === code
  );
}

function identityFieldsAgree(
  evidence: AccountReviewAccountEvidence,
  account: OwnedReviewAccount
): boolean {
  if (evidence.type !== null && evidence.type !== account.type) return false;
  if (evidence.institutionId !== null &&
      evidence.institutionId !== account.institutionId) return false;
  if (evidence.providerDisplayName !== null &&
      !sameText(evidence.providerDisplayName, account.providerDisplayName)) return false;
  // No inferred equivalence when the owned account has a different/unproven card.
  if (evidence.cardLast4 !== account.cardLast4) return false;
  return evidence.name === null ||
    [account.name, account.providerDisplayName, ...account.senderNames].some(
      (candidate) => sameText(evidence.name, candidate)
    );
}

function hasIndependentIdentity(
  evidence: AccountReviewAccountEvidence,
  role: "source" | "destination"
): boolean {
  if (evidence.evidenceSpans.length === 0) return false;
  if (evidence.providerDisplayName !== null ||
      evidence.institutionId !== null ||
      (evidence.cardLast4 !== null && evidence.name !== null)) return true;
  // A grounded, typed Cash destination can be identified by a literal name.
  return role === "destination" && evidence.type === "CASH" &&
    evidence.name !== null;
}

/** Model candidateAccountIds are never an ownership proof or a ranking signal. */
export function groundedOwnedCandidates(
  evidence: AccountReviewAccountEvidence,
  eligible: readonly OwnedReviewAccount[],
  role: "source" | "destination"
): readonly OwnedReviewAccount[] {
  if (evidence.state !== "explicit" && evidence.state !== "contextual") return [];
  if (!hasIndependentIdentity(evidence, role)) return [];
  return eligible.filter((account) => identityFieldsAgree(evidence, account));
}

/** Multiple simultaneous eligible defaults are an inconsistency, not ordering. */
export function soleEligibleDefault(
  eligible: readonly OwnedReviewAccount[]
): OwnedReviewAccount | null {
  const defaults = eligible.filter((account) => account.isDefault);
  return defaults.length === 1 ? defaults[0] ?? null : null;
}
