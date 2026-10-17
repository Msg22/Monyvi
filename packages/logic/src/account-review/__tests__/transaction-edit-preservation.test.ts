/**
 * #395 FR-019 / T030 + T054 — TESTS FIRST.
 * Production edit_row_transaction does not exist yet. Red must be actual
 * canonical schema/reducer behavior, not a missing future import or fixture.
 */
import {
  accountReviewCommandSchema,
  accountReviewSessionSchema,
  type AccountReviewCommand,
  type AccountReviewSession,
} from "../schemas";
import { reduceAccountReviewCommand } from "../reducer";
import {
  canonicalVoiceReview,
  ownedContext,
  scope,
} from "./review-command-fixtures";
import {
  makeT025ReviewSession,
  makeT025ConfirmedSession,
  makeT025SmsOriginal,
  T025_IDS,
} from "../../sms-review-drafts/__tests__/account-review-v2-t025-fixtures";

function smsReview(): AccountReviewSession {
  return makeT025ReviewSession(
    T025_IDS.queue,
    [makeT025SmsOriginal(0), makeT025SmsOriginal(1)],
    [T025_IDS.rowOne, T025_IDS.rowTwo]
  );
}

function editWire(
  session: AccountReviewSession,
  rowId: string,
  patch: Readonly<Record<string, unknown>>,
  expectedRowRevision = session.rows.find((row) => row.rowId === rowId)
    ?.revision
): Record<string, unknown> {
  if (expectedRowRevision === undefined)
    throw new Error("Missing canonical row");
  return {
    kind: "edit_row_transaction",
    ...scope(session),
    rowId,
    expectedRowRevision,
    patch,
  };
}

/**
 * TEST-ONLY wire injection into the actual reducer: current TS discriminant
 * does not yet contain this future command. No such cast belongs in runtime.
 */
function sendToCurrentReducer(
  session: AccountReviewSession,
  wire: unknown
): ReturnType<typeof reduceAccountReviewCommand> {
  return reduceAccountReviewCommand({
    state: session,
    command: wire as AccountReviewCommand,
    accountSnapshots: ownedContext(session),
    nextUndoToken: null,
    undo: null,
  });
}

