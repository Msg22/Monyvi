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
  overrides: Partial<ReviewableTransaction> & {
    readonly isAtmWithdrawal?: boolean;
  } = {}
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
        act(() => {
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
        });
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

  it("still seeds later safe rows when a row is edited during account matching", async () => {
    const transactions = [
      createTransaction({ originLabel: "FIRST_SAFE", confidence: 0.95 }),
      createTransaction({ originLabel: "SECOND_SAFE", confidence: 0.95 }),
    ];
    let completeMatching: (() => void) | undefined;

    mockMatchTransactionsBatched.mockImplementationOnce(
      (
        _transactions: readonly ReviewableTransaction[],
        _userId: string,
        _batchSize: number,
        onBatchComplete: (batch: ReadonlyMap<number, AccountMatch>) => void
      ): Promise<void> =>
        new Promise((resolve) => {
          act(() => {
            onBatchComplete(new Map([[0, accountMatch("acc-1")]]));
          });
          completeMatching = () => {
            act(() => {
              onBatchComplete(new Map([[1, accountMatch("acc-1")]]));
            });
            resolve();
          };
        })
    );

    const { result } = renderHook(() =>
      useTransactionReviewState({ transactions, onSave: jest.fn() })
    );

    await waitFor(() => expect(result.current.accountMatches.size).toBe(1));
    expect(Array.from(result.current.resolvedAccountMatchIndices)).toEqual([0]);
    expect(result.current.isReviewMetadataReady).toBe(false);
    act(() => result.current.handleOpenEditModal(0));
    act(() => {
      result.current.handleEditModalSave({
        amount: 125,
        type: "EXPENSE",
        categoryId: "cat-food",
        accountId: "acc-1",
        accountName: "Bank",
      });
    });

    completeMatching?.();

    await waitFor(() => expect(result.current.accountMatches.size).toBe(2));
    expect(Array.from(result.current.resolvedAccountMatchIndices)).toEqual([
      0, 1,
    ]);
    expect(result.current.isReviewMetadataReady).toBe(true);
    expect(Array.from(result.current.selectedIndices).sort()).toEqual([0, 1]);
  });

  it("resolves every skeleton into review state when account matching fails", async () => {
    const warningSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    mockMatchTransactionsBatched.mockRejectedValueOnce(
      new Error("matching unavailable")
    );
    const transactions = [createTransaction(), createTransaction()];

    const { result } = renderHook(() =>
      useTransactionReviewState({ transactions, onSave: jest.fn() })
    );

    await waitFor(() =>
      expect(result.current.isReviewMetadataReady).toBe(true)
    );

    expect(Array.from(result.current.resolvedAccountMatchIndices)).toEqual([
      0, 1,
    ]);
    expect(result.current.needsReviewCount).toBe(2);
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "warning" })
    );

    warningSpy.mockRestore();
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

  it("clears active filters when focusing all needs-review rows", async () => {
    const transactions = [
      createTransaction({ originLabel: "SAFE", confidence: 0.95 }),
      createTransaction({ originLabel: "LOW", confidence: 0.7 }),
      createTransaction({
        originLabel: "INCOME_REVIEW",
        confidence: 0.7,
        type: "INCOME",
      }),
    ];

    const { result } = renderHook(() =>
      useTransactionReviewState({ transactions, onSave: jest.fn() })
    );

    await waitFor(() => expect(result.current.accountMatches.size).toBe(3));

    act(() => {
      result.current.setSearchQuery("safe");
      result.current.handleTypeToggle("Expense");
      result.current.setPeriod("this_month");
    });

    expect(
      result.current.filteredTransactions.map((tx) => tx.originLabel)
    ).toEqual(["SAFE"]);

    act(() => {
      result.current.handleReviewNeeds();
    });

    expect(result.current.reviewMode).toBe("needs_review");
    expect(result.current.searchQuery).toBe("");
    expect(result.current.selectedTypes).toEqual(["All"]);
    expect(result.current.period).toBe("all_time");
    expect(
      result.current.filteredTransactions.map((tx) => tx.originLabel)
    ).toEqual(["LOW", "INCOME_REVIEW"]);
  });

  it("returns one continuous newest-first list without date headers", async () => {
    const transactions = [
      createTransaction({
        date: new Date("2026-07-02T12:00:00.000Z"),
        deduplicationHash: "sms-fingerprint-2",
      }),
      createTransaction({ date: new Date("2026-07-01T12:00:00.000Z") }),
    ];

    const { result } = renderHook(() =>
      useTransactionReviewState({ transactions, onSave: jest.fn() })
    );

    await waitFor(() => expect(result.current.accountMatches.size).toBe(2));

    expect(result.current.listItems).toHaveLength(2);
    expect(result.current.listItems.map((item) => item.tx.date)).toEqual([
      new Date("2026-07-02T12:00:00.000Z"),
      new Date("2026-07-01T12:00:00.000Z"),
    ]);
  });

  it("treats ATM withdrawal suggestions as transfers when filtering", async () => {
    const transactions = [
      createTransaction({
        originLabel: "ATM",
        isAtmWithdrawal: true,
      }),
      createTransaction({
        originLabel: "CARD",
        deduplicationHash: "sms-fingerprint-card",
      }),
    ];

    const { result } = renderHook(() =>
      useTransactionReviewState({ transactions, onSave: jest.fn() })
    );

    await waitFor(() => expect(result.current.accountMatches.size).toBe(2));

    act(() => {
      result.current.handleTypeToggle("Transfer");
    });

    expect(
      result.current.filteredTransactions.map((tx) => tx.originLabel)
    ).toEqual(["ATM"]);
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

  it("selects an ATM row after the user explicitly confirms its cash destination", async () => {
    const transactions = [
      {
        ...createTransaction({
          confidence: 0.99,
          reviewStatus: "needs_review",
          reviewReasons: ["cash_transfer_review"],
        }),
        isAtmWithdrawal: true,
      },
    ];

    const { result } = renderHook(() =>
      useTransactionReviewState({ transactions, onSave: jest.fn() })
    );

    await waitFor(() => expect(result.current.accountMatches.size).toBe(1));
    expect(result.current.selectedIndices.has(0)).toBe(false);

    act(() => result.current.handleOpenEditModal(0));
    act(() => {
      result.current.handleEditModalSave({
        amount: 100,
        type: "EXPENSE",
        categoryId: "cat-food",
        accountId: "acc-1",
        accountName: "Bank",
        toAccountId: "cash-1",
        toAccountName: "Cash",
        toAccountConfirmed: true,
      });
    });

    expect(result.current.reviewMetaByIndex.get(0)).toEqual({
      isAutoSelectable: true,
      reasons: [],
    });
    expect(result.current.selectedIndices.has(0)).toBe(true);
  });

  it("preserves an explicit deselection when a safe row is edited", async () => {
    const transactions = [createTransaction({ confidence: 0.99 })];
    const { result } = renderHook(() =>
      useTransactionReviewState({ transactions, onSave: jest.fn() })
    );

    await waitFor(() =>
      expect(result.current.selectedIndices.has(0)).toBe(true)
    );

    act(() => result.current.handleToggleItem(0));
    expect(result.current.selectedIndices.has(0)).toBe(false);

    act(() => result.current.handleOpenEditModal(0));
    act(() => {
      result.current.handleEditModalSave({
        amount: 125,
        type: "EXPENSE",
        categoryId: "cat-food",
        accountId: "acc-1",
        accountName: "Bank",
      });
    });

    expect(result.current.reviewMetaByIndex.get(0)?.isAutoSelectable).toBe(
      true
    );
    expect(result.current.selectedIndices.has(0)).toBe(false);
  });

  it("keeps parser category review after an account-only edit", async () => {
    const transactions = [
      createTransaction({
        confidence: 0.99,
        reviewStatus: "needs_review",
        reviewReasons: ["category_needed"],
      }),
    ];

    const { result } = renderHook(() =>
      useTransactionReviewState({ transactions, onSave: jest.fn() })
    );

    await waitFor(() => expect(result.current.accountMatches.size).toBe(1));

    act(() => result.current.handleOpenEditModal(0));
    act(() => {
      result.current.handleEditModalSave({
        amount: 100,
        type: "EXPENSE",
        categoryId: "cat-food",
        accountId: "acc-manual",
        accountName: "Manual account",
      });
    });

    expect(result.current.reviewMetaByIndex.get(0)?.reasons).toContain(
      "category_needed"
    );
    expect(Array.from(result.current.selectedIndices)).toEqual([]);
    expect(result.current.autoSelectedCount).toBe(0);
    expect(result.current.needsReviewCount).toBe(1);

    act(() => result.current.handleOpenEditModal(0));
    act(() => {
      result.current.handleEditModalSave({
        amount: 100,
        type: "EXPENSE",
        categoryId: "cat-shopping",
        categoryConfirmed: true,
        accountId: "acc-manual",
        accountName: "Manual account",
      });
    });

    expect(result.current.reviewMetaByIndex.get(0)?.reasons).not.toContain(
      "category_needed"
    );
    expect(Array.from(result.current.selectedIndices)).toEqual([0]);
    expect(result.current.autoSelectedCount).toBe(1);
    expect(result.current.needsReviewCount).toBe(0);

    act(() => result.current.handleOpenEditModal(0));
    act(() => {
      result.current.handleEditModalSave({
        amount: 120,
        type: "EXPENSE",
        categoryId: "cat-shopping",
        accountId: "acc-manual",
        accountName: "Manual account",
      });
    });

    expect(result.current.reviewMetaByIndex.get(0)?.reasons).not.toContain(
      "category_needed"
    );
    expect(result.current.autoSelectedCount).toBe(1);
  });

  it("re-seeds when review risk fields change for the same parsed transaction", async () => {
    const firstScan = [createTransaction({ confidence: 0.95 })];
    const secondScan = [createTransaction({ confidence: 0.7 })];

    const { result, rerender } = renderHook<
      UseTransactionReviewStateResult,
      { readonly transactions: readonly ReviewableTransaction[] }
    >(
      ({ transactions }) =>
        useTransactionReviewState({ transactions, onSave: jest.fn() }),
      { initialProps: { transactions: firstScan } }
    );

    await waitFor(() => expect(result.current.selectedIndices.size).toBe(1));

    act(() => {
      rerender({ transactions: secondScan });
    });

    await waitFor(() => expect(result.current.selectedIndices.size).toBe(0));
    expect(result.current.needsReviewCount).toBe(1);
  });

  it("re-seeds when parser review state changes for the same transaction", async () => {
    const firstScan = [
      createTransaction({ confidence: 0.95, reviewStatus: "auto_selectable" }),
    ];
    const secondScan = [
      createTransaction({
        confidence: 0.95,
        reviewStatus: "needs_review",
        reviewReasons: ["ambiguous_amount"],
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

    await waitFor(() => expect(result.current.selectedIndices.size).toBe(1));

    act(() => {
      rerender({ transactions: secondScan });
    });

    await waitFor(() => expect(result.current.selectedIndices.size).toBe(0));
    expect(result.current.reviewMetaByIndex.get(0)?.reasons).toEqual([
      "parser_review",
    ]);
  });

  it("clears stale edits when a retry changes parsed content", async () => {
    const firstScan = [
      createTransaction({ counterparty: "Original merchant" }),
    ];
    const correctedScan = [
      createTransaction({ counterparty: "Corrected merchant" }),
    ];

    const { result, rerender } = renderHook<
      UseTransactionReviewStateResult,
      { readonly transactions: readonly ReviewableTransaction[] }
    >(
      ({ transactions }) =>
        useTransactionReviewState({ transactions, onSave: jest.fn() }),
      { initialProps: { transactions: firstScan } }
    );

    await waitFor(() => expect(result.current.accountMatches.size).toBe(1));

    act(() => result.current.handleOpenEditModal(0));
    act(() => {
      result.current.handleEditModalSave({
        amount: 100,
        type: "EXPENSE",
        categoryId: "cat-food",
        accountId: "acc-1",
        accountName: "Bank",
        counterparty: "User override",
      });
    });
    expect(result.current.effectiveTransactions[0]?.counterparty).toBe(
      "User override"
    );

    act(() => rerender({ transactions: correctedScan }));

    await waitFor(() =>
      expect(result.current.transactionOverrides.size).toBe(0)
    );
    expect(result.current.effectiveTransactions[0]?.counterparty).toBe(
      "Corrected merchant"
    );
  });

  it("does not seed a retry scan from stale account matches", async () => {
    const firstScan = [
      createTransaction({ originLabel: "SAFE", confidence: 0.95 }),
    ];
    const secondScan = [
      createTransaction({
        originLabel: "NO_ACCOUNT",
        confidence: 0.99,
        deduplicationHash: "sms-fingerprint-2",
      }),
    ];
    let pendingBatch:
      | ((batch: ReadonlyMap<number, AccountMatch>) => void)
      | null = null;

    mockMatchTransactionsBatched
      .mockImplementationOnce(
        (
          transactions: readonly ReviewableTransaction[],
          _userId: string,
          _batchSize: number,
          onBatchComplete: (batch: ReadonlyMap<number, AccountMatch>) => void
        ): Promise<void> => {
          act(() => {
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
          });
          return Promise.resolve();
        }
      )
      .mockImplementationOnce(
        (
          _transactions: readonly ReviewableTransaction[],
          _userId: string,
          _batchSize: number,
          onBatchComplete: (batch: ReadonlyMap<number, AccountMatch>) => void
        ): Promise<void> => {
          pendingBatch = onBatchComplete;
          return new Promise(() => undefined);
        }
      );

    const { result, rerender } = renderHook<
      UseTransactionReviewStateResult,
      { readonly transactions: readonly ReviewableTransaction[] }
    >(
      ({ transactions }) =>
        useTransactionReviewState({ transactions, onSave: jest.fn() }),
      { initialProps: { transactions: firstScan } }
    );

    await waitFor(() => expect(result.current.selectedIndices.size).toBe(1));

    act(() => {
      rerender({ transactions: secondScan });
    });

    await waitFor(() => expect(result.current.accountMatches.size).toBe(0));
    expect(result.current.selectedIndices.size).toBe(0);

    act(() => {
      pendingBatch?.(new Map([[0, accountMatch(null)]]));
    });

    await waitFor(() => expect(result.current.accountMatches.size).toBe(1));
    expect(result.current.selectedIndices.size).toBe(0);
    expect(result.current.needsReviewCount).toBe(1);
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

    act(() => {
      rerender({ transactions: secondScan });
    });

    await waitFor(() => expect(result.current.accountMatches.size).toBe(1));
    expect(Array.from(result.current.selectedIndices)).toEqual([0]);
    expect(result.current.reviewMode).toBe("all");
    expect(result.current.needsReviewCount).toBe(0);
  });
});
