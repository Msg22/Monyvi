/**
 * #395 T024 pure reducer safety regressions split from shared-groups.test.ts.
 * Stale and unauthorized commands, revision bounds, transient Undo, late
 * scope isolation and canonical group identity remain real SUT assertions.
 */
import {
  accountReviewSessionSchema,
  type AccountReviewCommand,
  type AccountReviewSession,
} from "../schemas";
import { deriveAccountReviewGroupIdentity } from "../identity";
import {
  reduceAccountReviewCommand,
  mergeAccountReviewLateRows,
} from "../reducer";
import { MAX_CANONICAL_UNSIGNED_INTEGER_STRING } from "../../financial-actions/action-contracts";
import { syntheticHashProvider } from "./normalization-fixtures";
import {
  COMMAND_IDS,
  canonicalCommand,
  canonicalVoiceReview,
  groupByName,
  laterCibUserChoiceReview,
  mismatchedIncomingReview,
  ownedContext,
  qnbCibReview,
  requireRow,
  scope,
} from "./review-command-fixtures";

interface UndoLease {
  readonly token: string;
  readonly previousState: AccountReviewSession;
  readonly afterRemovalGeneration: AccountReviewSession["operationGeneration"];
}

function apply(
  state: AccountReviewSession,
  command: AccountReviewCommand,
  nextUndoToken: string | null = null,
  undo: UndoLease | null = null
): ReturnType<typeof reduceAccountReviewCommand> {
  return reduceAccountReviewCommand({
    state,
    command,
    nextUndoToken,
    undo,
    accountSnapshots: ownedContext(state),
  });
}

function groupCommand(
  state: AccountReviewSession,
  name: string,
  kind: "confirm_group" | "remove_group"
): AccountReviewCommand {
  const group = groupByName(state, name);
  const common = {
    ...scope(state),
    groupId: group.groupId,
    expectedGroupRevision: group.revision,
  };
  return kind === "confirm_group"
    ? canonicalCommand({ ...common, kind: "confirm_group" })
    : canonicalCommand({ ...common, kind: "remove_group" });
}

