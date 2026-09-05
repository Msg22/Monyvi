import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { CurrencyType, Transaction } from "@monyvi/db";

const mockLoggerError = jest.fn();
let mockUserId: string | null = "user-1";
let mockIsResolvingUser = false;

interface MockObserver {
  readonly next: (records: Transaction[]) => void;
  readonly error: (error: unknown) => void;
}

const observerRef: { current: MockObserver | null } = { current: null };
const unsubscribe = jest.fn();
const mockObserveStatsCurrencyTransactions = jest.fn((_input: unknown) => ({
  observe: () => ({
    subscribe: (observer: MockObserver) => {
      observerRef.current = observer;
      return { unsubscribe };
    },
  }),
}));

function mockBuildStatsCurrencies(
  transactions: readonly Transaction[],
  preferredCurrency: CurrencyType
): CurrencyType[] {
  const currencies = Array.from(
    new Set(transactions.map((transaction) => transaction.currency))
  ).sort();

  return currencies.includes(preferredCurrency)
    ? [
        preferredCurrency,
        ...currencies.filter((currency) => currency !== preferredCurrency),
      ]
    : currencies;
}

jest.mock("@/services/analytics-read-model-service", () => ({
  observeStatsCurrencyTransactions: (input: unknown): unknown =>
    mockObserveStatsCurrencyTransactions(input),
  buildStatsCurrencies: (
    transactions: readonly Transaction[],
    preferredCurrency: CurrencyType
  ): CurrencyType[] => mockBuildStatsCurrencies(transactions, preferredCurrency),
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    error: (...args: readonly unknown[]): void => {
      mockLoggerError(...args);
    },
  },
}));

jest.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: (): { userId: string | null; isResolvingUser: boolean } => ({
    userId: mockUserId,
    isResolvingUser: mockIsResolvingUser,
  }),
}));

import { useStatsCurrencyFilter } from "@/hooks/useStatsCurrencyFilter";

function transaction(currency: CurrencyType): Transaction {
  return { currency } as unknown as Transaction;
}

describe("useStatsCurrencyFilter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    observerRef.current = null;
    mockUserId = "user-1";
    mockIsResolvingUser = false;
  });

  it("selects the preferred currency when it exists in transaction data", async () => {
    const { result } = renderHook(() => useStatsCurrencyFilter("EGP"));

    act(() => {
      observerRef.current?.next([
        transaction("USD"),
        transaction("EGP"),
        transaction("EUR"),
      ]);
    });

    await waitFor(() => {
      expect(result.current.availableCurrencies).toEqual(["EGP", "EUR", "USD"]);
      expect(result.current.selectedCurrency).toBe("EGP");
      expect(result.current.isLoading).toBe(false);
    });
  });

  it("falls back to the first available transaction currency when preferred is absent", async () => {
    const { result } = renderHook(() => useStatsCurrencyFilter("EGP"));

    act(() => {
      observerRef.current?.next([transaction("USD"), transaction("EUR")]);
    });

    await waitFor(() => {
      expect(result.current.availableCurrencies).toEqual(["EUR", "USD"]);
      expect(result.current.selectedCurrency).toBe("EUR");
    });
  });

  it("lets the user switch only to an available transaction currency", async () => {
    const { result } = renderHook(() => useStatsCurrencyFilter("EGP"));

    act(() => {
      observerRef.current?.next([transaction("EGP"), transaction("USD")]);
    });

    await waitFor(() => {
      expect(result.current.availableCurrencies).toEqual(["EGP", "USD"]);
    });

    act(() => {
      result.current.selectCurrency("USD");
    });
    expect(result.current.selectedCurrency).toBe("USD");

    act(() => {
      result.current.selectCurrency("EUR");
    });
    expect(result.current.selectedCurrency).toBe("USD");
  });

  it("keeps preferred currency as the empty-state selection when there are no transactions", async () => {
    const { result } = renderHook(() => useStatsCurrencyFilter("EGP"));

    act(() => {
      observerRef.current?.next([]);
    });

    await waitFor(() => {
      expect(result.current.availableCurrencies).toEqual([]);
      expect(result.current.selectedCurrency).toBe("EGP");
      expect(result.current.isLoading).toBe(false);
    });
  });

  it("stays disabled while resolving and does not subscribe while signed out", async () => {
    mockIsResolvingUser = true;
    const resolving = renderHook(() => useStatsCurrencyFilter("EGP"));

    expect(resolving.result.current.isLoading).toBe(true);
    expect(mockObserveStatsCurrencyTransactions).not.toHaveBeenCalled();
    resolving.unmount();

    mockIsResolvingUser = false;
    mockUserId = null;
    const signedOut = renderHook(() => useStatsCurrencyFilter("EGP"));

    await waitFor(() => {
      expect(signedOut.result.current.isLoading).toBe(false);
    });
    expect(mockObserveStatsCurrencyTransactions).not.toHaveBeenCalled();
  });

  it("surfaces observation failures", async () => {
    const error = new Error("currency options failed");
    const { result } = renderHook(() => useStatsCurrencyFilter("EGP"));

    act(() => {
      observerRef.current?.error(error);
    });

    await waitFor(() => {
      expect(result.current.error).toBe(error);
      expect(result.current.isLoading).toBe(false);
    });
    expect(mockLoggerError).toHaveBeenCalledWith(
      "stats.currencyOptions.observe.failed",
      error
    );
  });
});
