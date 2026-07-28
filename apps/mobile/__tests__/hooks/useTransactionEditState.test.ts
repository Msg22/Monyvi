import { useTransactionEditState } from "@/hooks/useTransactionEditState";
import type { PendingAccount } from "@/services/pending-account-service";
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

    await act(async () => {
      await result.current.accountHandlers.handleSave();
    });

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
    await act(async () => {
      await result.current.accountHandlers.handleSave();
    });

    expect(onSave).toHaveBeenLastCalledWith(
      expect.objectContaining({
        accountConfirmed: true,
        categoryConfirmed: true,
      })
    );
  });

  it("allows SMS review currency edits and includes the selected currency in saved edits", async () => {
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
        allowTransactionCurrencyEdit: true,
      })
    );

    await waitFor(() =>
      expect(result.current.state.selectedCategoryId).toBe(category.id)
    );
    expect(result.current.state.isCurrencyLocked).toBe(false);

    act(() => result.current.accountHandlers.handleCurrencySelect("USD"));
    expect(result.current.state.newAccountCurrency).toBe("USD");

    await act(async () => {
      await result.current.accountHandlers.handleSave();
    });

    expect(onSave).toHaveBeenLastCalledWith(
      expect.objectContaining({ currency: "USD" })
    );
  });

  it("re-resolves an ATM cash destination when the transaction currency changes", async () => {
    const bankAccount = createAccount();
    const egpCashAccount = {
      ...createAccount(),
      id: "cash-egp",
      name: "EGP Cash",
      type: "CASH" as const,
    };
    const usdCashAccount = {
      ...createAccount(),
      id: "cash-usd",
      name: "USD Cash",
      currency: "USD" as const,
      type: "CASH" as const,
    };
    const category = {
      id: "cat-food",
      displayName: "Food",
    } as unknown as Category;
    const transaction = {
      ...createTransaction(),
      isAtmWithdrawal: true,
      toAccountId: egpCashAccount.id,
      toAccountName: egpCashAccount.name,
    };

    const { result } = renderHook(() =>
      useTransactionEditState({
        transaction,
        currentAccountId: bankAccount.id,
        currentAccountName: bankAccount.name,
        accounts: [bankAccount, egpCashAccount, usdCashAccount],
        pendingAccounts: [],
        categoryMap: new Map([[category.id, category]]),
        expenseCategories: [category],
        incomeCategories: [],
        onSave: jest.fn(),
        onCreatePendingAccount: jest.fn(),
        allowTransactionCurrencyEdit: true,
      })
    );

    await waitFor(() =>
      expect(result.current.state.selectedToAccountId).toBe(egpCashAccount.id)
    );

    act(() => result.current.accountHandlers.handleCurrencySelect("USD"));

    expect(result.current.state.selectedToAccountId).toBe(usdCashAccount.id);
    expect(result.current.state.selectedToAccountName).toBe(usdCashAccount.name);
    expect(result.current.state.isCreatingNewToAccount).toBe(false);
  });

  it("persists a new account snapshot before adding it to in-memory state", async () => {
    const category = {
      id: "cat-food",
      displayName: "Food",
    } as unknown as Category;
    let resolveSave!: () => void;
    const saveResult = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    const onSave = jest.fn<Promise<void>, [TransactionEdits]>(() => saveResult);
    const onCreatePendingAccount = jest.fn<void, [PendingAccount]>();

    const { result } = renderHook(() =>
      useTransactionEditState({
        transaction: createTransaction(),
        currentAccountId: null,
        currentAccountName: null,
        accounts: [],
        pendingAccounts: [],
        categoryMap: new Map([[category.id, category]]),
        expenseCategories: [category],
        incomeCategories: [],
        onSave,
        onCreatePendingAccount,
      })
    );

    await waitFor(() =>
      expect(result.current.state.selectedCategoryId).toBe(category.id)
    );

    await act(async () => {
      const saving = result.current.accountHandlers.handleSave();

      const savedEdits = onSave.mock.calls[0]?.[0];
      expect(savedEdits?.accountId).toMatch(/^pending-/);
      expect(savedEdits?.pendingAccount).toMatchObject({
        name: "Unknown sender",
        currency: "EGP",
        type: "BANK",
      });
      expect(onCreatePendingAccount).not.toHaveBeenCalled();
      resolveSave();
      await saving;
    });

    const createdAccount = onCreatePendingAccount.mock.calls[0]?.[0];
    expect(createdAccount?.tempId).toMatch(/^pending-/);
    expect(createdAccount?.name).toBe("Unknown sender");
  });

  it("clears a durable pending-account snapshot after selecting an existing account", async () => {
    const account = createAccount();
    const pendingAccount: PendingAccount = {
      tempId: "pending-qnb",
      name: "QNB EGYPT",
      currency: "EGP",
      type: "BANK",
      senderDisplayName: "QNB EGYPT",
    };
    const category = {
      id: "cat-food",
      displayName: "Food",
    } as unknown as Category;
    const onSave = jest.fn<void, [TransactionEdits]>();
    const transaction = {
      ...createTransaction(),
      accountId: pendingAccount.tempId,
    };

    const { result } = renderHook(() =>
      useTransactionEditState({
        transaction,
        currentAccountId: pendingAccount.tempId,
        currentAccountName: pendingAccount.name,
        accounts: [account],
        pendingAccounts: [pendingAccount],
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
    act(() => {
      result.current.accountHandlers.handleSelectAccount({
        id: account.id,
        name: account.name,
        currency: account.currency,
        isPending: false,
        type: account.type,
      });
    });
    await act(async () => {
      await result.current.accountHandlers.handleSave();
    });

    expect(onSave.mock.calls[0]?.[0].pendingAccount).toBeNull();
  });
});
