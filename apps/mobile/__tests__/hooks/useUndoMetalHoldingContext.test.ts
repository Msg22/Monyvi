import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useUndoMetalHoldingContext } from "../../hooks/useUndoMetalHoldingContext";
import { getActiveSyncPromise } from "../../services/sync";
import {
  readUndoMetalHoldingContext,
  type UndoMetalHoldingContext,
} from "../../services/undo-metal-holding-command-service";

let mockUserId: string | null = "user-1";
let mockIsResolvingUser = false;
jest.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({
    userId: mockUserId,
    isResolvingUser: mockIsResolvingUser,
  }),
}));
jest.mock("@/providers/DatabaseProvider", () => ({
  useDatabase: (): object => mockDatabase,
}));
jest.mock("@/services/user-data-access", () => ({
  getCurrentUserDataScope: jest.fn(),
}));
jest.mock("@/services/undo-metal-holding-command-service", () => ({
  readUndoMetalHoldingContext: jest.fn(),
}));
jest.mock("@/services/sync", () => ({
  getActiveSyncPromise: jest.fn(),
}));
const mockDatabase = {};
const readContext = jest.mocked(readUndoMetalHoldingContext);
const activeSync = jest.mocked(getActiveSyncPromise);
const CONTEXT: UndoMetalHoldingContext = {
  holdingId: "holding-1",
  userId: "user-1",
  terminalKind: "dispose",
  terminalEventId: "dispose-1",
  expectedFinancialRevision: "1",
};

beforeEach((): void => {
  jest.clearAllMocks();
  mockUserId = "user-1";
  mockIsResolvingUser = false;
  readContext.mockResolvedValue(CONTEXT);
  activeSync.mockReturnValue(null);
});

