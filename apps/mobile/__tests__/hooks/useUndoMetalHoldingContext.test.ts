import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useUndoMetalHoldingContext } from "../../hooks/useUndoMetalHoldingContext";
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
const mockDatabase = {};
const readContext = jest.mocked(readUndoMetalHoldingContext);
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
});
