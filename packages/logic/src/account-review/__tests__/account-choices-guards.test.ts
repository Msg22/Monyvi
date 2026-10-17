/**
 * #395 T034/T036 focused RED guards. All original T034 definitions stay
 * unchanged in account-choices.test.ts; only pure canonical fixtures here.
 */
import {
  accountReviewCommandSchema,
  accountReviewSessionSchema,
} from "../schemas";
import { groundedOwnedCandidates } from "../resolution-candidates";
import { mergeAccountReviewLateRows } from "../reducer";
import { normalizeAccountReviewParserResult } from "../normalization";
import { makeSmsInput } from "./normalization-fixtures";
import {
  COMMAND_IDS,
  canonicalCommand,
  canonicalVoiceReview,
  groupByName,
  ownedContext,
  qnbCibReview,
  requireRow,
  reviewWithReadyRow,
  scope,
  unconfirmedCurrencyReview,
  type OwnedCommandAccount,
} from "./review-command-fixtures";
import {
  apply,
  assertUnchangedFailure,
  choiceList,
  choose,
  changedOwnedAccounts,
  confirmCurrency,
  makeOverflowReview,
  replaceGroup,
  saveLockedReview,
  smsAtmReview,
} from "./account-choices-fixtures";

describe("#395 T034 follow-up: manual options and current ownership are distinct", () => {
  it("a manual chooser includes alternatives the grounded QNB matcher cannot infer", async () => {
    const state = await qnbCibReview();
    const rowId = groupByName(state, "QNB").linkedRowIds[0];
    if (!rowId) throw new Error("Missing QNB evidence row");
    const row = requireRow(state, rowId);
    const current = ownedContext(state);
    const matched = groundedOwnedCandidates(
      row.accountEvidence,
      current.accounts,
      "source"
    ).map((account) => account.id);
    const offered = choiceList(state, rowId, "source", current).map(
      (account) => account.id
    );
    expect(matched).toEqual([COMMAND_IDS.qnbAccount]);
    expect(offered).toEqual(
      expect.arrayContaining([
        COMMAND_IDS.qnbAccount,
        COMMAND_IDS.cibAccount,
        COMMAND_IDS.walletAccount,
        COMMAND_IDS.cashAccount,
      ])
    );
    expect(row.assignment.state).toBe("suggested");
    expect(state.rows.every((item) => !item.selected)).toBe(true);
  });

  it.each(["removed", "wrong_type", "wrong_currency"] as const)(
    "a %s owned Wallet is neither a manual SMS option nor a valid command",
    async (change) => {
      const before = accountReviewSessionSchema.parse(
        await normalizeAccountReviewParserResult(makeSmsInput())
      );
      const rowId = before.rows[0]?.rowId;
      if (!rowId) throw new Error("Missing SMS row");
      expect(choiceList(before, rowId, "source").map((a) => a.id)).toContain(
        COMMAND_IDS.walletAccount
      );
      const fresh = changedOwnedAccounts(
        before,
        COMMAND_IDS.walletAccount,
        change
      );
      expect(
        choiceList(before, rowId, "source", fresh).map((a) => a.id)
      ).not.toContain(COMMAND_IDS.walletAccount);
      assertUnchangedFailure(
        apply(before, choose(before, rowId, COMMAND_IDS.walletAccount), fresh),
        before
      );
    }
  );

  it("rejects foreign owner and contradictory provider/account projections atomically", async () => {
    const before = await qnbCibReview();
    const rowId = groupByName(before, "QNB").linkedRowIds[0];
    if (!rowId) throw new Error("Missing choice row");
    const current = ownedContext(before);
    const foreign = { ...current, ownerId: COMMAND_IDS.otherOwner };
    const contradictory = {
      ...current,
      accounts: current.accounts.map(
        (account): OwnedCommandAccount =>
          account.id === COMMAND_IDS.cibAccount
            ? { ...account, currency: "USD" }
            : account
      ),
    };
    expect(() => choiceList(before, rowId, "source", foreign)).toThrow();
    expect(() => choiceList(before, rowId, "source", contradictory)).toThrow();
    const command = choose(before, rowId, COMMAND_IDS.cibAccount);
    const ownerFailure = apply(before, command, foreign);
    assertUnchangedFailure(ownerFailure, before);
    expect(ownerFailure.reasonCodes).toContain("review_owner_changed");
    const projectionFailure = apply(before, command, contradictory);
    assertUnchangedFailure(projectionFailure, before);
    expect(projectionFailure.reasonCodes).toContain("account_unavailable");
  });
});

