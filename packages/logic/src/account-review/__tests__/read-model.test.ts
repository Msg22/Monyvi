/**
 * #395 T057 TESTS FIRST. The pure projection module is intentionally absent
 * at parent bde7c628: import failure is creation Red, not behavioral Red.
 * Derive all domain values from canonical sessions and command schemas.
 */
import {
  accountReviewCommandSchema,
  accountReviewSaveIntentSchema,
  accountReviewSessionSchema,
  type AccountReviewCommand,
  type AccountReviewRow,
  type AccountReviewSession,
} from "../schemas";
import { projectAccountReviewSession } from "../read-model";
import { reduceAccountReviewCommand } from "../reducer";
import {
  COMMAND_IDS,
  canonicalCommand,
  groupByName,
  ownedContext,
  qnbCibReview,
  requireRow,
  reviewWithReadyRow,
  scope,
  unconfirmedCurrencyReview,
} from "./review-command-fixtures";

const VIEW_IDS = Object.freeze({
  defaultOne: "00000000-0000-4000-8000-000000009501",
  defaultTwo: "00000000-0000-4000-8000-000000009502",
  uncertain: "00000000-0000-4000-8000-000000009503",
  secondReady: "00000000-0000-4000-8000-000000009504",
  frozenAction: "00000000-0000-4000-8000-000000009505",
});

type Projection = ReturnType<typeof projectAccountReviewSession>;

function projection(state: AccountReviewSession): Projection {
  return projectAccountReviewSession({
    session: state,
    accountSnapshots: ownedContext(state),
  });
}

function batchCommand(
  state: AccountReviewSession,
  kind: "select_ready" | "clear_selection"
): Extract<AccountReviewCommand, { kind: "select_ready" | "clear_selection" }> {
  const parsed = accountReviewCommandSchema.parse({
    ...scope(state),
    kind,
    filter: state.filter,
  });
  if (parsed.kind !== "select_ready" && parsed.kind !== "clear_selection") {
    throw new Error("Expected canonical bulk review command");
  }
  return parsed;
}

function apply(
  state: AccountReviewSession,
  command: AccountReviewCommand,
  nextUndoToken: string | null = null
): ReturnType<typeof reduceAccountReviewCommand> {
  return reduceAccountReviewCommand({
    state,
    command,
    accountSnapshots: ownedContext(state),
    nextUndoToken,
    undo: null,
  });
}

/** Adds two independently resolved default rows to real normalized QNB3/CIB1. */
async function combinedReview(): Promise<AccountReviewSession> {
  const groups = await qnbCibReview();
  const ready = await reviewWithReadyRow();
  const defaultTemplate = requireRow(ready, COMMAND_IDS.readyRow);
  if (defaultTemplate.source !== "VOICE") {
    throw new Error("Expected canonical Voice default-row source");
  }
  const makeDefault = (rowId: string, index: number): AccountReviewRow => ({
    ...defaultTemplate,
    rowId,
    sourceRef: "t057:default:" + index,
    selected: true,
    revision: "0",
    assignment: {
      state: "existing",
      accountId: COMMAND_IDS.cashAccount,
      origin: "default",
      currency: "EGP",
      identityRevision: "0",
    },
    hasUserAccountOverride: false,
    transaction: {
      ...defaultTemplate.transaction,
      note: "Synthetic default " + index,
      originalTranscript: "Synthetic default " + index,
    },
  });
  const ambiguous = await unconfirmedCurrencyReview("conflicting");
  const uncertainRow = ambiguous.rows[0];
  if (!uncertainRow) throw new Error("Missing canonical unresolved row");

  return accountReviewSessionSchema.parse({
    ...groups,
    rows: [
      ...groups.rows,
      makeDefault(VIEW_IDS.defaultOne, 1),
      makeDefault(VIEW_IDS.defaultTwo, 2),
      {
        ...uncertainRow,
        rowId: VIEW_IDS.uncertain,
        sourceRef: "t057:uncertain",
      },
    ],
  });
}

function withFilter(
  session: AccountReviewSession,
  filter: AccountReviewSession["filter"]
): AccountReviewSession {
  return accountReviewSessionSchema.parse({ ...session, filter });
}

