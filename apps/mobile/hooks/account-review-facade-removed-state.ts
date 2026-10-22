/** Pure ownership-safe identity checks for current-review removed ghosts. */
import type { AccountReviewSession } from "../../../packages/logic/src/account-review/review-schemas";
import type { ReviewUndoLease } from "../../../packages/logic/src/account-review/reducer";

export function isRemovedReviewGroup(
  session: AccountReviewSession,
  groupId: string
): boolean {
  return session.groups.some(
    (group) =>
      group.groupId === groupId &&
      group.status === "removed" &&
      session.removedEvidenceKeys.includes(group.evidenceKey)
  );
}

/** Identify the one transient removal lease; never infer Undo from tombstones. */
export function currentReviewUndoGroupId(
  current: AccountReviewSession | null,
  lease: ReviewUndoLease | null
): AccountReviewSession["groups"][number]["groupId"] | null {
  if (
    !current ||
    !lease ||
    current.operationGeneration !== lease.afterRemovalGeneration ||
    current.ownerId !== lease.previousState.ownerId ||
    current.sessionId !== lease.previousState.sessionId ||
    current.source !== lease.previousState.source
  )
    return null;
  const previous = lease.previousState;
  const removed = previous.groups.filter(
    (group) =>
      group.status !== "removed" &&
      !previous.removedEvidenceKeys.includes(group.evidenceKey) &&
      current.removedEvidenceKeys.includes(group.evidenceKey) &&
      current.groups.some(
        (now) =>
          now.groupId === group.groupId &&
          now.status === "removed" &&
          now.evidenceKey === group.evidenceKey
      )
  );
  return removed.length === 1 ? (removed[0]?.groupId ?? null) : null;
}
