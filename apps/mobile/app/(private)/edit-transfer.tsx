/**
 * Edit Transfer Screen
 *
 * Pre-populates form fields from an existing transfer and allows
 * editing amount, from account, to account, notes, and date.
 * Includes delete and discard modals.
 */

import { AmountDisplay } from "@/components/add-transaction/AmountDisplay";
import {
  type CalculatorKey,
  CalculatorKeypad,
} from "@/components/add-transaction/CalculatorKeypad";
import {
  type OptionalFields,
  OptionalSection,
} from "@/components/add-transaction/OptionalSection";
import { TypeTabs } from "@/components/add-transaction/TypeTabs";
import { ConfirmationModal } from "@/components/modals/ConfirmationModal";
import { AccountSelectorModal } from "@/components/modals/AccountSelectorModal";
import { CategorySelectorModal } from "@/components/modals/CategorySelectorModal";
import { PageHeader } from "@/components/navigation/PageHeader";
import { palette } from "@/constants/colors";
import { useToast } from "@/components/ui/Toast";
import { useCategoryLookup } from "@/context/CategoriesContext";
import { useTheme } from "@/context/ThemeContext";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { useTransferById } from "@/hooks/useTransferById";
import {
  convertTransferToTransaction,
  deleteTransfer,
  updateTransfer,
} from "@/services/transfer-service";
import {
  evaluateAmountExpression,
  formatAmountInput,
  isValidTransactionAmount,
  parsePositiveFiniteAmountInput,
} from "@monyvi/logic";
import { Ionicons } from "@expo/vector-icons";
import type { TransactionType } from "@monyvi/db";
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
  ActivityIndicator,
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
  readonly fromAccountId: string;
  readonly toAccountId: string;
  readonly notes: string | undefined;
  readonly date: Date;
}

// =============================================================================
// Component
// =============================================================================

