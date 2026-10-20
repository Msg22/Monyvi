/** #395 temporary, presentation-only account-recovery drill-down. */
import { useState } from "react";
import type { AccountReviewRow, AccountReviewSession } from "@monyvi/logic";
import { presentReviewRowIssueKeys } from "./shared-account-presentation";

/** Preserve the source row order; never mutate the canonical session filter. */
export function accountNeededReviewRows(
  session: AccountReviewSession
): readonly AccountReviewRow[] {
  return session.rows.filter((row) =>
    presentReviewRowIssueKeys(row).some(
      (key) =>
        key === "account_review_issue_account" ||
        key === "account_review_issue_currency"
    )
  );
}

/** Local drill-down only: Save still uses the authoritative full session. */
export function useTemporaryAccountNeededFilter(
  session: AccountReviewSession | null
): {
  readonly active: boolean;
  readonly rows: readonly AccountReviewRow[];
  readonly showAccountNeeded: () => void;
  readonly showAll: () => void;
} {
  const [scope, setScope] = useState<string | null>(null);
  const key = session
    ? JSON.stringify([session.ownerId, session.sessionId])
    : null;
  const active = scope !== null && scope === key && session !== null;
  return {
    active,
    rows: active && session ? accountNeededReviewRows(session) : [],
    showAccountNeeded: () => {
      if (key !== null) setScope(key);
    },
    showAll: () => setScope(null),
  };
}
