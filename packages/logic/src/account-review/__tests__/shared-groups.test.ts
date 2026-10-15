/**
 * #395 T024 tests FIRST — group identity, scope, immutable commands and
 * genuinely transient Undo. Future pure reducer/merge are intentionally missing.
 */
import {
  accountReviewCommandSchema, accountReviewSessionSchema,
  type AccountReviewCommand, type AccountReviewSession,
} from "../schemas";
import { deriveAccountReviewGroupIdentity } from "../identity";
import {
  reduceAccountReviewCommand, mergeAccountReviewLateRows,
} from "../reducer";
import type { AccountReviewOwnedContext } from "../normalization-types";
import { syntheticHashProvider } from "./normalization-fixtures";
import {
  COMMAND_IDS, canonicalCommand, canonicalVoiceReview, groupByName,
  ownedContext, qnbCibReview, requireRow, reviewWithReadyRow, scope,
} from "./review-command-fixtures";

interface UndoLease {
  readonly token: string;
  readonly previousState: AccountReviewSession;
  readonly afterRemovalGeneration: AccountReviewSession["operationGeneration"];
}

function apply(
  state: AccountReviewSession, command: AccountReviewCommand,
  nextUndoToken: string | null = null, undo: UndoLease | null = null,
  accountSnapshots: AccountReviewOwnedContext = ownedContext(state)
): ReturnType<typeof reduceAccountReviewCommand> {
  return reduceAccountReviewCommand({
    state, command, accountSnapshots, nextUndoToken, undo,
  });
}

function groupCommand(
  state: AccountReviewSession, name: string,
  kind: "confirm_group" | "remove_group"
): AccountReviewCommand {
  const group = groupByName(state, name);
  const common = {
    ...scope(state), groupId: group.groupId,
    expectedGroupRevision: group.revision,
  };
  return kind === "confirm_group"
    ? canonicalCommand({ ...common, kind: "confirm_group" })
    : canonicalCommand({ ...common, kind: "remove_group" });
}

function rowSelection(
  state: AccountReviewSession, rowId: string, disclosed: boolean
): AccountReviewCommand {
  const qnb = groupByName(state, "QNB");
  const row = requireRow(state, rowId);
  return canonicalCommand({
    ...scope(state), kind: "select_row", rowId,
    expectedRowRevision: row.revision,
    groupId: disclosed ? qnb.groupId : null,
    expectedGroupRevision: disclosed ? qnb.revision : null,
    hasSharedConfirmationDisclosure: disclosed,
  });
}

function assertPurePreservation(
  before: AccountReviewSession, after: AccountReviewSession
): void {
  expect(after.ownerId).toBe(before.ownerId);
  expect(after.sessionId).toBe(before.sessionId);
  expect(after.source).toBe(before.source);
  expect(after.preferredCurrency).toBe(before.preferredCurrency);
  expect(after.rows.map((row) => row.rowId).sort()).toEqual(
    before.rows.map((row) => row.rowId).sort()
  );
  expect(after.rows.map((row) => row.amountDecimal).sort()).toEqual(
    before.rows.map((row) => row.amountDecimal).sort()
  );
  expect(after.rows.map((row) => row.transaction.categoryId).sort()).toEqual(
    before.rows.map((row) => row.transaction.categoryId).sort()
  );
  expect(after.saveIntent).toBe(before.saveIntent);
  accountReviewSessionSchema.parse(after);
}

