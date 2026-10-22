/**
 * #395 PR396 SMS retry follow-up — real hook/facade/read-model lifecycle.
 * Mock owned SMS services, Expo UUID, and the unused Voice service import
 * boundary only; the SMS hook, controller, and pure reducer remain real.
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";
import {
  accountReviewCommandSchema,
  accountReviewSessionSchema,
  type AccountReviewSession,
} from "../../../../packages/logic/src/account-review/review-schemas";
import {
  reduceAccountReviewCommand,
  autoSelectReadyReviewSession,
  type ReviewUndoLease,
} from "../../../../packages/logic/src/account-review/reducer";
import { makeOwnedContext } from "../../../../packages/logic/src/account-review/__tests__/normalization-fixtures";
import {
  makeT025ConfirmedSession,
  makeT025ReviewSession,
  makeT025SmsOriginal,
  T025_IDS,
} from "../../../../packages/logic/src/sms-review-drafts/__tests__/account-review-v2-t025-fixtures";
import {
  useAccountReview,
  type UseAccountReviewInput,
} from "@/hooks/useAccountReview";

type BootstrapFn =
  typeof import("@/services/account-review-legacy-bootstrap-service").loadOrBootstrapOwnedSmsReviewSession;
type AccountReadFn =
  typeof import("@/services/account-review-read-model-service").loadAccountReviewAccountSnapshots;
type SmsCommandFn =
  typeof import("@/services/account-review-command-service").executeSmsAccountReviewCommand;
type SmsReadyFn =
  typeof import("@/services/account-review-command-service").initializeSmsAccountReviewReadySelection;
type SmsDiscardFn =
  typeof import("@/services/account-review-command-service").discardSmsAccountReviewRemovedSuggestion;

const mockBootstrap = jest.fn<
  ReturnType<BootstrapFn>,
  Parameters<BootstrapFn>
>();
const mockAccounts = jest.fn<
  ReturnType<AccountReadFn>,
  Parameters<AccountReadFn>
>();
const mockSmsCommand = jest.fn<
  ReturnType<SmsCommandFn>,
  Parameters<SmsCommandFn>
>();
const mockReadyBootstrap = jest.fn<
  ReturnType<SmsReadyFn>,
  Parameters<SmsReadyFn>
>();
const mockDiscardRemoved = jest.fn<
  ReturnType<SmsDiscardFn>,
  Parameters<SmsDiscardFn>
>();

jest.mock("expo-crypto", () => ({
  randomUUID: (): string =>
    jest
      .requireActual<typeof import("node:crypto")>("node:crypto")
      .randomUUID(),
}));
jest.mock("@/services/account-review-legacy-bootstrap-service", () => ({
  loadOrBootstrapOwnedSmsReviewSession: (
    ...args: Parameters<BootstrapFn>
  ): ReturnType<BootstrapFn> => mockBootstrap(...args),
}));
jest.mock("@/services/account-review-read-model-service", () => ({
  loadAccountReviewAccountSnapshots: (
    ...args: Parameters<AccountReadFn>
  ): ReturnType<AccountReadFn> => mockAccounts(...args),
}));
jest.mock("@/services/account-review-command-service", () => ({
  executeSmsAccountReviewCommand: (
    ...args: Parameters<SmsCommandFn>
  ): ReturnType<SmsCommandFn> => mockSmsCommand(...args),
  initializeSmsAccountReviewReadySelection: (
    ...args: Parameters<SmsReadyFn>
  ): ReturnType<SmsReadyFn> => mockReadyBootstrap(...args),
  discardSmsAccountReviewRemovedSuggestion: (
    ...args: Parameters<SmsDiscardFn>
  ): ReturnType<SmsDiscardFn> => mockDiscardRemoved(...args),
}));
jest.mock("@/services/account-review-voice-command-service", () => ({
  executeVoiceAccountReviewCommand: (): never => {
    throw new Error("unexpected_voice_command_in_sms_followup_test");
  },
}));

function input(
  ownerId: string = T025_IDS.owner
): Extract<UseAccountReviewInput, { mode: "SMS" }> {
  return {
    mode: "SMS",
    ownerId,
    sessionId: T025_IDS.queue,
    queueId: T025_IDS.queue,
  };
}

/** Both responses represent the SAME durable queue, not synthetic ID churn. */
function beforeAndAfterActualQueueMerge(): {
  readonly before: AccountReviewSession;
  readonly merged: AccountReviewSession;
} {
  const before = makeT025ConfirmedSession(
    makeT025ReviewSession(
      T025_IDS.queue,
      [makeT025SmsOriginal(0)],
      [T025_IDS.rowOne]
    ),
    [T025_IDS.rowOne]
  );
  const expanded = makeT025ConfirmedSession(
    makeT025ReviewSession(
      T025_IDS.queue,
      [makeT025SmsOriginal(0), makeT025SmsOriginal(1)],
      [T025_IDS.rowOne, T025_IDS.rowTwo]
    ),
    [T025_IDS.rowOne]
  );
  const merged = accountReviewSessionSchema.parse({
    ...expanded,
    sourceRevision: "1",
    revision: "2",
    operationGeneration: "2",
  });
  if (
    before.rows.length !== 1 ||
    merged.rows.length !== 2 ||
    before.groups[0]?.status !== "confirmed" ||
    merged.groups[0]?.status !== "confirmed"
  )
    throw new Error("invalid_real_queue_merge_fixture");
  return { before, merged };
}

