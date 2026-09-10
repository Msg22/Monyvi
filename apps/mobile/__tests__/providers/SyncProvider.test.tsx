/**
 * @file SyncProvider.test.tsx
 * @description Tests the authenticated startup/profile sync gate. Market-rate
 * availability is intentionally screen-level and must not block routing.
 */

import { act, render, waitFor } from "@testing-library/react-native";
import React from "react";

const mockSyncDatabase = jest.fn<Promise<void>, [unknown, boolean?]>();
const mockCheckIsAuthenticated = jest.fn<Promise<boolean>, []>();
const mockFetchProfileCount = jest.fn<Promise<number>, []>();
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

jest.mock("@/services/sync", () => ({
  syncDatabase: (database: unknown, forceFullSync?: boolean): Promise<void> =>
    mockSyncDatabase(database, forceFullSync),
}));

jest.mock("@/services/supabase", () => ({
  isAuthenticated: (): Promise<boolean> => mockCheckIsAuthenticated(),
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
  },
}));

jest.mock("@/services/user-data-access", () => ({
  queryOwned: (): {
    readonly fetchCount: () => Promise<number>;
  } => ({ fetchCount: mockFetchProfileCount }),
}));

import { SyncProvider, useSync } from "../../providers/SyncProvider";
import type { InitialSyncFailureReason } from "../../utils/routing-decision";

interface SyncContextSnapshot {
  readonly initialSyncState: string;
  readonly initialSyncFailureReason: InitialSyncFailureReason;
  readonly retryInitialSync: () => Promise<string>;
}

interface CaptureResult {
  read(): SyncContextSnapshot;
  unmount(): void;
}

function renderAndCapture(): CaptureResult {
  let current: SyncContextSnapshot | null = null;

  function CaptureComponent(): null {
    const { initialSyncState, initialSyncFailureReason, retryInitialSync } =
      useSync();
    current = {
      initialSyncState,
      initialSyncFailureReason,
      retryInitialSync,
    };
    return null;
  }

  const renderer = render(
    <SyncProvider>
      <CaptureComponent />
    </SyncProvider>
  );

  return {
    read(): SyncContextSnapshot {
      if (current === null) {
        throw new Error("sync context has not rendered");
      }
      return current;
    },
    unmount: renderer.unmount,
  };
}

describe("SyncProvider initialSyncState", () => {
  let lastUnmount: (() => void) | null = null;

  beforeEach((): void => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockCheckIsAuthenticated.mockResolvedValue(true);
    mockFetchProfileCount.mockResolvedValue(0);
    mockSyncDatabase.mockResolvedValue(undefined);
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      user: { id: "current-user" },
    });
    mockDbGet.mockImplementation((table: string) => {
      if (table !== "profiles") {
        throw new Error(
          `authenticated startup queried unrelated table ${table}`
        );
      }
      return { table };
    });
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
    capture: CaptureResult,
    expectedState: string
  ): Promise<void> {
    await waitFor(() =>
      expect(capture.read().initialSyncState).toBe(expectedState)
    );
  }

  it('starts with initialSyncState "in-progress"', (): void => {
    mockFetchProfileCount.mockReturnValue(new Promise(() => undefined));
    mockSyncDatabase.mockReturnValue(new Promise(() => undefined));
    const capture = renderAndCapture();
    lastUnmount = () => capture.unmount();

    expect(capture.read().initialSyncState).toBe("in-progress");
  });

  it('transitions to "success" when the required profile sync completes', async (): Promise<void> => {
    const capture = renderAndCapture();

    await waitForInitialSyncState(capture, "success");

    expect(mockSyncDatabase).toHaveBeenCalledWith(expect.anything(), true);
    expect(capture.read().initialSyncFailureReason).toBeNull();
  });

  it("checks only the current user's profile before trusting local startup data", async (): Promise<void> => {
    mockFetchProfileCount.mockResolvedValue(1);
    const capture = renderAndCapture();

    await waitForInitialSyncState(capture, "success");

    expect(mockDbGet).toHaveBeenCalledTimes(1);
    expect(mockDbGet).toHaveBeenCalledWith("profiles");
    expect(mockWhere).toHaveBeenCalledWith("deleted", false);
    expect(mockSyncDatabase).toHaveBeenCalledWith(expect.anything(), false);
  });

  it("does not block authenticated startup when no market snapshot is cached", async (): Promise<void> => {
    mockFetchProfileCount.mockResolvedValue(1);
    mockSyncDatabase.mockRejectedValue(new Error("network unavailable"));
    const capture = renderAndCapture();

    await waitForInitialSyncState(capture, "success");

    expect(mockDbGet).not.toHaveBeenCalledWith("market_rates");
    expect(mockDbGet).not.toHaveBeenCalledWith("market_rate_observations");
    expect(mockSyncDatabase).toHaveBeenCalledWith(expect.anything(), false);
    expect(capture.read().initialSyncFailureReason).toBeNull();
  });

  it('transitions to "failed" when auth is true but the user id is missing', async (): Promise<void> => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      user: {},
    });
    const capture = renderAndCapture();

    await waitForInitialSyncState(capture, "failed");

    expect(mockDbGet).not.toHaveBeenCalled();
    expect(mockSyncDatabase).not.toHaveBeenCalled();
    expect(capture.read().initialSyncFailureReason).toBeNull();
  });

  it('transitions to "failed" when required profile sync throws before timeout', async (): Promise<void> => {
    mockSyncDatabase.mockRejectedValue(new Error("network error"));
    const capture = renderAndCapture();

    await waitForInitialSyncState(capture, "failed");

    expect(capture.read().initialSyncFailureReason).toBeNull();
  });

  it('transitions to "timeout" when required profile sync exceeds 20 seconds', async (): Promise<void> => {
    mockSyncDatabase.mockReturnValue(new Promise(() => undefined));
    const capture = renderAndCapture();
    lastUnmount = () => capture.unmount();

    await advancePastInitialSyncTimeout();
    await waitForInitialSyncState(capture, "timeout");

    expect(capture.read().initialSyncFailureReason).toBeNull();
  });

  it("provides retryInitialSync as a callable function", (): void => {
    mockFetchProfileCount.mockReturnValue(new Promise(() => undefined));
    mockSyncDatabase.mockReturnValue(new Promise(() => undefined));
    const capture = renderAndCapture();
    lastUnmount = () => capture.unmount();

    expect(typeof capture.read().retryInitialSync).toBe("function");
  });

  it("retries a failed required profile sync without introducing a market-rate gate", async (): Promise<void> => {
    mockSyncDatabase.mockRejectedValueOnce(new Error("network unavailable"));
    const capture = renderAndCapture();

    await waitForInitialSyncState(capture, "failed");

    mockSyncDatabase.mockResolvedValueOnce(undefined);
    await act(async () => {
      await capture.read().retryInitialSync();
    });

    await waitForInitialSyncState(capture, "success");
    expect(capture.read().initialSyncFailureReason).toBeNull();
    expect(mockDbGet).not.toHaveBeenCalledWith("market_rates");
  });
});
