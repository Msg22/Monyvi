/** CR-DOM1: one guarded edit_group form command owns name/type/currency. */
import {
  accountReviewCommandSchema,
  accountReviewSessionSchema,
  type AccountReviewCommand,
  type AccountReviewGroup,
  type AccountReviewSession,
} from "../review-schemas";
import { reduceAccountReviewCommand } from "../reducer";
import { makeOwnedContext } from "./normalization-fixtures";
import {
  makeT025ConfirmedSession,
  makeT025ReviewSession,
  makeT025SmsAtmCodecInput,
  makeT025SmsOriginal,
  T025_IDS,
} from "../../sms-review-drafts/__tests__/account-review-v2-t025-fixtures";

function twoLinkedRows(): AccountReviewSession {
  return makeT025ReviewSession(
    T025_IDS.queue,
    [makeT025SmsOriginal(0), makeT025SmsOriginal(1)],
    [T025_IDS.rowOne, T025_IDS.rowTwo]
  );
}

function editGroup(
  session: AccountReviewSession,
  currency?: AccountReviewGroup["currency"]
): AccountReviewCommand {
  const group = session.groups[0];
  if (!group) throw new Error("missing_group_to_edit");
  return accountReviewCommandSchema.parse({
    kind: "edit_group",
    ownerId: session.ownerId,
    sessionId: session.sessionId,
    expectedReviewRevision: session.revision,
    expectedOperationGeneration: session.operationGeneration,
    groupId: group.groupId,
    expectedGroupRevision: group.revision,
    identity: {
      name: group.name,
      type: group.type ?? "BANK",
      institutionId: group.institutionId,
      providerDisplayName: group.providerDisplayName,
      cardLast4: group.cardLast4,
      senderNames: group.senderNames,
      ...(currency === undefined ? {} : { currency }),
    },
    reconfirm: true,
  });
}

function apply(
  session: AccountReviewSession,
  command: AccountReviewCommand,
  manuallyDeselected: ReadonlySet<string> = new Set()
): ReturnType<typeof reduceAccountReviewCommand> {
  return reduceAccountReviewCommand({
    state: session,
    command,
    accountSnapshots: makeOwnedContext(),
    nextUndoToken: null,
    undo: null,
    autoSelectReady: true,
    manuallyDeselectedRowIds: manuallyDeselected,
  });
}

