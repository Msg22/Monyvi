import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReviewableTransaction } from "@monyvi/logic";
import type {
  AccountMatch,
  AccountWithBankDetails,
  MatchReason,
} from "@/services/sms-account-matcher";
import {
  type UseTransactionReviewStateResult,
  useTransactionReviewState,
} from "@/hooks/useTransactionReviewState";

type MatchTransactionsBatchedMock = (
  transactions: readonly ReviewableTransaction[],
  userId: string,
  batchSize: number,
  onBatchComplete: (batch: ReadonlyMap<number, AccountMatch>) => void,
  accounts?: readonly AccountWithBankDetails[]
) => Promise<void>;

const mockFetchAccountsWithDetails = jest.fn<
  Promise<readonly AccountWithBankDetails[]>,
  [string]
>();
const mockMatchTransactionsBatched = jest.fn<
  ReturnType<MatchTransactionsBatchedMock>,
  Parameters<MatchTransactionsBatchedMock>
>();
const mockShowToast = jest.fn();

jest.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

jest.mock("@/hooks/useCategories", () => ({
  useCategories: () => ({
    expenseCategories: [],
    incomeCategories: [],
  }),
}));

jest.mock("@/context/CategoriesContext", () => ({
  useCategoryLookup: () => new Map(),
}));

jest.mock("@/hooks/useMarketRates", () => ({
  useMarketRates: () => ({ latestRates: null }),
}));

jest.mock("@/hooks/usePeriodSummary", () => ({
  getPeriodDateRange: () => ({
    startDate: new Date("2026-01-01T00:00:00.000Z").getTime(),
    endDate: new Date("2026-12-31T23:59:59.999Z").getTime(),
  }),
}));

jest.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({
    userId: "user-1",
    isResolvingUser: false,
  }),
}));

jest.mock("@/services/sms-account-matcher", () => ({
  fetchAccountsWithDetails: (
    userId: string
  ): Promise<readonly AccountWithBankDetails[]> =>
    mockFetchAccountsWithDetails(userId),
  matchTransactionsBatched: (
    ...args: Parameters<MatchTransactionsBatchedMock>
  ): Promise<void> => mockMatchTransactionsBatched(...args),
}));

jest.mock("@/services/sms-review-save-service", () => ({
  prepareSavePayload: jest.fn(),
}));

function createTransaction(
  overrides: Partial<ReviewableTransaction> = {}
): ReviewableTransaction {
  return {
    amount: 100,
    currency: "EGP",
    type: "EXPENSE",
    counterparty: "Shop",
    date: new Date("2026-07-01T12:00:00.000Z"),
    categoryId: "cat-food",
    categoryDisplayName: "Food",
    confidence: 0.95,
    originLabel: "NBE",
    source: "SMS",
    deduplicationHash: "sms-fingerprint-1",
    ...overrides,
  };
}

function accountMatch(accountId: string | null): {
  readonly accountId: string | null;
  readonly accountName: string | null;
  readonly matchReason: MatchReason;
} {
  return {
    accountId,
    accountName: accountId ? "Bank" : null,
    matchReason: accountId ? "sms_sender" : "none",
  };
}

