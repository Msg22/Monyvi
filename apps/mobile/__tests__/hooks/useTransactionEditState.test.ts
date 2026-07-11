import { useTransactionEditState } from "@/hooks/useTransactionEditState";
import type { AccountWithBankDetails } from "@/services/sms-account-matcher";
import type { TransactionEdits } from "@/services/sms-edit-modal-service";
import type { Category } from "@monyvi/db";
import type { ReviewableTransaction } from "@monyvi/logic";
import { act, renderHook, waitFor } from "@testing-library/react-native";

function createTransaction(): ReviewableTransaction {
  return {
    amount: 100,
    currency: "EGP",
    type: "EXPENSE",
    counterparty: "Shop",
    date: new Date("2026-07-01T12:00:00.000Z"),
    categoryId: undefined as unknown as string,
    categoryDisplayName: "",
    confidence: 0.99,
    originLabel: "Unknown sender",
    source: "SMS",
    deduplicationHash: "sms-fingerprint-1",
    reviewStatus: "needs_review",
    reviewReasons: ["account_needed", "category_needed"],
  };
}

function createAccount(): AccountWithBankDetails {
  return {
    id: "account-1",
    name: "Main",
    currency: "EGP",
    isDefault: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    type: "BANK",
    smsSenderNames: [],
  };
}

describe("useTransactionEditState", () => {
  it("confirms account and category fields only after explicit selection", async () => {
    const account = createAccount();
    const category = {
      id: "cat-food",
      displayName: "Food",
    } as unknown as Category;
    const onSave = jest.fn<void, [TransactionEdits]>();

    const { result } = renderHook(() =>
      useTransactionEditState({
        transaction: createTransaction(),
        currentAccountId: account.id,
        currentAccountName: account.name,
        accounts: [account],
        pendingAccounts: [],
        categoryMap: new Map([[category.id, category]]),
        expenseCategories: [category],
        incomeCategories: [],
        onSave,
        onCreatePendingAccount: jest.fn(),
      })
    );

    await waitFor(() =>
      expect(result.current.state.selectedCategoryId).toBe(category.id)
    );

    act(() => result.current.accountHandlers.handleSave());

    expect(onSave).toHaveBeenLastCalledWith(
      expect.objectContaining({
        accountConfirmed: undefined,
        categoryConfirmed: undefined,
      })
    );

    act(() => {
      result.current.accountHandlers.handleSelectAccount({
        id: account.id,
        name: account.name,
        currency: account.currency,
        isPending: false,
        type: account.type,
      });
      result.current.setters.setSelectedCategoryId(category.id);
    });
    act(() => result.current.accountHandlers.handleSave());

    expect(onSave).toHaveBeenLastCalledWith(
      expect.objectContaining({
        accountConfirmed: true,
        categoryConfirmed: true,
      })
    );
  });
});
