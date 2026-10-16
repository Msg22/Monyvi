/**
 * #395 T034 TESTS FIRST — owned compatible choices, row/group scopes, currency
 * confirmation, immutable snapshots and no implicit money conversion.
 * Future pure candidates/reducer modules intentionally remain unimplemented.
 */
import {
  accountReviewCommandSchema,
  accountReviewSessionSchema,
} from "../schemas";
import { mergeAccountReviewLateRows } from "../reducer";
import { normalizeAccountReviewParserResult } from "../normalization";
import { makeSmsInput, makeUsdAmountInput } from "./normalization-fixtures";
import {
  COMMAND_IDS,
  availableAccounts,
  canonicalCommand,
  groupByName,
  ownedContext,
  qnbCibReview,
  requireRow,
  scope,
  unconfirmedCurrencyReview,
} from "./review-command-fixtures";
import {
  apply,
  assertUnchangedFailure,
  choiceList,
  choose,
} from "./account-choices-fixtures";

describe("#395 T034 pure candidate list uses fresh owned currency/type/role", () => {
  it("Voice can choose owned same-currency Bank, Wallet or Cash, not USD or foreign", async () => {
    const state = await qnbCibReview();
    const rowId = groupByName(state, "QNB").linkedRowIds[0];
    if (!rowId) throw new Error("Missing Voice target");
    const candidates = choiceList(state, rowId, "source");
    const ids = candidates.map((account) => account.id);
    expect([...ids].sort()).toEqual(
      [
        COMMAND_IDS.qnbAccount,
        COMMAND_IDS.cibAccount,
        COMMAND_IDS.walletAccount,
        COMMAND_IDS.cashAccount,
      ].sort()
    );
    expect(ids).not.toContain(COMMAND_IDS.usdAccount);
    expect(ids).not.toContain(COMMAND_IDS.outsideAccount);
    const qnb = candidates.find(
      (account) => account.id === COMMAND_IDS.qnbAccount
    );
    expect(qnb).toMatchObject({
      name: "QNB payroll",
      providerDisplayName: "QNB",
      cardLast4: "1234",
      currency: "EGP",
      type: "BANK",
    });
    expect(qnb).not.toHaveProperty("balance");
    expect(qnb).not.toHaveProperty("accountNumber");
  });

  it("ordinary SMS cannot choose Cash as source or show a transfer destination", async () => {
    const state = accountReviewSessionSchema.parse(
      await normalizeAccountReviewParserResult(makeSmsInput())
    );
    const first = state.rows[0];
    if (!first || first.source !== "SMS") throw new Error("Missing SMS source");
    const sources = choiceList(state, first.rowId, "source");
    expect(sources.map((account) => account.id)).not.toContain(
      COMMAND_IDS.cashAccount
    );
    expect(sources.map((account) => account.id)).toEqual(
      expect.arrayContaining([
        COMMAND_IDS.qnbAccount,
        COMMAND_IDS.cibAccount,
        COMMAND_IDS.walletAccount,
      ])
    );
    expect(choiceList(state, first.rowId, "destination")).toEqual([]);
    expect(first.transaction.isAtmWithdrawal).not.toBe(true);
  });

  it("ATM destination is independently only same-currency Cash, never the source", async () => {
    const state = accountReviewSessionSchema.parse(
      await normalizeAccountReviewParserResult(makeSmsInput())
    );
    const first = state.rows[0];
    if (!first || first.source !== "SMS") throw new Error("Missing SMS source");
    const atm = accountReviewSessionSchema.parse({
      ...state,
      rows: [
        {
          ...first,
          transaction: { ...first.transaction, isAtmWithdrawal: true },
          toAssignment: {
            state: "unresolved",
            accountId: null,
            reasonCode: "cash_transfer_review",
            candidateAccountIds: [],
          },
        },
      ],
    });
    expect(
      choiceList(atm, first.rowId, "destination").map((account) => account.id)
    ).toEqual([COMMAND_IDS.cashAccount]);
    expect(
      choiceList(atm, first.rowId, "source").map((account) => account.id)
    ).not.toContain(COMMAND_IDS.cashAccount);
  });

  it.each([
    "ambiguous",
    "conflicting",
    "unsupported",
    "legacy_unknown",
  ] as const)(
    "%s currency yields zero preconfirmation choices, not preferred inference",
    async (reason) => {
      const state = await unconfirmedCurrencyReview(reason);
      const row = state.rows[0];
      if (!row) throw new Error("Missing uncertainty row");
      expect(row.currency.state).toBe("unconfirmed");
      expect(choiceList(state, row.rowId, "source")).toEqual([]);
      expect(row.selected).toBe(false);
      expect(row.transaction.amount).toBe(50);
    }
  );

  it("captured preferred EGP omission survives coherent fresh USD profile", async () => {
    const initial = await qnbCibReview();
    const first = initial.rows[0];
    if (!first) throw new Error("Missing EGP review row");
    const state = accountReviewSessionSchema.parse({
      ...initial,
      rows: initial.rows.map((row) =>
        row.rowId === first.rowId
          ? {
              ...row,
              currency: {
                state: "known",
                code: "EGP",
                origin: "preferred_omission",
              },
            }
          : row
      ),
    });
    const current = ownedContext(state, availableAccounts(), "USD");
    expect(current.providerContext.preferredCurrency).toBe("USD");
    expect(state.preferredCurrency).toBe("EGP");
    const ids = choiceList(state, first.rowId, "source", current).map(
      (candidate) => candidate.id
    );
    expect(ids).toContain(COMMAND_IDS.qnbAccount);
    expect(ids).not.toContain(COMMAND_IDS.usdAccount);
    expect(requireRow(state, first.rowId).amountDecimal).toBe("50");
    expect(requireRow(state, first.rowId).currency).toEqual({
      state: "known",
      code: "EGP",
      origin: "preferred_omission",
    });
  });

  it("a changed/foreign owner snapshot cannot reveal owned candidates", async () => {
    const state = await qnbCibReview();
    const id = state.rows[0]?.rowId;
    if (!id) throw new Error("Missing row");
    const original = ownedContext(state);
    expect(() =>
      choiceList(state, id, "source", {
        ...original,
        ownerId: COMMAND_IDS.otherOwner,
      })
    ).toThrow();
    expect(() =>
      choiceList(state, COMMAND_IDS.outsideAccount, "source")
    ).toThrow();
  });
});

