/**
 * #395 T054 filter reconciliation — TESTS FIRST / NOT RUN.
 * Pure canonical reducer/schema/owned projection; never a mock reducer or
 * copied eligibility function. set_filter intentionally fails at the frozen
 * source until Root runs meaningful Red and releases source ownership.
 */
import {
  accountReviewCommandSchema,
  accountReviewSessionSchema,
  type AccountReviewCommand,
  type AccountReviewSession,
} from "../review-schemas";
import {
  reduceAccountReviewCommand,
  type ReviewUndoLease,
} from "../reducer";
import { projectAccountReviewSession } from "../read-model";
import {
  COMMAND_IDS,
  groupByName,
  ownedContext,
  qnbCibReview,
  reviewWithReadyRow,
  requireRow,
  scope,
} from "./review-command-fixtures";

type Filter = AccountReviewSession["filter"];

function setFilter(
  state: AccountReviewSession,
  filter: Filter
): AccountReviewCommand {
  return accountReviewCommandSchema.parse({
    ...scope(state), kind: "set_filter", filter,
  });
}
function batch(
  state: AccountReviewSession,
  kind: "select_ready" | "clear_selection",
  filter: Filter = state.filter
): AccountReviewCommand {
  return accountReviewCommandSchema.parse({
    ...scope(state), kind, filter,
  });
}
function run(
  state: AccountReviewSession,
  command: AccountReviewCommand,
  undo: ReviewUndoLease | null = null,
  nextUndoToken: string | null = null
): ReturnType<typeof reduceAccountReviewCommand> {
  return reduceAccountReviewCommand({
    state,
    command,
    accountSnapshots: ownedContext(state),
    nextUndoToken,
    undo,
  });
}
function removeQnb(state: AccountReviewSession): AccountReviewCommand {
  const group = groupByName(state, "QNB");
  return accountReviewCommandSchema.parse({
    ...scope(state), kind: "remove_group",
    groupId: group.groupId, expectedGroupRevision: group.revision,
  });
}
function undoFor(
  state: AccountReviewSession
): AccountReviewCommand {
  return accountReviewCommandSchema.parse({
    ...scope(state), kind: "undo_removal",
    undoToken: COMMAND_IDS.undoToken,
  });
}