describe("#395 T057 — canonical read-model counts and visibility", () => {
  it("counts 7/5/2 from real rows; two reasons on one row count once", async () => {
    const session = await combinedReview();
    const uncertain = requireRow(session, VIEW_IDS.uncertain);
    expect(uncertain.reviewReasons).toEqual(
      expect.arrayContaining(["currency_confirmation_needed", "account_needed"])
    );
    const projected = projection(session);
    expect(projected.summary).toMatchObject({
      totalCount: 7,
      distinctNeedsReviewCount: 5,
      selectedCount: 2,
      defaultAssignmentCount: 2,
      pendingGroupCount: 2,
      confirmedGroupCount: 0,
    });
    expect(projected.visibleRowIds).toEqual(
      session.rows.map((row) => row.rowId)
    );
    expect(projected.readyVisibleRowIds).toEqual([]);
  });

  it("reflects true checked rows, not auto eligibility or linked confirmations", async () => {
    const session = await combinedReview();
    const qnb = groupByName(session, "QNB");
    const result = apply(
      session,
      canonicalCommand({
        ...scope(session),
        kind: "confirm_group",
        groupId: qnb.groupId,
        expectedGroupRevision: qnb.revision,
      })
    );
    expect(result.reasonCodes).toEqual([]);
    const projected = projection(result.state);
    expect(projected.summary).toMatchObject({
      totalCount: 7,
      distinctNeedsReviewCount: 2,
      selectedCount: 2,
      pendingGroupCount: 1,
      confirmedGroupCount: 1,
      defaultAssignmentCount: 2,
    });
    expect(
      result.state.rows.filter((row) => row.selected).map((row) => row.rowId)
    ).toEqual([VIEW_IDS.defaultOne, VIEW_IDS.defaultTwo]);
  });

  it("retains only reciprocal live links; a removed tombstone cannot inflate counts", async () => {
    const before = await combinedReview();
    const qnb = groupByName(before, "QNB");
    const removed = apply(
      before,
      canonicalCommand({
        ...scope(before),
        kind: "remove_group",
        groupId: qnb.groupId,
        expectedGroupRevision: qnb.revision,
      }),
      COMMAND_IDS.undoToken
    );
    expect(removed.reasonCodes).toEqual([]);
    expect(groupByName(removed.state, "QNB").linkedRowIds).toHaveLength(3);
    const model = projection(removed.state);
    const tombstone = model.groupSummaries.find(
      (item) => item.groupId === qnb.groupId
    );
    expect(tombstone).toMatchObject({
      groupId: qnb.groupId,
      status: "removed",
      liveLinkedRowIds: [],
    });
    expect(model.summary).toMatchObject({
      totalCount: 7,
      selectedCount: 2,
      pendingGroupCount: 1,
      confirmedGroupCount: 0,
    });
    const cib = groupByName(removed.state, "CIB");
    expect(
      model.groupSummaries.find((item) => item.groupId === cib.groupId)
        ?.liveLinkedRowIds
    ).toEqual(cib.linkedRowIds);
    expect(removed.state.rows).toHaveLength(before.rows.length);
  });

  it("keeps filter membership independent of group scope and selected eligibility", async () => {
    const base = await combinedReview();
    const all = projection(withFilter(base, "all"));
    const needsReview = projection(withFilter(base, "needs_review"));
    const selected = projection(withFilter(base, "selected"));
    expect(all.visibleRowIds).toEqual(base.rows.map((row) => row.rowId));
    expect(needsReview.visibleRowIds).toEqual(
      base.rows
        .filter((row) => row.reviewReasons.length > 0)
        .map((row) => row.rowId)
    );
    expect(needsReview.visibleRowIds).toHaveLength(5);
    expect(selected.visibleRowIds).toEqual([
      VIEW_IDS.defaultOne,
      VIEW_IDS.defaultTwo,
    ]);
    for (const view of [all, needsReview, selected]) {
      expect(view.summary).toMatchObject({
        totalCount: 7,
        distinctNeedsReviewCount: 5,
        selectedCount: 2,
      });
      expect(view.groupSummaries).toHaveLength(2);
    }
  });
});

