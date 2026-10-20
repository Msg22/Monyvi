/** CR-DOM1: canonical readiness, manual opt-out and disclosure regression. */
import {
  accountReviewCommandSchema,
  type AccountReviewSession,
} from "../review-schemas";
import {
  autoSelectReadyReviewSession,
  reduceAccountReviewCommand,
} from "../reducer";
import { makeOwnedContext } from "./normalization-fixtures";
import {
  makeT025ConfirmedSession,
  makeT025ReviewSession,
  makeT025SmsOriginal,
  T025_IDS,
} from "../../sms-review-drafts/__tests__/account-review-v2-t025-fixtures";

function twoPendingRows(): AccountReviewSession {
  return makeT025ReviewSession(
    T025_IDS.queue,
    [makeT025SmsOriginal(0), makeT025SmsOriginal(1)],
    [T025_IDS.rowOne, T025_IDS.rowTwo]
  );
}

function selectReady(
  state: AccountReviewSession
): ReturnType<typeof reduceAccountReviewCommand> {
  return reduceAccountReviewCommand({
    state,
    command: accountReviewCommandSchema.parse({
      kind: "select_ready",
      ownerId: state.ownerId,
      sessionId: state.sessionId,
      expectedReviewRevision: state.revision,
      expectedOperationGeneration: state.operationGeneration,
      filter: state.filter,
    }),
    accountSnapshots: makeOwnedContext(),
    nextUndoToken: null,
    undo: null,
  });
}

