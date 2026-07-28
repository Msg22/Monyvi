import type { AccountOption } from "@/components/transaction-review/edit-modal/AccountSelector";
import {
  getEditFormConfig,
  type EditFormConfig,
} from "@/components/transaction-review/edit-modal/get-edit-form-config";
import type { PendingAccount } from "@/services/pending-account-service";
import type { AccountWithBankDetails } from "@/services/sms-account-matcher";
import {
  buildPendingAccount,
  buildTransactionEdits,
  generatePendingTempId,
  isDuplicateAccount,
  type TransactionEdits,
} from "@/services/sms-edit-modal-service";
import {
  TransactionValidationErrors,
  validateTransactionForm,
} from "@/validation/transaction-validation";
import type { Category, CurrencyType, TransactionType } from "@monyvi/db";
import {
  parseAmountInput,
  type ParsedSmsTransaction,
  type ReviewableTransaction,
} from "@monyvi/logic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export interface UseTransactionEditStateReturn {
  readonly state: {
    readonly amount: string;
    readonly note: string;
    readonly counterparty: string;
    readonly txType: TransactionType;
    readonly selectedAccountId: string | null;
    readonly selectedAccountName: string;
    readonly isAccountPickerOpen: boolean;
    readonly formErrors: TransactionValidationErrors;
    readonly isCreatingNew: boolean;
    readonly newAccountName: string;
    readonly newAccountError: string | null;
    readonly selectedToAccountId: string | null;
    readonly selectedToAccountName: string;
    readonly newToAccountName: string;
    readonly isToAccountPickerOpen: boolean;
    readonly isCreatingNewToAccount: boolean;
    readonly isCategoryPickerOpen: boolean;
    readonly selectedCategoryId: string;
    readonly selectedCategoryDisplayName: string | null;
    readonly relevantCategories: readonly Category[];
    readonly accountOptions: readonly AccountOption[];
    readonly hasBankAccounts: boolean;
    readonly cashAccountOptions: readonly AccountOption[];
    readonly hasCashAccounts: boolean;
    readonly editedTransactionCurrency: CurrencyType;
    readonly selectedAccountCurrency: CurrencyType;
    readonly hasCurrencyMismatch: boolean;
    readonly formConfig: EditFormConfig;
    // Currency-grouped account lists for AccountSelector
    readonly matchingAccounts: readonly AccountOption[];
    readonly otherAccounts: readonly AccountOption[];
    readonly showSectionHeaders: boolean;
    readonly isCurrencyLocked: boolean;
    readonly isCurrencyPickerOpen: boolean;
    readonly newAccountCurrency: CurrencyType;
  };
  readonly setters: {
    readonly setAmount: React.Dispatch<React.SetStateAction<string>>;
    readonly setNote: React.Dispatch<React.SetStateAction<string>>;
    readonly setCounterparty: React.Dispatch<React.SetStateAction<string>>;
    readonly setTxType: React.Dispatch<React.SetStateAction<TransactionType>>;
    readonly setIsAccountPickerOpen: React.Dispatch<
      React.SetStateAction<boolean>
    >;
    readonly setNewAccountName: React.Dispatch<React.SetStateAction<string>>;
    readonly setIsCategoryPickerOpen: React.Dispatch<
      React.SetStateAction<boolean>
    >;
    readonly setSelectedCategoryId: (categoryId: string) => void;
    readonly setSelectedToAccountId: React.Dispatch<
      React.SetStateAction<string | null>
    >;
    readonly setSelectedToAccountName: React.Dispatch<
      React.SetStateAction<string>
    >;
    readonly setIsToAccountPickerOpen: React.Dispatch<
      React.SetStateAction<boolean>
    >;
    readonly setNewToAccountName: React.Dispatch<React.SetStateAction<string>>;
    readonly setFormErrors: React.Dispatch<
      React.SetStateAction<TransactionValidationErrors>
    >;
    readonly setIsCurrencyPickerOpen: React.Dispatch<
      React.SetStateAction<boolean>
    >;
  };
  readonly accountHandlers: {
    readonly handleStartNew: () => void;
    readonly handleCancelNew: () => void;
    readonly handleStartNewToAccount: () => void;
    readonly handleCancelNewToAccount: () => void;
    readonly handleSave: () => Promise<void>;
    readonly handleSelectAccount: (opt: AccountOption) => void;
    readonly handleCurrencySelect: (currency: CurrencyType) => void;
  };
}