describe("#395 T024 immutable independent QNB3/CIB1 group commands", () => {
  it("confirms exactly the QNB group without selecting rows or creating accounts", async () => {
    const before = await qnbCibReview();
    const frozen = structuredClone(before);
    const qnb = groupByName(before, "QNB");
    const cib = groupByName(before, "CIB");
    expect(qnb.linkedRowIds).toHaveLength(3);
    expect(cib.linkedRowIds).toHaveLength(1);
    const result = apply(before, groupCommand(before, "QNB", "confirm_group"));
    expect(result.reasonCodes).toEqual([]);
    expect(result.effect).toBe("session_only");
    expect(result.undoToken).toBeNull();
    expect([...result.affectedRowIds].sort()).toEqual([...qnb.linkedRowIds].sort());
    expect(result.affectedGroupIds).toEqual([qnb.groupId]);
    const changed = groupByName(result.state, "QNB");
    expect(changed.status).toBe("confirmed");
    expect(changed.confirmedIdentityRevision).toBe(changed.revision);
    expect(changed.revision).not.toBe(qnb.revision);
    for (const id of qnb.linkedRowIds) {
      const row = requireRow(result.state, id);
      expect(row.assignment).toMatchObject({
        state: "suggested", groupId: qnb.groupId,
        groupRevision: changed.revision, confirmation: "confirmed",
      });
      expect(row.reviewReasons).not.toContain("account_group_unconfirmed");
      expect(row.selected).toBe(false);
    }
    expect(groupByName(result.state, "CIB")).toEqual(cib);
    expect(requireRow(result.state, COMMAND_IDS.cibRow)).toEqual(
      requireRow(before, COMMAND_IDS.cibRow)
    );
    expect(result.state.rows.every((row) => !row.selected)).toBe(true);
    expect(result.state.revision).not.toBe(before.revision);
    expect(result.state.operationGeneration).not.toBe(before.operationGeneration);
    assertPurePreservation(before, result.state);
    expect(before).toEqual(frozen);
  });

  it("a disclosed QNB click confirms QNB3 but selects only the clicked row", async () => {
    const before = await qnbCibReview();
    const qnb = groupByName(before, "QNB");
    const clicked = qnb.linkedRowIds[1];
    if (!clicked) throw new Error("Missing clicked QNB row");
    const result = apply(before, rowSelection(before, clicked, true));
    expect(result.reasonCodes).toEqual([]);
    expect(groupByName(result.state, "QNB").status).toBe("confirmed");
    expect(groupByName(result.state, "CIB").status).toBe("pending");
    const selectedIds = result.state.rows.filter((row) => row.selected).map((row) => row.rowId);
    expect(selectedIds).toEqual([clicked]);
    for (const id of qnb.linkedRowIds) {
      expect(requireRow(result.state, id).assignment).toMatchObject({
        state: "suggested", confirmation: "confirmed",
      });
    }
    expect(requireRow(result.state, COMMAND_IDS.cibRow).selected).toBe(false);
    assertPurePreservation(before, result.state);
  });

  it("a pending group cannot be selected by an undisclosed row-only command", async () => {
    const before = await qnbCibReview();
    const row = requireRow(before, groupByName(before, "QNB").linkedRowIds[0] ?? "");
    const withoutGroup = canonicalCommand({
      ...scope(before), kind: "select_row", rowId: row.rowId,
      expectedRowRevision: row.revision, groupId: null,
      expectedGroupRevision: null, hasSharedConfirmationDisclosure: false,
    });
    expect(accountReviewCommandSchema.safeParse(withoutGroup).success).toBe(true);
    const blocked = apply(before, withoutGroup);
    expect(blocked.state).toEqual(before);
    expect(blocked.effect).toBe("none");
    expect(blocked.reasonCodes).toContain("review_shared_disclosure_required");
    expect(blocked.affectedRowIds).toEqual([]);
  });

  it("only a disclosed linked group ID with matching revision is valid", async () => {
    const before = await qnbCibReview();
    const rowId = groupByName(before, "QNB").linkedRowIds[0];
    if (!rowId) throw new Error("Missing pending group member");
    const invalid = {
      ...scope(before), kind: "select_row",
      rowId, expectedRowRevision: requireRow(before, rowId).revision,
      groupId: groupByName(before, "QNB").groupId,
      expectedGroupRevision: null, hasSharedConfirmationDisclosure: true,
    };
    expect(accountReviewCommandSchema.safeParse(invalid).success).toBe(false);
    expect(before.rows.every((row) => !row.selected)).toBe(true);
  });

  it("bulk selection checks eligible standalone rows, never confirms pending groups", async () => {
    const before = await reviewWithReadyRow();
    const result = apply(before, canonicalCommand({
      ...scope(before), kind: "select_ready", filter: "all",
    }));
    expect(result.reasonCodes).toEqual([]);
    expect(result.state.rows.filter((row) => row.selected).map((row) => row.rowId))
      .toEqual([COMMAND_IDS.readyRow]);
    expect(groupByName(result.state, "QNB").status).toBe("pending");
    for (const id of groupByName(before, "QNB").linkedRowIds) {
      expect(requireRow(result.state, id).selected).toBe(false);
    }
    expect(result.state.saveIntent).toBeNull();
    assertPurePreservation(before, result.state);
  });

  it("a material edit increments identity revision and requires explicit reconfirm", async () => {
    const before = await qnbCibReview();
    const confirmed = apply(before, groupCommand(before, "QNB", "confirm_group")).state;
    const qnb = groupByName(confirmed, "QNB");
    const cmd = canonicalCommand({
      ...scope(confirmed), kind: "edit_group",
      groupId: qnb.groupId, expectedGroupRevision: qnb.revision,
      identity: {
        name: "QNB Everyday", type: qnb.type === null ? "BANK" : qnb.type,
        institutionId: qnb.institutionId,
        providerDisplayName: qnb.providerDisplayName,
        cardLast4: qnb.cardLast4, senderNames: [...qnb.senderNames],
      },
      reconfirm: true,
    });
    const result = apply(confirmed, cmd);
    const changed = result.state.groups.find((group) => group.name === "QNB Everyday");
    if (!changed) throw new Error("Edited group not retained");
    expect(changed.status).toBe("pending");
    expect(changed.revision).not.toBe(qnb.revision);
    expect(changed.confirmedIdentityRevision).toBeNull();
    expect(groupByName(result.state, "CIB")).toEqual(groupByName(before, "CIB"));
    for (const id of qnb.linkedRowIds) {
      expect(requireRow(result.state, id).assignment).toMatchObject({
        state: "suggested", groupRevision: changed.revision, confirmation: "pending",
      });
      expect(requireRow(result.state, id).selected).toBe(false);
    }
    assertPurePreservation(confirmed, result.state);
  });

  it("editing one group to an existing incompatible nickname does not mutate either group", async () => {
    const before = await qnbCibReview();
    const qnb = groupByName(before, "QNB");
    const cmd = canonicalCommand({
      ...scope(before), kind: "edit_group",
      groupId: qnb.groupId, expectedGroupRevision: qnb.revision,
      identity: {
        name: "CIB", type: "BANK", institutionId: null,
        providerDisplayName: "CIB", cardLast4: null, senderNames: ["CIB"],
      },
      reconfirm: true,
    });
    const blocked = apply(before, cmd);
    expect(blocked.state).toEqual(before);
    expect(blocked.effect).toBe("none");
    expect(blocked.reasonCodes.length).toBeGreaterThan(0);
  });

  it("remove retains finance, writes tombstone, and unselects only linked QNB", async () => {
    const before = await qnbCibReview();
    const qnb = groupByName(before, "QNB");
    const result = apply(
      before, groupCommand(before, "QNB", "remove_group"), COMMAND_IDS.undoToken
    );
    expect(result.reasonCodes).toEqual([]);
    expect(result.undoToken).toBe(COMMAND_IDS.undoToken);
    const removed = result.state.groups.find((group) => group.groupId === qnb.groupId);
    expect(removed?.status).toBe("removed");
    expect(result.state.removedEvidenceKeys).toContain(qnb.evidenceKey);
    for (const id of qnb.linkedRowIds) {
      const row = requireRow(result.state, id);
      expect(row.assignment.state).toBe("unresolved");
      expect(row.reviewReasons).toContain("account_group_removed");
      expect(row.selected).toBe(false);
    }
    expect(groupByName(result.state, "CIB")).toEqual(groupByName(before, "CIB"));
    expect(result.state.operationGeneration).not.toBe(before.operationGeneration);
    assertPurePreservation(before, result.state);
  });

  it("transient Undo restores only its exact same-generation removal", async () => {
    const before = await qnbCibReview();
    const removal = apply(
      before, groupCommand(before, "QNB", "remove_group"), COMMAND_IDS.undoToken
    );
    const removed = removal.state;
    const lease: UndoLease = {
      token: COMMAND_IDS.undoToken, previousState: before,
      afterRemovalGeneration: removed.operationGeneration,
    };
    const cmd = canonicalCommand({
      ...scope(removed), kind: "undo_removal", undoToken: COMMAND_IDS.undoToken,
    });
    const undone = apply(removed, cmd, null, lease);
    expect(undone.reasonCodes).toEqual([]);
    expect(groupByName(undone.state, "QNB").status).toBe("pending");
    expect(undone.state.removedEvidenceKeys).not.toContain(groupByName(before, "QNB").evidenceKey);
    expect(undone.state.rows.map((row) => row.amountDecimal)).toEqual(
      before.rows.map((row) => row.amountDecimal)
    );
    expect(undone.state.ownerId).toBe(before.ownerId);
    expect(undone.state.operationGeneration).not.toBe(removed.operationGeneration);
    accountReviewSessionSchema.parse(undone.state);
    const replay = apply(undone.state, canonicalCommand({
      ...scope(undone.state), kind: "undo_removal", undoToken: COMMAND_IDS.undoToken,
    }), null, lease);
    expect(replay.state).toEqual(undone.state);
    expect(replay.reasonCodes).toContain("review_undo_invalid");
  });

  it("stale generation, row/group revision and foreign actor cannot mutate or replay", async () => {
    const before = await qnbCibReview();
    const qnb = groupByName(before, "QNB");
    const cmd = groupCommand(before, "QNB", "confirm_group");
    const confirmed = apply(before, cmd).state;
    const stale = apply(confirmed, cmd);
    expect(stale.state).toEqual(confirmed);
    expect(stale.reasonCodes).toContain("review_revision_stale");
    const staleGeneration = apply(before, canonicalCommand({
      ...scope(before), expectedOperationGeneration: "99",
      kind: "confirm_group", groupId: qnb.groupId,
      expectedGroupRevision: qnb.revision,
    }));
    expect(staleGeneration.state).toEqual(before);
    expect(staleGeneration.reasonCodes).toContain("review_revision_stale");
    const foreign = apply(before, canonicalCommand({
      ...scope(before), ownerId: COMMAND_IDS.otherOwner,
      kind: "confirm_group", groupId: qnb.groupId,
      expectedGroupRevision: qnb.revision,
    }));
    expect(foreign.state).toEqual(before);
    expect(foreign.reasonCodes).toContain("review_owner_changed");
    expect(before.rows.every((row) => !row.selected)).toBe(true);
  });

  it("stale group and row revisions independently reject otherwise current commands", async () => {
    const state = await qnbCibReview();
    const qnb = groupByName(state, "QNB");
    const rowId = qnb.linkedRowIds[0];
    if (!rowId) throw new Error("Missing current row");
    const staleGroup = apply(state, canonicalCommand({
      ...scope(state), kind: "confirm_group",
      groupId: qnb.groupId, expectedGroupRevision: "99",
    }));
    expect(staleGroup.state).toEqual(state);
    expect(staleGroup.effect).toBe("none");
    expect(staleGroup.reasonCodes).toContain("review_revision_stale");
    const staleRow = apply(state, canonicalCommand({
      ...scope(state), kind: "select_row", rowId,
      expectedRowRevision: "99", groupId: qnb.groupId,
      expectedGroupRevision: qnb.revision,
      hasSharedConfirmationDisclosure: true,
    }));
    expect(staleRow.state).toEqual(state);
    expect(staleRow.effect).toBe("none");
    expect(staleRow.reasonCodes).toContain("review_revision_stale");
    expect(state.rows.every((row) => !row.selected)).toBe(true);
  });

  it("Undo must not overwrite a later CIB account edit after QNB removal", async () => {
    const before = await qnbCibReview();
    const removed = apply(
      before, groupCommand(before, "QNB", "remove_group"), COMMAND_IDS.undoToken
    );
    const afterRemoval = removed.state;
    const cib = requireRow(afterRemoval, COMMAND_IDS.cibRow);
    const later = apply(afterRemoval, canonicalCommand({
      ...scope(afterRemoval), kind: "choose_row_account",
      rowId: cib.rowId, expectedRowRevision: cib.revision,
      accountId: COMMAND_IDS.cibAccount,
    })).state;
    expect(later.operationGeneration).not.toBe(afterRemoval.operationGeneration);
    const undo = apply(later, canonicalCommand({
      ...scope(later), kind: "undo_removal", undoToken: COMMAND_IDS.undoToken,
    }), null, {
      token: COMMAND_IDS.undoToken, previousState: before,
      afterRemovalGeneration: afterRemoval.operationGeneration,
    });
    expect(undo.state).toEqual(later);
    expect(undo.effect).toBe("none");
    expect(undo.reasonCodes).toContain("review_undo_invalid");
    expect(requireRow(undo.state, COMMAND_IDS.cibRow).assignment).toMatchObject({
      state: "existing", origin: "user", accountId: COMMAND_IDS.cibAccount,
    });
    expect(undo.state.removedEvidenceKeys).toContain(groupByName(before, "QNB").evidenceKey);
  });

  it("duplicate confirm and removed tombstones stay safe across late arrivals", async () => {
    const initial = await canonicalVoiceReview();
    const incoming = await canonicalVoiceReview(true);
    expect(initial.rows).toHaveLength(2);
    expect(incoming.rows).toHaveLength(3);
    const first = groupByName(initial, "QNB");
    const confirmed = apply(initial, groupCommand(initial, "QNB", "confirm_group")).state;
    const chosen = first.linkedRowIds[0];
    if (!chosen) throw new Error("No stable Voice original");
    const selected = apply(confirmed, canonicalCommand({
      ...scope(confirmed), kind: "select_row",
      rowId: chosen, expectedRowRevision: requireRow(confirmed, chosen).revision,
      groupId: null, expectedGroupRevision: null,
      hasSharedConfirmationDisclosure: false,
    })).state;
    const joined = mergeAccountReviewLateRows({ current: selected, incoming });
    expect(joined.rows).toHaveLength(3);
    expect(requireRow(joined, chosen).selected).toBe(true);
    const newcomers = joined.rows.filter(
      (row) => !selected.rows.some((existing) => existing.rowId === row.rowId)
    );
    expect(newcomers).toHaveLength(1);
    expect(newcomers[0]?.selected).toBe(false);
    expect(joined.rows.map((row) => row.rowId).sort()).toEqual(
      incoming.rows.map((row) => row.rowId).sort()
    );
    expect(joined.saveIntent).toBeNull();
    const again = mergeAccountReviewLateRows({ current: joined, incoming });
    expect(again).toEqual(joined);
  });

  it("a durable removal blocks unchanged late evidence and keeps original finance", async () => {
    const initial = await canonicalVoiceReview();
    const qnb = groupByName(initial, "QNB");
    const removed = apply(initial, groupCommand(initial, "QNB", "remove_group"),
      COMMAND_IDS.undoToken).state;
    const reappearing = await canonicalVoiceReview(true);
    const merged = mergeAccountReviewLateRows({ current: removed, incoming: reappearing });
    expect(merged.rows).toHaveLength(3);
    expect(merged.removedEvidenceKeys).toContain(qnb.evidenceKey);
    const tombstone = merged.groups.find((group) => group.evidenceKey === qnb.evidenceKey);
    expect(tombstone?.status).toBe("removed");
    expect(merged.rows.every((row) => !row.selected)).toBe(true);
    expect(merged.rows.every((row) =>
      row.assignment.state !== "suggested" || row.assignment.groupId !== qnb.groupId
    )).toBe(true);
    accountReviewSessionSchema.parse(merged);
  });

  it("late parser replay cannot overwrite a user-edited group identity", async () => {
    const before = await qnbCibReview();
    const qnb = groupByName(before, "QNB");
    const edit = canonicalCommand({
      ...scope(before), kind: "edit_group",
      groupId: qnb.groupId, expectedGroupRevision: qnb.revision,
      identity: {
        name: "QNB Household", type: "BANK",
        institutionId: qnb.institutionId,
        providerDisplayName: qnb.providerDisplayName,
        cardLast4: qnb.cardLast4, senderNames: [...qnb.senderNames],
      }, reconfirm: true,
    });
    const edited = apply(before, edit).state;
    const incoming = await qnbCibReview();
    const merged = mergeAccountReviewLateRows({ current: edited, incoming });
    const retained = groupByName(merged, "QNB Household");
    expect(retained.status).toBe("pending");
    expect(retained.revision).not.toBe(qnb.revision);
    expect(merged.groups.some((group) => group.name === "QNB")).toBe(false);
    expect(groupByName(merged, "CIB")).toEqual(groupByName(edited, "CIB"));
    for (const id of qnb.linkedRowIds) {
      expect(requireRow(merged, id).assignment).toMatchObject({
        state: "suggested", groupRevision: retained.revision,
        confirmation: "pending",
      });
    }
    expect(merged.rows.every((row) => !row.selected)).toBe(true);
    accountReviewSessionSchema.parse(merged);
  });

  it("a new merchant named QNB without account evidence stays outside the QNB group", async () => {
    const before = await canonicalVoiceReview();
    const later = await canonicalVoiceReview(true);
    const newRow = later.rows.find((row) =>
      !before.rows.some((existing) => existing.rowId === row.rowId)
    );
    if (!newRow || newRow.source !== "VOICE") {
      throw new Error("Missing distinct later Voice row");
    }
    const isolated = {
      ...newRow,
      accountEvidence: {
        ...newRow.accountEvidence, state: "uncertain", name: null, type: null,
        institutionId: null, providerDisplayName: null, cardLast4: null,
        evidenceSpans: [], candidateAccountIds: [],
      },
      assignment: {
        state: "unresolved", accountId: null,
        reasonCode: "account_identity_uncertain", candidateAccountIds: [],
      },
      transaction: { ...newRow.transaction, merchant: "QNB" },
      reviewReasons: ["account_identity_uncertain"],
      selected: false,
    };
    const incoming = accountReviewSessionSchema.parse({
      ...later,
      rows: later.rows.map((row) => row.rowId === newRow.rowId ? isolated : row),
      groups: later.groups.map((group) => ({
        ...group, linkedRowIds: group.linkedRowIds.filter((id) => id !== newRow.rowId),
      })),
    });
    const merged = mergeAccountReviewLateRows({ current: before, incoming });
    const extra = requireRow(merged, newRow.rowId);
    expect(extra.transaction.merchant).toBe("QNB");
    expect(extra.assignment.state).toBe("unresolved");
    expect(extra.accountEvidence.state).toBe("uncertain");
    expect(extra.selected).toBe(false);
    expect(groupByName(merged, "QNB").linkedRowIds).not.toContain(newRow.rowId);
    expect(merged.rows.map((row) => row.rowId).sort()).toEqual(
      incoming.rows.map((row) => row.rowId).sort()
    );
  });

  it("the same account name without compatible type/provider/card is not one group", async () => {
    const state = await qnbCibReview();
    const qnb = groupByName(state, "QNB");
    const identity = {
      name: qnb.name, type: qnb.type, currency: qnb.currency,
      institutionId: qnb.institutionId, providerDisplayName: qnb.providerDisplayName,
      cardLast4: qnb.cardLast4, senderNames: qnb.senderNames,
    };
    const makeIdentity = (patch: Partial<typeof identity>) =>
      deriveAccountReviewGroupIdentity({
        ownerId: state.ownerId, sessionId: state.sessionId,
        source: state.source, identity: { ...identity, ...patch },
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
    for (const variant of variants) expect(variant.groupId).not.toBe(qnb.groupId);
    const repeated = await makeIdentity({
      name: "  qnb ", senderNames: [...qnb.senderNames].reverse(),
    });
    expect(repeated.groupId).toBe(qnb.groupId);
  });
});
