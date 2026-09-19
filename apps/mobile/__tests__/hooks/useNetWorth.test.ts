jest.mock("../../hooks/useMetalPortfolio", () => ({
  useMetalPortfolio: (): unknown => ({
    wealthBreakdown: {
      totalNetWorthDecimal: "2500",
      totalNetWorthUsdDecimal: "50",
      metals: { amountDecimal: "1000" },
    },
    isSummaryLoading: false,
    error: null,
    refresh: jest.fn(),
  }),
}));

import { act, renderHook, waitFor } from "@testing-library/react-native";
import type {
  Account,
  Asset,
  AssetMetal,
  DailySnapshotNetWorth,
} from "@monyvi/db";

const mockLoggerError = jest.fn();
const mockObserveNetWorthAccounts = jest.fn();
const mockObserveNetWorthAssets = jest.fn();
const mockObserveNetWorthAssetMetals = jest.fn();
const mockObserveNetWorthSnapshots = jest.fn();
const mockBuildNetWorthReadModel = jest.fn();
const mockBuildMonthlyPercentageChange = jest.fn();

let mockUserId: string | null = "user-1";
let mockIsResolvingUser = false;

interface MockObserver<T> {
  readonly next: (result: T[]) => void;
  readonly error: (err: unknown) => void;
}

interface MockQuery<T> {
  readonly observe: jest.Mock<{
    readonly subscribe: jest.Mock<
      { readonly unsubscribe: jest.Mock },
      [MockObserver<T>]
    >;
  }>;
  readonly observeWithColumns: jest.Mock<{
    readonly subscribe: jest.Mock<
      { readonly unsubscribe: jest.Mock },
      [MockObserver<T>]
    >;
  }>;
  readonly observerRef: { current: MockObserver<T> | null };
  readonly unsubscribe: jest.Mock;
}

function createQuery<T>(): MockQuery<T> {
  const observerRef: { current: MockObserver<T> | null } = { current: null };
  const unsubscribe = jest.fn();
  const subscribe = jest.fn((observer: MockObserver<T>) => {
    observerRef.current = observer;
    return { unsubscribe };
  });

  return {
    observerRef,
    unsubscribe,
    observe: jest.fn(() => ({ subscribe })),
    observeWithColumns: jest.fn(() => ({ subscribe })),
  };
}

const accountsQuery = createQuery<Account>();
const assetsQuery = createQuery<Asset>();
const assetMetalsQuery = createQuery<AssetMetal>();
const snapshotsQuery = createQuery<DailySnapshotNetWorth>();
const netWorthModel = {
  totalNetWorth: 2500,
  totalNetWorthUsd: 50,
  totalAccounts: 1500,
  totalAssets: 1000,
};

jest.mock("@/services/net-worth-read-model-service", () => ({
  buildMonthlyPercentageChange: (...args: readonly unknown[]): unknown =>
    mockBuildMonthlyPercentageChange(...args),
  buildNetWorthReadModel: (...args: readonly unknown[]): unknown =>
    mockBuildNetWorthReadModel(...args),
  observeNetWorthAccounts: (...args: readonly unknown[]): unknown =>
    mockObserveNetWorthAccounts(...args),
  observeNetWorthAssetMetals: (...args: readonly unknown[]): unknown =>
    mockObserveNetWorthAssetMetals(...args),
  observeNetWorthAssets: (...args: readonly unknown[]): unknown =>
    mockObserveNetWorthAssets(...args),
  observeNetWorthSnapshots: (...args: readonly unknown[]): unknown =>
    mockObserveNetWorthSnapshots(...args),
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    error: (...args: readonly unknown[]): void => {
      mockLoggerError(...args);
    },
  },
}));

const mockSelectedSnapshot = { snapshotId: "snapshot-1" };

jest.mock("../../hooks/useMarketRates", () => ({
  useMarketRates: (): {
    selectedSnapshot: typeof mockSelectedSnapshot;
    isLoading: boolean;
    isCurrentLoading: boolean;
  } => ({
    selectedSnapshot: mockSelectedSnapshot,
    isLoading: false,
    isCurrentLoading: false,
  }),
}));

jest.mock("../../hooks/usePreferredCurrency", () => ({
  usePreferredCurrency: (): { preferredCurrency: "USD" } => ({
    preferredCurrency: "USD",
  }),
}));

