import {
  act,
  renderHook,
  waitFor,
  type RenderHookResult,
} from "@testing-library/react-native";

import {
  useDeleteHoldingCommand,
  type UseDeleteHoldingCommandResult,
} from "../../hooks/useDeleteHoldingCommand";

const mockDelete = jest.fn();
const mockReadToken = jest.fn();
const mockCommit = jest.fn();
const mockDigest = jest.fn();

let mockUuidCounter = 0;
let mockUserId: string | null = "user-1";

jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: (...args: unknown[]): unknown => mockDigest(...args),
  randomUUID: (): string => {
    mockUuidCounter += 1;
    return `test-uuid-${mockUuidCounter}`;
  },
}));

jest.mock("@/providers/DatabaseProvider", () => {
  const stableDatabase: { readonly mock: true } = { mock: true };
  return {
    useDatabase: (): { readonly mock: true } => stableDatabase,
  };
});

jest.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: (): {
    readonly userId: string | null;
    readonly isResolvingUser: boolean;
  } => ({ userId: mockUserId, isResolvingUser: false }),
}));

jest.mock("@/services/delete-metal-holding-concurrency-service", () => ({
  readDeleteHoldingConcurrencyToken: (...args: unknown[]): unknown =>
    mockReadToken(...args),
}));

jest.mock("@/services/delete-metal-holding-command-service", () => ({
  createDeleteMetalHoldingCommandService: (
    ...args: unknown[]
  ): { readonly delete: jest.Mock } => {
    mockCreateService(...args);
    return { delete: mockDelete };
  },
}));

const mockCreateService = jest.fn();

jest.mock("@/services/financial-action-foundation-repository", () => ({
  createFinancialActionFoundationRepository: (): {
    readonly commitFinancialActionGroupLocally: jest.Mock;
  } => ({ commitFinancialActionGroupLocally: mockCommit }),
}));

jest.mock("@/services/user-data-access", () => ({
  assertExpectedCurrentUser: jest.fn(),
  getCurrentUserDataScope: jest.fn(),
}));

describe("useDeleteHoldingCommand", () => {
  beforeEach((): void => {
    mockDelete.mockReset();
    mockReadToken.mockReset();
    mockCreateService.mockClear();
    mockDigest.mockReset();
    mockDigest.mockResolvedValue("hash");
    mockReadToken.mockResolvedValue({
      expectedFinancialRevision: "1",
      predecessorEventId: "event-correction",
    });
    mockUuidCounter = 0;
    mockUserId = "user-1";
  });

  async function renderCommand(
    options: {
      readonly holdingId?: string;
      readonly expectTokenLoad?: boolean;
    } = {}
  ): Promise<RenderHookResult<UseDeleteHoldingCommandResult, unknown>> {
    const { holdingId = "holding-1", expectTokenLoad = true } = options;
    const hook = renderHook(() => useDeleteHoldingCommand(holdingId));
    if (expectTokenLoad) {
      await waitFor(() => {
        expect(mockReadToken).toHaveBeenCalled();
        hook.result.current.input.createCommand({
          actionId: "probe-action",
          actionEvidenceId: "probe-evidence",
          lifecycleEventId: "probe-event",
        });
      });
    }
    return hook;
  }

  it("builds one scoped Delete command from the live concurrency token", async () => {
    const { result } = await renderCommand();

    const command = result.current.input.createCommand({
      actionId: "test-uuid-1",
      actionEvidenceId: "test-uuid-2",
      lifecycleEventId: "test-uuid-3",
    });

    expect(command.ids).toEqual({
      actionId: "test-uuid-1",
      actionEvidenceId: "test-uuid-2",
      lifecycleEventId: "test-uuid-3",
    });
    const input = command.input;
    expect(input.predecessorEventId).toBe("event-correction");
    expect(input.holdingId).toBe("holding-1");
    expect(input.userId).toBe("user-1");
    expect(input.expectedFinancialRevision).toBe("1");
    expect(input.occurredAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );
    expect(input.latestAllowedCalendarDate).toBe(input.occurredAt.slice(0, 10));
  });

  it("supports a predecessor-less revision-zero migrated holding", async () => {
    mockReadToken.mockResolvedValue({
      expectedFinancialRevision: "0",
      predecessorEventId: null,
    });
    const { result } = await renderCommand();

    const command = result.current.input.createCommand({
      actionId: "test-uuid-1",
      actionEvidenceId: "test-uuid-2",
      lifecycleEventId: "test-uuid-3",
    });

    expect(command.input.expectedFinancialRevision).toBe("0");
    expect(command.input.predecessorEventId).toBeNull();
  });

  it("executes through the scoped command service", async () => {
    const { result } = await renderCommand();
    mockDelete.mockResolvedValue({ kind: "committed" });
    const command = result.current.input.createCommand({
      actionId: "test-uuid-1",
      actionEvidenceId: "test-uuid-2",
      lifecycleEventId: "test-uuid-3",
    });

    await act(async (): Promise<void> => {
      await result.current.input.execute(command);
    });

    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledWith(command.input);
  });

  it("generates stable local IDs and hashes through the platform providers", async () => {
    const { result } = await renderCommand();

    expect(result.current.input.createId()).toBe("test-uuid-1");
    const createServiceArgs = mockCreateService.mock
      .calls as Array<readonly [Record<string, unknown>]>;
    const dependencies = createServiceArgs[0][0];
    const hashProvider = dependencies.hashProvider as {
      readonly digestUtf8: (text: string) => Promise<string>;
    };
    await act(async (): Promise<void> => {
      await expect(hashProvider.digestUtf8("canonical")).resolves.toBe("hash");
    });
    expect(mockDigest).toHaveBeenCalledWith("SHA-256", "canonical");
  });

  it("refreshes the concurrency token without rebuilding service wiring", async () => {
    const { result } = await renderCommand();
    mockReadToken.mockClear();

    await act(async (): Promise<void> => {
      await result.current.refreshToken();
    });

    expect(mockReadToken).toHaveBeenCalledTimes(1);
    expect(mockCreateService).toHaveBeenCalledTimes(1);
  });

  it("refuses command construction without a holding identity", async () => {
    const { result } = await renderCommand({
      holdingId: undefined,
      expectTokenLoad: false,
    });

    expect(() =>
      result.current.input.createCommand({
        actionId: "test-uuid-1",
        actionEvidenceId: "test-uuid-2",
        lifecycleEventId: "test-uuid-3",
      })
    ).toThrow("metal_delete_unavailable");
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("refuses command construction while signed out", async () => {
    mockUserId = null;
    const { result } = await renderCommand({ expectTokenLoad: false });

    expect(() =>
      result.current.input.createCommand({
        actionId: "test-uuid-1",
        actionEvidenceId: "test-uuid-2",
        lifecycleEventId: "test-uuid-3",
      })
    ).toThrow("metal_delete_unavailable");
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