describe("Restore context facade", (): void => {
  it("loads current owned terminal token, then clears it when user changes", async (): Promise<void> => {
    const { result, rerender } = renderHook(() =>
      useUndoMetalHoldingContext("holding-1", "dispose-1")
    );
    await waitFor((): void => expect(result.current.context).toEqual(CONTEXT));
    mockUserId = null;
    rerender(undefined);
    expect(result.current.context).toBeNull();
    expect(readContext).toHaveBeenCalledTimes(1);
  });

  it("does not query while auth resolves or holding is Active", (): void => {
    mockIsResolvingUser = true;
    const { result, rerender } = renderHook(
      (terminal: string | null) =>
        useUndoMetalHoldingContext("holding-1", terminal),
      { initialProps: "dispose-1" }
    );
    expect(result.current.context).toBeNull();
    mockIsResolvingUser = false;
    rerender(null);
    expect(readContext).not.toHaveBeenCalled();
  });

  it("shows read failures and retries without any financial command", async (): Promise<void> => {
    readContext.mockRejectedValueOnce(new Error("read_failed"));
    const { result } = renderHook(() =>
      useUndoMetalHoldingContext("holding-1", "dispose-1")
    );
    await waitFor((): void =>
      expect(result.current.error?.message).toBe("read_failed")
    );
    act((): void => result.current.retry());
    await waitFor((): void => expect(result.current.context).toEqual(CONTEXT));
    expect(readContext).toHaveBeenCalledTimes(2);
  });

  it("ignores pending context after current terminal changes", async (): Promise<void> => {
    let resolveOld: (context: UndoMetalHoldingContext) => void = (): void => {
      throw new Error("missing_resolver");
    };
    readContext.mockReturnValueOnce(
      new Promise<UndoMetalHoldingContext>((resolve): void => {
        resolveOld = resolve;
      })
    );
    const next = {
      ...CONTEXT,
      terminalEventId: "dispose-2",
      expectedFinancialRevision: "3",
    };
    readContext.mockResolvedValueOnce(next);
    const { result, rerender } = renderHook(
      (terminal: string) => useUndoMetalHoldingContext("holding-1", terminal),
      { initialProps: "dispose-1" }
    );
    rerender("dispose-2");
    await waitFor((): void => expect(result.current.context).toEqual(next));
    await act(async (): Promise<void> => {
      resolveOld(CONTEXT);
      await Promise.resolve();
    });
    expect(result.current.context).toEqual(next);
  });

  it("waits for explicit Detail Retry sync before refreshing terminal eligibility", async (): Promise<void> => {
    let finishSync: () => void = (): void => {
      throw new Error("missing_sync_resolver");
    };
    const pendingSync = new Promise<void>((resolve): void => {
      finishSync = resolve;
    });
    activeSync.mockReturnValue(pendingSync);
    readContext.mockRejectedValueOnce(new Error("missing_terminal_evidence"));
    const { result } = renderHook(() =>
      useUndoMetalHoldingContext("holding-1", "dispose-1")
    );
    await waitFor((): void =>
      expect(result.current.error?.message).toBe("missing_terminal_evidence")
    );

    act((): void => result.current.retryAfterSync());
    expect(result.current.isLoading).toBe(true);
    expect(readContext).toHaveBeenCalledTimes(1);
    expect(activeSync).toHaveBeenCalledTimes(1);

    await act(async (): Promise<void> => {
      finishSync();
      await pendingSync;
    });
    await waitFor((): void => expect(result.current.context).toEqual(CONTEXT));
    expect(readContext).toHaveBeenCalledTimes(2);
  });

  it("keeps an offline pull failure retryable and never enters an automatic sync loop", async (): Promise<void> => {
    let rejectSync: (error: Error) => void = (): void => {
      throw new Error("missing_sync_rejector");
    };
    const pendingSync = new Promise<void>((_resolve, reject): void => {
      rejectSync = reject;
    });
    activeSync.mockReturnValue(pendingSync);
    readContext
      .mockRejectedValueOnce(new Error("missing_terminal_evidence"))
      .mockRejectedValueOnce(new Error("still_missing"));
    const { result } = renderHook(() =>
      useUndoMetalHoldingContext("holding-1", "dispose-1")
    );
    await waitFor((): void =>
      expect(result.current.error?.message).toBe("missing_terminal_evidence")
    );
    act((): void => result.current.retryAfterSync());
    await act(async (): Promise<void> => {
      rejectSync(new Error("offline"));
      await Promise.resolve();
    });
    await waitFor((): void =>
      expect(result.current.error?.message).toBe("still_missing")
    );
    expect(activeSync).toHaveBeenCalledTimes(1);
    expect(readContext).toHaveBeenCalledTimes(2);
  });

  it("does not deliver previous user's sync response after an auth switch", async (): Promise<void> => {
    let finishSync: () => void = (): void => {
      throw new Error("missing_sync_resolver");
    };
    const pendingSync = new Promise<void>((resolve): void => {
      finishSync = resolve;
    });
    activeSync.mockReturnValue(pendingSync);
    const { result, rerender } = renderHook(() =>
      useUndoMetalHoldingContext("holding-1", "dispose-1")
    );
    await waitFor((): void => expect(result.current.context).toEqual(CONTEXT));
    act((): void => result.current.retryAfterSync());

    readContext.mockResolvedValueOnce({ ...CONTEXT, userId: "user-2" });
    mockUserId = "user-2";
    rerender(undefined);
    await waitFor((): void =>
      expect(result.current.context?.userId).toBe("user-2")
    );

    await act(async (): Promise<void> => {
      finishSync();
      await pendingSync;
    });
    expect(result.current.context?.userId).toBe("user-2");
    expect(readContext).toHaveBeenCalledTimes(2);
  });

  it("does not reread on a completed pull after unmount", async (): Promise<void> => {
    let finishSync: () => void = (): void => {
      throw new Error("missing_sync_resolver");
    };
    const pendingSync = new Promise<void>((resolve): void => {
      finishSync = resolve;
    });
    activeSync.mockReturnValue(pendingSync);
    const { result, unmount } = renderHook(() =>
      useUndoMetalHoldingContext("holding-1", "dispose-1")
    );
    await waitFor((): void => expect(result.current.context).toEqual(CONTEXT));
    act((): void => result.current.retryAfterSync());
    unmount();
    await act(async (): Promise<void> => {
      finishSync();
      await pendingSync;
    });
    expect(readContext).toHaveBeenCalledTimes(1);
  });
});