describe("useTransactionReviewState", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchAccountsWithDetails.mockResolvedValue([]);
    mockMatchTransactionsBatched.mockImplementation(
      (
        transactions: readonly ReviewableTransaction[],
        _userId: string,
        _batchSize: number,
        onBatchComplete: (batch: ReadonlyMap<number, AccountMatch>) => void
      ): Promise<void> => {
        onBatchComplete(
          new Map(
            transactions.map((transaction, index) => [
              index,
              accountMatch(
                transaction.originLabel === "NO_ACCOUNT" ? null : "acc-1"
              ),
            ])
          )
        );
        return Promise.resolve();
      }
    );
  });

  it("seeds selection only after account matching resolves safe rows", async () => {
    const transactions = [
      createTransaction({ originLabel: "SAFE", confidence: 0.95 }),
      createTransaction({ originLabel: "LOW", confidence: 0.8 }),
      {
        ...createTransaction({ originLabel: "ATM", confidence: 0.99 }),
        isAtmWithdrawal: true,
      },
      createTransaction({ originLabel: "NO_ACCOUNT", confidence: 0.99 }),
    ];

    const { result } = renderHook(() =>
      useTransactionReviewState({ transactions, onSave: jest.fn() })
    );

    await waitFor(() => expect(result.current.accountMatches.size).toBe(4));

    expect(Array.from(result.current.selectedIndices)).toEqual([0]);
    expect(result.current.autoSelectedCount).toBe(1);
    expect(result.current.needsReviewCount).toBe(3);
  });

  it("focuses needs-review rows and selects only shown rows", async () => {
    const transactions = [
      createTransaction({ originLabel: "SAFE", confidence: 0.95 }),
      createTransaction({ originLabel: "LOW", confidence: 0.7 }),
      createTransaction({ originLabel: "NO_ACCOUNT", confidence: 0.99 }),
    ];

    const { result } = renderHook(() =>
      useTransactionReviewState({ transactions, onSave: jest.fn() })
    );

    await waitFor(() => expect(result.current.accountMatches.size).toBe(3));

    act(() => {
      result.current.handleReviewNeeds();
    });

    expect(result.current.reviewMode).toBe("needs_review");
    expect(
      result.current.filteredTransactions.map((tx) => tx.originLabel)
    ).toEqual(["LOW", "NO_ACCOUNT"]);

    act(() => {
      result.current.handleToggleAll();
    });

    expect(Array.from(result.current.selectedIndices).sort()).toEqual([
      0, 1, 2,
    ]);
    expect(result.current.needsReviewCount).toBe(2);
    expect(
      result.current.filteredTransactions.map((tx) => tx.originLabel)
    ).toEqual(["LOW", "NO_ACCOUNT"]);
  });

  it("updates review reasons when editing a row resolves the missing account", async () => {
    const transactions = [
      createTransaction({ originLabel: "NO_ACCOUNT", confidence: 0.99 }),
    ];

    const { result } = renderHook(() =>
      useTransactionReviewState({ transactions, onSave: jest.fn() })
    );

    await waitFor(() => expect(result.current.accountMatches.size).toBe(1));
    expect(result.current.reviewMetaByIndex.get(0)?.reasons).toContain(
      "account_needed"
    );

    act(() => {
      result.current.handleOpenEditModal(0);
    });
    act(() => {
      result.current.handleEditModalSave({
        amount: 100,
        type: "EXPENSE",
        categoryId: "cat-food",
        accountId: "acc-manual",
        accountName: "Manual account",
      });
    });

    expect(result.current.reviewMetaByIndex.get(0)?.reasons).not.toContain(
      "account_needed"
    );
    expect(Array.from(result.current.selectedIndices)).toEqual([0]);
  });

  it("re-seeds selection when retry scan results replace the transaction array", async () => {
    const firstScan = [
      createTransaction({ originLabel: "SAFE", confidence: 0.95 }),
      createTransaction({ originLabel: "LOW", confidence: 0.7 }),
    ];
    const secondScan = [
      createTransaction({
        originLabel: "NEXT_SAFE",
        confidence: 0.99,
        deduplicationHash: "sms-fingerprint-2",
      }),
    ];

    const { result, rerender } = renderHook<
      UseTransactionReviewStateResult,
      { readonly transactions: readonly ReviewableTransaction[] }
    >(
      ({ transactions }) =>
        useTransactionReviewState({ transactions, onSave: jest.fn() }),
      { initialProps: { transactions: firstScan } }
    );

    await waitFor(() => expect(result.current.accountMatches.size).toBe(2));
    expect(Array.from(result.current.selectedIndices)).toEqual([0]);

    act(() => {
      result.current.handleReviewNeeds();
    });
    expect(result.current.reviewMode).toBe("needs_review");

    rerender({ transactions: secondScan });

    await waitFor(() => expect(result.current.accountMatches.size).toBe(1));
    expect(Array.from(result.current.selectedIndices)).toEqual([0]);
    expect(result.current.reviewMode).toBe("all");
    expect(result.current.needsReviewCount).toBe(0);
  });
});