describe("#395 T034 follow-up: reciprocal detach, tombstones and stale group scope", () => {
  it("detaching one row revises the live group's reciprocal member pointers", async () => {
    const before = await qnbCibReview();
    const original = groupByName(before, "QNB");
    const clicked = original.linkedRowIds[0];
    if (!clicked) throw new Error("Missing QNB row");
    const result = apply(
      before,
      choose(before, clicked, COMMAND_IDS.cibAccount)
    );
    expect(result.reasonCodes).toEqual([]);
    expect(result.affectedGroupIds).toContain(original.groupId);
    const updated = groupByName(result.state, "QNB");
    expect(updated.groupId).toBe(original.groupId);
    expect(updated.evidenceKey).toBe(original.evidenceKey);
    expect(BigInt(updated.revision)).toBe(BigInt(original.revision) + 1n);
    expect(updated.linkedRowIds).toEqual(
      original.linkedRowIds.filter((id) => id !== clicked)
    );
    for (const id of updated.linkedRowIds) {
      const oldRow = requireRow(before, id);
      const row = requireRow(result.state, id);
      expect(row.assignment).toMatchObject({
        state: "suggested",
        groupId: updated.groupId,
        groupRevision: updated.revision,
        confirmation: "pending",
      });
      expect(BigInt(row.revision)).toBeGreaterThan(BigInt(oldRow.revision));
      expect(row.selected).toBe(oldRow.selected);
    }
    expect(groupByName(result.state, "CIB")).toEqual(
      groupByName(before, "CIB")
    );
    accountReviewSessionSchema.parse(result.state);
  });

  it("last-row detach tombstones original evidence and rejects late same-group replay", async () => {
    const before = await canonicalVoiceReview();
    const incoming = await canonicalVoiceReview(true);
    const group = before.groups[0];
    if (!group || group.linkedRowIds.length !== 2) {
      throw new Error("Expected canonical two-row shared group");
    }
    let state = before;
    for (const rowId of group.linkedRowIds) {
      const next = apply(state, choose(state, rowId, COMMAND_IDS.cibAccount));
      expect(next.reasonCodes).toEqual([]);
      state = next.state;
    }
    const tombstone = state.groups.find(
      (item) => item.groupId === group.groupId
    );
    expect(tombstone).toMatchObject({
      groupId: group.groupId,
      evidenceKey: group.evidenceKey,
      status: "removed",
    });
    expect(state.removedEvidenceKeys).toContain(group.evidenceKey);
    const replay = mergeAccountReviewLateRows({ current: state, incoming });
    const additional = replay.rows.filter(
      (row) => !state.rows.some((old) => old.rowId === row.rowId)
    );
    expect(additional).toHaveLength(1);
    expect(additional[0]?.assignment).toMatchObject({
      state: "unresolved",
      reasonCode: "account_group_removed",
    });
    expect(additional[0]?.selected).toBe(false);
    for (const id of group.linkedRowIds) {
      expect(requireRow(replay, id)).toEqual(requireRow(state, id));
    }
    expect(replay.removedEvidenceKeys).toContain(group.evidenceKey);
    expect(
      replay.groups.find((item) => item.groupId === group.groupId)?.status
    ).toBe("removed");
    accountReviewSessionSchema.parse(replay);
  });

  it("a fresh review scope with an old group revision cannot replace a changed group", async () => {
    const before = await qnbCibReview();
    const oldGroup = groupByName(before, "QNB");
    const rowId = oldGroup.linkedRowIds[0];
    if (!rowId) throw new Error("Missing shared row");
    const changed = apply(
      before,
      choose(before, rowId, COMMAND_IDS.cibAccount)
    ).state;
    const newGroup = groupByName(changed, "QNB");
    const oldGroupCommand = canonicalCommand({
      ...scope(changed),
      kind: "replace_group_account",
      groupId: oldGroup.groupId,
      expectedGroupRevision: oldGroup.revision,
      disclosedLinkedRowCount: newGroup.linkedRowIds.length,
      accountId: COMMAND_IDS.qnbAccount,
    });
    const failed = apply(changed, oldGroupCommand);
    assertUnchangedFailure(failed, changed);
    expect(failed.reasonCodes).toContain("review_revision_stale");
  });

  it("group replacement never unchecks an unrelated already-ready row", async () => {
    const before = await reviewWithReadyRow();
    const selected = apply(
      before,
      canonicalCommand({
        ...scope(before),
        kind: "select_ready",
        filter: "all",
      })
    );
    expect(selected.reasonCodes).toEqual([]);
    const ready = requireRow(selected.state, COMMAND_IDS.readyRow);
    expect(ready.selected).toBe(true);
    const result = apply(
      selected.state,
      replaceGroup(selected.state, "QNB", COMMAND_IDS.qnbAccount)
    );
    expect(result.reasonCodes).toEqual([]);
    expect(requireRow(result.state, ready.rowId)).toEqual(ready);
    accountReviewSessionSchema.parse(result.state);
  });
});