describe("#395 T034 one row choice versus disclosed whole group replacement", () => {
  it("one explicit same-currency choice detaches only the clicked QNB row", async () => {
    const before = await qnbCibReview();
    const qnb = groupByName(before, "QNB");
    const cib = groupByName(before, "CIB");
    const clicked = qnb.linkedRowIds[1];
    if (!clicked) throw new Error("Missing second QNB row");
    const initial = structuredClone(before);
    const result = apply(
      before,
      choose(before, clicked, COMMAND_IDS.cibAccount)
    );
    expect(result.reasonCodes).toEqual([]);
    expect(result.affectedRowIds).toEqual([clicked]);
    const row = requireRow(result.state, clicked);
    expect(row.assignment).toMatchObject({
      state: "existing",
      origin: "user",
      accountId: COMMAND_IDS.cibAccount,
      currency: "EGP",
    });
    expect(row.hasUserAccountOverride).toBe(true);
    expect(row.selected).toBe(false);
    expect(row.amountDecimal).toBe(requireRow(before, clicked).amountDecimal);
    expect(row.transaction.amount).toBe(
      requireRow(before, clicked).transaction.amount
    );
    const linked = groupByName(result.state, "QNB").linkedRowIds;
    expect(linked).not.toContain(clicked);
    expect([...linked].sort()).toEqual(
      qnb.linkedRowIds.filter((id) => id !== clicked).sort()
    );
    for (const id of linked) {
      expect(requireRow(result.state, id).assignment).toMatchObject({
        state: "suggested",
        confirmation: "pending",
      });
    }
    expect(groupByName(result.state, "CIB")).toEqual(cib);
    expect(requireRow(result.state, COMMAND_IDS.cibRow)).toEqual(
      requireRow(before, COMMAND_IDS.cibRow)
    );
    expect(result.state.saveIntent).toBeNull();
    expect(before).toEqual(initial);
    accountReviewSessionSchema.parse(result.state);
  });

  it.each([
    ["outside", COMMAND_IDS.outsideAccount],
    ["wrong currency", COMMAND_IDS.usdAccount],
  ] as const)(
    "rejects %s account choice instead of writing an unowned or converted account",
    async (_kind, accountId) => {
      const before = await qnbCibReview();
      const rowId = groupByName(before, "QNB").linkedRowIds[0];
      if (!rowId) throw new Error("Missing pending QNB choice");
      const failed = apply(before, choose(before, rowId, accountId));
      assertUnchangedFailure(failed, before);
      expect(requireRow(failed.state, rowId).transaction.amount).toBe(50);
    }
  );

  it("ordinary SMS cannot choose Cash even when it is an active EGP default", async () => {
    const before = accountReviewSessionSchema.parse(
      await normalizeAccountReviewParserResult(makeSmsInput())
    );
    const id = before.rows[0]?.rowId;
    if (!id) throw new Error("Missing SMS row");
    const rejected = apply(before, choose(before, id, COMMAND_IDS.cashAccount));
    assertUnchangedFailure(rejected, before);
    expect(before.rows[0]?.transaction.amount).toBe(50);
  });

  it("an explicit owned SMS Bank choice requests a pure persist effect, never a write", async () => {
    const before = accountReviewSessionSchema.parse(
      await normalizeAccountReviewParserResult(makeSmsInput())
    );
    const row = before.rows[0];
    if (!row || row.source !== "SMS") throw new Error("Missing source SMS row");
    const original = structuredClone(before);
    const result = apply(
      before,
      choose(before, row.rowId, COMMAND_IDS.cibAccount)
    );
    expect(result.reasonCodes).toEqual([]);
    expect(result.effect).toBe("persist_sms");
    expect(requireRow(result.state, row.rowId).assignment).toMatchObject({
      state: "existing",
      origin: "user",
      accountId: COMMAND_IDS.cibAccount,
    });
    expect(result.state.saveIntent).toBeNull();
    expect(result.state.rows.every((item) => !item.selected)).toBe(true);
    expect(before).toEqual(original);
    accountReviewSessionSchema.parse(result.state);
  });

  it("Voice can explicitly choose Cash without mutating account defaults", async () => {
    const before = await qnbCibReview();
    const id = groupByName(before, "QNB").linkedRowIds[0];
    if (!id) throw new Error("Missing Voice row");
    const accounts = ownedContext(before);
    const chosen = apply(
      before,
      choose(before, id, COMMAND_IDS.cashAccount),
      accounts
    );
    expect(chosen.reasonCodes).toEqual([]);
    expect(requireRow(chosen.state, id).assignment).toMatchObject({
      state: "existing",
      origin: "user",
      accountId: COMMAND_IDS.cashAccount,
    });
    expect(chosen.state.rows.filter((row) => row.selected)).toEqual([]);
    expect(
      accounts.accounts.filter((a) => a.isDefault).map((a) => a.id)
    ).toEqual([COMMAND_IDS.cashAccount]);
  });

  it("a stale row revision cannot undo a newer explicitly chosen account", async () => {
    const before = await qnbCibReview();
    const clicked = groupByName(before, "QNB").linkedRowIds[0];
    if (!clicked) throw new Error("Missing clicked row");
    const oldCommand = choose(before, clicked, COMMAND_IDS.cibAccount);
    const chosen = apply(before, oldCommand).state;
    const replay = apply(chosen, oldCommand);
    assertUnchangedFailure(replay, chosen);
    expect(replay.reasonCodes).toContain("review_revision_stale");
    expect(requireRow(replay.state, clicked).assignment).toMatchObject({
      state: "existing",
      accountId: COMMAND_IDS.cibAccount,
      origin: "user",
    });
  });

  it("whole-group replacement requires the current exact disclosed linked count", async () => {
    const before = await qnbCibReview();
    const qnb = groupByName(before, "QNB");
    expect(qnb.linkedRowIds).toHaveLength(3);
    const wrong = canonicalCommand({
      ...scope(before),
      kind: "replace_group_account",
      groupId: qnb.groupId,
      expectedGroupRevision: qnb.revision,
      accountId: COMMAND_IDS.qnbAccount,
      disclosedLinkedRowCount: 2,
    });
    const failed = apply(before, wrong);
    assertUnchangedFailure(failed, before);
    expect(failed.reasonCodes).toContain("review_group_count_stale");
  });

  it("disclosed QNB3 replacement affects exactly those three; CIB1 remains pending", async () => {
    const before = await qnbCibReview();
    const qnb = groupByName(before, "QNB");
    const cib = groupByName(before, "CIB");
    const cmd = canonicalCommand({
      ...scope(before),
      kind: "replace_group_account",
      groupId: qnb.groupId,
      expectedGroupRevision: qnb.revision,
      accountId: COMMAND_IDS.qnbAccount,
      disclosedLinkedRowCount: qnb.linkedRowIds.length,
    });
    const result = apply(before, cmd);
    expect(result.reasonCodes).toEqual([]);
    expect([...result.affectedRowIds].sort()).toEqual(
      [...qnb.linkedRowIds].sort()
    );
    for (const id of qnb.linkedRowIds) {
      const row = requireRow(result.state, id);
      expect(row.assignment).toMatchObject({
        state: "existing",
        origin: "user",
        accountId: COMMAND_IDS.qnbAccount,
      });
      expect(row.selected).toBe(false);
      expect(row.currency.state).toBe("known");
      expect(row.transaction.amount).toBe(
        requireRow(before, id).transaction.amount
      );
    }
    expect(requireRow(result.state, COMMAND_IDS.cibRow)).toEqual(
      requireRow(before, COMMAND_IDS.cibRow)
    );
    expect(groupByName(result.state, "CIB")).toEqual(cib);
    expect(result.state.saveIntent).toBeNull();
    accountReviewSessionSchema.parse(result.state);
  });

  it("a chosen row stays detached and selected state is not overwritten by late AI", async () => {
    const before = await qnbCibReview();
    const qnb = groupByName(before, "QNB");
    const clicked = qnb.linkedRowIds[0];
    if (!clicked) throw new Error("Missing row");
    const chosen = apply(
      before,
      choose(before, clicked, COMMAND_IDS.cibAccount)
    ).state;
    const incoming = await qnbCibReview();
    const replay = mergeAccountReviewLateRows({ current: chosen, incoming });
    expect(requireRow(replay, clicked).assignment).toMatchObject({
      state: "existing",
      accountId: COMMAND_IDS.cibAccount,
      origin: "user",
    });
    expect(requireRow(replay, clicked).hasUserAccountOverride).toBe(true);
    expect(groupByName(replay, "QNB").linkedRowIds).not.toContain(clicked);
    expect(replay.rows.filter((row) => row.selected)).toEqual([]);
    expect(replay.rows.map((row) => row.rowId).sort()).toEqual(
      chosen.rows.map((row) => row.rowId).sort()
    );
  });
});