describe("#395 FR-019 canonical transaction-field edit — pure RED", () => {
  it("R01 strictly admits proposed positive edit wire with row/business/session CAS", () => {
    const session = smsReview();
    const wire = editWire(session, T025_IDS.rowOne, {
      amountDecimal: "60.25",
      categoryId: "00000000-0000-4000-8000-000000000206",
      counterparty: "Corrected shop",
    });
    const result = accountReviewCommandSchema.safeParse(wire);
    expect(result.success).toBe(true); // RED: current union lacks this command
    if (result.success) expect(result.data).toEqual(wire);
  });

  it("R02 edits only one SMS transaction, with consistent decimal, preserved original source/evidence, selections and unrelated reasons", () => {
    const initial = smsReview();
    const original = initial.rows[0];
    if (!original || original.source !== "SMS")
      throw new Error("Missing actual canonical SMS row");
    const state = accountReviewSessionSchema.parse({
      ...initial,
      rows: initial.rows.map((row) =>
        row.rowId === original.rowId
          ? {
              ...row,
              reviewReasons: [...row.reviewReasons, "low_confidence"],
              transaction: {
                ...row.transaction,
                reviewReasons: ["low_confidence"],
              },
            }
          : row
      ),
    });
    const result = sendToCurrentReducer(
      state,
      editWire(state, original.rowId, {
        amountDecimal: "60.25",
        counterparty: "Corrected merchant label",
      })
    );
    expect(result.reasonCodes).toEqual([]);
    expect(result.effect).toBe("persist_sms");
    expect(result.affectedRowIds).toEqual([original.rowId]);
    const changed = result.state.rows.find(
      (row) => row.rowId === original.rowId
    );
    if (!changed || changed.source !== "SMS")
      throw new Error("Changed canonical SMS row missing");
    expect(changed.amountDecimal).toBe("60.25");
    expect(changed.transaction.amount).toBe(60.25);
    expect(changed.transaction.counterparty).toBe("Corrected merchant label");
    expect(changed.transaction.date).toEqual(original.transaction.date);
    expect(changed.transaction.rawSmsBody).toBe(
      original.transaction.rawSmsBody
    );
    expect(changed.transaction.senderDisplayName).toBe(
      original.transaction.senderDisplayName
    );
    expect(changed.sourceFingerprint).toBe(original.sourceFingerprint);
    expect(changed.accountEvidence).toEqual(original.accountEvidence);
    expect(changed.toAccountEvidence).toEqual(original.toAccountEvidence);
    expect(changed.assignment).toEqual(original.assignment);
    expect(changed.currency).toEqual(original.currency);
    expect(changed.selected).toBe(original.selected);
    expect(changed.reviewReasons).toContain("low_confidence");
    expect(changed.reviewReasons).toContain("account_group_unconfirmed");
    expect(BigInt(changed.revision)).toBe(BigInt(original.revision) + 1n);
    expect(BigInt(result.state.revision)).toBe(BigInt(state.revision) + 1n);
    expect(BigInt(result.state.operationGeneration)).toBe(
      BigInt(state.operationGeneration) + 1n
    );
    expect(result.state.rows[1]).toEqual(state.rows[1]);
    expect(result.state.groups).toEqual(state.groups);
  });

  it("R03 Voice note/counterparty/amount are session-only; transcript/date and other rows stay unchanged", async () => {
    const state = await canonicalVoiceReview();
    const row = state.rows[0];
    if (!row || row.source !== "VOICE")
      throw new Error("Actual normalized Voice row unavailable");
    const result = sendToCurrentReducer(
      state,
      editWire(state, row.rowId, {
        amountDecimal: "42.5",
        counterparty: "Corrected description",
        note: "User-entered note",
      })
    );
    expect(result.reasonCodes).toEqual([]);
    expect(result.effect).toBe("session_only");
    const changed = result.state.rows.find(
      (candidate) => candidate.rowId === row.rowId
    );
    if (!changed || changed.source !== "VOICE")
      throw new Error("Voice result lost its source");
    expect(changed.amountDecimal).toBe("42.5");
    expect(changed.transaction.amount).toBe(42.5);
    expect(changed.transaction.counterparty).toBe("Corrected description");
    expect(changed.transaction.note).toBe("User-entered note");
    expect(changed.transaction.date).toEqual(row.transaction.date);
    expect(changed.transaction.originalTranscript).toBe(
      row.transaction.originalTranscript
    );
    expect(changed.transaction.detectedLanguage).toBe(
      row.transaction.detectedLanguage
    );
    expect(
      result.state.rows.filter((candidate) => candidate.rowId !== row.rowId)
    ).toEqual(state.rows.filter((candidate) => candidate.rowId !== row.rowId));
  });

  it("R04 exact stale row revision rejects rather than mutating the authoritative graph", () => {
    const state = smsReview();
    const result = sendToCurrentReducer(
      state,
      editWire(state, T025_IDS.rowOne, { amountDecimal: "60" }, "999")
    );
    expect(result.reasonCodes).toContain("review_revision_stale");
    expect(result.effect).toBe("none");
    expect(result.state).toEqual(state);
    expect(result.affectedRowIds).toEqual([]);
  });

  it.each([
    ["foreign account", { accountId: T025_IDS.foreignOwner }],
    ["currency mutation", { currency: "USD" }],
    ["provider fingerprint mutation", { sourceFingerprint: "forged" }],
    ["date edit (date is read-only)", { date: "2026-10-15T12:00:00.000Z" }],
    ["review-reason bypass", { reviewReasons: [] }],
    ["empty edit", {}],
  ])(
    "R05 strict patch refuses %s without exposing legacy override fields",
    (_label, patch) => {
      const session = smsReview();
      expect(
        accountReviewCommandSchema.safeParse(
          editWire(session, T025_IDS.rowOne, patch)
        ).success
      ).toBe(false);
    }
  );

  it.each([
    ["SMS type is read-only", { type: "INCOME" }],
    ["Voice-only note on SMS", { note: "not an SMS field" }],
    ["EGP overprecision", { amountDecimal: "1.005" }],
  ])(
    "R06 source/precision admission refuses %s without mutation",
    (_label, patch) => {
      const session = smsReview();
      const result = sendToCurrentReducer(
        session,
        editWire(session, T025_IDS.rowOne, patch)
      );
      expect(result.effect).toBe("none");
      expect(result.reasonCodes.length).toBeGreaterThan(0);
      expect(result.state).toEqual(session);
    }
  );

  it("R07 existing set_filter command remains admitted (positive control)", () => {
    const session = smsReview();
    const current = accountReviewCommandSchema.parse({
      kind: "set_filter",
      ...scope(session),
      filter: "needs_review",
    });
    const result = sendToCurrentReducer(session, current);
    expect(result.reasonCodes).toEqual([]);
    expect(result.effect).toBe("persist_sms");
    expect(result.state.filter).toBe("needs_review");
    expect(result.state.rows).toEqual(session.rows);
    expect(result.state.groups).toEqual(session.groups);
  });
  it("R08 missing current category authority refuses an otherwise valid category edit without touching any row", () => {
    const state = smsReview();
    const result = sendToCurrentReducer(
      state,
      editWire(state, T025_IDS.rowOne, {
        categoryId: "00000000-0000-4000-8000-000000000206",
      })
    );
    expect(result.reasonCodes).toContain("category_needed");
    expect(result.effect).toBe("none");
    expect(result.state).toEqual(state);
  });

  it("R09 a proven current owner-accessible active category supplies display name, never an untrusted UI label", () => {
    const state = smsReview();
    const id = "00000000-0000-4000-8000-000000000206";
    const result = reduceAccountReviewCommand({
      state,
      command: editWire(state, T025_IDS.rowOne, {
        categoryId: id,
      }) as unknown as AccountReviewCommand,
      accountSnapshots: ownedContext(state),
      categorySnapshots: {
        ownerId: state.ownerId,
        categories: [
          {
            id,
            userId: null,
            isSystem: true,
            deleted: false,
            type: "EXPENSE",
            displayName: "Verified category",
          },
        ],
      },
      nextUndoToken: null,
      undo: null,
    });
    expect(result.reasonCodes).toEqual([]);
    expect(result.effect).toBe("persist_sms");
    const changed = result.state.rows[0];
    if (!changed || changed.source !== "SMS")
      throw new Error("Expected updated SMS category");
    expect(changed.transaction.categoryId).toBe(id);
    expect(changed.transaction.categoryDisplayName).toBe("Verified category");
    expect(changed.transaction.categoryConfirmed).toBe(true);
    const previous = state.rows[0];
    if (!previous || previous.source !== "SMS")
      throw new Error("Missing original SMS source for category proof");
    expect(changed.transaction.rawSmsBody).toBe(
      previous.transaction.rawSmsBody
    );
    expect(result.state.rows[1]).toEqual(state.rows[1]);
    expect(result.state.groups).toEqual(state.groups);
  });

  it("R10 an otherwise valid category with a foreign owner or wrong type is never trusted", () => {
    const state = smsReview();
    const id = "00000000-0000-4000-8000-000000000206";
    for (const category of [
      {
        id,
        userId: T025_IDS.foreignOwner,
        isSystem: false,
        deleted: false,
        type: "EXPENSE" as const,
        displayName: "Foreign",
      },
      {
        id,
        userId: null,
        isSystem: true,
        deleted: false,
        type: "INCOME" as const,
        displayName: "Wrong type",
      },
      {
        id,
        userId: null,
        isSystem: true,
        deleted: true,
        type: "EXPENSE" as const,
        displayName: "Deleted",
      },
    ]) {
      const result = reduceAccountReviewCommand({
        state,
        command: editWire(state, T025_IDS.rowOne, {
          categoryId: id,
        }) as unknown as AccountReviewCommand,
        accountSnapshots: ownedContext(state),
        categorySnapshots: { ownerId: state.ownerId, categories: [category] },
        nextUndoToken: null,
        undo: null,
      });
      expect(result.effect).toBe("none");
      expect(result.reasonCodes).toContain("category_needed");
      expect(result.state).toEqual(state);
    }
  });

  it("R11 an unchanged amount is a no-op, preserving global/row revisions and selection", () => {
    const state = makeT025ConfirmedSession(smsReview(), [T025_IDS.rowOne]);
    const row = state.rows[0];
    if (!row) throw new Error("Confirmed row missing");
    const result = sendToCurrentReducer(
      state,
      editWire(state, row.rowId, { amountDecimal: row.amountDecimal })
    );
    expect(result.reasonCodes).toEqual([]);
    expect(result.effect).toBe("none");
    expect(result.state).toBe(state);
    expect(result.affectedRowIds).toEqual([]);
    expect(result.state.rows[0]?.selected).toBe(true);
  });

  it("R12 material edit retains a currently ready selection without selecting its siblings", () => {
    const state = makeT025ConfirmedSession(smsReview(), [T025_IDS.rowOne]);
    const row = state.rows[0];
    if (!row) throw new Error("Confirmed row missing");
    const result = sendToCurrentReducer(
      state,
      editWire(state, row.rowId, { amountDecimal: "60.5" })
    );
    expect(result.reasonCodes).toEqual([]);
    expect(result.effect).toBe("persist_sms");
    expect(result.state.rows[0]?.selected).toBe(true);
    expect(result.state.rows[1]?.selected).toBe(false);
    expect(result.state.groups).toEqual(state.groups);
  });

  it("R13 Voice type toggle is admitted only with an active compatible owner-scoped category; SMS cannot use it", async () => {
    const state = await canonicalVoiceReview();
    const row = state.rows[0];
    if (!row || row.source !== "VOICE")
      throw new Error("Expected Voice fixture");
    const nextType = row.transaction.type === "EXPENSE" ? "INCOME" : "EXPENSE";
    const nextCategory = "00000000-0000-4000-8000-000000009815";
    const command = editWire(state, row.rowId, {
      type: nextType,
      categoryId: nextCategory,
    }) as unknown as AccountReviewCommand;
    const withoutAuthority = sendToCurrentReducer(state, command);
    expect(withoutAuthority.reasonCodes).toContain("category_needed");
    expect(withoutAuthority.effect).toBe("none");
    const accepted = reduceAccountReviewCommand({
      state,
      command,
      accountSnapshots: ownedContext(state),
      categorySnapshots: {
        ownerId: state.ownerId,
        categories: [
          {
            id: nextCategory,
            userId: state.ownerId,
            isSystem: false,
            deleted: false,
            type: nextType,
            displayName: "Owner verified category",
          },
        ],
      },
      nextUndoToken: null,
      undo: null,
    });
    expect(accepted.reasonCodes).toEqual([]);
    expect(accepted.effect).toBe("session_only");
    const changed = accepted.state.rows.find(
      (candidate) => candidate.rowId === row.rowId
    );
    if (!changed || changed.source !== "VOICE")
      throw new Error("Voice changed type lost original source");
    expect(changed.transaction.type).toBe(nextType);
    expect(changed.transaction.categoryId).toBe(nextCategory);
    expect(changed.transaction.categoryDisplayName).toBe(
      "Owner verified category"
    );
    expect(changed.transaction.originalTranscript).toBe(
      row.transaction.originalTranscript
    );
    expect(accepted.state.groups).toEqual(state.groups);
  });
});
