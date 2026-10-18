/**
 * #395 PR396 canonical component tests: genuine reciprocal group/removal fixtures.
 * Pure canonical reducer transitions; no test mocks or alternate review authority.
 */
import {
  accountReviewCommandSchema,
  accountReviewSessionSchema,
} from "@monyvi/logic";
import {
  reduceAccountReviewCommand,
  type ReviewUndoLease,
} from "../../../../../packages/logic/src/account-review/reducer";
import type { AccountReviewSession } from "../../../../../packages/logic/src/account-review/review-schemas";
import { makeOwnedContext } from "../../../../../packages/logic/src/account-review/__tests__/normalization-fixtures";
import {
  makeT025ReviewSession,
  makeT025SmsOriginal,
  T025_IDS,
} from "../../../../../packages/logic/src/sms-review-drafts/__tests__/account-review-v2-t025-fixtures";

export const SECOND_GROUP_ID = "00000000-0000-4000-8000-000000002507";
export const SECOND_UNDO_ID = "00000000-0000-4000-8000-000000002508";

/** Two genuinely reciprocal suggested groups; the pure reducer owns BOTH removals. */
export function twoGroupSession(): AccountReviewSession {
  const original = makeT025ReviewSession(
    T025_IDS.queue,
    [makeT025SmsOriginal(0), makeT025SmsOriginal(1)],
    [T025_IDS.rowOne, T025_IDS.rowTwo]
  );
  const group = original.groups[0];
  if (!group) throw new Error("missing_two_group_fixture_base");
  return accountReviewSessionSchema.parse({
    ...original,
    groups: [
      { ...group, linkedRowIds: [T025_IDS.rowOne] },
      {
        ...group,
        groupId: SECOND_GROUP_ID,
        name: "QNB Two",
        evidenceKey: "b".repeat(64),
        suggestionRefs: ["t025-second-independent-suggestion"],
        linkedRowIds: [T025_IDS.rowTwo],
      },
    ],
    rows: original.rows.map((row) =>
      row.rowId === T025_IDS.rowTwo && row.assignment.state === "suggested"
        ? {
            ...row,
            assignment: { ...row.assignment, groupId: SECOND_GROUP_ID },
          }
        : row
    ),
  });
}
export function removeActualGroup(
  session: AccountReviewSession,
  groupId: string,
  token: string,
  undo: ReviewUndoLease | null
): ReturnType<typeof reduceAccountReviewCommand> {
  const group = session.groups.find((item) => item.groupId === groupId);
  if (!group) throw new Error("missing_real_group_for_removal");
  return reduceAccountReviewCommand({
    state: session,
    command: accountReviewCommandSchema.parse({
      kind: "remove_group",
      ownerId: session.ownerId,
      sessionId: session.sessionId,
      expectedReviewRevision: session.revision,
      expectedOperationGeneration: session.operationGeneration,
      groupId,
      expectedGroupRevision: group.revision,
    }),
    accountSnapshots: makeOwnedContext(),
    nextUndoToken: token,
    undo,
  });
}