export interface UseTransactionEditStateProps {
  readonly transaction: ReviewableTransaction;
  readonly currentAccountName: string | null;
  readonly currentAccountId: string | null;
  readonly accounts: readonly AccountWithBankDetails[];
  readonly pendingAccounts: readonly PendingAccount[];
  readonly categoryMap: ReadonlyMap<string, Category>;
  readonly expenseCategories: readonly Category[];
  readonly incomeCategories: readonly Category[];
  readonly onSave: (
    edits: TransactionEdits
  ) => boolean | void | Promise<boolean | void>;
  readonly onCreatePendingAccount: (account: PendingAccount) => void;
  readonly allowTransactionCurrencyEdit?: boolean;
}

export function useTransactionEditState({
  transaction,
  currentAccountName,
  currentAccountId,
  accounts,
  pendingAccounts,
  categoryMap,
  expenseCategories,
  incomeCategories,
  onSave,
  onCreatePendingAccount,
  allowTransactionCurrencyEdit = false,
}: UseTransactionEditStateProps): UseTransactionEditStateReturn {
  const { t } = useTranslation("transactions");
  // Config
  const formConfig = useMemo(
    () => getEditFormConfig(transaction),
    [transaction]
  );
  const smsTransaction =
    transaction.source === "SMS" ? (transaction as ParsedSmsTransaction) : null;

  const readTransactionNote = (tx: ReviewableTransaction): string => {
    const value = (tx as { note?: unknown }).note;
    return typeof value === "string" ? value : "";
  };

  // Local editable state
  const [amount, setAmount] = useState(transaction.amount.toString());
  const [note, setNote] = useState(readTransactionNote(transaction));

  const [counterparty, setCounterparty] = useState(
    transaction.counterparty || ""
  );
  const [txType, setTxType] = useState<TransactionType>(transaction.type);
  const [selectedAccountId, setSelectedAccountId] = useState(currentAccountId);
  const [selectedAccountName, setSelectedAccountName] = useState(
    currentAccountName ?? ""
  );
  const [isAccountConfirmed, setIsAccountConfirmed] = useState(false);
  const [isAccountPickerOpen, setIsAccountPickerOpen] = useState(false);
  const [formErrors, setFormErrors] = useState<TransactionValidationErrors>({});

  // "+ New" account creation state
  const preCreateSelectedAccountRef = useRef<{
    id: string | null;
    name: string;
  } | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newAccountName, setNewAccountName] = useState(transaction.originLabel);
  const [newAccountCurrency, setNewAccountCurrency] = useState<CurrencyType>(
    transaction.currency
  );
  const [newAccountError, setNewAccountError] = useState<string | null>(null);

  const [selectedToAccountId, setSelectedToAccountId] = useState<string | null>(
    smsTransaction?.toAccountId ?? null
  );
  const [selectedToAccountName, setSelectedToAccountName] = useState(
    smsTransaction?.toAccountName ?? ""
  );
  const [newToAccountName, setNewToAccountName] = useState("Cash");
  const [isToAccountPickerOpen, setIsToAccountPickerOpen] = useState(false);
  const [isCreatingNewToAccount, setIsCreatingNewToAccount] = useState(false);

  // Category state
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    transaction.categoryId
  );
  const [isCategoryConfirmed, setIsCategoryConfirmed] = useState(false);
  const [shouldClearCategoryConfirmation, setShouldClearCategoryConfirmation] =
    useState(false);

  // Currency picker state (for "Create New Account" mode)
  const [isCurrencyPickerOpen, setIsCurrencyPickerOpen] = useState(false);

  const selectedCategoryDisplayName = useMemo((): string | null => {
    const selectedCategory = categoryMap.get(
      selectedCategoryId ?? transaction.categoryId
    );
    return selectedCategory?.displayName ?? null;
  }, [selectedCategoryId, categoryMap, transaction.categoryId]);

  const relevantCategories = useMemo(() => {
    return txType === "EXPENSE" ? expenseCategories : incomeCategories;
  }, [txType, expenseCategories, incomeCategories]);

  // Merge real accounts + pending accounts for the dropdown.
  // Voice: all account types | SMS: accounts supported by SMS matching.
  const isVoiceSource = transaction.source === "VOICE";

  const accountOptions = useMemo<readonly AccountOption[]>(() => {
    const real: AccountOption[] = accounts.map((acc) => ({
      id: acc.id,
      name: acc.name,
      currency: acc.currency,
      isPending: false,
      type: acc.type,
    }));
    const pending: AccountOption[] = pendingAccounts.map((pa) => ({
      id: pa.tempId,
      name: pa.name,
      currency: pa.currency,
      isPending: true,
      type: pa.type,
    }));
    const all = [...real, ...pending];
    return isVoiceSource
      ? all
      : all.filter(
          (option) => option.type === "BANK" || option.type === "DIGITAL_WALLET"
        );
  }, [accounts, pendingAccounts, isVoiceSource]);

  // Currency-grouped sorting for AccountSelector section headers
  const { matchingAccounts, otherAccounts, showSectionHeaders } =
    useMemo(() => {
      if (!isVoiceSource) {
        return {
          matchingAccounts: accountOptions,
          otherAccounts: [] as AccountOption[],
          showSectionHeaders: false,
        };
      }
      const txCurrency = transaction.currency;
      const matching = accountOptions.filter((o) => o.currency === txCurrency);
      const other = accountOptions.filter((o) => o.currency !== txCurrency);
      const shouldShowHeaders = matching.length > 0 && other.length > 0;
      return {
        matchingAccounts: matching,
        otherAccounts: other,
        showSectionHeaders: shouldShowHeaders,
      };
    }, [accountOptions, transaction.currency, isVoiceSource]);

  const hasBankAccounts = accountOptions.length > 0;

  // Cash accounts for ATM withdrawal TO dropdown
  const cashAccountOptions = useMemo<readonly AccountOption[]>(() => {
    return accounts
      .filter((acc) => acc.type === "CASH")
      .map((acc) => ({
        id: acc.id,
        name: acc.name,
        currency: acc.currency,
        isPending: false,
        type: acc.type,
      }));
  }, [accounts]);

  const hasCashAccounts = cashAccountOptions.length > 0;

  const editedTransactionCurrency = allowTransactionCurrencyEdit
    ? newAccountCurrency
    : transaction.currency;

  const selectedAccountCurrency = useMemo((): CurrencyType => {
    if (isCreatingNew) {
      return newAccountCurrency;
    }
    const found = accountOptions.find((opt) => opt.id === selectedAccountId);
    return found?.currency ?? editedTransactionCurrency;
  }, [
    accountOptions,
    selectedAccountId,
    editedTransactionCurrency,
    isCreatingNew,
    newAccountCurrency,
  ]);

  const hasCurrencyMismatch =
    selectedAccountId !== null &&
    selectedAccountCurrency !== editedTransactionCurrency;

  // Existing non-SMS flows keep currency tied to the selected account.
  const isCurrencyLocked =
    !allowTransactionCurrencyEdit &&
    !isCreatingNew &&
    (hasBankAccounts || selectedAccountId !== null);

  // Track which transaction identity has been initialized
  const initializedForIdentityRef = useRef<string | null>(null);
  const transactionIdentity =
    transaction.deduplicationHash ??
    `${transaction.counterparty}-${transaction.amount}-${transaction.date.getTime()}`;

  useEffect(() => {
    if (initializedForIdentityRef.current === transactionIdentity) return;
    initializedForIdentityRef.current = transactionIdentity;

    setAmount(transaction.amount.toString());
    setNewAccountCurrency(transaction.currency);
    setNote(readTransactionNote(transaction));
    setCounterparty(transaction.counterparty || "");
    setTxType(transaction.type);
    setSelectedCategoryId(transaction.categoryId);
    setIsCategoryConfirmed(false);
    setShouldClearCategoryConfirmation(false);
    setIsAccountConfirmed(false);

    const matchedOption = currentAccountId
      ? accountOptions.find((o) => o.id === currentAccountId)
      : undefined;

    preCreateSelectedAccountRef.current = matchedOption
      ? { id: matchedOption.id, name: matchedOption.name }
      : null;

    if (matchedOption) {
      setSelectedAccountId(matchedOption.id);
      setSelectedAccountName(matchedOption.name);
    } else {
      setSelectedAccountId(null);
      setSelectedAccountName("");
    }

    setIsAccountPickerOpen(false);
    setIsCreatingNew(!hasBankAccounts);
    setNewAccountName(transaction.originLabel);
    setNewAccountError(null);
    setFormErrors({});

    if (formConfig.showToAccount) {
      setIsToAccountPickerOpen(false);
      const persistedToAccount = smsTransaction?.toAccountId
        ? cashAccountOptions.find(
            (option) =>
              option.id === smsTransaction.toAccountId &&
              option.currency === transaction.currency
          )
        : undefined;
      const currencyMatch = cashAccountOptions.find(
        (option) => option.currency === transaction.currency
      );
      const selectedToAccount = persistedToAccount ?? currencyMatch;
      setIsCreatingNewToAccount(selectedToAccount === undefined);
      if (selectedToAccount) {
        setSelectedToAccountId(selectedToAccount.id);
        setSelectedToAccountName(selectedToAccount.name);
      } else {
        const durableNewDestinationName = smsTransaction?.toAccountId
          ? ""
          : (smsTransaction?.toAccountName ?? "");
        setSelectedToAccountId(null);
        setSelectedToAccountName(durableNewDestinationName);
        setNewToAccountName(durableNewDestinationName || "Cash");
      }
    }
  }, [
    transactionIdentity,
    transaction,
    smsTransaction,
    currentAccountId,
    currentAccountName,
    accountOptions,
    hasBankAccounts,
    formConfig.showToAccount,
    cashAccountOptions,
  ]);

  const prevTypeRef = useRef(txType);

  useEffect(() => {
    if (relevantCategories.length === 0) return;

    const typeChanged = prevTypeRef.current !== txType;
    prevTypeRef.current = txType;

    if (!selectedCategoryId || typeChanged) {
      setSelectedCategoryId(relevantCategories[0].id);
      setIsCategoryConfirmed(false);
      if (typeChanged) {
        setShouldClearCategoryConfirmation(true);
      }
    }
  }, [relevantCategories, selectedCategoryId, txType]);

  const handleSelectCategory = useCallback((categoryId: string): void => {
    setSelectedCategoryId(categoryId);
    setIsCategoryConfirmed(true);
    setShouldClearCategoryConfirmation(false);
  }, []);

  // Handlers

  const handleStartNew = useCallback(() => {
    preCreateSelectedAccountRef.current = {
      id: selectedAccountId,
      name: selectedAccountName,
    };
    setIsCreatingNew(true);
    setIsAccountConfirmed(false);
    setIsAccountPickerOpen(false);
    setNewAccountName(transaction.originLabel);
    setNewAccountCurrency(transaction.currency);
    setSelectedAccountId(null);
    setSelectedAccountName("");
  }, [
    transaction.originLabel,
    transaction.currency,
    selectedAccountId,
    selectedAccountName,
  ]);

  const handleCancelNew = useCallback(() => {
    setIsCreatingNew(false);
    setIsAccountConfirmed(false);
    setNewAccountError(null);
    setNewAccountCurrency(transaction.currency);

    // Revert to previously selected account if one existed
    const previousSelection = preCreateSelectedAccountRef.current;
    if (previousSelection && previousSelection.id !== null) {
      setSelectedAccountId(previousSelection.id);
      setSelectedAccountName(previousSelection.name);
    } else if (currentAccountId) {
      const matchedOption = accountOptions.find(
        (o) => o.id === currentAccountId
      );
      if (matchedOption) {
        setSelectedAccountId(matchedOption.id);
        setSelectedAccountName(matchedOption.name);
      }
    }
  }, [currentAccountId, accountOptions, transaction.currency]);

  const handleCurrencySelect = useCallback(
    (currency: CurrencyType): void => {
      setNewAccountCurrency(currency);
      setIsCurrencyPickerOpen(false);
      if (allowTransactionCurrencyEdit && !isCreatingNew) {
        const selectedAccount = accountOptions.find(
          (option) => option.id === selectedAccountId
        );
        if (selectedAccount && selectedAccount.currency !== currency) {
          setSelectedAccountId(null);
          setSelectedAccountName("");
          setIsAccountConfirmed(false);
        }
      }
      if (!formConfig.showToAccount) return;

      const matchingCashAccount = cashAccountOptions.find(
        (option) => option.currency === currency
      );
      if (matchingCashAccount) {
        setSelectedToAccountId(matchingCashAccount.id);
        setSelectedToAccountName(matchingCashAccount.name);
        setIsCreatingNewToAccount(false);
        return;
      }

      setSelectedToAccountId(null);
      setSelectedToAccountName("");
      setNewToAccountName("Cash");
      setIsCreatingNewToAccount(true);
    },
    [
      accountOptions,
      allowTransactionCurrencyEdit,
      cashAccountOptions,
      formConfig.showToAccount,
      isCreatingNew,
      selectedAccountId,
    ]
  );

  const handleSave = useCallback(async (): Promise<void> => {
    const isCreatingNewAccount = isCreatingNew || !hasBankAccounts;
    let resolvedAccountId: string | null = null;
    let resolvedAccountName: string | null = null;
    let pendingAccountToCreate: PendingAccount | null = null;

    if (isCreatingNewAccount) {
      const trimmedName = newAccountName.trim();

      if (!trimmedName) {
        setNewAccountError("Account name is required");
        return;
      }

      const tempId = generatePendingTempId();
      pendingAccountToCreate = buildPendingAccount(tempId, {
        name: trimmedName,
        currency: newAccountCurrency,
        senderDisplayName: transaction.originLabel,
        cardLast4:
          "cardLast4" in transaction
            ? ((transaction as { cardLast4?: string }).cardLast4 ?? undefined)
            : undefined,
      });

      if (
        isDuplicateAccount(
          trimmedName,
          newAccountCurrency,
          accounts,
          pendingAccounts,
          pendingAccountToCreate
        )
      ) {
        setNewAccountError(
          `An account named "${trimmedName}" in ${newAccountCurrency} already exists`
        );
        return;
      }

      resolvedAccountId = tempId;
      resolvedAccountName = trimmedName;
    } else {
      resolvedAccountId = selectedAccountId;
      resolvedAccountName = selectedAccountName;
      const selectedAccount = accountOptions.find(
        (option) => option.id === selectedAccountId
      );
      if (
        selectedAccount &&
        selectedAccount.currency !== editedTransactionCurrency
      ) {
        setFormErrors((previous) => ({
          ...previous,
          accountId: t("account_currency_mismatch"),
        }));
        return;
      }
    }

    const { isValid, errors } = validateTransactionForm(txType, {
      amount,
      accountId: resolvedAccountId,
      categoryId: selectedCategoryId,
    });

    const requiresToAccount = formConfig.showToAccount;
    const isToAccountValid =
      !requiresToAccount ||
      (isCreatingNewToAccount
        ? newToAccountName.trim().length > 0
        : !!selectedToAccountId);

    if (!isValid || !isToAccountValid) {
      const finalErrors = { ...errors };
      if (!isToAccountValid) {
        finalErrors.toAccountId = isCreatingNewToAccount
          ? "Cash account name is required"
          : "Cash account is required";
      }
      setFormErrors(finalErrors);
      return;
    }

    setFormErrors({});

    const edits = buildTransactionEdits({
      accountId: resolvedAccountId,
      accountName: resolvedAccountName,
      accountConfirmed: isCreatingNewAccount || isAccountConfirmed,
      counterparty,
      type: txType,
      categoryId: selectedCategoryId,
      categoryConfirmed: isCategoryConfirmed,
      shouldClearCategoryConfirmation,
      amount: parseFloat(parseAmountInput(amount)),
      currency: allowTransactionCurrencyEdit ? newAccountCurrency : undefined,
      note: note.trim() || undefined,
      toAccountId: formConfig.showToAccount
        ? isCreatingNewToAccount
          ? null
          : selectedToAccountId
        : undefined,
      toAccountName: formConfig.showToAccount
        ? isCreatingNewToAccount
          ? newToAccountName.trim() || "Cash"
          : selectedToAccountName
        : undefined,
      toAccountConfirmed: formConfig.showToAccount ? true : undefined,
      pendingAccount:
        transaction.source === "SMS"
          ? (pendingAccountToCreate ??
            pendingAccounts.find(
              (account) => account.tempId === resolvedAccountId
            ) ??
            null)
          : undefined,
    });

    try {
      const didSave = await onSave(edits);
      if (didSave === false) return;
      if (pendingAccountToCreate) {
        onCreatePendingAccount(pendingAccountToCreate);
      }
    } catch {
      // Keep the form open; the durable owner provides the error feedback.
    }
  }, [
    amount,
    note,
    counterparty,
    txType,
    selectedAccountId,
    selectedAccountName,
    transaction,
    isCreatingNew,
    isAccountConfirmed,
    hasBankAccounts,
    newAccountName,
    accounts,
    pendingAccounts,
    selectedCategoryId,
    isCategoryConfirmed,
    shouldClearCategoryConfirmation,
    onSave,
    onCreatePendingAccount,
    formConfig.showToAccount,
    selectedToAccountId,
    selectedToAccountName,
    newToAccountName,
    isCreatingNewToAccount,
    newAccountCurrency,
    allowTransactionCurrencyEdit,
    accountOptions,
    editedTransactionCurrency,
    t,
  ]);

  return {
    state: {
      amount,
      note,
      counterparty,
      txType,
      selectedAccountId,
      selectedAccountName,
      isAccountPickerOpen,
      formErrors,
      isCreatingNew,
      newAccountName,
      newAccountError,
      selectedToAccountId,
      selectedToAccountName,
      newToAccountName,
      isToAccountPickerOpen,
      isCreatingNewToAccount,
      isCategoryPickerOpen,
      selectedCategoryId,
      selectedCategoryDisplayName,
      relevantCategories,
      accountOptions,
      hasBankAccounts,
      cashAccountOptions,
      hasCashAccounts,
      editedTransactionCurrency,
      selectedAccountCurrency,
      hasCurrencyMismatch,
      formConfig,
      matchingAccounts,
      otherAccounts,
      showSectionHeaders,
      isCurrencyLocked,
      isCurrencyPickerOpen,
      newAccountCurrency,
    },
    setters: {
      setAmount,
      setNote,
      setCounterparty,
      setTxType,
      setIsAccountPickerOpen,
      setNewAccountName,
      setIsCategoryPickerOpen,
      setSelectedCategoryId: handleSelectCategory,
      setSelectedToAccountId,
      setSelectedToAccountName,
      setIsToAccountPickerOpen,
      setNewToAccountName,
      setFormErrors,
      setIsCurrencyPickerOpen,
    },
    accountHandlers: {
      handleStartNew,
      handleCancelNew,
      handleStartNewToAccount: useCallback(() => {
        setIsCreatingNewToAccount(true);
        setIsToAccountPickerOpen(false);
      }, []),
      handleCancelNewToAccount: useCallback(() => {
        setIsCreatingNewToAccount(false);
        setNewToAccountName("Cash");
        setFormErrors((prev) => ({ ...prev, toAccountId: undefined }));
      }, []),
      handleSave,
      handleCurrencySelect,
      handleSelectAccount: useCallback((opt: AccountOption) => {
        setSelectedAccountId(opt.id);
        setSelectedAccountName(opt.name);
        setIsAccountConfirmed(true);
        setIsAccountPickerOpen(false);
        // Exit create-new mode if user selects an existing account
        setIsCreatingNew(false);
        setNewAccountError(null);
        setFormErrors((prev) => ({
          ...prev,
          accountId: undefined,
        }));
      }, []),
    },
  };
}
