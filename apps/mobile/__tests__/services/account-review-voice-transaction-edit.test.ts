/**
 * #395 FR-019 Voice T054: authenticated edit uses canonical memory-only
 * reducer. No Watermelon queue, legacy modal writer or provider reparse.
 */
import { waitFor } from "@testing-library/react-native";
import { executeVoiceAccountReviewCommand } from "@/services/account-review-voice-command-service";
import { accountReviewCommandSchema } from "../../../../packages/logic/src/account-review/schemas";
import {
  canonicalVoiceReview,
  ownedContext,
  scope,
} from "../../../../packages/logic/src/account-review/__tests__/review-command-fixtures";

const mockCategories = jest.fn();
let mockCurrentOwner: string | null = null;
jest.mock(
  "@/services/account-review-transaction-edit-category-service",
  () => ({
    loadCurrentAccountReviewEditorCategories: (
      ...args: readonly unknown[]
    ): unknown => mockCategories(...args),
  })
);
jest.mock("@/services/user-data-access", () => ({
  assertExpectedCurrentUser: (expected: string): Promise<void> =>
    mockCurrentOwner === expected
      ? Promise.resolve()
      : Promise.reject(new Error("auth_scope_changed")),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentOwner = null;
});

describe("#395 T054 authenticated Voice transaction edit", () => {
  it("preserves date/transcript and produces a memory-only revised session", async () => {
    const session = await canonicalVoiceReview();
    mockCurrentOwner = session.ownerId;
    const row = session.rows[0];
    if (!row || row.source !== "VOICE")
      throw new Error("Expected Voice fixture");
    mockCategories.mockResolvedValue({
      snapshot: { ownerId: session.ownerId, categories: [] },
      records: [],
    });
    const result = await executeVoiceAccountReviewCommand({
      session,
      command: accountReviewCommandSchema.parse({
        kind: "edit_row_transaction",
        ...scope(session),
        rowId: row.rowId,
        expectedRowRevision: row.revision,
        patch: { amountDecimal: "42.5", note: "Confirmed note" },
      }),
      accountSnapshots: ownedContext(session),
      nextUndoToken: null,
      undo: null,
    });
    expect(result.reasonCodes).toEqual([]);
    expect(result.effect).toBe("session_only");
    expect(result.state.rows[0]?.transaction.amount).toBe(42.5);
    const changed = result.state.rows[0];
    if (!changed || changed.source !== "VOICE")
      throw new Error("Voice source lost");
    expect(changed.transaction.note).toBe("Confirmed note");
    expect(changed.transaction.originalTranscript).toBe(
      row.transaction.originalTranscript
    );
    expect(changed.transaction.date).toEqual(row.transaction.date);
    expect(mockCategories).toHaveBeenCalledWith(session.ownerId, undefined);
  });

  it("revokes a Voice edit if the owner changes while category proof is awaiting", async () => {
    const session = await canonicalVoiceReview();
    mockCurrentOwner = session.ownerId;
    const row = session.rows[0];
    if (!row || row.source !== "VOICE") throw new Error("Expected Voice");
    let release: (value: unknown) => void = () => {};
    mockCategories.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const command = accountReviewCommandSchema.parse({
      kind: "edit_row_transaction",
      ...scope(session),
      rowId: row.rowId,
      expectedRowRevision: row.revision,
      patch: { note: "Stale Voice owner" },
    });
    const inFlight = executeVoiceAccountReviewCommand({
      session,
      command,
      accountSnapshots: ownedContext(session),
      nextUndoToken: null,
      undo: null,
    });
    // Wait for entry into the real authenticated category boundary.
    await waitFor(() => expect(mockCategories).toHaveBeenCalledTimes(1));
    mockCurrentOwner = "00000000-0000-4000-8000-000000009999";
    release({
      snapshot: { ownerId: session.ownerId, categories: [] },
      records: [],
    });
    await expect(inFlight).rejects.toThrow("auth_scope_changed");
  });

  it("rejects an edit before touching category data when its signal was aborted", async () => {
    const session = await canonicalVoiceReview();
    mockCurrentOwner = session.ownerId;
    const row = session.rows[0];
    if (!row) throw new Error("Expected row");
    const controller = new AbortController();
    controller.abort();
    await expect(
      executeVoiceAccountReviewCommand({
        session,
        command: accountReviewCommandSchema.parse({
          kind: "edit_row_transaction",
          ...scope(session),
          rowId: row.rowId,
          expectedRowRevision: row.revision,
          patch: { amountDecimal: "42" },
        }),
        accountSnapshots: ownedContext(session),
        signal: controller.signal,
        nextUndoToken: null,
        undo: null,
      })
    ).rejects.toThrow("account_review_voice_cancelled");
    expect(mockCategories).not.toHaveBeenCalled();
  });
});
