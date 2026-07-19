/**
 * @file SyncProvider.test.tsx
 * @description Unit tests for SyncProvider's initialSyncState and retryInitialSync.
 */

import { act, render, waitFor } from "@testing-library/react-native";
import { MARKET_RATE_MODEL_VALUE_FIELDS } from "@monyvi/logic";
import React from "react";

const mockSyncDatabase = jest.fn();
const mockCheckIsAuthenticated = jest.fn();
const mockFetchProfileCount = jest.fn();
const mockFetchMarketRates = jest.fn();
const mockDbGet = jest.fn();

interface MockAuthState {
  readonly isAuthenticated: boolean;
  readonly user?: { readonly id?: string };
}

const mockUseAuth = jest.fn<MockAuthState, []>(() => ({
  isAuthenticated: true,
  user: { id: "current-user" },
}));
const mockWhere = jest.fn((column: string, value: unknown) => ({
  column,
  value,
}));
const mockSortBy = jest.fn((column: string, order: unknown) => ({
  column,
  order,
}));
const mockTake = jest.fn((count: number) => ({ count }));

jest.mock("@/services/sync", () => ({
  syncDatabase: (...args: unknown[]): Promise<unknown> =>
    mockSyncDatabase(...args) as Promise<unknown>,
}));

jest.mock("@/services/supabase", () => ({
  isAuthenticated: (): Promise<boolean> =>
    mockCheckIsAuthenticated() as Promise<boolean>,
}));

jest.mock("@monyvi/db", () => ({
  database: {
    get: (table: string): unknown => mockDbGet(table),
  },
}));

jest.mock("@/context/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock("@nozbe/watermelondb", () => ({
  Q: {
    where: (column: string, value: unknown): unknown =>
      mockWhere(column, value),
    sortBy: (column: string, order: unknown): unknown =>
      mockSortBy(column, order),
    take: (count: number): unknown => mockTake(count),
    desc: "desc",
  },
}));

import { SyncProvider, useSync } from "../../providers/SyncProvider";

interface SyncContextSnapshot {
  initialSyncState: string;
  initialSyncFailureReason: string | null;
  retryInitialSync: () => Promise<string>;
}

function renderAndCapture(): {
  result: React.MutableRefObject<SyncContextSnapshot>;
  unmount: () => void;
} {
  const resultRef =
    React.createRef() as React.MutableRefObject<SyncContextSnapshot>;

  function CaptureComponent(): null {
    const { initialSyncState, initialSyncFailureReason, retryInitialSync } =
      useSync();
    resultRef.current = {
      initialSyncState,
      initialSyncFailureReason,
      retryInitialSync,
    };
    return null;
  }

  const renderer = render(
    React.createElement(
      SyncProvider,
      null,
      React.createElement(CaptureComponent)
    )
  );

  return { result: resultRef, unmount: renderer.unmount };
}