describe("#395 T034 follow-up: currency, selected rows and ATM endpoints", () => {
  it("unsupported-currency confirmation retains original grounded evidence and amount", async () => {
    const before = await unconfirmedCurrencyReview("unsupported");
    const row = before.rows[0];
    if (!row || row.source !== "VOICE") throw new Error("Missing Voice row");
    const result = apply(before, confirmCurrency(before, row.rowId, "USD"));
    expect(result.reasonCodes).toEqual([]);
    const changed = requireRow(result.state, row.rowId);
    if (changed.source !== "VOICE") {
      throw new Error("Currency confirmation changed Voice row source");
    }
    expect(changed.currency).toEqual({
      state: "known",
      code: "USD",
      origin: "user",
    });
    expect(changed.hasUserCurrencyOverride).toBe(true);
    expect(changed.accountEvidence).toEqual(row.accountEvidence);
    expect(changed.toAccountEvidence).toEqual(row.toAccountEvidence);
    expect(changed.sourceRef).toBe(row.sourceRef);
    expect(changed.transaction.originalTranscript).toBe(
      row.transaction.originalTranscript
    );
    expect(changed.amountDecimal).toBe(row.amountDecimal);
    expect(changed.transaction.amount).toBe(row.transaction.amount);
    expect(changed.transaction.date).toEqual(row.transaction.date);
    expect(changed.assignment.state).toBe("unresolved");
    expect(before.rows[0]).toEqual(row);
  });

  it("unrecognized currency cannot enter the canonical command grammar", async () => {
    const before = await unconfirmedCurrencyReview("ambiguous");
    const row = before.rows[0];
    if (!row) throw new Error("Missing uncertain row");
    const original = structuredClone(before);
    expect(
      accountReviewCommandSchema.safeParse({
        ...scope(before),
        kind: "confirm_row_currency",
        rowId: row.rowId,
        expectedRowRevision: row.revision,
        currency: "DOGE",
      }).success
    ).toBe(false);
    expect(before).toEqual(original);
  });

  it("a material currency change invalidates only the selected row's old account", async () => {
    const before = await reviewWithReadyRow();
    const selected = apply(
      before,
      canonicalCommand({
        ...scope(before),
        kind: "select_ready",
        filter: "all",
      })
    );
    expect(selected.reasonCodes).toEqual([]);
    const previous = requireRow(selected.state, COMMAND_IDS.readyRow);
    expect(previous.selected).toBe(true);
    const result = apply(
      selected.state,
      confirmCurrency(selected.state, previous.rowId, "USD")
    );
    expect(result.reasonCodes).toEqual([]);
    const changed = requireRow(result.state, previous.rowId);
    expect(changed.selected).toBe(false);
    expect(changed.assignment.state).toBe("unresolved");
    expect(changed.hasUserCurrencyOverride).toBe(true);
    expect(changed.amountDecimal).toBe(previous.amountDecimal);
    expect(changed.transaction.amount).toBe(previous.transaction.amount);
    expect(changed.accountEvidence).toEqual(previous.accountEvidence);
    expect(groupByName(result.state, "QNB")).toEqual(
      groupByName(selected.state, "QNB")
    );
    for (const row of selected.state.rows.filter(
      (r) => r.rowId !== previous.rowId
    )) {
      expect(requireRow(result.state, row.rowId)).toEqual(row);
    }
  });

  it("SMS ATM BANK then CASH then WALLET choices preserve opposite endpoints", async () => {
    const before = await smsAtmReview();
    const id = before.rows[0]?.rowId;
    if (!id) throw new Error("Missing ATM row");
    const bank = apply(before, choose(before, id, COMMAND_IDS.cibAccount));
    expect(bank.reasonCodes).toEqual([]);
    const cash = apply(
      bank.state,
      choose(bank.state, id, COMMAND_IDS.cashAccount)
    );
    expect(cash.reasonCodes).toEqual([]);
    const afterCash = requireRow(cash.state, id);
    expect(afterCash.assignment).toEqual(requireRow(bank.state, id).assignment);
    expect(afterCash.toAssignment).toMatchObject({
      state: "existing",
      accountId: COMMAND_IDS.cashAccount,
      origin: "user",
      currency: "EGP",
    });
    const wallet = apply(
      cash.state,
      choose(cash.state, id, COMMAND_IDS.walletAccount)
    );
    expect(wallet.reasonCodes).toEqual([]);
    const afterWallet = requireRow(wallet.state, id);
    expect(afterWallet.assignment).toMatchObject({
      state: "existing",
      accountId: COMMAND_IDS.walletAccount,
      origin: "user",
    });
    expect(afterWallet.toAssignment).toEqual(afterCash.toAssignment);
    expect(afterWallet.sourceFingerprint).toBe(
      requireRow(before, id).sourceFingerprint
    );
    expect(afterWallet.amountDecimal).toBe(
      requireRow(before, id).amountDecimal
    );
    expect(wallet.state.sourceRevision).toBe(before.sourceRevision);
    accountReviewSessionSchema.parse(wallet.state);
  });

  it.each(["removed", "wrong_type", "wrong_currency"] as const)(
    "ATM refuses %s opposite Cash after fresh owned revalidation",
    async (change) => {
      const before = await smsAtmReview();
      const id = before.rows[0]?.rowId;
      if (!id) throw new Error("Missing ATM row");
      const bank = apply(before, choose(before, id, COMMAND_IDS.cibAccount));
      expect(bank.reasonCodes).toEqual([]);
      const cash = apply(
        bank.state,
        choose(bank.state, id, COMMAND_IDS.cashAccount)
      );
      expect(cash.reasonCodes).toEqual([]);
      const fresh = changedOwnedAccounts(
        cash.state,
        COMMAND_IDS.cashAccount,
        change
      );
      expect(
        choiceList(cash.state, id, "destination", fresh).map((a) => a.id)
      ).not.toContain(COMMAND_IDS.cashAccount);
      assertUnchangedFailure(
        apply(
          cash.state,
          choose(cash.state, id, COMMAND_IDS.walletAccount),
          fresh
        ),
        cash.state
      );
    }
  );
});