describe("#395 T054 canonical set_filter — guarded pure transitions", () => {
  it("F01 accepts only the closed common owner/session/revision plus target filter", async () => {
    const state = await qnbCibReview();
    expect(accountReviewCommandSchema.parse({
      ...scope(state), kind: "set_filter", filter: "needs_review",
    })).toEqual({
      ...scope(state), kind: "set_filter", filter: "needs_review",
    });
    expect(() => accountReviewCommandSchema.parse({
      ...scope(state), kind: "set_filter", filter: "needs_review",
      rowId: COMMAND_IDS.readyRow,
    })).toThrow();
    expect(() => accountReviewCommandSchema.parse({
      ...scope(state), kind: "set_filter", filter: "ready",
    })).toThrow();
  });

  it("F02 changes ONLY filter + global review revision; no business generation, groups, row revisions, choices or selections", async () => {
    const original = await reviewWithReadyRow();
    const result = run(original, setFilter(original, "needs_review"));
    expect(result.reasonCodes).toEqual([]);
    expect(result.effect).toBe("session_only");
    expect(result.affectedRowIds).toEqual([]);
    expect(result.affectedGroupIds).toEqual([]);
    expect(result.undoToken).toBeNull();
    expect(result.state.filter).toBe("needs_review");
    expect(BigInt(result.state.revision)).toBe(
      BigInt(original.revision) + 1n
    );
    expect(result.state.operationGeneration).toBe(original.operationGeneration);
    expect(result.state.sourceRevision).toBe(original.sourceRevision);
    expect(result.state.rows).toEqual(original.rows);
    expect(result.state.groups).toEqual(original.groups);
    expect(result.state.removedEvidenceKeys).toEqual(original.removedEvidenceKeys);
    expect(result.state.saveIntent).toBe(original.saveIntent);
    accountReviewSessionSchema.parse(result.state);
  });

  it("F03 same-filter dispatch is a true accepted no-op and cannot spend a revision or Undo", async () => {
    const state = await qnbCibReview();
    const result = run(state, setFilter(state, "all"));
    expect(result.state).toBe(state);
    expect(result.reasonCodes).toEqual([]);
    expect(result.effect).toBe("none");
    expect(result.affectedRowIds).toEqual([]);
    expect(result.affectedGroupIds).toEqual([]);
    expect(result.state.revision).toBe(state.revision);
    expect(result.state.operationGeneration).toBe(state.operationGeneration);
  });

  it("F04 All → Needs review → All invalidates old All bulk commands through revision ABA", async () => {
    const initial = await reviewWithReadyRow();
    const oldAllBulk = batch(initial, "select_ready");
    const needs = run(initial, setFilter(initial, "needs_review"));
    const back = run(needs.state, setFilter(needs.state, "all"));
    expect(needs.reasonCodes).toEqual([]);
    expect(back.reasonCodes).toEqual([]);
    expect(back.state.filter).toBe("all");
    expect(BigInt(back.state.revision)).toBe(
      BigInt(initial.revision) + 2n
    );
    expect(back.state.operationGeneration).toBe(initial.operationGeneration);
    const stale = run(back.state, oldAllBulk);
    expect(stale.reasonCodes).toEqual(["review_revision_stale"]);
    expect(stale.state).toBe(back.state);
    expect(stale.effect).toBe("none");
  });

  it("F05 rejects foreign actor, other session, stale review and stale business generation without partial transition", async () => {
    const initial = await qnbCibReview();
    const valid = setFilter(initial, "selected");
    const bad = [
      { ...valid, ownerId: COMMAND_IDS.otherOwner },
      { ...valid, sessionId: COMMAND_IDS.otherSession },
      { ...valid, expectedReviewRevision: "999" },
      { ...valid, expectedOperationGeneration: "999" },
    ].map((command) => accountReviewCommandSchema.parse(command));
    for (const command of bad) {
      const result = run(initial, command);
      expect(result.state).toBe(initial);
      expect(result.effect).toBe("none");
      expect(result.affectedRowIds).toEqual([]);
      expect(result.reasonCodes.length).toBeGreaterThan(0);
    }
  });

  it("F06 frozen Save intent prevents filter switching without affecting the financial intent", async () => {
    const original = await reviewWithReadyRow();
    const row = requireRow(original, COMMAND_IDS.readyRow);
    const frozen = accountReviewSessionSchema.parse({
      ...original,
      rows: original.rows.map((item) =>
        item.rowId === row.rowId ? { ...item, selected: true } : item
      ),
      saveIntent: {
        actionId: COMMAND_IDS.otherSession,
        ownerId: original.ownerId,
        sessionId: original.sessionId,
        source: original.source,
        expectedReviewRevision: original.revision,
        expectedOperationGeneration: original.operationGeneration,
        selectedRows: [{ rowId: row.rowId, revision: row.revision }],
        confirmedGroups: [],
        plannedEntityIds: [],
        occurredAt: "2026-10-16T00:00:00.000Z",
      },
    });
    const blocked = run(frozen, setFilter(frozen, "needs_review"));
    expect(blocked.state).toBe(frozen);
    expect(blocked.reasonCodes).toContain("review_revision_stale");
  });

  it("F07 bulk commands only act against the CURRENT exact filter and pure preview agrees with actual reducer", async () => {
    const original = await reviewWithReadyRow();
    const switched = run(original, setFilter(original, "needs_review")).state;
    expect(switched.filter).toBe("needs_review");
    expect(run(switched, batch(switched, "select_ready", "all"))
      .reasonCodes).toEqual(["review_revision_stale"]);
    const preview = projectAccountReviewSession({
      session: switched, accountSnapshots: ownedContext(switched),
    });
    const ready = run(switched, batch(switched, "select_ready"));
    expect(preview.readyVisibleRowIds).toEqual(ready.affectedRowIds);
    expect(preview.visibleRowIds.every((id) =>
      switched.rows.find((row) => row.rowId === id)?.reviewReasons.length
    )).toBe(true);
    expect(ready.state.rows.filter((row) => row.selected)).toEqual([]);
  });

  it("F08 Clear selection targets selected-filter rows and preserves all other business content", async () => {
    const original = await reviewWithReadyRow();
    const chosen = accountReviewCommandSchema.parse({
      ...scope(original), kind: "select_row",
      rowId: COMMAND_IDS.readyRow,
      expectedRowRevision: requireRow(original, COMMAND_IDS.readyRow).revision,
      groupId: null, expectedGroupRevision: null,
      hasSharedConfirmationDisclosure: false,
    });
    const selected = run(original, chosen);
    expect(selected.reasonCodes).toEqual([]);
    const switched = run(selected.state, setFilter(selected.state, "selected"));
    const cleared = run(switched.state, batch(switched.state, "clear_selection"));
    expect(cleared.reasonCodes).toEqual([]);
    expect(cleared.affectedRowIds).toEqual([COMMAND_IDS.readyRow]);
    expect(cleared.state.rows.every((row) => !row.selected)).toBe(true);
    expect(cleared.state.filter).toBe("selected");
    expect(cleared.state.groups).toEqual(switched.state.groups);
    expect(cleared.state.operationGeneration).not.toBe(
      switched.state.operationGeneration
    );
  });

  it("F09 Remove → Filter → Undo retains CURRENT filter and exact business state", async () => {
    const original = await qnbCibReview();
    const removed = run(original, removeQnb(original), null, COMMAND_IDS.undoToken);
    expect(removed.reasonCodes).toEqual([]);
    const lease: ReviewUndoLease = {
      token: COMMAND_IDS.undoToken,
      previousState: original,
      afterRemovalGeneration: removed.state.operationGeneration,
    };
    const filtered = run(removed.state, setFilter(removed.state, "selected"), lease);
    expect(filtered.reasonCodes).toEqual([]);
    expect(filtered.state.operationGeneration).toBe(
      removed.state.operationGeneration
    );
    const undone = run(filtered.state, undoFor(filtered.state), lease);
    expect(undone.reasonCodes).toEqual([]);
    expect(undone.state.filter).toBe("selected");
    expect(groupByName(undone.state, "QNB").status).toBe("pending");
    expect(undone.state.rows.map((row) => row.amountDecimal)).toEqual(
      original.rows.map((row) => row.amountDecimal)
    );
    expect(undone.state.removedEvidenceKeys).not.toContain(
      groupByName(original, "QNB").evidenceKey
    );
  });

  it("F10 business edit after filter still revokes Undo; no false restoration after business ABA", async () => {
    const original = await reviewWithReadyRow();
    const removed = run(original, removeQnb(original), null, COMMAND_IDS.undoToken);
    expect(removed.reasonCodes).toEqual([]);
    const lease: ReviewUndoLease = {
      token: COMMAND_IDS.undoToken,
      previousState: original,
      afterRemovalGeneration: removed.state.operationGeneration,
    };
    const filtered = run(removed.state, setFilter(removed.state, "all"), lease);
    // all is the unchanged current filter; prove actual filter change instead.
    const navigation = run(filtered.state, setFilter(filtered.state, "needs_review"), lease);
    expect(navigation.reasonCodes).toEqual([]);
    const clicked = requireRow(navigation.state, COMMAND_IDS.readyRow);
    const selected = run(navigation.state, accountReviewCommandSchema.parse({
      ...scope(navigation.state),
      kind: "select_row",
      rowId: clicked.rowId,
      expectedRowRevision: clicked.revision,
      groupId: null,
      expectedGroupRevision: null,
      hasSharedConfirmationDisclosure: false,
    }), lease);
    expect(selected.reasonCodes).toEqual([]);
    const staleUndo = run(selected.state, undoFor(selected.state), lease);
    expect(staleUndo.reasonCodes).toEqual(["review_undo_invalid"]);
    expect(staleUndo.state).toBe(selected.state);
    expect(groupByName(staleUndo.state, "QNB").status).toBe("removed");
  });
});