describe("#395 T024 isolated command safety and identity invariants", () => {
  it("stale generation, row/group revision and foreign actor cannot mutate or replay", async () => {
    const before = await qnbCibReview();
    const qnb = groupByName(before, "QNB");
    const cmd = groupCommand(before, "QNB", "confirm_group");
    const confirmed = apply(before, cmd).state;
    const stale = apply(confirmed, cmd);
    expect(stale.state).toEqual(confirmed);
    expect(stale.reasonCodes).toContain("review_revision_stale");
    const staleGeneration = apply(
      before,
      canonicalCommand({
        ...scope(before),
        expectedOperationGeneration: "99",
        kind: "confirm_group",
        groupId: qnb.groupId,
        expectedGroupRevision: qnb.revision,
      })
    );
    expect(staleGeneration.state).toEqual(before);
    expect(staleGeneration.reasonCodes).toContain("review_revision_stale");
    const foreign = apply(
      before,
      canonicalCommand({
        ...scope(before),
        ownerId: COMMAND_IDS.otherOwner,
        kind: "confirm_group",
        groupId: qnb.groupId,
        expectedGroupRevision: qnb.revision,
      })
    );
    expect(foreign.state).toEqual(before);
    expect(foreign.reasonCodes).toContain("review_owner_changed");
    expect(before.rows.every((row) => !row.selected)).toBe(true);
  });

  it("stale group and row revisions independently reject otherwise current commands", async () => {
    const state = await qnbCibReview();
    const qnb = groupByName(state, "QNB");
    const rowId = qnb.linkedRowIds[0];
    if (!rowId) throw new Error("Missing current row");
    const staleGroup = apply(
      state,
      canonicalCommand({
        ...scope(state),
        kind: "confirm_group",
        groupId: qnb.groupId,
        expectedGroupRevision: "99",
      })
    );
    expect(staleGroup.state).toEqual(state);
    expect(staleGroup.effect).toBe("none");
    expect(staleGroup.reasonCodes).toContain("review_revision_stale");
    const staleRow = apply(
      state,
      canonicalCommand({
        ...scope(state),
        kind: "select_row",
        rowId,
        expectedRowRevision: "99",
        groupId: qnb.groupId,
        expectedGroupRevision: qnb.revision,
        hasSharedConfirmationDisclosure: true,
      })
    );
    expect(staleRow.state).toEqual(state);
    expect(staleRow.effect).toBe("none");
    expect(staleRow.reasonCodes).toContain("review_revision_stale");
    expect(state.rows.every((row) => !row.selected)).toBe(true);
  });

  it("Undo must not overwrite a later CIB account edit after QNB removal", async () => {
    const before = await qnbCibReview();
    const removed = apply(
      before,
      groupCommand(before, "QNB", "remove_group"),
      COMMAND_IDS.undoToken
    );
    const afterRemoval = removed.state;
    // An independent later user choice has already committed. T024 must not
    // rely on T036's future choose_row_account implementation to set it up.
    const later = laterCibUserChoiceReview(afterRemoval);
    expect(accountReviewSessionSchema.safeParse(later).success).toBe(true);
    expect(later.revision).not.toBe(afterRemoval.revision);
    expect(later.operationGeneration).not.toBe(
      afterRemoval.operationGeneration
    );
    expect(requireRow(later, COMMAND_IDS.cibRow).revision).not.toBe(
      requireRow(afterRemoval, COMMAND_IDS.cibRow).revision
    );
    expect(later.groups.some((group) => group.name === "CIB")).toBe(false);
    const undo = apply(
      later,
      canonicalCommand({
        ...scope(later),
        kind: "undo_removal",
        undoToken: COMMAND_IDS.undoToken,
      }),
      null,
      {
        token: COMMAND_IDS.undoToken,
        previousState: before,
        afterRemovalGeneration: afterRemoval.operationGeneration,
      }
    );
    expect(undo.state).toEqual(later);
    expect(undo.effect).toBe("none");
    expect(undo.reasonCodes).toContain("review_undo_invalid");
    expect(requireRow(undo.state, COMMAND_IDS.cibRow).assignment).toMatchObject(
      {
        state: "existing",
        origin: "user",
        accountId: COMMAND_IDS.cibAccount,
      }
    );
    expect(undo.state.removedEvidenceKeys).toContain(
      groupByName(before, "QNB").evidenceKey
    );
  });

  it.each(["owner", "source", "session"] as const)(
    "rejects a different %s scope before any late-merge mutation",
    async (dimension) => {
      const current = await canonicalVoiceReview();
      const incoming = await mismatchedIncomingReview(dimension);
      expect(accountReviewSessionSchema.safeParse(current).success).toBe(true);
      expect(accountReviewSessionSchema.safeParse(incoming).success).toBe(true);
      if (dimension === "owner") {
        expect(incoming.ownerId).not.toBe(current.ownerId);
        expect(incoming.source).toBe(current.source);
        expect(incoming.sessionId).toBe(current.sessionId);
      } else if (dimension === "source") {
        expect(incoming.ownerId).toBe(current.ownerId);
        expect(incoming.source).not.toBe(current.source);
        expect(incoming.sessionId).toBe(current.sessionId);
      } else {
        expect(incoming.ownerId).toBe(current.ownerId);
        expect(incoming.source).toBe(current.source);
        expect(incoming.sessionId).not.toBe(current.sessionId);
      }
      const beforeCurrent = structuredClone(current);
      const beforeIncoming = structuredClone(incoming);
      // Uniform fail-closed error; never yield a mixed-owner/recording session.
      expect(() => mergeAccountReviewLateRows({ current, incoming })).toThrow(
        "account_review_late_merge_scope_mismatch"
      );
      expect(current).toEqual(beforeCurrent);
      expect(incoming).toEqual(beforeIncoming);
    }
  );

  it("rejects canonical revision overflow without partially confirming a group", async () => {
    const original = await qnbCibReview();
    const max = MAX_CANONICAL_UNSIGNED_INTEGER_STRING;
    const sessionMax = accountReviewSessionSchema.parse({
      ...original,
      revision: max,
    });
    const generationMax = accountReviewSessionSchema.parse({
      ...original,
      operationGeneration: max,
    });
    for (const state of [sessionMax, generationMax]) {
      const frozen = structuredClone(state);
      const result = apply(state, groupCommand(state, "QNB", "confirm_group"));
      expect(result.state).toEqual(frozen);
      expect(result.effect).toBe("none");
      expect(result.affectedGroupIds).toEqual([]);
      expect(result.affectedRowIds).toEqual([]);
      expect(result.reasonCodes).toContain("review_revision_stale");
      expect(groupByName(state, "QNB").status).toBe("pending");
    }
  });

  it("rejects group revision overflow without changing any linked row", async () => {
    const initial = await qnbCibReview();
    const qnb = groupByName(initial, "QNB");
    const max = MAX_CANONICAL_UNSIGNED_INTEGER_STRING;
    const state = accountReviewSessionSchema.parse({
      ...initial,
      groups: initial.groups.map((g) =>
        g.groupId === qnb.groupId ? { ...g, revision: max } : g
      ),
      rows: initial.rows.map((row) =>
        row.assignment.state === "suggested" &&
        row.assignment.groupId === qnb.groupId
          ? { ...row, assignment: { ...row.assignment, groupRevision: max } }
          : row
      ),
    });
    const result = apply(state, groupCommand(state, "QNB", "confirm_group"));
    expect(result.state).toEqual(state);
    expect(result.effect).toBe("none");
    expect(result.reasonCodes).toContain("review_revision_stale");
    expect(result.affectedRowIds).toEqual([]);
  });

  it("rejects a disclosed wrong-group ID even if revisions are equal", async () => {
    const start = await qnbCibReview();
    const confirmed = apply(
      start,
      groupCommand(start, "QNB", "confirm_group")
    ).state;
    const qnb = groupByName(confirmed, "QNB");
    const clicked = qnb.linkedRowIds[0];
    if (!clicked) throw new Error("No confirmed QNB row");
    const command = canonicalCommand({
      ...scope(confirmed),
      kind: "select_row",
      rowId: clicked,
      expectedRowRevision: requireRow(confirmed, clicked).revision,
      groupId: groupByName(confirmed, "CIB").groupId,
      expectedGroupRevision: qnb.revision,
      hasSharedConfirmationDisclosure: true,
    });
    const result = apply(confirmed, command);
    expect(result.state).toEqual(confirmed);
    expect(result.effect).toBe("none");
    expect(result.reasonCodes).toContain("review_revision_stale");
    expect(result.state.rows.every((row) => !row.selected)).toBe(true);
  });

  it("T036 choice/currency/group replacement commands remain unsupported in T027", async () => {
    const state = await qnbCibReview();
    const qnb = groupByName(state, "QNB");
    const clicked = qnb.linkedRowIds[0];
    if (!clicked) throw new Error("Missing QNB row");
    const row = requireRow(state, clicked);
    const unsupported = [
      canonicalCommand({
        ...scope(state),
        kind: "choose_row_account",
        rowId: clicked,
        expectedRowRevision: row.revision,
        accountId: COMMAND_IDS.cibAccount,
      }),
      canonicalCommand({
        ...scope(state),
        kind: "confirm_row_currency",
        rowId: clicked,
        expectedRowRevision: row.revision,
        currency: "USD",
      }),
      canonicalCommand({
        ...scope(state),
        kind: "replace_group_account",
        groupId: qnb.groupId,
        expectedGroupRevision: qnb.revision,
        accountId: COMMAND_IDS.qnbAccount,
        disclosedLinkedRowCount: qnb.linkedRowIds.length,
      }),
    ];
    for (const command of unsupported) {
      const result = apply(state, command);
      expect(result.state).toEqual(state);
      expect(result.effect).toBe("none");
      expect(result.reasonCodes).toContain("account_group_snapshot_conflict");
      expect(result.affectedRowIds).toEqual([]);
      expect(result.affectedGroupIds).toEqual([]);
    }
  });

  it("the same account name without compatible type/provider/card is not one group", async () => {
    const state = await qnbCibReview();
    const qnb = groupByName(state, "QNB");
    const identity = {
      name: qnb.name,
      type: qnb.type,
      currency: qnb.currency,
      institutionId: qnb.institutionId,
      providerDisplayName: qnb.providerDisplayName,
      cardLast4: qnb.cardLast4,
      senderNames: qnb.senderNames,
    };
    const makeIdentity = (
      patch: Partial<typeof identity>
    ): ReturnType<typeof deriveAccountReviewGroupIdentity> =>
      deriveAccountReviewGroupIdentity({
        ownerId: state.ownerId,
        sessionId: state.sessionId,
        source: state.source,
        identity: { ...identity, ...patch },
        hashProvider: syntheticHashProvider,
      });
    const original = await makeIdentity({});
    expect(original.groupId).toBe(qnb.groupId);
    const variants = await Promise.all([
      makeIdentity({ type: "DIGITAL_WALLET" }),
      makeIdentity({ providerDisplayName: "CIB" }),
      makeIdentity({ cardLast4: "1234" }),
      makeIdentity({ currency: "USD" }),
    ]);
    expect(new Set(variants.map((v) => v.groupId)).size).toBe(4);
    for (const variant of variants)
      expect(variant.groupId).not.toBe(qnb.groupId);
    const repeated = await makeIdentity({
      name: "  qnb ",
      senderNames: [...qnb.senderNames].reverse(),
    });
    expect(repeated.groupId).toBe(qnb.groupId);
  });
});
