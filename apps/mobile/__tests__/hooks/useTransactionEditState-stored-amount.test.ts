import { useTransactionEditState } from "@/hooks/useTransactionEditState";
import type { AccountWithBankDetails } from "@/services/sms-account-matcher";
import type { Category } from "@monyvi/db";
import type { ReviewableTransaction } from "@monyvi/logic";
import { renderHook, waitFor } from "@testing-library/react-native";

function createBtcAccount(): AccountWithBankDetails {
  return {
    id: "btc-account",
    name: "BTC",
    currency: "BTC",
    isDefault: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    type: "BANK",
    smsSenderNames: [],
  };
}

function createBtcTransaction(): ReviewableTransaction {
  return {
    amount: 0.00000001,
    currency: "BTC",
    type: "EXPENSE",
    counterparty: "Exchange",
    date: new Date("2026-07-01T12:00:00.000Z"),
    categoryId: "cat-fees",
    categoryDisplayName: "Fees",
    confidence: 0.99,
    originLabel: "Exchange",
    source: "SMS",
    deduplicationHash: "btc-fingerprint-1",
    reviewStatus: "needs_review",
    reviewReasons: [],
  };
}

describe("useTransactionEditState stored amount normalization", () => {
  it("initializes a small persisted BTC amount as canonical decimal input instead of exponent notation", async () => {
    const account = createBtcAccount();
    const category = {
      id: "cat-fees",
      displayName: "Fees",
      type: "EXPENSE",
    } as unknown as Category;

    const { result } = renderHook(() =>
      useTransactionEditState({
        transaction: createBtcTransaction(),
        currentAccountId: account.id,
        currentAccountName: account.name,
        accounts: [account],
        pendingAccounts: [],
        categoryMap: new Map([[category.id, category]]),
        expenseCategories: [category],
        incomeCategories: [],
        onSave: jest.fn(),
        onCreatePendingAccount: jest.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.state.amount).toBe("0.00000001");
    });
  });
});