export default function EditTransfer(): React.ReactNode {
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
  const { transfer, isLoading: isLoadingTransfer } = useTransferById(id);
  const { accounts } = useAccounts();
  const { expenseCategories, incomeCategories } = useCategories();
  const categoryMap = useCategoryLookup();

  // ---------------------------------------------------------------------------
  // Form State
  // ---------------------------------------------------------------------------
  const [amount, setAmount] = useState<string>("");
  const [targetAmount, setTargetAmount] = useState<string>("");
  const [activeAmountField, setActiveAmountField] = useState<
    "amount" | "targetAmount"
  >("amount");
  const [fromAccountId, setFromAccountId] = useState<string>("");
  const [toAccountId, setToAccountId] = useState<string>("");
  const [notes, setNotes] = useState<string | undefined>(undefined);
  const [date, setDate] = useState(new Date());

  // Conversion state (for type-switch to EXPENSE/INCOME)
  const [selectedType, setSelectedTypeRaw] = useState<
    TransactionType | "TRANSFER"
  >("TRANSFER");

  /** Wraps setSelectedType with LayoutAnimation for smooth form content swap */
  const setSelectedType = useCallback(
    (next: TransactionType | "TRANSFER"): void => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setSelectedTypeRaw(next);
    },
    []
  );
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [counterparty, _setCounterparty] = useState<string | undefined>(
    undefined
  );

  // ---------------------------------------------------------------------------
  // UI State
  // ---------------------------------------------------------------------------
  const [isOptionalExpanded, setIsOptionalExpanded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFromAccountModalOpen, setIsFromAccountModalOpen] = useState(false);
  const [isToAccountModalOpen, setIsToAccountModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDiscardModalOpen, setIsDiscardModalOpen] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [amountError, setAmountError] = useState<string | undefined>(undefined);

  // Track original values for dirty checking
  const originalRef = useRef<OriginalValues | null>(null);

  // ---------------------------------------------------------------------------
  // Derived Values
  // ---------------------------------------------------------------------------
  const fromAccount = accounts.find((a) => a.id === fromAccountId);
  const toAccount = accounts.find((a) => a.id === toAccountId);
  const isTransferMode = selectedType === "TRANSFER";
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);
  const selectedCategory = categoryMap.get(selectedCategoryId) ?? null;
  const relevantCategories =
    selectedType === "INCOME" ? incomeCategories : expenseCategories;

  // Filter out the selected "from" account from "to" options and vice versa
  const toAccountOptions = useMemo(
    () => accounts.filter((a) => a.id !== fromAccountId),
    [accounts, fromAccountId]
  );
  const fromAccountOptions = useMemo(
    () => accounts.filter((a) => a.id !== toAccountId),
    [accounts, toAccountId]
  );

  // ---------------------------------------------------------------------------
  // Initialize form from transfer
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!transfer || isInitialized) return;

    const amountStr = transfer.amount.toString();
    setAmount(amountStr);
    if (
      transfer.convertedAmount !== undefined &&
      transfer.convertedAmount !== null
    ) {
      setTargetAmount(transfer.convertedAmount.toString());
    }
    setFromAccountId(transfer.fromAccountId);
    setToAccountId(transfer.toAccountId);
    setNotes(transfer.notes);
    setDate(transfer.date);

    originalRef.current = {
      amount: amountStr,
      fromAccountId: transfer.fromAccountId,
      toAccountId: transfer.toAccountId,
      notes: transfer.notes,
      date: transfer.date,
    };

    // Expand optional section if notes exist
    if (transfer.notes) {
      setIsOptionalExpanded(true);
    }

    setIsInitialized(true);
  }, [transfer, isInitialized]);

  // ---------------------------------------------------------------------------
  // Dirty Checking
  // ---------------------------------------------------------------------------
  const isDirty = useMemo(() => {
    if (!originalRef.current) return false;
    const orig = originalRef.current;
    return (
      amount !== orig.amount ||
      fromAccountId !== orig.fromAccountId ||
      toAccountId !== orig.toAccountId ||
      notes !== orig.notes ||
      date.getTime() !== orig.date.getTime()
    );
  }, [amount, fromAccountId, toAccountId, notes, date]);

  // ---------------------------------------------------------------------------
  // Calculator Evaluation
  // ---------------------------------------------------------------------------
  const calculateResult = (expr: string): number | null => {
    return evaluateAmountExpression(expr);
  };

  // ---------------------------------------------------------------------------
  // Handle Save
  // ---------------------------------------------------------------------------
  const handleSave = async (): Promise<void> => {
    if (isSubmitting || !transfer) return;

    // Basic validation
    const parsedAmount = calculateResult(amount);
    if (
      parsedAmount === null ||
      !Number.isFinite(parsedAmount) ||
      !isValidTransactionAmount(parsedAmount)
    ) {
      setAmountError(t("invalid_amount"));
      return;
    }

    const parsedTargetAmount = targetAmount
      ? parsePositiveFiniteAmountInput(targetAmount)
      : null;
    if (
      targetAmount &&
      (parsedTargetAmount === null ||
        !isValidTransactionAmount(parsedTargetAmount))
    ) {
      setAmountError(t("invalid_amount"));
      return;
    }

    // --- Branch: Convert to Transaction ---
    if (!isTransferMode) {
      if (!selectedAccountId) {
        showToast({ type: "error", title: t("please_select_an_account") });
        return;
      }
      if (!selectedCategoryId) {
        showToast({ type: "error", title: t("select_category") });
        return;
      }

      setIsSubmitting(true);

      try {
        await convertTransferToTransaction({
          transferId: transfer.id,
          accountId: selectedAccountId,
          type: selectedType,
          categoryId: selectedCategoryId,
          counterparty: counterparty || undefined,
        });

        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success
        ).catch(console.error);
        showToast({
          type: "success",
          title: t("converted_to_type", { type: selectedType.toLowerCase() }),
        });
        router.back();
      } catch (err) {
        console.error("[EditTransfer] Conversion error:", err);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
          console.error
        );
        showToast({ type: "error", title: t("convert_error") });
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // --- Branch: Regular Transfer Update ---
    if (!fromAccountId) {
      showToast({ type: "error", title: t("please_select_source_account") });
      return;
    }

    if (!toAccountId) {
      showToast({
        type: "error",
        title: t("please_select_destination_account"),
      });
      return;
    }

    if (fromAccountId === toAccountId) {
      showToast({ type: "error", title: t("accounts_must_be_different") });
      return;
    }

    setIsSubmitting(true);

    try {
      await updateTransfer(transfer.id, {
        amount: parsedAmount,
        convertedAmount: parsedTargetAmount ?? undefined,
        notes: notes || undefined,
        date,
        fromAccountId,
        toAccountId,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        console.error
      );
      showToast({ type: "success", title: t("update_success") });
      router.back();
    } catch (err) {
      console.error("[EditTransfer] Save error:", err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        console.error
      );
      showToast({ type: "error", title: t("update_error") });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Calculator Key Handler
  // ---------------------------------------------------------------------------
  const handleKeyPress = (key: CalculatorKey): void => {
    // Clear amount error on interaction
    if (amountError) {
      setAmountError(undefined);
    }

    if (key === "DONE") {
      handleSave().catch((err: unknown) =>
        console.error("[EditTransfer] Save failed:", err)
      );
      return;
    }

    // Determine which field to edit based on active selection
    const isTargetField =
      isTransferMode && activeAmountField === "targetAmount";
    const currentValue = isTargetField ? targetAmount : amount;
    const setValue = isTargetField ? setTargetAmount : setAmount;

    if (key === "=") {
      const result = calculateResult(currentValue);
      if (result !== null) {
        const formatted = Number(result.toFixed(10)).toString();
        setValue(formatted);
      }
      return;
    }

    if (key === "DEL") {
      setValue((prev) => prev.slice(0, -1));
      return;
    }

    // Operator keys: +, -, *, /
    const isOperator = ["+", "-", "*", "/"].includes(key);

    setValue((prev) => {
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
    if (!transfer) return;

    try {
      await deleteTransfer(transfer.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
        console.error
      );
      showToast({ type: "success", title: t("delete_success") });
      router.back();
    } catch (err) {
      console.error("[EditTransfer] Delete error:", err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        console.error
      );
      showToast({ type: "error", title: t("delete_failed") });
    }
  };

  // ---------------------------------------------------------------------------
  // Loading / Not Found
  // ---------------------------------------------------------------------------
  if (isLoadingTransfer) {
    return (
      <View
        testID="edit-transfer-loading"
        className="flex-1 items-center justify-center bg-background dark:bg-background-dark"
      >
        <ActivityIndicator size="large" color={palette.nileGreen[500]} />
      </View>
    );
  }

  if (!transfer) {
    return (
      <View
        testID="edit-transfer-not-found"
        className="flex-1 items-center justify-center px-6 bg-background dark:bg-background-dark"
      >
        <Text className="text-lg font-semibold text-slate-500 dark:text-slate-400 text-center">
          {t("transfer_not_found")}
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
      testID="edit-transfer-screen"
      className="flex-1 bg-background dark:bg-background-dark"
    >
      {/* Header */}
      <PageHeader
        title={t("edit_transfer")}
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
              console.error("[EditTransfer] Save failed:", err)
            );
          },
          loading: isSubmitting,
          disabled: !isDirty,
        }}
      />

      <ScrollView
        className="flex-1 bg-background dark:bg-background-dark"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* Type Tabs */}
        <View className="mt-4">
          <TypeTabs selectedType={selectedType} onSelect={setSelectedType} />
        </View>

        {/* Amount Display */}
        <View className="px-6">
          <AmountDisplay
            amount={formatAmountInput(amount, "0")}
            currency={
              isTransferMode
                ? fromAccount?.currency || "EGP"
                : selectedAccount?.currency || "EGP"
            }
            type={selectedType}
            mainColor={!isTransferMode ? selectedCategory?.color : undefined}
            originalAmount={
              originalRef.current?.amount
                ? formatAmountInput(originalRef.current.amount, "0")
                : undefined
            }
            onPress={() => {
              if (isOptionalExpanded) setIsOptionalExpanded(false);
              if (isTransferMode) setActiveAmountField("amount");
            }}
          />
          {amountError && (
            <Text className="text-red-500 text-xs mt-1 text-center">
              {amountError}
            </Text>
          )}
        </View>

        {/* Conditional Form Content */}
        {isTransferMode ? (
          /* ---- Transfer Mode: From/To Account Selectors ---- */
          <View className="px-6 mt-6">
            {/* From Account */}
            <View className="mb-4">
              <Text className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">
                {t("from_account")}
              </Text>
              <TouchableOpacity
                onPress={() => setIsFromAccountModalOpen(true)}
                className="flex-row items-center p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50"
              >
                <View className="w-9 h-9 rounded-xl items-center justify-center me-3 bg-red-100 dark:bg-red-900/30">
                  <Ionicons
                    name="arrow-up-outline"
                    size={18}
                    color={isDark ? palette.red[400] : palette.red[600]}
                  />
                </View>
                <Text
                  numberOfLines={1}
                  className="flex-1 text-sm font-semibold text-slate-900 dark:text-white"
                >
                  {fromAccount?.name || tCommon("select")}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={isDark ? palette.slate[500] : palette.slate[400]}
                />
              </TouchableOpacity>
            </View>

            {/* Swap Button */}
            <View className="items-center -my-1">
              <TouchableOpacity
                onPress={() => {
                  setFromAccountId(toAccountId);
                  setToAccountId(fromAccountId);
                }}
                className="w-10 h-10 rounded-full items-center justify-center bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              >
                <Ionicons
                  name="swap-vertical"
                  size={20}
                  color={isDark ? palette.slate[400] : palette.slate[500]}
                />
              </TouchableOpacity>
            </View>

            {/* To Account */}
            <View className="mt-4">
              <Text className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">
                {t("to_account")}
              </Text>
              <TouchableOpacity
                onPress={() => setIsToAccountModalOpen(true)}
                className="flex-row items-center p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50"
              >
                <View className="w-9 h-9 rounded-xl items-center justify-center me-3 bg-nileGreen-100 dark:bg-nileGreen-900/30">
                  <Ionicons
                    name="arrow-down-outline"
                    size={18}
                    color={
                      isDark ? palette.nileGreen[400] : palette.nileGreen[600]
                    }
                  />
                </View>
                <Text
                  numberOfLines={1}
                  className="flex-1 text-sm font-semibold text-slate-900 dark:text-white"
                >
                  {toAccount?.name || tCommon("select")}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={isDark ? palette.slate[500] : palette.slate[400]}
                />
              </TouchableOpacity>
            </View>

            {/* Target Amount — shown for cross-currency transfers */}
            {fromAccount &&
              toAccount &&
              fromAccount.currency !== toAccount.currency && (
                <View className="mt-4">
                  <Text className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">
                    {t("received_currency", { currency: toAccount.currency })}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setActiveAmountField("targetAmount")}
                    className={`flex-row items-center p-3 rounded-xl border bg-slate-50 dark:bg-slate-800/50 ${
                      activeAmountField === "targetAmount"
                        ? "border-nileGreen-500"
                        : "border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    <Text className="flex-1 text-base font-bold text-slate-900 dark:text-white">
                      {formatAmountInput(targetAmount, "0")}
                    </Text>
                    <Text className="text-xs font-medium text-slate-400 dark:text-slate-500 ms-2">
                      {toAccount.currency}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
          </View>
        ) : (
          /* ---- Transaction Mode: Single Account + Category ---- */
          <View className="px-6 mt-4">
            <View className="flex-row gap-4 mb-4">
              {/* Account Field */}
              <View className="flex-1">
                <Text className="input-label">
                  {t("account").toUpperCase()}
                </Text>
                <TouchableOpacity
                  onPress={() => setIsAccountModalOpen(true)}
                  activeOpacity={0.7}
                  className="flex-row items-center bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700"
                >
                  <View
                    className="w-8 h-8 rounded-xl items-center justify-center me-2 bg-slate-100 dark:bg-slate-700/50"
                    style={{
                      backgroundColor: selectedCategory?.color
                        ? `${selectedCategory.color}20`
                        : undefined,
                    }}
                  >
                    <Ionicons
                      name={
                        selectedAccount?.type === "BANK"
                          ? "business-outline"
                          : selectedAccount?.type === "DIGITAL_WALLET"
                            ? "card-outline"
                            : "wallet-outline"
                      }
                      size={18}
                      color={
                        selectedCategory?.color ||
                        (isDark ? palette.slate[400] : palette.slate[500])
                      }
                    />
                  </View>
                  <Text
                    numberOfLines={1}
                    className="flex-1 text-sm font-semibold text-slate-900 dark:text-white"
                  >
                    {selectedAccount?.name || tCommon("select")}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Category Field */}
              <View className="flex-1">
                <Text className="input-label">
                  {t("category").toUpperCase()}
                </Text>
                <TouchableOpacity
                  onPress={() => setIsCategoryModalOpen(true)}
                  activeOpacity={0.7}
                  className="flex-row items-center bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700"
                >
                  <View
                    className="w-8 h-8 rounded-xl items-center justify-center me-2"
                    style={{
                      backgroundColor: selectedCategory?.color
                        ? `${selectedCategory.color}20`
                        : isDark
                          ? palette.slate[700]
                          : palette.slate[100],
                    }}
                  >
                    {selectedCategory?.icon ? (
                      <Ionicons
                        name={
                          selectedCategory.icon as keyof typeof Ionicons.glyphMap
                        }
                        size={18}
                        color={
                          selectedCategory.color ||
                          (isDark ? palette.slate[400] : palette.slate[500])
                        }
                      />
                    ) : (
                      <Ionicons
                        name="grid-outline"
                        size={18}
                        color={isDark ? palette.slate[400] : palette.slate[500]}
                      />
                    )}
                  </View>
                  <Text
                    numberOfLines={1}
                    className="flex-1 text-sm font-semibold text-slate-900 dark:text-white"
                  >
                    {selectedCategory?.displayName || tCommon("select")}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Optional Section: Notes + Date — only in transaction mode */}
        {isOptionalExpanded && !isTransferMode && (
          <OptionalSection
            expanded={isOptionalExpanded}
            onToggleExpand={() => setIsOptionalExpanded(false)}
            transactionType="TRANSFER"
            fields={{
              note: notes,
              date,
              isRecurring: false,
              recurringName: "",
              recurringFrequency: "MONTHLY" as const,
              recurringAutoCreate: false,
            }}
            onChange={(updates: Partial<OptionalFields>) => {
              if (updates.note !== undefined) setNotes(updates.note);
              if (updates.date !== undefined) setDate(updates.date);
            }}
            hideRecurring
          />
        )}
      </ScrollView>

      {/* "More details" bar — hidden in transfer mode */}
      {!isOptionalExpanded && !isTransferMode && (
        <TouchableOpacity
          onPress={() => setIsOptionalExpanded(true)}
          className="flex-row items-center justify-center py-2 border-t border-slate-200 dark:border-slate-800"
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
      {/* Account selector modals (Transfer mode) */}
      <AccountSelectorModal
        visible={isFromAccountModalOpen}
        accounts={fromAccountOptions}
        selectedId={fromAccountId}
        onSelect={setFromAccountId}
        onClose={() => setIsFromAccountModalOpen(false)}
      />

      <AccountSelectorModal
        visible={isToAccountModalOpen}
        accounts={toAccountOptions}
        selectedId={toAccountId}
        onSelect={setToAccountId}
        onClose={() => setIsToAccountModalOpen(false)}
      />

      {/* Account selector modal (Transaction mode) */}
      {!isTransferMode && (
        <AccountSelectorModal
          visible={isAccountModalOpen}
          accounts={accounts}
          selectedId={selectedAccountId}
          onSelect={setSelectedAccountId}
          onClose={() => setIsAccountModalOpen(false)}
        />
      )}

      {/* Category selector modal (Transaction mode) */}
      {!isTransferMode && (
        <CategorySelectorModal
          visible={isCategoryModalOpen}
          rootCategories={relevantCategories}
          selectedId={selectedCategoryId}
          type={selectedType}
          onSelect={setSelectedCategoryId}
          onClose={() => setIsCategoryModalOpen(false)}
        />
      )}

      {/* Delete Confirmation */}
      <ConfirmationModal
        visible={isDeleteModalOpen}
        onConfirm={() => {
          handleDelete().catch((err: unknown) =>
            console.error("[EditTransfer] Delete failed:", err)
          );
        }}
        onCancel={() => setIsDeleteModalOpen(false)}
        title={t("delete_transfer_title")}
        message={t("delete_transfer_message")}
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
    </View>
  );
}
