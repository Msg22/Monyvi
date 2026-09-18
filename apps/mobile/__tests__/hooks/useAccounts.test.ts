/**
 * useAccounts hook tests
 *
 * Focuses on the bank-account observer contract from PR #548 review:
 * balance/default/name edits on existing bank accounts must emit, and
 * successful emissions from either subscription must clear a stale observer error.
 */

import React from "react";

interface ReactTestRendererInstance {
  unmount: () => void;
}

interface ReactTestRendererAct {
  (callback: () => Promise<void>): Promise<void>;
  (callback: () => void): void;
}

interface ReactTestRendererModule {
  act: ReactTestRendererAct;
  create: (element: React.ReactElement) => ReactTestRendererInstance;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
const RTR: ReactTestRendererModule = require("react-test-renderer");

interface MockSubscription {
  readonly unsubscribe: jest.Mock;
}

interface MockObserver<T> {
  readonly next: (result: readonly T[]) => void;
  readonly error: (err: unknown) => void;
}

interface MockObservable<T> {
  readonly subscribe: jest.Mock<MockSubscription, [MockObserver<T>]>;
}

interface MockQuery<T> {
  readonly observe: jest.Mock<MockObservable<T>, []>;
  readonly observeWithColumns: jest.Mock<
    MockObservable<T>,
    [readonly string[]]
  >;
}

interface MockCollection<T> {
  readonly query: jest.Mock<MockQuery<T>, unknown[]>;
}

interface MockAccount {
  readonly id: string;
  readonly name: string;
  readonly userId: string;
}

interface MockBankDetails {
  readonly accountId: string;
  readonly bankName: string;
}

interface UseBankAccountsResult {
  readonly bankAccounts: ReadonlyArray<{
    readonly account: MockAccount;
    readonly bankDetails: MockBankDetails | undefined;
  }>;
  readonly isLoading: boolean;
  readonly error: Error | null;
}

interface UseAccountsResult {
  readonly accounts: readonly MockAccount[];
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly totalAccountsBalance: number;
  readonly refetch: () => void;
}

const mockAccountObservers: Array<MockObserver<MockAccount>> = [];
const mockBankDetailsObservers: Array<MockObserver<MockBankDetails>> = [];
const mockAccountsObserve = jest.fn<MockObservable<MockAccount>, []>();
const mockAccountsObserveWithColumns = jest.fn<
  MockObservable<MockAccount>,
  [readonly string[]]
>();
const mockBankDetailsObserve = jest.fn<MockObservable<MockBankDetails>, []>();
const mockBankDetailsObserveWithColumns = jest.fn<
  MockObservable<MockBankDetails>,
  [readonly string[]]
>();
const mockDatabaseGet = jest.fn();
let consoleErrorSpy: jest.SpyInstance<void, Parameters<typeof console.error>>;

function buildObservable<T>(
  observers: Array<MockObserver<T>>
): MockObservable<T> {
  return {
    subscribe: jest.fn((observer: MockObserver<T>) => {
      observers.push(observer);
      return { unsubscribe: jest.fn() };
    }),
  };
}

const mockAccountsQuery: MockQuery<MockAccount> = {
  observe: mockAccountsObserve,
  observeWithColumns: mockAccountsObserveWithColumns,
};

const mockBankDetailsQuery: MockQuery<MockBankDetails> = {
  observe: mockBankDetailsObserve,
  observeWithColumns: mockBankDetailsObserveWithColumns,
};

const mockAccountsCollection: MockCollection<MockAccount> = {
  query: jest.fn(() => mockAccountsQuery),
};

const mockBankDetailsCollection: MockCollection<MockBankDetails> = {
  query: jest.fn(() => mockBankDetailsQuery),
};

jest.mock("@monyvi/db", () => ({
  database: {
    get: (collectionName: string): unknown => mockDatabaseGet(collectionName),
  },
}));

jest.mock("@nozbe/watermelondb", () => ({
  Q: {
    where: (...args: readonly unknown[]) => ({ kind: "where", args }),
    sortBy: (...args: readonly unknown[]) => ({ kind: "sortBy", args }),
    take: (...args: readonly unknown[]) => ({ kind: "take", args }),
    oneOf: (...args: readonly unknown[]) => ({ kind: "oneOf", args }),
    desc: "desc",
  },
}));

jest.mock("../../hooks/useMarketRates", () => ({
  useMarketRates: (): { selectedSnapshot: null } => ({
    selectedSnapshot: null,
  }),
}));

jest.mock("../../hooks/usePreferredCurrency", () => ({
  usePreferredCurrency: (): { preferredCurrency: "USD" } => ({
    preferredCurrency: "USD",
  }),
}));

jest.mock("../../hooks/useCurrentUser", () => ({
  useCurrentUser: (): { userId: string; isResolvingUser: boolean } => ({
    userId: "user-1",
    isResolvingUser: false,
  }),
}));

jest.mock("../../services/supabase", () => ({
  getCurrentUserId: (): Promise<string> => Promise.resolve("user-1"),
}));

// Import AFTER mocks
// eslint-disable-next-line import/first
import { useAccounts, useBankAccounts } from "../../hooks/useAccounts";

function renderUseAccountsHook(): {
  readonly result: { current: UseAccountsResult };
  readonly unmount: () => void;
} {
  const ref: { current: UseAccountsResult } = {
    current: {
      accounts: [],
      isLoading: true,
      error: null,
      totalAccountsBalance: 0,
      refetch: () => undefined,
    },
  };

  const HookWrapper = (): React.JSX.Element | null => {
    ref.current = useAccounts();
    return null;
  };

  let renderer: ReactTestRendererInstance = { unmount: () => undefined };
  RTR.act(() => {
    renderer = RTR.create(React.createElement(HookWrapper));
  });
  return { result: ref, unmount: () => renderer.unmount() };
}

function renderHook(): {
  readonly result: { current: UseBankAccountsResult };
  readonly unmount: () => void;
} {
  const ref: { current: UseBankAccountsResult } = {
    current: { bankAccounts: [], isLoading: true, error: null },
  };

  const HookWrapper = (): React.JSX.Element | null => {
    ref.current = useBankAccounts() as unknown as UseBankAccountsResult;
    return null;
  };

  let renderer: ReactTestRendererInstance = { unmount: () => undefined };
  RTR.act(() => {
    renderer = RTR.create(React.createElement(HookWrapper));
  });
  return { result: ref, unmount: () => renderer.unmount() };
}

beforeEach(() => {
  jest.clearAllMocks();
  consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  mockAccountObservers.length = 0;
  mockBankDetailsObservers.length = 0;
  mockAccountsObserve.mockReturnValue(buildObservable(mockAccountObservers));
  mockAccountsObserveWithColumns.mockReturnValue(
    buildObservable(mockAccountObservers)
  );
  mockBankDetailsObserve.mockReturnValue(
    buildObservable(mockBankDetailsObservers)
  );
  mockAccountsCollection.query.mockReturnValue(mockAccountsQuery);
  mockBankDetailsCollection.query.mockReturnValue(mockBankDetailsQuery);
  mockDatabaseGet.mockImplementation((collectionName: string) => {
    if (collectionName === "accounts") return mockAccountsCollection;
    if (collectionName === "bank_details") return mockBankDetailsCollection;
    throw new Error(`Unexpected collection: ${collectionName}`);
  });
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

describe("useAccounts", () => {
  it("observes balance and default-flag changes on existing accounts", () => {
    const { unmount } = renderUseAccountsHook();

    expect(mockAccountsObserveWithColumns).toHaveBeenCalledWith([
      "balance",
      "is_default",
      "name",
      "institution_id",
      "provider_display_name",
    ]);
    expect(mockAccountsObserve).not.toHaveBeenCalled();

    unmount();
  });
});

describe("useBankAccounts", () => {
  it("observes balance and default-flag changes on existing bank accounts", () => {
    const { unmount } = renderHook();

    expect(mockAccountsObserveWithColumns).toHaveBeenCalledWith([
      "balance",
      "is_default",
      "name",
      "institution_id",
      "provider_display_name",
    ]);
    expect(mockAccountsObserve).not.toHaveBeenCalled();

    unmount();
  });

  it("clears stale errors after later successful account emissions", () => {
    const { result } = renderHook();

    RTR.act(() => {
      mockAccountObservers[0].error(new Error("accounts observer failed"));
    });
    expect(result.current.error?.message).toBe("accounts observer failed");

    RTR.act(() => {
      mockAccountObservers[0].next([
        { id: "acc-1", name: "Bank", userId: "user-1" },
      ]);
    });

    expect(result.current.error).toBeNull();
  });

  it("clears stale errors after later successful bank-detail emissions", () => {
    const { result } = renderHook();

    RTR.act(() => {
      mockAccountObservers[0].next([
        { id: "acc-1", name: "Bank", userId: "user-1" },
      ]);
    });

    RTR.act(() => {
      mockBankDetailsObservers[0].error(new Error("details observer failed"));
    });
    expect(result.current.error?.message).toBe("details observer failed");

    RTR.act(() => {
      mockBankDetailsObservers[0].next([
        { accountId: "acc-1", bankName: "CIB" },
      ]);
    });

    expect(result.current.error).toBeNull();
  });

  it("queries bank_details only for the owned bank account ids", () => {
    renderHook();

    RTR.act(() => {
      mockAccountObservers[0].next([
        { id: "acc-1", name: "Bank", userId: "user-1" },
      ]);
    });

    expect(mockBankDetailsCollection.query).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "where",
        args: [
          "account_id",
          expect.objectContaining({ kind: "oneOf", args: [["acc-1"]] }),
        ],
      }),
      expect.objectContaining({ kind: "where", args: ["deleted", false] })
    );
  });

  it("does not join a foreign bank-detail emission into owned accounts", () => {
    const { result } = renderHook();

    RTR.act(() => {
      mockAccountObservers[0].next([
        { id: "acc-1", name: "Bank", userId: "user-1" },
      ]);
    });

    RTR.act(() => {
      mockBankDetailsObservers[0].next([
        { accountId: "foreign-acc", bankName: "Other Bank" },
      ]);
    });

    expect(result.current.bankAccounts).toEqual([
      {
        account: { id: "acc-1", name: "Bank", userId: "user-1" },
        bankDetails: undefined,
      },
    ]);
  });
});