describe("#395 T034 currency changes are scoped and never numerical conversions", () => {
  it.each(["ambiguous", "conflicting", "legacy_unknown"] as const)(
    "explicit USD confirmation clears %s uncertainty for only its row",
    async (reason) => {
      const before = await unconfirmedCurrencyReview(reason);
      const row = before.rows[0];
      if (!row) throw new Error("Missing uncertain row");
      expect(row.currency.state).toBe("unconfirmed");
      const cmd = canonicalCommand({
        ...scope(before),
        kind: "confirm_row_currency",
        rowId: row.rowId,
        expectedRowRevision: row.revision,
        currency: "USD",
      });
      const ctx = ownedContext(
        before,
        availableAccounts().map((a) =>
          a.id === COMMAND_IDS.usdAccount
            ? { ...a, isDefault: true }
            : { ...a, isDefault: false }
        )
      );
      const result = apply(before, cmd, ctx);
      expect(result.reasonCodes).toEqual([]);
      const changed = requireRow(result.state, row.rowId);
      expect(changed.currency).toEqual({
        state: "known",
        code: "USD",
        origin: "user",
      });
      expect(changed.reviewReasons).not.toContain(
        "currency_confirmation_needed"
      );
      expect(changed.amountDecimal).toBe(row.amountDecimal);
      expect(changed.transaction.amount).toBe(row.transaction.amount);
      expect(changed.transaction.date).toEqual(row.transaction.date);
      expect(changed.transaction.categoryId).toBe(row.transaction.categoryId);
      expect(changed.assignment.state).toBe("unresolved");
      expect(changed.selected).toBe(false);
      expect(result.state.preferredCurrency).toBe("EGP");
      expect(result.state.saveIntent).toBeNull();
    }
  );

  it("currency correction detaches one QNB row without rewriting other EGP members", async () => {
    const before = await qnbCibReview();
    const qnb = groupByName(before, "QNB");
    const clicked = qnb.linkedRowIds[1];
    if (!clicked) throw new Error("Missing linked currency row");
    const old = requireRow(before, clicked);
    const result = apply(
      before,
      canonicalCommand({
        ...scope(before),
        kind: "confirm_row_currency",
        rowId: clicked,
        expectedRowRevision: old.revision,
        currency: "USD",
      })
    );
    expect(result.reasonCodes).toEqual([]);
    const changed = requireRow(result.state, clicked);
    expect(changed.currency).toEqual({
      state: "known",
      code: "USD",
      origin: "user",
    });
    expect(changed.amountDecimal).toBe(old.amountDecimal);
    expect(changed.transaction.amount).toBe(old.transaction.amount);
    expect(changed.assignment.state).toBe("unresolved");
    expect(changed.selected).toBe(false);
    const remaining = groupByName(result.state, "QNB").linkedRowIds;
    expect(remaining).not.toContain(clicked);
    expect(remaining).toHaveLength(2);
    for (const id of remaining) {
      expect(requireRow(result.state, id).currency).toEqual(
        requireRow(before, id).currency
      );
      expect(requireRow(result.state, id).transaction.amount).toBe(
        requireRow(before, id).transaction.amount
      );
    }
    expect(groupByName(result.state, "CIB")).toEqual(
      groupByName(before, "CIB")
    );
    accountReviewSessionSchema.parse(result.state);
  });

  it("fractional original amount remains exactly 50.75 after currency confirmation", async () => {
    const before = accountReviewSessionSchema.parse(
      await normalizeAccountReviewParserResult(makeUsdAmountInput())
    );
    const row = before.rows[0];
    if (!row) throw new Error("Missing decimal row");
    expect(row.amountDecimal).toBe("50.75");
    const result = apply(
      before,
      canonicalCommand({
        ...scope(before),
        kind: "confirm_row_currency",
        rowId: row.rowId,
        expectedRowRevision: row.revision,
        currency: "EGP",
      })
    );
    const changed = requireRow(result.state, row.rowId);
    expect(changed.amountDecimal).toBe("50.75");
    expect(changed.transaction.amount).toBe(50.75);
    expect(changed.transaction.date).toEqual(row.transaction.date);
    expect(changed.transaction.categoryId).toBe(row.transaction.categoryId);
    expect(result.state.saveIntent).toBeNull();
  });

  it("foreign actor, stale generation and mismatched row ID are inert", async () => {
    const before = await qnbCibReview();
    const id = groupByName(before, "QNB").linkedRowIds[0];
    if (!id) throw new Error("Missing choice row");
    const row = requireRow(before, id);
    const attempts = [
      {
        ...scope(before),
        ownerId: COMMAND_IDS.otherOwner,
        kind: "choose_row_account",
        rowId: id,
        expectedRowRevision: row.revision,
        accountId: COMMAND_IDS.cibAccount,
      },
      {
        ...scope(before),
        expectedOperationGeneration: "42",
        kind: "confirm_row_currency",
        rowId: id,
        expectedRowRevision: row.revision,
        currency: "EGP",
      },
      {
        ...scope(before),
        kind: "choose_row_account",
        rowId: COMMAND_IDS.outsideAccount,
        expectedRowRevision: row.revision,
        accountId: COMMAND_IDS.qnbAccount,
      },
    ];
    for (const candidate of attempts) {
      const parsed = accountReviewCommandSchema.parse(candidate);
      assertUnchangedFailure(apply(before, parsed), before);
    }
  });
});