describe("CR-DOM1 canonical ready auto-selection", () => {
  it("selects initially ready confirmed rows without changing group state or IDs", () => {
    const before = makeT025ConfirmedSession(twoPendingRows());
    const next = autoSelectReadyReviewSession(
      before,
      makeOwnedContext(),
      new Set<string>()
    );
    expect(next.effect).toBe("persist_sms");
    expect(next.reasonCodes).toEqual([]);
    expect(next.affectedRowIds).toEqual([T025_IDS.rowOne, T025_IDS.rowTwo]);
    expect(next.state.rows.map((row) => row.selected)).toEqual([true, true]);
    expect(next.state.groups).toEqual(before.groups);
    expect(next.state.removedEvidenceKeys).toEqual([]);
    expect(next.state.operationGeneration).not.toBe(before.operationGeneration);
  });

  it("never confirms a pending group by automatic readiness or undisclosed click", () => {
    const pending = twoPendingRows();
    const automatic = autoSelectReadyReviewSession(
      pending,
      makeOwnedContext(),
      new Set<string>()
    );
    expect(automatic.effect).toBe("none");
    expect(automatic.state).toBe(pending);
    expect(pending.rows.every((row) => !row.selected)).toBe(true);
    expect(pending.groups[0]?.status).toBe("pending");
    const row = pending.rows[0];
    const group = pending.groups[0];
    if (!row || !group) throw new Error("missing_t025_pending_row_group");
    const undisclosed = {
      kind: "select_row",
      ownerId: pending.ownerId,
      sessionId: pending.sessionId,
      expectedReviewRevision: pending.revision,
      expectedOperationGeneration: pending.operationGeneration,
      rowId: row.rowId,
      expectedRowRevision: row.revision,
      groupId: group.groupId,
      expectedGroupRevision: group.revision,
      hasSharedConfirmationDisclosure: false,
    };
    // Explicit shared-group parameters without disclosure fail the strict
    // command validator before any reducer selection or confirmation.
    const invalid = accountReviewCommandSchema.safeParse(undisclosed);
    expect(invalid.success).toBe(false);
    if (invalid.success) throw new Error("unexpected_undisclosed_command");
    expect(invalid.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["hasSharedConfirmationDisclosure"],
          message: "Shared selection needs explicit disclosure",
        }),
      ])
    );
    // Even a structurally valid row-only click cannot implicitly confirm
    // the still-pending linked group through the reducer.
    const rejected = reduceAccountReviewCommand({
      state: pending,
      command: accountReviewCommandSchema.parse({
        ...undisclosed,
        groupId: null,
        expectedGroupRevision: null,
      }),
      accountSnapshots: makeOwnedContext(),
      nextUndoToken: null,
      undo: null,
      autoSelectReady: true,
    });
    expect(rejected.effect).toBe("none");
    expect(rejected.reasonCodes).toEqual(["review_shared_disclosure_required"]);
    expect(rejected.state).toBe(pending);
    expect(rejected.state.groups[0]?.status).toBe("pending");
  });

  it("selects newly ready linked rows after explicit confirmation, not before", () => {
    const pending = twoPendingRows();
    const group = pending.groups[0];
    if (!group) throw new Error("missing_pending_group");
    const confirmed = reduceAccountReviewCommand({
      state: pending,
      command: accountReviewCommandSchema.parse({
        kind: "confirm_group",
        ownerId: pending.ownerId,
        sessionId: pending.sessionId,
        expectedReviewRevision: pending.revision,
        expectedOperationGeneration: pending.operationGeneration,
        groupId: group.groupId,
        expectedGroupRevision: group.revision,
      }),
      accountSnapshots: makeOwnedContext(),
      nextUndoToken: null,
      undo: null,
      autoSelectReady: true,
      manuallyDeselectedRowIds: new Set<string>(),
    });
    expect(confirmed.reasonCodes).toEqual([]);
    expect(confirmed.state.groups[0]?.status).toBe("confirmed");
    expect(confirmed.state.rows.map((row) => row.selected)).toEqual([
      true,
      true,
    ]);
    expect(confirmed.affectedRowIds).toEqual([
      T025_IDS.rowOne,
      T025_IDS.rowTwo,
    ]);
  });

  it("preserves manual deselection through unrelated row editing and explicit Select ready reselects", () => {
    const initially = autoSelectReadyReviewSession(
      makeT025ConfirmedSession(twoPendingRows()),
      makeOwnedContext(),
      new Set<string>()
    ).state;
    const row = initially.rows[0];
    if (!row) throw new Error("missing_ready_row");
    const deselected = reduceAccountReviewCommand({
      state: initially,
      command: accountReviewCommandSchema.parse({
        kind: "set_row_selected",
        ownerId: initially.ownerId,
        sessionId: initially.sessionId,
        expectedReviewRevision: initially.revision,
        expectedOperationGeneration: initially.operationGeneration,
        rowId: row.rowId,
        expectedRowRevision: row.revision,
        selected: false,
      }),
      accountSnapshots: makeOwnedContext(),
      nextUndoToken: null,
      undo: null,
      autoSelectReady: true,
    });
    expect(deselected.reasonCodes).toEqual([]);
    expect(deselected.state.rows.map((item) => item.selected)).toEqual([
      false,
      true,
    ]);
    const other = deselected.state.rows[1];
    if (!other) throw new Error("missing_unrelated_row");
    const edited = reduceAccountReviewCommand({
      state: deselected.state,
      command: accountReviewCommandSchema.parse({
        kind: "edit_row_transaction",
        ownerId: deselected.state.ownerId,
        sessionId: deselected.state.sessionId,
        expectedReviewRevision: deselected.state.revision,
        expectedOperationGeneration: deselected.state.operationGeneration,
        rowId: other.rowId,
        expectedRowRevision: other.revision,
        patch: { counterparty: "Unrelated revised merchant" },
      }),
      accountSnapshots: makeOwnedContext(),
      nextUndoToken: null,
      undo: null,
      autoSelectReady: true,
      manuallyDeselectedRowIds: new Set([row.rowId]),
    });
    expect(edited.reasonCodes).toEqual([]);
    expect(edited.state.rows.map((item) => item.selected)).toEqual([
      false,
      true,
    ]);
    expect(edited.state.rows[1]?.transaction.counterparty).toBe(
      "Unrelated revised merchant"
    );
    const refreshed = autoSelectReadyReviewSession(
      edited.state,
      makeOwnedContext(),
      new Set([row.rowId])
    );
    expect(refreshed.effect).toBe("none");
    expect(refreshed.state.rows[0]?.selected).toBe(false);
    const explicit = selectReady(edited.state);
    expect(explicit.reasonCodes).toEqual([]);
    expect(explicit.affectedRowIds).toEqual([row.rowId]);
    expect(explicit.state.rows.every((item) => item.selected)).toBe(true);
  });

  it("does not reselect a ready manually opted-out row on reload", () => {
    const before = makeT025ConfirmedSession(twoPendingRows());
    const keepDeselected = new Set([T025_IDS.rowOne]);
    const initialized = autoSelectReadyReviewSession(
      before,
      makeOwnedContext(),
      keepDeselected
    );
    expect(initialized.state.rows.map((row) => row.selected)).toEqual([
      false,
      true,
    ]);
    const repeated = autoSelectReadyReviewSession(
      initialized.state,
      makeOwnedContext(),
      keepDeselected
    );
    expect(repeated.effect).toBe("none");
    expect(repeated.state.rows[0]?.selected).toBe(false);
  });
});
