/**
 * Pure T029 tests-only builders. Canonical review schemas validate every
 * command/fixture; no DB, mock writer, persisted DTO or provider dependency.
 */
import {
  accountReviewCommandSchema,
  accountReviewSessionSchema,
  type AccountReviewCommand,
  type AccountReviewSession,
} from "../../../../packages/logic/src/account-review/schemas";
import { T025_IDS } from "../../../../packages/logic/src/sms-review-drafts/__tests__/account-review-v2-t025-fixtures";

export function confirmedCommand(
  session: AccountReviewSession
): AccountReviewCommand {
  const group = session.groups[0];
  if (!group) throw new Error("Canonical T025 group missing");
  return accountReviewCommandSchema.parse({
    kind: "confirm_group",
    ownerId: session.ownerId,
    sessionId: session.sessionId,
    expectedReviewRevision: session.revision,
    expectedOperationGeneration: session.operationGeneration,
    groupId: group.groupId,
    expectedGroupRevision: group.revision,
  });
}

export function selectCommand(
  session: AccountReviewSession,
  rowId: string
): AccountReviewCommand {
  const row = session.rows.find((candidate) => candidate.rowId === rowId);
  if (!row) throw new Error("Missing T025 selection row");
  return accountReviewCommandSchema.parse({
    kind: "select_row",
    ownerId: session.ownerId,
    sessionId: session.sessionId,
    expectedReviewRevision: session.revision,
    expectedOperationGeneration: session.operationGeneration,
    rowId,
    expectedRowRevision: row.revision,
    groupId: null,
    expectedGroupRevision: null,
    hasSharedConfirmationDisclosure: false,
  });
}

/** Two independent live groups sharing one global review generation. */
export function makeIndependentT029GroupSession(
  session: AccountReviewSession
): AccountReviewSession {
  const first = session.rows[0];
  const second = session.rows[1];
  const group = session.groups[0];
  if (!first || !second || !group)
    throw new Error("Missing canonical separate-group source fixture");
  const otherGroup = {
    ...group,
    groupId: T025_IDS.alternateQueue,
    evidenceKey: "b".repeat(64),
    suggestionRefs: ["t025-independent-cib"],
    name: "CIB",
    providerDisplayName: "CIB",
    senderNames: ["CIB"],
    linkedRowIds: [second.rowId],
  };
  return accountReviewSessionSchema.parse({
    ...session,
    groups: [{ ...group, linkedRowIds: [first.rowId] }, otherGroup],
    rows: session.rows.map((row) =>
      row.rowId === second.rowId && row.assignment.state === "suggested"
        ? {
            ...row,
            assignment: { ...row.assignment, groupId: otherGroup.groupId },
          }
        : row
    ),
  });
}