beforeEach(() => {
  mockBootstrap.mockReset();
  mockAccounts.mockReset();
  mockSmsCommand.mockReset();
  mockReadyBootstrap.mockReset();
  mockDiscardRemoved.mockReset();
  mockReadyBootstrap.mockImplementation(({ expectedSession }) =>
    Promise.resolve(
      autoSelectReadyReviewSession(
        expectedSession,
        makeOwnedContext(),
        new Set<string>()
      ).state
    )
  );
  mockDiscardRemoved.mockRejectedValue(
    new Error("unexpected_sms_discard_in_followup")
  );
  mockAccounts.mockResolvedValue(makeOwnedContext());
  mockSmsCommand.mockRejectedValue(
    new Error("unexpected_sms_financial_command_in_retry_test")
  );
});

describe("#395 PR396 same-ID SMS retry facade reload", () => {
  it("reboots from merged canonical queue rows using the existing reload API, preserving confirmed choices and owner scope", async () => {
    const { before, merged } = beforeAndAfterActualQueueMerge();
    const readyMerged = autoSelectReadyReviewSession(
      merged,
      makeOwnedContext(),
      new Set<string>()
    ).state;
    const pendingOwner = T025_IDS.owner;
    mockBootstrap.mockResolvedValueOnce(before).mockResolvedValueOnce(merged);
    const { result } = renderHook(() => useAccountReview(input()));
    await waitFor(() => expect(result.current.session).toEqual(before));
    expect(result.current.session?.groups[0]?.status).toBe("confirmed");
    expect(result.current.readModel?.visibleRowIds).toContain(T025_IDS.rowOne);

    // A successful external retry updates physical items under exactly the
    // same owner/session/queue identity; the container must call this API.
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.session).toEqual(readyMerged));
    expect(mockBootstrap).toHaveBeenCalledTimes(2);
    expect(
      mockBootstrap.mock.calls.every(
        ([args]) =>
          args.queueId === T025_IDS.queue &&
          args.expectedOwnerId === pendingOwner
      )
    ).toBe(true);
    expect(result.current.session?.sessionId).toBe(before.sessionId);
    expect(result.current.session?.ownerId).toBe(before.ownerId);
    expect(result.current.session?.rows.map((row) => row.rowId)).toEqual([
      T025_IDS.rowOne,
      T025_IDS.rowTwo,
    ]);
    expect(
      result.current.session?.rows.find((row) => row.rowId === T025_IDS.rowOne)
        ?.assignment
    ).toEqual(
      merged.rows.find((row) => row.rowId === T025_IDS.rowOne)?.assignment
    );
    expect(result.current.session?.groups[0]?.status).toBe("confirmed");
    expect(result.current.readModel?.visibleRowIds).toContain(T025_IDS.rowTwo);
    expect(result.current.error).toBeNull();
    expect(mockSmsCommand).not.toHaveBeenCalled();
  });

  it("keeps the validated owned Review usable after a recoverable command rejection and accepts an explicit retry", async () => {
    const { before } = beforeAndAfterActualQueueMerge();
    mockBootstrap.mockResolvedValue(before);
    mockSmsCommand
      .mockRejectedValueOnce(new Error("transient_review_command_rejected"))
      .mockImplementationOnce(({ command, accountSnapshots, nextUndoToken }) =>
        Promise.resolve(
          reduceAccountReviewCommand({
            state: before,
            command,
            accountSnapshots,
            nextUndoToken: nextUndoToken ?? null,
            undo: null,
          })
        )
      );

    const { result } = renderHook(() => useAccountReview(input()));
    await waitFor(() => expect(result.current.session).toEqual(before));
    await waitFor(() => expect(result.current.readModel).not.toBeNull());
    const originalView = result.current.readModel;
    const originalChoices = result.current.choiceAccounts;
    expect(originalChoices.length).toBeGreaterThan(0);

    const command = accountReviewCommandSchema.parse({
      kind: "set_filter",
      ownerId: before.ownerId,
      sessionId: before.sessionId,
      expectedReviewRevision: before.revision,
      expectedOperationGeneration: before.operationGeneration,
      filter: "selected",
    });
    await act(async () => {
      await expect(result.current.dispatch(command)).rejects.toThrow(
        "transient_review_command_rejected"
      );
    });
    expect(result.current.error).toBeNull();
    expect(result.current.session).toEqual(before);
    expect(result.current.readModel).toEqual(originalView);
    expect(result.current.choiceAccounts).toEqual(originalChoices);
    expect(mockSmsCommand).toHaveBeenCalledTimes(1);

    await act(async () => {
      const accepted = await result.current.dispatch(command);
      expect(accepted.reasonCodes).toEqual([]);
      expect(accepted.state.filter).toBe("selected");
    });
    expect(mockSmsCommand).toHaveBeenCalledTimes(2);
    expect(result.current.session?.filter).toBe("selected");
    expect(result.current.error).toBeNull();
    expect(result.current.readModel).not.toBeNull();
    expect(result.current.choiceAccounts).toEqual(originalChoices);
  });

  it("still blocks stale Review projection and choices after an ownership rejection", async () => {
    const { before } = beforeAndAfterActualQueueMerge();
    mockBootstrap.mockResolvedValue(before);
    mockSmsCommand.mockRejectedValueOnce(new Error("AUTH_SCOPE_CHANGED"));
    const { result } = renderHook(() => useAccountReview(input()));
    await waitFor(() => expect(result.current.readModel).not.toBeNull());
    await act(async () => {
      await expect(
        result.current.dispatch(
          accountReviewCommandSchema.parse({
            kind: "set_filter",
            ownerId: before.ownerId,
            sessionId: before.sessionId,
            expectedReviewRevision: before.revision,
            expectedOperationGeneration: before.operationGeneration,
            filter: "selected",
          })
        )
      ).rejects.toThrow("AUTH_SCOPE_CHANGED");
    });
    expect(result.current.error?.message).toBe("AUTH_SCOPE_CHANGED");
    expect(result.current.readModel).toBeNull();
    expect(result.current.choiceAccounts).toEqual([]);
    expect(mockSmsCommand).toHaveBeenCalledTimes(1);
  });

  it("rejects a late same-ID retry result after the actor changes, without exposing the old owner's choices", async () => {
    const { before, merged } = beforeAndAfterActualQueueMerge();
    let resolveReload!: (value: AccountReviewSession) => void;
    const pendingReload = new Promise<AccountReviewSession>((resolve) => {
      resolveReload = resolve;
    });
    mockBootstrap
      .mockResolvedValueOnce(before)
      .mockReturnValueOnce(pendingReload)
      .mockResolvedValueOnce(
        accountReviewSessionSchema.parse({
          ...before,
          ownerId: T025_IDS.foreignOwner,
        })
      );
    const initial = input();
    const { result, rerender } = renderHook(
      ({ value }: { value: UseAccountReviewInput }) => useAccountReview(value),
      { initialProps: { value: initial as UseAccountReviewInput } }
    );
    await waitFor(() => expect(result.current.session).toEqual(before));
    act(() => result.current.reload());
    await waitFor(() => expect(mockBootstrap).toHaveBeenCalledTimes(2));
    rerender({ value: input(T025_IDS.foreignOwner) });
    await waitFor(() => expect(mockBootstrap).toHaveBeenCalledTimes(3));
    await act(async () => {
      resolveReload(merged);
      await pendingReload;
    });
    expect(result.current.session?.ownerId).not.toBe(T025_IDS.owner);
    expect(result.current.readModel).toBeNull();
    expect(result.current.error).not.toBeNull();
    expect(mockSmsCommand).not.toHaveBeenCalled();
  });

  it("CR-DOM1 hook Discard revokes its matching Undo callback without touching removed transactions", async () => {
    let persisted = makeT025ReviewSession();
    let lease: ReviewUndoLease | null = null;
    mockBootstrap.mockImplementation(() => Promise.resolve(persisted));
    mockSmsCommand.mockImplementation(
      ({ command, accountSnapshots, nextUndoToken }) => {
        const previous = persisted;
        const outcome = reduceAccountReviewCommand({
          state: persisted,
          command,
          accountSnapshots,
          nextUndoToken: nextUndoToken ?? null,
          undo: lease,
        });
        if (
          outcome.reasonCodes.length === 0 &&
          outcome.effect === "persist_sms"
        ) {
          persisted = outcome.state;
          lease =
            command.kind === "remove_group" && outcome.undoToken
              ? {
                  token: outcome.undoToken,
                  previousState: previous,
                  afterRemovalGeneration: outcome.state.operationGeneration,
                }
              : null;
        }
        return Promise.resolve(outcome);
      }
    );
    mockDiscardRemoved.mockImplementation(({ groupId, undoToken }) => {
      expect(groupId).toBe(T025_IDS.group);
      expect(undoToken).toBe(lease?.token);
      lease = null;
      return Promise.resolve();
    });
    const { result } = renderHook(() => useAccountReview(input()));
    await waitFor(() => expect(result.current.session).toEqual(persisted));
    const original = result.current.session;
    if (!original) throw new Error("missing_review_for_discard");
    await act(async () => {
      const outcome = await result.current.dispatch(
        accountReviewCommandSchema.parse({
          kind: "remove_group",
          ownerId: original.ownerId,
          sessionId: original.sessionId,
          expectedReviewRevision: original.revision,
          expectedOperationGeneration: original.operationGeneration,
          groupId: T025_IDS.group,
          expectedGroupRevision: original.groups[0]?.revision,
        })
      );
      expect(outcome.reasonCodes).toEqual([]);
    });
    const removed = result.current.session;
    const staleUndo = result.current.undoRemoval;
    if (!removed) throw new Error("missing_tombstone_after_remove");
    await act(async () =>
      result.current.discardRemovedSuggestion(T025_IDS.group)
    );
    expect(result.current.discardedGroupIds).toContain(T025_IDS.group);
    expect(result.current.undoToken).toBeNull();
    expect(result.current.session).toEqual(removed);
    await act(async () => {
      await expect(staleUndo()).rejects.toThrow(
        "account_review_facade_undo_unavailable"
      );
    });
    expect(mockSmsCommand).toHaveBeenCalledTimes(1);
    expect(mockDiscardRemoved).toHaveBeenCalledTimes(1);
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.session).toEqual(persisted));
    expect(result.current.discardedGroupIds).toContain(T025_IDS.group);
    expect(result.current.session?.groups[0]?.status).toBe("removed");
    expect(result.current.session?.rows).toHaveLength(original.rows.length);
  });

  it("rejects a captured Undo for group A after removing B; only B's live token restores B", async () => {
    const original = makeT025ReviewSession(
      T025_IDS.queue,
      [makeT025SmsOriginal(0), makeT025SmsOriginal(1)],
      [T025_IDS.rowOne, T025_IDS.rowTwo]
    );
    const groupA = original.groups[0];
    if (!groupA) throw new Error("missing_t025_group");
    const groupBId = "00000000-0000-4000-8000-000000002507";
    let persisted = accountReviewSessionSchema.parse({
      ...original,
      groups: [
        { ...groupA, linkedRowIds: [T025_IDS.rowOne] },
        {
          ...groupA,
          groupId: groupBId,
          evidenceKey: "b".repeat(64),
          suggestionRefs: ["t025-second-qnb-source-suggestion"],
          linkedRowIds: [T025_IDS.rowTwo],
        },
      ],
      rows: original.rows.map((row) =>
        row.rowId === T025_IDS.rowTwo && row.assignment.state === "suggested"
          ? {
              ...row,
              assignment: { ...row.assignment, groupId: groupBId },
            }
          : row
      ),
    });
    let persistedUndo: ReviewUndoLease | null = null;
    mockBootstrap.mockImplementation(
      (): ReturnType<BootstrapFn> => Promise.resolve(persisted)
    );
    // Simulate only the durable SMS writer; the hook, controller and reducer
    // (including the stale token guard under test) are the real production code.
    mockSmsCommand.mockImplementation(
      ({
        command,
        accountSnapshots,
        nextUndoToken,
      }): ReturnType<SmsCommandFn> => {
        const before = persisted;
        const outcome = reduceAccountReviewCommand({
          state: persisted,
          command,
          accountSnapshots,
          nextUndoToken: nextUndoToken ?? null,
          undo: persistedUndo,
        });
        if (
          outcome.effect === "persist_sms" &&
          outcome.reasonCodes.length === 0
        ) {
          persisted = outcome.state;
          persistedUndo =
            command.kind === "remove_group" && outcome.undoToken !== null
              ? {
                  token: outcome.undoToken,
                  previousState: before,
                  afterRemovalGeneration: outcome.state.operationGeneration,
                }
              : null;
        }
        return Promise.resolve(outcome);
      }
    );

    const { result } = renderHook(() => useAccountReview(input()));
    await waitFor(() => expect(result.current.session).toEqual(persisted));
    const removeGroup = async (groupId: string): Promise<void> => {
      const session = result.current.session;
      const group = session?.groups.find((item) => item.groupId === groupId);
      if (!session || !group) throw new Error("missing_current_review_group");
      const outcome = await result.current.dispatch(
        accountReviewCommandSchema.parse({
          kind: "remove_group",
          ownerId: session.ownerId,
          sessionId: session.sessionId,
          expectedReviewRevision: session.revision,
          expectedOperationGeneration: session.operationGeneration,
          groupId,
          expectedGroupRevision: group.revision,
        })
      );
      expect(outcome.reasonCodes).toEqual([]);
      expect(outcome.effect).toBe("persist_sms");
    };

    await act(async () => removeGroup(T025_IDS.group));
    expect(result.current.undoGroupId).toBe(T025_IDS.group);
    const staleUndoA = result.current.undoRemoval;
    const tokenA = result.current.undoToken;
    expect(tokenA).not.toBeNull();

    await act(async () => removeGroup(groupBId));
    expect(result.current.undoGroupId).toBe(groupBId);
    const stateAfterB = result.current.session;
    const tokenB = result.current.undoToken;
    expect(tokenB).not.toBeNull();
    expect(tokenB).not.toBe(tokenA);
    expect(mockSmsCommand).toHaveBeenCalledTimes(2);

    await act(async () => {
      await expect(staleUndoA()).rejects.toThrow(
        "account_review_facade_undo_unavailable"
      );
    });
    expect(mockSmsCommand).toHaveBeenCalledTimes(2);
    expect(result.current.session).toEqual(stateAfterB);
    expect(result.current.undoToken).toBe(tokenB);
    expect(result.current.undoGroupId).toBe(groupBId);
    expect(
      result.current.session?.groups.every(
        (group) => group.status === "removed"
      )
    ).toBe(true);

    await act(async () => {
      const restored = await result.current.undoRemoval();
      expect(restored.effect).toBe("persist_sms");
      expect(restored.reasonCodes).toEqual([]);
    });
    expect(mockSmsCommand).toHaveBeenCalledTimes(3);
    expect(
      result.current.session?.groups.find(
        (group) => group.groupId === T025_IDS.group
      )?.status
    ).toBe("removed");
    expect(
      result.current.session?.groups.find((group) => group.groupId === groupBId)
        ?.status
    ).toBe("pending");
    expect(result.current.undoToken).toBeNull();
    expect(result.current.undoGroupId).toBeNull();
  });
});
