import { act, renderHook } from "@testing-library/react-native";

import {
  useUndoMetalHolding,
  type UseUndoMetalHoldingInput,
} from "../../hooks/useUndoMetalHolding";
import type { UndoMetalHoldingCommandService } from "../../services/undo-metal-holding-command-service";

interface DeferredUndo {
  readonly promise: ReturnType<UndoMetalHoldingCommandService["undo"]>;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
}

function deferredUndo(): DeferredUndo {
  let resolve: () => void = (): void => {
    throw new Error("missing_resolver");
  };
  let reject: (error: Error) => void = (): void => {
    throw new Error("missing_rejecter");
  };
  const promise = new Promise<
    Awaited<ReturnType<UndoMetalHoldingCommandService["undo"]>>
  >((resolvePromise, rejectPromise): void => {
    resolve = (): void =>
      resolvePromise({ kind: "committed", holdingId: "holding-1" });
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function inputFor(
  service: UndoMetalHoldingCommandService
): UseUndoMetalHoldingInput {
  let counter = 0;
  return {
    holdingId: "holding-1",
    userId: "user-1",
    status: "disposed",
    currentTerminalEventId: "dispose-1",
    expectedFinancialRevision: "1",
    service,
    createId: (): string => `id-${++counter}`,
    getOccurredAt: (): string => "2026-08-30T12:00:00.000Z",
  };
}

describe("useUndoMetalHolding attempt lifecycle", (): void => {
  it("shares concurrent taps and preserves every command ID across same-attempt retry", async (): Promise<void> => {
    const pending = deferredUndo();
    const undo = jest
      .fn<
        ReturnType<UndoMetalHoldingCommandService["undo"]>,
        Parameters<UndoMetalHoldingCommandService["undo"]>
      >()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue({ kind: "committed", holdingId: "holding-1" });
    const input = inputFor({ undo });
    const { result, rerender } = renderHook(
      (props: UseUndoMetalHoldingInput) => useUndoMetalHolding(props),
      { initialProps: input }
    );
    let first: Promise<boolean> = Promise.resolve(false);
    let second: Promise<boolean> = Promise.resolve(false);
    act((): void => {
      first = result.current.submit();
      second = result.current.submit();
    });
    expect(second).toBe(first);
    await act(async (): Promise<void> => {
      pending.reject(new Error("local_commit_failed"));
      await first;
    });
    expect(result.current.error?.message).toBe("local_commit_failed");
    rerender({ ...input });
    await act(async (): Promise<void> => {
      await result.current.retry();
    });
    expect(undo).toHaveBeenCalledTimes(2);
    expect(undo.mock.calls[1]?.[0]).toEqual(undo.mock.calls[0]?.[0]);
    expect(result.current.isCompleted).toBe(true);
  });

  it.each([
    { holdingId: "holding-2" },
    { userId: "user-2" },
    { currentTerminalEventId: "dispose-2" },
    { expectedFinancialRevision: "3" },
  ])(
    "starts fresh command when attempt identity changes: %p",
    async (change: Partial<UseUndoMetalHoldingInput>): Promise<void> => {
      const undo = jest
        .fn<
          ReturnType<UndoMetalHoldingCommandService["undo"]>,
          Parameters<UndoMetalHoldingCommandService["undo"]>
        >()
        .mockResolvedValue({ kind: "committed", holdingId: "holding-1" });
      const input = inputFor({ undo });
      const { result, rerender } = renderHook(
        (props: UseUndoMetalHoldingInput) => useUndoMetalHolding(props),
        { initialProps: input }
      );
      await act(async (): Promise<void> => {
        await result.current.submit();
      });
      rerender({ ...input, ...change });
      expect(result.current.isCompleted).toBe(false);
      await act(async (): Promise<void> => {
        await result.current.retry();
      });
      const previous = undo.mock.calls[0]?.[0];
      const current = undo.mock.calls[1]?.[0];
      expect(current?.actionId).not.toBe(previous?.actionId);
      expect(current).toMatchObject({
        holdingId: change.holdingId ?? input.holdingId,
        userId: change.userId ?? input.userId,
        expectedFinancialRevision:
          change.expectedFinancialRevision ?? input.expectedFinancialRevision,
        predecessorEventId:
          change.currentTerminalEventId ?? input.currentTerminalEventId,
        reversesEventId:
          change.currentTerminalEventId ?? input.currentTerminalEventId,
      });
    }
  );

  it.each(["resolve", "reject"] as const)(
    "suppresses stale %s completion while new target commits",
    async (outcome): Promise<void> => {
      const oldAttempt = deferredUndo();
      const newAttempt = deferredUndo();
      const undo = jest
        .fn<
          ReturnType<UndoMetalHoldingCommandService["undo"]>,
          Parameters<UndoMetalHoldingCommandService["undo"]>
        >()
        .mockReturnValueOnce(oldAttempt.promise)
        .mockReturnValueOnce(newAttempt.promise);
      const input = inputFor({ undo });
      const { result, rerender } = renderHook(
        (props: UseUndoMetalHoldingInput) => useUndoMetalHolding(props),
        { initialProps: input }
      );
      let oldPending: Promise<boolean> = Promise.resolve(false);
      act((): void => {
        oldPending = result.current.submit();
      });
      await act(async (): Promise<void> => {
        await Promise.resolve();
      });
      rerender({ ...input, userId: "user-2", holdingId: "holding-2" });
      expect(result.current.isSubmitting).toBe(false);
      let newPending: Promise<boolean> = Promise.resolve(false);
      act((): void => {
        newPending = result.current.submit();
      });
      await act(async (): Promise<void> => {
        if (outcome === "resolve") oldAttempt.resolve();
        else oldAttempt.reject(new Error("stale_error"));
        expect(await oldPending).toBe(false);
      });
      expect(result.current.isSubmitting).toBe(true);
      expect(result.current.isCompleted).toBe(false);
      expect(result.current.error).toBeNull();
      await act(async (): Promise<void> => {
        newAttempt.resolve();
        expect(await newPending).toBe(true);
      });
      expect(result.current.isCompleted).toBe(true);
    }
  );

  it("cannot replay old command after target becomes Active", async (): Promise<void> => {
    const undo = jest
      .fn<
        ReturnType<UndoMetalHoldingCommandService["undo"]>,
        Parameters<UndoMetalHoldingCommandService["undo"]>
      >()
      .mockResolvedValue({ kind: "committed", holdingId: "holding-1" });
    const input = inputFor({ undo });
    const { result, rerender } = renderHook(
      (props: UseUndoMetalHoldingInput) => useUndoMetalHolding(props),
      { initialProps: input }
    );
    await act(async (): Promise<void> => {
      await result.current.submit();
    });
    rerender({
      ...input,
      status: "active",
      currentTerminalEventId: null,
      expectedFinancialRevision: "2",
    });
    await act(async (): Promise<void> => {
      expect(await result.current.retry()).toBe(false);
    });
    expect(result.current.error?.message).toBe(
      "metal_undo_terminal_holding_required"
    );
    expect(undo).toHaveBeenCalledTimes(1);
    expect(result.current.isCompleted).toBe(false);
  });

  it("does not revive old completion when the same identity returns after a user switch", async (): Promise<void> => {
    const undo = jest
      .fn<
        ReturnType<UndoMetalHoldingCommandService["undo"]>,
        Parameters<UndoMetalHoldingCommandService["undo"]>
      >()
      .mockResolvedValue({ kind: "committed", holdingId: "holding-1" });
    const input = inputFor({ undo });
    const { result, rerender } = renderHook(
      (props: UseUndoMetalHoldingInput) => useUndoMetalHolding(props),
      { initialProps: input }
    );
    await act(async (): Promise<void> => {
      await result.current.submit();
    });
    rerender({ ...input, userId: "user-2" });
    rerender(input);
    expect(result.current.isCompleted).toBe(false);
    await act(async (): Promise<void> => {
      await result.current.submit();
    });
    expect(undo.mock.calls[1]?.[0].actionId).not.toBe(
      undo.mock.calls[0]?.[0].actionId
    );
  });

  it("suppresses completion after unmount", async (): Promise<void> => {
    const pending = deferredUndo();
    const input = inputFor({
      undo: (): ReturnType<UndoMetalHoldingCommandService["undo"]> =>
        pending.promise,
    });
    const { result, unmount } = renderHook(() => useUndoMetalHolding(input));
    let submitted: Promise<boolean> = Promise.resolve(false);
    act((): void => {
      submitted = result.current.submit();
    });
    unmount();
    pending.resolve();
    expect(await submitted).toBe(false);
  });

  it("aligns actionEvidenceId and lifecycleEventId with canonical actionId to prevent duplicate rows on pull", async (): Promise<void> => {
    const undo = jest
      .fn<
        ReturnType<UndoMetalHoldingCommandService["undo"]>,
        Parameters<UndoMetalHoldingCommandService["undo"]>
      >()
      .mockResolvedValue({ kind: "committed", holdingId: "holding-1" });
    const input = inputFor({ undo });
    const { result } = renderHook(() => useUndoMetalHolding(input));

    await act(async (): Promise<void> => {
      await result.current.submit();
    });

    expect(undo).toHaveBeenCalledTimes(1);
    const command = undo.mock.calls[0]?.[0];
    expect(command).toBeDefined();
    expect(command?.actionId).toBeDefined();
    expect(command?.actionEvidenceId).toBe(command?.actionId);
    expect(command?.lifecycleEventId).toBe(command?.actionId);
  });
});
