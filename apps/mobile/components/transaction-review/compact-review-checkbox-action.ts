/** User-facing checkbox routing; canonical reducer still decides selection.
 * Check both SMS ATM endpoints before returning any eligible select action.
 */
import type { AccountReviewRow, AccountReviewSession } from "@monyvi/logic";

export type CompactReviewCheckboxAction =
  | "confirm_group"
  | "choose_account"
  | "choose_destination_account"
  | "choose_category"
  | "edit_row"
  | "select";

export function compactReviewCheckboxAction(
  row: AccountReviewRow,
  groups: ReadonlyMap<string, AccountReviewSession["groups"][number]>
): CompactReviewCheckboxAction {
  const isSmsAtm =
    row.source === "SMS" && row.transaction.isAtmWithdrawal === true;
  const source = row.assignment;
  const destination = isSmsAtm ? row.toAssignment : null;
  const pendingSource =
    source.state === "suggested" &&
    groups.get(source.groupId)?.status === "pending";
  const pendingDestination =
    destination?.state === "suggested" &&
    groups.get(destination.groupId)?.status === "pending";

  // Both endpoints must be checked. A confirmed Bank source must never
  // suppress an outstanding Cash destination confirmation.
  if (pendingSource || pendingDestination) return "confirm_group";
  if (source.state === "unresolved" || row.currency.state === "unconfirmed")
    return "choose_account";
  if (
    isSmsAtm &&
    (destination === null ||
      destination?.state === "unresolved" ||
      (destination?.state === "suggested" &&
        groups.get(destination.groupId)?.status !== "confirmed"))
  )
    return "choose_destination_account";
  if (row.reviewReasons.includes("category_needed")) return "choose_category";
  if (row.reviewReasons.length > 0) return "edit_row";
  return "select";
}
