/**
 * Edit Transaction Screen
 *
 * Pre-populates form fields from an existing transaction and allows
 * editing amount, category, counterparty, note, date, type (EXPENSE ↔ INCOME),
 * and account (cross-currency allowed). Includes delete and discard modals.
 */

import { AmountDisplay } from "@/components/add-transaction/AmountDisplay";
import {
  type CalculatorKey,
  CalculatorKeypad,
} from "@/components/add-transaction/CalculatorKeypad";
import { TypeTabs } from "@/components/add-transaction/TypeTabs";
import { EditTransactionFields } from "@/components/edit-transaction/EditTransactionFields";
import { ConfirmationModal } from "@/components/modals/ConfirmationModal";
import { AccountSelectorModal } from "@/components/modals/AccountSelectorModal";
import { CategorySelectorModal } from "@/components/modals/CategorySelectorModal";
import { PageHeader } from "@/components/navigation/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { RecurringWarningBanner } from "@/components/transactions/RecurringWarningBanner";
import { palette } from "@/constants/colors";
import { useToast } from "@/components/ui/Toast";
import { useCategoryLookup } from "@/context/CategoriesContext";
import { useTheme } from "@/context/ThemeContext";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { useCategoryChildren } from "@/hooks/useCategoryChildren";
import { useTransactionById } from "@/hooks/useTransactionById";
import {
  convertTransactionToTransfer,
  deleteTransaction,
  updateTransaction,
} from "@/services/transaction-service";
import {
  validateTransactionForm,
  type TransactionValidationErrors,
} from "@/validation/transaction-validation";
import { Ionicons } from "@expo/vector-icons";
import type { TransactionType } from "@monyvi/db";
import {
  calculateEditedTransactionBalanceProjection,
  evaluateAmountExpression,
  formatAmountInput,
} from "@monyvi/logic";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  LayoutAnimation,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// =============================================================================
// Types
// =============================================================================

interface OriginalValues {
  readonly amount: string;
  readonly type: TransactionType | "TRANSFER";
  readonly categoryId: string;
  readonly accountId: string;
  readonly counterparty: string | undefined;
  readonly note: string | undefined;
  readonly date: Date;
}

// =============================================================================
// Component
// =============================================================================

