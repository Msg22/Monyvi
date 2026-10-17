/**
 * T036: read-only manual account-picker projection for a canonical review row.
 * This is deliberately NOT the evidence-grounded automatic matching API.
 */
import {
  accountReviewSessionSchema,
  type AccountReviewSession,
} from "./review-schemas";
import type { AccountReviewOwnedContext } from "./normalization-types";
import {
  assertOwnedResolutionContext,
  eligibleCashDestinations,
  eligibleSourceAccounts,
} from "./resolution-candidates";

export interface GetAccountReviewAccountCandidatesInput {
  readonly session: AccountReviewSession;
  readonly rowId: AccountReviewSession["rows"][number]["rowId"];
  readonly role: "source" | "destination";
  readonly accountSnapshots: AccountReviewOwnedContext;
}

/**
 * Return the caller's current owned, eligible accounts without selecting one.
 * The owned snapshots already contain active accounts; no isActive field or
 * inferred account is introduced. A selection is rechecked by the reducer.
 */
export function getAccountReviewAccountCandidates(
  input: GetAccountReviewAccountCandidatesInput
): ReadonlyArray<AccountReviewOwnedContext["accounts"][number]> {
  const session = accountReviewSessionSchema.parse(input.session);
  assertOwnedResolutionContext(session, input.accountSnapshots);
  const row = session.rows.find((item) => item.rowId === input.rowId);
  if (!row) throw new Error("account_review_choice_row_not_found");
  if (row.currency.state !== "known") return [];

  if (input.role === "destination") {
    if (row.source !== "SMS" || row.transaction.isAtmWithdrawal !== true) {
      return [];
    }
    const otherId =
      row.assignment.state === "existing" ? row.assignment.accountId : null;
    return eligibleCashDestinations(
      input.accountSnapshots.accounts,
      row.currency.code
    ).filter((account) => account.id !== otherId);
  }

  const otherId =
    row.toAssignment?.state === "existing" ? row.toAssignment.accountId : null;
  return eligibleSourceAccounts(
    input.accountSnapshots.accounts,
    row.source,
    row.currency.code
  ).filter((account) => account.id !== otherId);
}
