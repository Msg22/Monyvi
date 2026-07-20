import { act, renderHook, waitFor } from "@testing-library/react-native";

import type { GroupedTransaction } from "@/services/transaction-list-read-model-service";

const mockLoggerError = jest.fn();
const mockGetTransactionListReadModel = jest.fn();
const mockBuildTransactionGroups = jest.fn();
const mockObserveTransactionListInvalidationSources = jest.fn();

let mockUserId: string | null = "user-1";
let mockIsResolvingUser = false;
let mockTotalNetWorth: number | null = 1000;
let mockIsNetWorthLoading = false;

interface MockQuery {
  readonly observeWithColumns: jest.Mock<{
    readonly subscribe: jest.Mock<
      { readonly unsubscribe: jest.Mock },
      [(value: unknown) => void]
    >;
  }>;
  readonly subscriberRef: { current: ((value: unknown) => void) | null };
  readonly unsubscribe: jest.Mock;
}

function createInvalidationQuery(): MockQuery {
  const subscriberRef: { current: ((value: unknown) => void) | null } = {
    current: null,
  };
  const unsubscribe = jest.fn();

  return {
    subscriberRef,
    unsubscribe,
    observeWithColumns: jest.fn(() => ({
      subscribe: jest.fn((subscriber: (value: unknown) => void) => {
        subscriberRef.current = subscriber;
        return { unsubscribe };
      }),
    })),
  };
}

const transactionsQuery = createInvalidationQuery();
const transfersQuery = createInvalidationQuery();
const groupedData: GroupedTransaction[] = [
  {
    title: "May 11 - May 17",
    transactions: [],
    groupNetWorth: 1000,
    groupTotalIncome: 0,
    groupTotalExpense: 100,
  },
];
const readModel = {
  futureTransactions: [],
  displayedItems: [],
};

jest.mock("@/services/transaction-list-read-model-service", () => ({
  TRANSACTION_LIST_TRANSACTION_COLUMNS: [
    "category_id",
    "amount",
    "type",
    "note",
    "counterparty",
    "account_id",
    "date",
    "deleted",
  ],
  TRANSACTION_LIST_TRANSFER_COLUMNS: [
    "amount",
    "from_account_id",
    "to_account_id",
    "notes",
    "date",
    "deleted",
  ],
  buildTransactionGroups: (...args: readonly unknown[]): unknown =>
    mockBuildTransactionGroups(...args),
  getTransactionListReadModel: (...args: readonly unknown[]): unknown =>
    mockGetTransactionListReadModel(...args),
  observeTransactionListInvalidationSources: (
    ...args: readonly unknown[]
  ): unknown => mockObserveTransactionListInvalidationSources(...args),
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    error: (...args: readonly unknown[]): void => {
      mockLoggerError(...args);
    },
  },
}));

jest.mock("../../hooks/useCurrentUser", () => ({
  useCurrentUser: (): { userId: string | null; isResolvingUser: boolean } => ({
    userId: mockUserId,
    isResolvingUser: mockIsResolvingUser,
  }),
}));

jest.mock("../../hooks/useMarketRates", () => ({
  useMarketRates: (): { latestRates: null; isLoading: false } => ({
    latestRates: null,
    isLoading: false,
  }),
}));

jest.mock("../../hooks/useNetWorth", () => ({
  useNetWorth: (): { totalNetWorth: number | null; isLoading: boolean } => ({
    totalNetWorth: mockTotalNetWorth,
    isLoading: mockIsNetWorthLoading,
  }),
}));

jest.mock("../../hooks/usePreferredCurrency", () => ({
  usePreferredCurrency: (): { preferredCurrency: "EGP" } => ({
    preferredCurrency: "EGP",
  }),
}));

import { useTransactionsGrouping } from "@/hooks/useTransactionsGrouping";

describe("useTransactionsGrouping", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = "user-1";
    mockIsResolvingUser = false;
    mockTotalNetWorth = 1000;
    mockIsNetWorthLoading = false;
    mockObserveTransactionListInvalidationSources.mockReturnValue({
      transactionsQuery,
      transfersQuery,
    });
    mockGetTransactionListReadModel.mockResolvedValue(readModel);
    mockBuildTransactionGroups.mockReturnValue(groupedData);
  });

  it("delegates transaction list fetching and grouping to the read-model service", async () => {
    const { result } = renderHook(() =>
      useTransactionsGrouping("this_month", ["Income", "Expense"], "")
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockObserveTransactionListInvalidationSources).toHaveBeenCalledWith({
      userId: "user-1",
      period: "this_month",
    });
    expect(mockGetTransactionListReadModel).toHaveBeenCalledWith({
      userId: "user-1",
      period: "this_month",
      selectedTypes: ["Income", "Expense"],
    });
    expect(mockBuildTransactionGroups).toHaveBeenCalledWith({
      ...readModel,
      totalNetWorth: 1000,
      latestRates: null,
      preferredCurrency: "EGP",
      period: "this_month",
      searchQuery: "",
    });
    expect(result.current.groupedData).toBe(groupedData);
  });

  it("does not query while current user state is resolving or signed out", async () => {
    mockIsResolvingUser = true;
    const { result, rerender } = renderHook(() =>
      useTransactionsGrouping("this_month", ["Income"], "")
    );

    expect(result.current.isLoading).toBe(true);
    expect(mockGetTransactionListReadModel).not.toHaveBeenCalled();

    mockIsResolvingUser = false;
    mockUserId = null;
    rerender(undefined);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(mockGetTransactionListReadModel).not.toHaveBeenCalled();
  });

  it("refetches through the read-model service", async () => {
    const { result } = renderHook(() =>
      useTransactionsGrouping("this_month", ["Expense"], "")
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(mockGetTransactionListReadModel).toHaveBeenCalledTimes(2);
    });
  });

  it("regroups existing read-model data when only search query changes", async () => {
    const { rerender } = renderHook(
      ({ searchQuery }: { readonly searchQuery: string }) =>
        useTransactionsGrouping("this_month", ["Expense"], searchQuery),
      { initialProps: { searchQuery: "" } }
    );

    await waitFor(() => {
      expect(mockGetTransactionListReadModel).toHaveBeenCalledTimes(1);
    });

    rerender({ searchQuery: "rent" });

    await waitFor(() => {
      expect(mockBuildTransactionGroups).toHaveBeenLastCalledWith({
        ...readModel,
        totalNetWorth: 1000,
        latestRates: null,
        preferredCurrency: "EGP",
        period: "this_month",
        searchQuery: "rent",
      });
    });
    expect(mockGetTransactionListReadModel).toHaveBeenCalledTimes(1);
  });

  it("logs read-model failures and resets loading state", async () => {
    const error = new Error("fetch failed");
    mockGetTransactionListReadModel.mockRejectedValueOnce(error);

    const { result } = renderHook(() =>
      useTransactionsGrouping("this_month", ["Expense"], "")
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.groupedData).toEqual([]);
    expect(mockLoggerError).toHaveBeenCalledWith(
      "transactionsGrouping.readModel.failed",
      error
    );
  });
});