export default function EditTransaction(): React.ReactNode {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { showToast } = useToast();
  const { isDark } = useTheme();
  const { t } = useTranslation("transactions");
  const { t: tCommon } = useTranslation("common");

  // ---------------------------------------------------------------------------
  // Data Hooks
  // ---------------------------------------------------------------------------
  const { transaction, isLoading: isLoadingTx } = useTransactionById(id ?? "");
  const { accounts } = useAccounts();
  const { expenseCategories, incomeCategories } = useCategories();
  const categoryMap = useCategoryLookup();

  // ---------------------------------------------------------------------------
  // Form State
  // ---------------------------------------------------------------------------
  const [type, setTypeRaw] = useState<TransactionType | "TRANSFER">("EXPENSE");

  /** Wraps setType with LayoutAnimation for smooth form content swap */
  const setType = useCallback((next: TransactionType | "TRANSFER"): void => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setTypeRaw(next);
  }, []);
  const [amount, setAmount] = useState<string>("");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [counterparty, setCounterparty] = useState<string | undefined>(
    undefined
  );
  const [note, setNote] = useState<string | undefined>(undefined);
  const [date, setDate] = useState(new Date());

  // Transfer-conversion state (for type-switch to TRANSFER)
  const [toAccountId, setToAccountId] = useState<string>("");
  const [isToAccountModalOpen, setIsToAccountModalOpen] = useState(false);

  // ---------------------------------------------------------------------------
  // UI State
  // ---------------------------------------------------------------------------
  const [isOptionalExpanded, setIsOptionalExpanded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<TransactionValidationErrors>({});
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDiscardModalOpen, setIsDiscardModalOpen] = useState(false);
  const [isConversionWarningOpen, setIsConversionWarningOpen] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Track original values for dirty checking
  const originalRef = useRef<OriginalValues | null>(null);

  // ---------------------------------------------------------------------------
  // Derived Values
  // ---------------------------------------------------------------------------
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);
  const selectedToAccount = accounts.find((a) => a.id === toAccountId);
  const isTransferMode = type === "TRANSFER";
  const relevantCategories =
    type === "EXPENSE" ? expenseCategories : incomeCategories;

  const selectedCategory = categoryMap.get(selectedCategoryId) ?? null;

  // Filter accounts for transfer: from/to cannot be the same
  const fromAccountOptions = accounts.filter((a) => a.id !== toAccountId);
  const toAccountOptions = accounts.filter((a) => a.id !== selectedAccountId);

  // Check for linked relationships (debt, asset, recurring)
  const hasLinkedRelationships =
    transaction?.linkedDebtId ||
    transaction?.linkedAssetId ||
    transaction?.linkedRecurringId;

  // For income: when only 1 L1 category, show L2 children as chips
  const singleIncomeL1Id =
    type === "INCOME" && incomeCategories.length === 1
      ? incomeCategories[0].id
      : null;
  const { children: incomeL2Children } = useCategoryChildren(singleIncomeL1Id);

  const chipCategories = useMemo(() => {
    if (singleIncomeL1Id && incomeL2Children.length > 0) {
      return incomeL2Children;
    }
    return relevantCategories;
  }, [singleIncomeL1Id, incomeL2Children, relevantCategories]);

  const modalRootCategories = relevantCategories;

  // ---------------------------------------------------------------------------
  // Initialize form from transaction
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!transaction || isInitialized) return;

    const amountStr = transaction.amount.toString();
    setAmount(amountStr);
    setTypeRaw(transaction.type);
    setSelectedAccountId(transaction.accountId);
    setSelectedCategoryId(transaction.categoryId);
    setCounterparty(transaction.counterparty);
    setNote(transaction.note);
    setDate(transaction.date);

    originalRef.current = {
      amount: amountStr,
      type: transaction.type,
      categoryId: transaction.categoryId,
      accountId: transaction.accountId,
      counterparty: transaction.counterparty,
      note: transaction.note,
      date: transaction.date,
    };

    // Expand optional section if any optional fields have values
    if (transaction.counterparty || transaction.note) {
      setIsOptionalExpanded(true);
    }

    setIsInitialized(true);
  }, [transaction, isInitialized]);

  // ---------------------------------------------------------------------------
  // Dirty Checking
  // ---------------------------------------------------------------------------
  const isDirty = useMemo(() => {
    if (!originalRef.current) return false;
    const orig = originalRef.current;
    return (
      amount !== orig.amount ||
      type !== orig.type ||
      selectedCategoryId !== orig.categoryId ||
      selectedAccountId !== orig.accountId ||
      counterparty !== orig.counterparty ||
      note !== orig.note ||
      date.getTime() !== orig.date.getTime()
    );
  }, [
    amount,
    type,
    selectedCategoryId,
    selectedAccountId,
    counterparty,
    note,
    date,
  ]);

  // ---------------------------------------------------------------------------
  // Calculator Evaluation
  // ---------------------------------------------------------------------------
  const calculateResult = (expr: string): number | null => {
    return evaluateAmountExpression(expr);
  };

  const balanceProjection = (() => {
    const projectionAccount = isTransferMode
      ? accounts.find((account) => account.id === transaction?.accountId)
      : selectedAccount;

    if (!transaction || !projectionAccount || !amount) {
      return null;
    }

    const parsedAmount = calculateResult(amount);
    if (
      parsedAmount === null ||
      !Number.isFinite(parsedAmount) ||
      parsedAmount <= 0
    ) {
      return null;
    }

    const projectedEditedAmount = isTransferMode
      ? transaction.amount
      : parsedAmount;

    return calculateEditedTransactionBalanceProjection({
      currentAccountBalances: accounts.map((account) => ({
        accountId: account.id,
        balance: account.balance,
      })),
      originalAmount: transaction.amount,
      originalType: transaction.type,
      originalAccountId: transaction.accountId,
      editedAmount: projectedEditedAmount,
      editedType: type,
      editedAccountId: projectionAccount.id,
    });
  })();
  const balanceWarning = balanceProjection?.warningAccountProjection ?? null;
  const balanceWarningAccount = balanceWarning
    ? accounts.find((account) => account.id === balanceWarning.accountId)
    : null;

  // ---------------------------------------------------------------------------
  // Handle Save
  // ---------------------------------------------------------------------------
  const handleSave = async (): Promise<void> => {
    if (isSubmitting || !transaction) return;

    const parsedAmount = calculateResult(amount);
    if (
      parsedAmount === null ||
      !Number.isFinite(parsedAmount) ||
      parsedAmount <= 0
    ) {
      setFormErrors({ amount: t("invalid_amount") });
      return;
    }

    // --- Branch: Convert to Transfer ---
    if (isTransferMode) {
      if (!selectedAccountId) {
        setFormErrors({ accountId: t("please_select_source_account") });
        return;
      }
      if (!toAccountId) {
        setFormErrors({ accountId: t("please_select_destination_account") });
        return;
      }
      if (selectedAccountId === toAccountId) {
        setFormErrors({ accountId: t("accounts_must_be_different") });
        return;
      }

      // Show linkage warning if applicable (T018)
      if (hasLinkedRelationships) {
        setIsConversionWarningOpen(true);
        return;
      }

      return executeConversion();
    }

    // --- Branch: Regular Transaction Update ---
    const { isValid, errors } = validateTransactionForm(
      type,
      {
        amount,
        accountId: selectedAccountId,
        categoryId: selectedCategoryId,
      },
      undefined,
      { currency: selectedAccount?.currency }
    );

    if (!isValid) {
      setFormErrors(errors);
      return;
    }

    setIsSubmitting(true);

    try {
      await updateTransaction(transaction.id, {
        amount: parsedAmount,
        categoryId: selectedCategoryId,
        note: note || undefined,
        date,
        counterparty: counterparty || undefined,
        type,
        accountId: selectedAccountId,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        console.error
      );
      showToast({
        type: "success",
        title: t("update_success"),
        message: t("update_success_message"),
      });
      router.back();
    } catch (err) {
      console.error("[EditTransaction] Save error:", err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        console.error
      );
      showToast({ type: "error", title: t("update_error") });
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Execute the Transaction→Transfer conversion.
   * Called directly when no linkage warning is needed,
   * or from the linkage warning modal on confirm.
   */
  const executeConversion = async (): Promise<void> => {
    if (isSubmitting || !transaction) return;

    setIsSubmitting(true);
    try {
      await convertTransactionToTransfer({
        transactionId: transaction.id,
        toAccountId,
        notes: note,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        console.error
      );
      showToast({
        type: "success",
        title: t("converted_to_transfer"),
        message: t("converted_to_transfer_message"),
      });
      router.back();
    } catch (err) {
      console.error("[EditTransaction] Conversion error:", err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        console.error
      );
      showToast({ type: "error", title: t("convert_to_transfer_error") });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Calculator Key Handler
  // ---------------------------------------------------------------------------
  const handleKeyPress = (key: CalculatorKey): void => {
    // Clear amount error on interaction
    if (formErrors.amount) {
      setFormErrors((prev) => ({ ...prev, amount: undefined }));
    }

    if (key === "DONE") {
      handleSave().catch((err: unknown) =>
        console.error("[EditTransaction] Save failed:", err)
      );
      return;
    }

    if (key === "=") {
      const result = calculateResult(amount);
      if (result !== null) {
        const formatted = Number(result.toFixed(10)).toString();
        setAmount(formatted);
      }
      return;
    }

    if (key === "DEL") {
      setAmount((prev) => prev.slice(0, -1));
      return;
    }

    // Operator keys: +, -, *, /
    const isOperator = ["+", "-", "*", "/"].includes(key);

    setAmount((prev) => {
      // Prevent multiple decimals in the current number segment
      if (key === ".") {
        const lastOpIdx = Math.max(
          prev.lastIndexOf("+"),
          prev.lastIndexOf("-"),
          prev.lastIndexOf("*"),
          prev.lastIndexOf("/")
        );
        const currentSegment = prev.slice(lastOpIdx + 1);
        if (currentSegment.includes(".")) return prev;
      }

      // Prevent consecutive operators — replace the last one
      if (isOperator && prev.length > 0) {
        const lastChar = prev[prev.length - 1];
        if (["+", "-", "*", "/"].includes(lastChar)) {
          return prev.slice(0, -1) + key;
        }
      }

      // Prevent starting with an operator (except minus for negative)
      if (isOperator && prev.length === 0 && key !== "-") return prev;

      return prev + key;
    });
  };

  // ---------------------------------------------------------------------------
  // Handle Delete
  // ---------------------------------------------------------------------------
  const handleDelete = async (): Promise<void> => {
    if (!transaction) return;

    try {
      await deleteTransaction(transaction.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
        console.error
      );
      showToast({
        type: "success",
        title: t("delete_success"),
        message: t("transaction_deleted_message"),
      });
      router.back();
    } catch (err) {
      console.error("[EditTransaction] Delete error:", err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        console.error
      );
      showToast({ type: "error", title: t("delete_failed") });
    }
  };

  // ---------------------------------------------------------------------------
  // Loading / Error States
  // ---------------------------------------------------------------------------
  if (
    isLoadingTx ||
    (transaction !== null && transaction !== undefined && !isInitialized)
  ) {
    return <EditTransactionSkeleton />;
  }

  if (!transaction) {
    return (
      <View
        testID="edit-transaction-not-found"
        className="flex-1 items-center justify-center px-6 bg-background dark:bg-background-dark"
      >
        <Text className="text-lg font-semibold text-slate-500 dark:text-slate-400 text-center">
          {t("transaction_not_found")}
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="mt-4 px-6 py-3 rounded-xl bg-nileGreen-500"
        >
          <Text className="text-white font-semibold">{tCommon("back")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <View
      testID="edit-transaction-screen"
      className="flex-1 bg-background dark:bg-background-dark"
    >
      {/* Header */}
      <PageHeader
        title={t("edit_transaction")}
        showBackButton={true}
        backIcon="arrow"
        secondaryAction={{
          icon: "trash-outline",
          onPress: () => setIsDeleteModalOpen(true),
          color: palette.red[500],
        }}
        rightAction={{
          label: tCommon("save"),
          onPress: () => {
            handleSave().catch((err: unknown) =>
              console.error("[EditTransaction] Save failed:", err)
            );
          },
          loading: isSubmitting,
          disabled: !isDirty,
        }}
      />

      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-10"
        showsVerticalScrollIndicator={false}
      >
        {/* Recurring Warning */}
        {transaction.linkedRecurringId && (
          <RecurringWarningBanner recurringId={transaction.linkedRecurringId} />
        )}

        {/* Type Tabs (EXPENSE / INCOME / TRANSFER) */}
        <View className="mt-4">
          <TypeTabs selectedType={type} onSelect={setType} />
        </View>

        {/* Amount Display */}
        <>
          {/* Insufficient balance warning */}
          {balanceWarning && balanceWarningAccount && (
            <Text className="text-amber-500 text-xs font-medium text-center mb-1">
              {t("warning_negative_balance")}{" "}
              {formatAmountInput(
                balanceWarning.projectedBalance.toFixed(2),
                "0"
              )}{" "}
              {balanceWarningAccount.currency}
            </Text>
          )}
          <AmountDisplay
            amount={amount}
            currency={selectedAccount?.currency || "EGP"}
            type={type}
            mainColor={selectedCategory?.color}
            originalAmount={originalRef.current?.amount}
            onPress={
              isOptionalExpanded
                ? () => setIsOptionalExpanded(false)
                : undefined
            }
          />
          {formErrors.amount && (
            <Text className="text-red-500 text-xs font-medium text-center mt-1">
              {formErrors.amount}
            </Text>
          )}
        </>

        <EditTransactionFields
          isTransferMode={isTransferMode}
          type={type}
          selectedAccount={selectedAccount}
          selectedToAccount={selectedToAccount}
          selectedCategory={selectedCategory}
          chipCategories={chipCategories}
          formErrors={formErrors}
          isDark={isDark}
          isOptionalExpanded={isOptionalExpanded}
          counterparty={counterparty}
          note={note}
          date={date}
          t={t}
          tCommon={tCommon}
          onOpenAccountPicker={() => {
            setFormErrors((prev) => ({ ...prev, accountId: undefined }));
            setIsAccountModalOpen(true);
          }}
          onOpenToAccountPicker={() => {
            setFormErrors((prev) => ({ ...prev, accountId: undefined }));
            setIsToAccountModalOpen(true);
          }}
          onOpenCategoryPicker={() => {
            setFormErrors((prev) => ({ ...prev, categoryId: undefined }));
            setIsCategoryModalOpen(true);
          }}
          onSwapAccounts={() => {
            const tempFrom = selectedAccountId;
            setSelectedAccountId(toAccountId);
            setToAccountId(tempFrom);
          }}
          onSelectCategory={setSelectedCategoryId}
          onToggleOptional={() => setIsOptionalExpanded(false)}
          onOptionalChange={(updates) => {
            if (updates.counterparty !== undefined)
              setCounterparty(updates.counterparty);
            if (updates.note !== undefined) setNote(updates.note);
            if (updates.date !== undefined) setDate(updates.date);
          }}
        />
      </ScrollView>

      {/* "More details" bar — hidden in transfer mode */}
      {!isOptionalExpanded && !isTransferMode && (
        <TouchableOpacity
          onPress={() => setIsOptionalExpanded(true)}
          className="flex-row items-center justify-center py-2 border-t border-slate-200 dark:border-slate-800 bg-background dark:bg-background-dark"
        >
          <Ionicons
            name="create-outline"
            size={16}
            color={isDark ? palette.nileGreen[400] : palette.nileGreen[600]}
          />
          <Text className="ms-1.5 text-sm font-bold text-nileGreen-600 dark:text-nileGreen-400">
            {t("add_more_details")}
          </Text>
          <Ionicons
            name="chevron-down"
            size={14}
            color={isDark ? palette.nileGreen[400] : palette.nileGreen[600]}
            className="ms-1"
          />
        </TouchableOpacity>
      )}

      {/* Keypad */}
      <CalculatorKeypad
        onKeyPress={handleKeyPress}
        hide={isOptionalExpanded}
        actionLabel={t("save_changes")}
      />

      {/* Safe area spacer when keypad hidden */}
      {isOptionalExpanded && <View style={{ height: insets.bottom }} />}

      {/* Modals */}
      <AccountSelectorModal
        visible={isAccountModalOpen}
        accounts={isTransferMode ? fromAccountOptions : accounts}
        selectedId={selectedAccountId}
        onSelect={setSelectedAccountId}
        onClose={() => setIsAccountModalOpen(false)}
      />

      {isTransferMode && (
        <AccountSelectorModal
          visible={isToAccountModalOpen}
          accounts={toAccountOptions}
          selectedId={toAccountId}
          onSelect={setToAccountId}
          onClose={() => setIsToAccountModalOpen(false)}
        />
      )}

      {!isTransferMode && (
        <CategorySelectorModal
          visible={isCategoryModalOpen}
          rootCategories={modalRootCategories}
          selectedId={selectedCategoryId}
          type={type}
          onSelect={setSelectedCategoryId}
          onClose={() => setIsCategoryModalOpen(false)}
        />
      )}

      {/* Delete Confirmation */}
      <ConfirmationModal
        visible={isDeleteModalOpen}
        onConfirm={() => {
          handleDelete().catch((err: unknown) =>
            console.error("[EditTransaction] Delete failed:", err)
          );
        }}
        onCancel={() => setIsDeleteModalOpen(false)}
        title={t("delete_transaction_title")}
        message={t("delete_transaction_message")}
        confirmLabel={tCommon("delete")}
        variant="danger"
      />

      {/* Discard Changes Confirmation */}
      <ConfirmationModal
        visible={isDiscardModalOpen}
        onConfirm={() => router.back()}
        onCancel={() => setIsDiscardModalOpen(false)}
        title={t("discard_changes_title")}
        message={t("discard_changes_message")}
        confirmLabel={t("discard")}
        variant="warning"
        icon="alert-circle-outline"
      />

      {/* Linked Relationships Warning (T018) — shown when converting to Transfer */}
      <ConfirmationModal
        visible={isConversionWarningOpen}
        onConfirm={() => {
          setIsConversionWarningOpen(false);
          executeConversion().catch((err: unknown) =>
            console.error("[EditTransaction] Conversion failed:", err)
          );
        }}
        onCancel={() => setIsConversionWarningOpen(false)}
        title={t("linked_data_warning_title")}
        message={[
          t("linked_data_warning_converting"),
          transaction?.linkedDebtId ? t("linked_data_debt") : "",
          transaction?.linkedAssetId ? t("linked_data_asset") : "",
          transaction?.linkedRecurringId ? t("linked_data_recurring") : "",
          `\n${t("linked_data_warning_preserved")}`,
        ]
          .filter(Boolean)
          .join("\n")}
        confirmLabel={t("convert_anyway")}
        cancelLabel={tCommon("cancel")}
        variant="warning"
        icon="link-outline"
      />
    </View>
  );
}

function EditTransactionSkeleton(): React.JSX.Element {
  return (
    <View
      testID="edit-transaction-skeleton"
      className="flex-1 bg-background dark:bg-background-dark px-6 pt-6"
    >
      <Skeleton width="45%" height={28} borderRadius={8} />
      <View className="mt-8 items-center">
        <Skeleton width={180} height={64} borderRadius={16} />
      </View>
      <View className="mt-8 flex-row gap-4">
        <Skeleton width="48%" height={72} borderRadius={16} />
        <Skeleton width="48%" height={72} borderRadius={16} />
      </View>
      <View className="mt-6">
        <Skeleton width="100%" height={92} borderRadius={16} />
      </View>
    </View>
  );
}