jest.mock("../../hooks/useCurrentUser", () => ({
  useCurrentUser: (): { userId: string | null; isResolvingUser: boolean } => ({
    userId: mockUserId,
    isResolvingUser: mockIsResolvingUser,
  }),
  runUserScopedEffect: ({
    userId,
    isResolvingUser,
    onResolving,
    onSignedOut,
    onAuthenticated,
  }: {
    readonly userId: string | null;
    readonly isResolvingUser: boolean;
    readonly onResolving: () => void;
    readonly onSignedOut: () => void;
    readonly onAuthenticated: (userId: string) => void | (() => void);
  }): void | (() => void) => {
    if (isResolvingUser) {
      onResolving();
      return;
    }
    if (!userId) {
      onSignedOut();
      return;
    }
    return onAuthenticated(userId);
  },
}));

// eslint-disable-next-line import/first
import {
  useMonthlyPercentageChange,
  useNetWorth,
} from "../../hooks/useNetWorth";

beforeEach(() => {
  jest.clearAllMocks();
  mockUserId = "user-1";
  mockIsResolvingUser = false;
  mockObserveNetWorthAccounts.mockReturnValue(accountsQuery);
  mockObserveNetWorthAssets.mockReturnValue(assetsQuery);
  mockObserveNetWorthAssetMetals.mockReturnValue(assetMetalsQuery);
  mockObserveNetWorthSnapshots.mockReturnValue(snapshotsQuery);
  mockBuildNetWorthReadModel.mockReturnValue(netWorthModel);
  mockBuildMonthlyPercentageChange.mockReturnValue(12.5);
});

describe("useNetWorth", () => {
  it("reads scoped accounts and delegates effective ownership to the portfolio", async () => {
    const { result } = renderHook(() => useNetWorth());
    act(() =>
      accountsQuery.observerRef.current?.next([
        { id: "account-1" } as unknown as Account,
      ])
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockObserveNetWorthAccounts).toHaveBeenCalledWith("user-1");
    expect(mockObserveNetWorthAssets).not.toHaveBeenCalled();
    expect(mockObserveNetWorthAssetMetals).not.toHaveBeenCalled();
    expect(mockBuildNetWorthReadModel).toHaveBeenCalledWith({
      accounts: [{ id: "account-1" }],
      assetMetals: [],
      currentSnapshot: mockSelectedSnapshot,
      preferredCurrency: "USD",
    });
    expect(result.current).toMatchObject(netWorthModel);
  });

  it("does not query or expose totals while resolving or signed out", () => {
    mockIsResolvingUser = true;
    const { result, rerender } = renderHook(() => useNetWorth());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.totalNetWorth).toBeNull();
    expect(mockObserveNetWorthAccounts).not.toHaveBeenCalled();
    mockIsResolvingUser = false;
    mockUserId = null;
    rerender(undefined);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.totalNetWorth).toBeNull();
  });

  it("settles empty account reads and preserves explicit observer failure", async () => {
    const { result } = renderHook(() => useNetWorth());
    act(() => accountsQuery.observerRef.current?.next([]));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const error = new Error("accounts failed");
    act(() => accountsQuery.observerRef.current?.error(error));
    expect(result.current.error).toBe(error);
    expect(result.current.totalNetWorth).toBeNull();
    expect(result.current.totalAccounts).toBeNull();
  });

  it("hides the previous user's accounts immediately on identity change", async () => {
    const { result, rerender } = renderHook(() => useNetWorth());
    act(() => accountsQuery.observerRef.current?.next([]));
    await waitFor(() => expect(result.current.totalNetWorth).toBe(2500));
    mockUserId = "user-2";
    rerender(undefined);
    expect(result.current.totalNetWorth).toBeNull();
    expect(result.current.totalAccounts).toBeNull();
  });
});

describe("useMonthlyPercentageChange", () => {
  it("subscribes through the snapshot read-model service", async () => {
    const { result } = renderHook(() => useMonthlyPercentageChange());

    act(() => {
      snapshotsQuery.observerRef.current?.next([
        { id: "snapshot-1" } as unknown as DailySnapshotNetWorth,
      ]);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockObserveNetWorthSnapshots).toHaveBeenCalledWith("user-1");
    expect(mockBuildMonthlyPercentageChange).toHaveBeenCalledWith([
      { id: "snapshot-1" },
    ]);
    expect(result.current.monthlyPercentageChange).toBe(12.5);
  });
});