describe("#395 T057 — readiness delegates to the existing reducer/resolver", () => {
  it("Select ready returns exactly the reducer's eligible active-filter IDs", async () => {
    const state = await reviewWithReadyRow();
    const original = structuredClone(state);
    const model = projection(state);
    const result = apply(state, batchCommand(state, "select_ready"));
    expect(result.reasonCodes).toEqual([]);
    expect(model.readyVisibleRowIds).toEqual(result.affectedRowIds);
    expect(model.readyVisibleRowIds).toEqual([COMMAND_IDS.readyRow]);
    expect(
      result.state.rows.filter((row) => row.selected).map((row) => row.rowId)
    ).toEqual([COMMAND_IDS.readyRow]);
    expect(groupByName(result.state, "QNB").status).toBe("pending");
    expect(state).toEqual(original);
  });

  it("never confirms pending groups through Select ready; needs_review is a no-op", async () => {
    const original = withFilter(await reviewWithReadyRow(), "needs_review");
    const projected = projection(original);
    const result = apply(original, batchCommand(original, "select_ready"));
    expect(projected.visibleRowIds.length).toBeGreaterThan(0);
    expect(projected.readyVisibleRowIds).toEqual([]);
    expect(result.effect).toBe("none");
    expect(result.state).toEqual(original);
    expect(groupByName(result.state, "QNB").status).toBe("pending");
  });

  it("Clear selection only affects the current filter; Selected becomes truly empty", async () => {
    const state = withFilter(await combinedReview(), "selected");
    const removed = apply(state, batchCommand(state, "clear_selection"));
    expect(removed.reasonCodes).toEqual([]);
    expect(removed.affectedRowIds).toEqual([
      VIEW_IDS.defaultOne,
      VIEW_IDS.defaultTwo,
    ]);
    expect(removed.state.rows.every((row) => !row.selected)).toBe(true);
    expect(projection(removed.state).visibleRowIds).toEqual([]);
    expect(projection(removed.state).summary.selectedCount).toBe(0);
    expect(groupByName(removed.state, "QNB")).toEqual(
      groupByName(state, "QNB")
    );
  });

  it("cannot reuse a stale filter, owner or revision command", async () => {
    const original = await reviewWithReadyRow();
    const snapshot = structuredClone(original);
    const valid = batchCommand(original, "select_ready");
    const staleFilter = canonicalCommand({ ...valid, filter: "selected" });
    const changedOwner = canonicalCommand({
      ...valid,
      ownerId: COMMAND_IDS.otherOwner,
    });
    const staleRevision = canonicalCommand({
      ...valid,
      expectedReviewRevision: "7",
    });
    expect(apply(original, staleFilter).reasonCodes).toContain(
      "review_revision_stale"
    );
    expect(apply(original, changedOwner).reasonCodes).toContain(
      "review_owner_changed"
    );
    expect(apply(original, staleRevision).reasonCodes).toContain(
      "review_revision_stale"
    );
    expect(original).toEqual(snapshot);
  });

  it("rejects foreign owned snapshots instead of treating them as default eligibility", async () => {
    const original = await reviewWithReadyRow();
    expect(() =>
      projectAccountReviewSession({
        session: original,
        accountSnapshots: {
          ...ownedContext(original),
          ownerId: COMMAND_IDS.otherOwner,
        },
      })
    ).toThrow();
  });

  it("a frozen Save intent disables readiness and all bulk state changes", async () => {
    const before = await reviewWithReadyRow();
    const ready = requireRow(before, COMMAND_IDS.readyRow);
    const secondReady: AccountReviewRow = {
      ...ready,
      rowId: VIEW_IDS.secondReady,
      sourceRef: "t057:second-ready",
      selected: true,
      revision: "0",
    };
    const withChecked = accountReviewSessionSchema.parse({
      ...before,
      rows: [...before.rows, secondReady],
    });
    const intent = accountReviewSaveIntentSchema.parse({
      actionId: VIEW_IDS.frozenAction,
      ownerId: withChecked.ownerId,
      source: withChecked.source,
      sessionId: withChecked.sessionId,
      expectedReviewRevision: withChecked.revision,
      expectedOperationGeneration: withChecked.operationGeneration,
      selectedRows: [
        { rowId: secondReady.rowId, revision: secondReady.revision },
      ],
      confirmedGroups: [],
      plannedEntityIds: [],
      occurredAt: "2026-10-15T12:00:00.000Z",
    });
    const frozen = accountReviewSessionSchema.parse({
      ...withChecked,
      saveIntent: intent,
    });
    const original = structuredClone(frozen);
    expect(projection(frozen).readyVisibleRowIds).toEqual([]);
    expect(
      apply(frozen, batchCommand(frozen, "select_ready")).reasonCodes
    ).toContain("review_revision_stale");
    expect(
      apply(frozen, batchCommand(frozen, "clear_selection")).reasonCodes
    ).toContain("review_revision_stale");
    expect(frozen).toEqual(original);
  });
});
