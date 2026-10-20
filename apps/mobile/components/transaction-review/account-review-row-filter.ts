/** #395 transient account/group drilldown; canonical Save keeps its full session. */
import { useState } from "react";
import type { AccountReviewRow, AccountReviewSession } from "@monyvi/logic";
import { presentReviewRowIssueKeys } from "./shared-account-presentation";

interface LinkedGroupScope {
  readonly groupId: string;
  readonly liveLinkedRowIds: readonly string[];
}
type TemporaryScope =
  | { readonly sessionKey: string; readonly kind: "account" }
  | {
      readonly sessionKey: string;
      readonly kind: "linked";
      readonly groupId: string;
    };

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

/** Preserve source-order rows even if a group spans distant list positions. */
export function linkedGroupReviewRows(
  session: AccountReviewSession,
  liveLinkedRowIds: readonly string[]
): readonly AccountReviewRow[] {
  const affected = new Set(liveLinkedRowIds);
  return session.rows.filter((row) => affected.has(row.rowId));
}

export function useTemporaryAccountNeededFilter(
  session: AccountReviewSession | null,
  groupSummaries: readonly LinkedGroupScope[] = []
): {
  readonly active: boolean;
  readonly isAccountNeeded: boolean;
  readonly linkedGroupId: string | null;
  readonly linkedGroupName: string | null;
  readonly rows: readonly AccountReviewRow[];
  readonly showAccountNeeded: () => void;
  readonly showLinkedGroup: (groupId: string) => void;
  readonly showAll: () => void;
} {
  const [scope, setScope] = useState<TemporaryScope | null>(null);
  const key = session
    ? JSON.stringify([session.ownerId, session.sessionId])
    : null;
  const active = scope !== null && scope.sessionKey === key && session !== null;
  const isAccountNeeded = active && scope.kind === "account";
  const linkedGroupId =
    active && scope.kind === "linked" ? scope.groupId : null;
  const group =
    linkedGroupId === null
      ? null
      : (session?.groups.find((item) => item.groupId === linkedGroupId) ??
        null);
  const liveLinkedRowIds =
    linkedGroupId === null
      ? []
      : (groupSummaries.find((item) => item.groupId === linkedGroupId)
          ?.liveLinkedRowIds ?? []);
  const rows =
    !active || !session
      ? []
      : isAccountNeeded
        ? accountNeededReviewRows(session)
        : linkedGroupReviewRows(session, liveLinkedRowIds);
  return {
    active,
    isAccountNeeded,
    linkedGroupId,
    linkedGroupName: group?.name ?? null,
    rows,
    showAccountNeeded: () => {
      if (key !== null) setScope({ sessionKey: key, kind: "account" });
    },
    showLinkedGroup: (groupId) => {
      if (
        key !== null &&
        groupSummaries.some((item) => item.groupId === groupId) &&
        session?.groups.some(
          (item) => item.groupId === groupId && item.status !== "removed"
        )
      ) {
        setScope({ sessionKey: key, kind: "linked", groupId });
      }
    },
    showAll: () => setScope(null),
  };
}