describe("#395 T034 follow-up: fresh revisions and Save intent reject immutably", () => {
  it("stale row revision fails even with newly scoped review revision", async () => {
    const before = await qnbCibReview();
    const rowId = groupByName(before, "QNB").linkedRowIds[0];
    if (!rowId) throw new Error("Missing QNB row");
    const original = requireRow(before, rowId);
    const chosen = apply(
      before,
      choose(before, rowId, COMMAND_IDS.cibAccount)
    ).state;
    const stale = canonicalCommand({
      ...scope(chosen),
      kind: "choose_row_account",
      rowId,
      expectedRowRevision: original.revision,
      accountId: COMMAND_IDS.qnbAccount,
    });
    const failed = apply(chosen, stale);
    assertUnchangedFailure(failed, chosen);
    expect(failed.reasonCodes).toContain("review_revision_stale");
  });

  it.each(["review", "operation", "row", "group"] as const)(
    "%s revision overflow rejects the entire choice rather than partially detaching",
    async (which) => {
      const before = await qnbCibReview();
      const group = groupByName(before, "QNB");
      const id = group.linkedRowIds[0];
      if (!id) throw new Error("Missing overflow target");
      const state = makeOverflowReview(before, id, which);
      const result = apply(state, choose(state, id, COMMAND_IDS.cibAccount));
      assertUnchangedFailure(result, state);
      expect(result.reasonCodes).toContain("review_revision_stale");
    }
  );

  it.each(["account", "group", "currency"] as const)(
    "an outstanding Save intent blocks %s commands without touching selected rows",
    async (kind) => {
      const locked = await saveLockedReview();
      const command =
        kind === "account"
          ? choose(locked, COMMAND_IDS.readyRow, COMMAND_IDS.qnbAccount)
          : kind === "group"
            ? replaceGroup(locked, "QNB", COMMAND_IDS.qnbAccount)
            : confirmCurrency(locked, COMMAND_IDS.readyRow, "USD");
      const result = apply(locked, command);
      assertUnchangedFailure(result, locked);
      expect(result.reasonCodes).toContain("review_revision_stale");
      expect(requireRow(result.state, COMMAND_IDS.readyRow).selected).toBe(
        true
      );
      expect(result.state.saveIntent).toEqual(locked.saveIntent);
    }
  );
});