describe("CR-DOM1 explicit suggested-group currency", () => {
  it("updates only linked canonical user-currency fields without converting amounts or regenerating identity", () => {
    const before = twoLinkedRows();
    const command = editGroup(before, "USD");
    const result = apply(before, command, new Set([T025_IDS.rowOne]));
    expect(result.reasonCodes).toEqual([]);
    expect(result.effect).toBe("persist_sms");
    expect(result.state.saveIntent).toBeNull();
    expect(result.state.groups).toHaveLength(1);
    expect(result.state.groups[0]).toMatchObject({
      groupId: T025_IDS.group,
      evidenceKey: T025_IDS.evidenceKey,
      currency: "USD",
      status: "confirmed",
    });
    expect(result.affectedRowIds).toEqual([T025_IDS.rowOne, T025_IDS.rowTwo]);
    for (const [index, row] of result.state.rows.entries()) {
      const original = before.rows[index];
      if (!original) throw new Error("missing_original_row");
      expect(row.currency).toEqual({
        state: "known",
        code: "USD",
        origin: "user",
      });
      expect(row.transaction.currency).toBe("USD");
      expect(row.transaction.amount).toBe(original.transaction.amount);
      expect(row.amountDecimal).toBe(original.amountDecimal);
      expect(row.hasUserCurrencyOverride).toBe(true);
      expect(row.rowId).toBe(original.rowId);
      expect(row.sourceFingerprint).toBe(original.sourceFingerprint);
      expect(row.accountEvidence).toEqual(original.accountEvidence);
      expect(row.revision).not.toBe(original.revision);
      expect(row.assignment).toMatchObject({
        state: "suggested",
        groupId: T025_IDS.group,
        confirmation: "confirmed",
      });
    }
    // Explicit manual opt-out survives material reconfirmation; other ready
    // rows are selected by the canonical guarded auto-readiness transition.
    expect(result.state.rows.map((row) => row.selected)).toEqual([false, true]);
    expect(before.rows.map((row) => row.currency)).toEqual([
      { state: "known", code: "EGP", origin: "explicit" },
      { state: "known", code: "EGP", origin: "explicit" },
    ]);
  });

  it("keeps the original group/row currency when legacy edit_group omits the optional field", () => {
    const before = twoLinkedRows();
    const result = apply(before, editGroup(before));
    expect(result.reasonCodes).toEqual([]);
    expect(result.state.groups[0]?.currency).toBe("EGP");
    expect(
      result.state.rows.every((row) => row.transaction.currency === "EGP")
    ).toBe(true);
    expect(result.state.rows.every((row) => !row.hasUserCurrencyOverride)).toBe(
      true
    );
  });

  it("rejects a stale review revision and does not rewrite the prior accepted edit", () => {
    const before = twoLinkedRows();
    const command = editGroup(before, "USD");
    const accepted = apply(before, command);
    expect(accepted.reasonCodes).toEqual([]);
    const stale = apply(accepted.state, command);
    expect(stale.reasonCodes).toEqual(["review_revision_stale"]);
    expect(stale.effect).toBe("none");
    expect(stale.state).toBe(accepted.state);
    const foreign = apply(
      before,
      accountReviewCommandSchema.parse({
        ...command,
        ownerId: T025_IDS.foreignOwner,
      })
    );
    expect(foreign.reasonCodes).toEqual(["review_owner_changed"]);
    expect(foreign.state).toBe(before);
  });

  it("keeps original SMS parsed pending-account advice intact while canonical currency changes", () => {
    const original = twoLinkedRows();
    const first = original.rows[0];
    if (!first || first.source !== "SMS")
      throw new Error("missing_original_sms_row");
    const proposal = {
      tempId: "t025-parser-pending-account",
      name: "QNB",
      currency: "EGP",
      type: "BANK" as const,
      senderDisplayName: "QNB",
    };
    const review = accountReviewSessionSchema.parse({
      ...original,
      rows: original.rows.map((row) =>
        row.rowId === first.rowId && row.source === "SMS"
          ? {
              ...row,
              transaction: { ...row.transaction, pendingAccount: proposal },
            }
          : row
      ),
    });
    const changed = apply(review, editGroup(review, "USD"));
    expect(changed.reasonCodes).toEqual([]);
    expect(changed.state.groups[0]?.currency).toBe("USD");
    expect(changed.state.rows[0]?.transaction.currency).toBe("USD");
    const source = changed.state.rows[0];
    expect(source?.source).toBe("SMS");
    if (!source || source.source !== "SMS")
      throw new Error("missing_changed_sms_row");
    expect(source.transaction.pendingAccount).toEqual(proposal);
    expect(source.accountEvidence).toEqual(first.accountEvidence);
  });

  it("clears only the user-confirmed currency blocker when the group denomination changes", () => {
    const source = twoLinkedRows();
    const before = accountReviewSessionSchema.parse({
      ...source,
      rows: source.rows.map((row, index) =>
        index === 0
          ? {
              ...row,
              reviewReasons: [
                ...row.reviewReasons,
                "currency_confirmation_needed",
              ],
            }
          : row
      ),
    });
    const accepted = apply(before, editGroup(before, "USD"));
    expect(accepted.reasonCodes).toEqual([]);
    expect(accepted.state.rows[0]?.reviewReasons).not.toContain(
      "currency_confirmation_needed"
    );
    expect(accepted.state.rows[0]?.selected).toBe(true);
    expect(accepted.state.rows[1]?.selected).toBe(true);
  });

  it("refuses incompatible currency precision rather than rounding a financial amount", () => {
    // KWD permits three minor-unit decimals; USD permits only two.
    // Build a coherent KWD source transaction and review before the edit.
    const parsed = {
      ...makeT025SmsOriginal(),
      amount: 50.251,
      currency: "KWD" as const,
      rawSmsBody: "QNB purchase KWD 50.251",
    };
    const source = makeT025ReviewSession(
      T025_IDS.queue,
      [parsed],
      [T025_IDS.rowOne]
    );
    const before = accountReviewSessionSchema.parse({
      ...source,
      preferredCurrency: "KWD",
      groups: source.groups.map((group) => ({ ...group, currency: "KWD" })),
      rows: source.rows.map((row) => ({
        ...row,
        currency: { state: "known", code: "KWD", origin: "explicit" },
      })),
    });
    expect(before.rows[0]?.amountDecimal).toBe("50.251");
    expect(before.rows[0]?.transaction.amount).toBe(50.251);
    expect(before.rows[0]?.transaction.currency).toBe("KWD");
    const result = apply(before, editGroup(before, "USD"));
    expect(result.effect).toBe("none");
    expect(result.reasonCodes).toEqual(["ambiguous_amount"]);
    expect(result.state).toBe(before);
    expect(result.state.rows[0]?.amountDecimal).toBe("50.251");
    expect(result.state.rows[0]?.transaction.currency).toBe("KWD");
    expect(result.state.groups[0]?.currency).toBe("KWD");
  });

  it("rejects an edit to a nickname already used by another active group in the new currency", () => {
    const source = twoLinkedRows();
    const original = source.groups[0];
    const rowTwo = source.rows[1];
    if (!original || !rowTwo || rowTwo.assignment.state !== "suggested")
      throw new Error("missing_second_group_seed");
    const other: AccountReviewGroup = {
      ...original,
      groupId: T025_IDS.alternateQueue,
      evidenceKey: "b".repeat(64),
      suggestionRefs: ["t025-other-currency-suggestion"],
      linkedRowIds: [rowTwo.rowId],
      currency: "USD",
    };
    const session = accountReviewSessionSchema.parse({
      ...source,
      groups: [{ ...original, linkedRowIds: [T025_IDS.rowOne] }, other],
      rows: source.rows.map((row) =>
        row.rowId === rowTwo.rowId && row.assignment.state === "suggested"
          ? {
              ...row,
              currency: { state: "known", code: "USD", origin: "user" },
              transaction: { ...row.transaction, currency: "USD" },
              assignment: { ...row.assignment, groupId: other.groupId },
              hasUserCurrencyOverride: true,
            }
          : row
      ),
    });
    const refused = apply(session, editGroup(session, "USD"));
    expect(refused.effect).toBe("none");
    expect(refused.reasonCodes).toEqual(["account_group_snapshot_conflict"]);
    expect(refused.state).toBe(session);
  });

  it("rejects cross-currency SMS ATM source-to-Cash links without touching either endpoint", () => {
    const atm = makeT025SmsAtmCodecInput(true);
    const source = makeT025ReviewSession(
      T025_IDS.queue,
      [atm.transaction],
      [T025_IDS.rowOne]
    );
    const session = accountReviewSessionSchema.parse({
      ...source,
      rows: [atm.review.row],
      groups: atm.review.groups,
    });
    expect(session.rows[0]?.toAssignment?.state).toBe("suggested");
    const refused = apply(session, editGroup(session, "USD"));
    expect(refused.effect).toBe("none");
    expect(refused.reasonCodes).toEqual(["cash_transfer_review"]);
    expect(refused.state).toBe(session);
    expect(session.rows[0]?.transaction.amount).toBe(atm.transaction.amount);
    expect(session.groups.map((group) => group.currency)).toEqual([
      "EGP",
      "EGP",
    ]);
  });

  it("a confirmed group currency material change cannot silently preserve prior checkbox intent", () => {
    const before = makeT025ConfirmedSession(twoLinkedRows());
    const changed = apply(
      before,
      editGroup(before, "USD"),
      new Set([T025_IDS.rowOne])
    );
    expect(changed.reasonCodes).toEqual([]);
    expect(changed.state.groups[0]?.status).toBe("confirmed");
    expect(changed.state.rows.map((row) => row.selected)).toEqual([
      false,
      true,
    ]);
    expect(changed.state.rows.every((row) => row.hasUserCurrencyOverride)).toBe(
      true
    );
  });
});