describe("SyncProvider initialSyncState", () => {
  let lastUnmount: (() => void) | null = null;

  beforeEach((): void => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockCheckIsAuthenticated.mockResolvedValue(true);
    mockFetchProfileCount.mockResolvedValue(0);
    mockFetchMarketRates.mockResolvedValue([
      Object.fromEntries(
        MARKET_RATE_MODEL_VALUE_FIELDS.map((field) => [field, 1])
      ),
    ]);
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      user: { id: "current-user" },
    });
    mockDbGet.mockImplementation((table: string) => ({
      query: jest.fn(() =>
        table === "market_rates"
          ? { fetch: mockFetchMarketRates }
          : { fetchCount: mockFetchProfileCount }
      ),
    }));
  });

  afterEach((): void => {
    lastUnmount?.();
    lastUnmount = null;
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  async function advancePastInitialSyncTimeout(): Promise<void> {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(20_500);
    });
  }

  async function waitForInitialSyncState(
    result: React.MutableRefObject<SyncContextSnapshot>,
    expectedState: string
  ): Promise<void> {
    await waitFor(() =>
      expect(result.current?.initialSyncState).toBe(expectedState)
    );
  }

  it('starts with initialSyncState "in-progress"', (): void => {
    mockFetchProfileCount.mockReturnValue(new Promise(() => {}));
    mockSyncDatabase.mockReturnValue(new Promise(() => {}));
    const { result, unmount } = renderAndCapture();
    lastUnmount = unmount;
    expect(result.current.initialSyncState).toBe("in-progress");
  });

  it('transitions to "success" when sync completes within timeout', async (): Promise<void> => {
    mockSyncDatabase.mockResolvedValue(undefined);
    const { result } = renderAndCapture();

    await waitForInitialSyncState(result, "success");

    expect(result.current.initialSyncState).toBe("success");
  });

  it("checks the current user's profile instead of accounts before trusting local startup data", async (): Promise<void> => {
    mockFetchProfileCount.mockResolvedValue(1);
    mockSyncDatabase.mockResolvedValue(undefined);
    const { result } = renderAndCapture();

    await waitForInitialSyncState(result, "success");

    expect(mockDbGet).toHaveBeenCalledWith("profiles");
    expect(mockDbGet).toHaveBeenCalledWith("market_rates");
    expect(mockWhere).toHaveBeenCalledWith("user_id", "current-user");
    expect(mockWhere).toHaveBeenCalledWith("deleted", false);
    expect(mockSyncDatabase).toHaveBeenCalledWith(expect.anything(), false);
    expect(result.current.initialSyncState).toBe("success");
  });

  it("forces the blocking startup sync when the profile exists but cached market rates are missing", async (): Promise<void> => {
    mockFetchProfileCount.mockResolvedValue(1);
    mockFetchMarketRates.mockResolvedValue([]);
    mockSyncDatabase.mockResolvedValue(undefined);
    const { result } = renderAndCapture();

    await waitForInitialSyncState(result, "success");

    expect(mockSyncDatabase).toHaveBeenCalledWith(expect.anything(), true);
    expect(result.current.initialSyncState).toBe("success");
    expect(result.current.initialSyncFailureReason).toBeNull();
  });

  it("preserves a typed market-rate failure when required local rates are missing offline", async (): Promise<void> => {
    mockFetchProfileCount.mockResolvedValue(1);
    mockFetchMarketRates.mockResolvedValue([]);
    mockSyncDatabase.mockRejectedValue(new Error("Network unavailable"));
    const { result } = renderAndCapture();

    await waitForInitialSyncState(result, "failed");

    expect(result.current.initialSyncFailureReason).toBe(
      "market-rates-unavailable"
    );
  });

  it("allows offline startup when both the profile and a cached rate exist", async (): Promise<void> => {
    mockFetchProfileCount.mockResolvedValue(1);
    mockSyncDatabase.mockRejectedValue(new Error("Network unavailable"));
    const { result } = renderAndCapture();

    await waitForInitialSyncState(result, "success");

    expect(mockSyncDatabase).toHaveBeenCalledWith(expect.anything(), false);
    expect(result.current.initialSyncState).toBe("success");
    expect(result.current.initialSyncFailureReason).toBeNull();
  });

  it("forces the blocking startup sync when the cached market rate is invalid", async (): Promise<void> => {
    const validRate = Object.fromEntries(
      MARKET_RATE_MODEL_VALUE_FIELDS.map((field) => [field, 1])
    );
    mockFetchProfileCount.mockResolvedValue(1);
    mockFetchMarketRates.mockResolvedValue([
      { ...validRate, goldUsdPerGram: 0 },
    ]);
    mockSyncDatabase.mockResolvedValue(undefined);
    const { result } = renderAndCapture();

    await waitForInitialSyncState(result, "success");

    expect(mockSyncDatabase).toHaveBeenCalledWith(expect.anything(), true);
  });

  it('transitions to "failed" when auth is true but the user id is missing', async (): Promise<void> => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      user: {},
    });
    mockSyncDatabase.mockResolvedValue(undefined);
    const { result } = renderAndCapture();

    await waitForInitialSyncState(result, "failed");

    expect(mockDbGet).not.toHaveBeenCalledWith("profiles");
    expect(mockSyncDatabase).not.toHaveBeenCalled();
    expect(result.current.initialSyncState).toBe("failed");
  });

  it('transitions to "failed" when sync throws before timeout', async (): Promise<void> => {
    mockSyncDatabase.mockRejectedValue(new Error("Network error"));
    const { result } = renderAndCapture();

    await waitForInitialSyncState(result, "failed");

    expect(result.current.initialSyncState).toBe("failed");
  });

  it('transitions to "timeout" when sync takes longer than 20 seconds', async (): Promise<void> => {
    mockSyncDatabase.mockReturnValue(new Promise(() => {}));
    const { result, unmount } = renderAndCapture();
    lastUnmount = unmount;

    await advancePastInitialSyncTimeout();
    await waitForInitialSyncState(result, "timeout");

    expect(result.current.initialSyncState).toBe("timeout");
  });

  it("provides retryInitialSync as a callable function", (): void => {
    mockFetchProfileCount.mockReturnValue(new Promise(() => {}));
    mockSyncDatabase.mockReturnValue(new Promise(() => {}));
    const { result, unmount } = renderAndCapture();
    lastUnmount = unmount;
    expect(typeof result.current.retryInitialSync).toBe("function");
  });

  it("keeps the market-rate failure reason during retry and clears it after recovery", async (): Promise<void> => {
    mockFetchProfileCount.mockResolvedValue(1);
    mockFetchMarketRates.mockResolvedValue([]);
    mockSyncDatabase.mockRejectedValueOnce(new Error("Network unavailable"));
    const { result } = renderAndCapture();

    await waitForInitialSyncState(result, "failed");
    expect(result.current.initialSyncFailureReason).toBe(
      "market-rates-unavailable"
    );

    mockSyncDatabase.mockResolvedValueOnce(undefined);
    await act(async () => {
      await result.current.retryInitialSync();
    });

    await waitForInitialSyncState(result, "success");
    expect(result.current.initialSyncFailureReason).toBeNull();
  });
});
