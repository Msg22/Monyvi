import { AmountDisplay } from "@/components/add-transaction/AmountDisplay";
import {
  CalculatorKey,
  CalculatorKeypad,
} from "@/components/add-transaction/CalculatorKeypad";
import { CategoryPicker } from "@/components/add-transaction/CategoryPicker";
import { OptionalSection } from "@/components/add-transaction/OptionalSection";
import { TransferFields } from "@/components/add-transaction/TransferFields";
import { TypeTabs } from "@/components/add-transaction/TypeTabs";
import { CategoryIcon, IconLibrary } from "@/components/common/CategoryIcon";
import { AccountSelectorModal } from "@/components/modals/AccountSelectorModal";
import { CategorySelectorModal } from "@/components/modals/CategorySelectorModal";
import { PageHeader } from "@/components/navigation/PageHeader";
import { EmptyStateCard } from "@/components/ui/EmptyStateCard";
import { useToast } from "@/components/ui/Toast";
import { palette } from "@/constants/colors";
import { useCategoryLookup } from "@/context/CategoriesContext";
import { useTheme } from "@/context/ThemeContext";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { useCategoryChildren } from "@/hooks/useCategoryChildren";
import { useMarketRates } from "@/hooks/useMarketRates";
import {
  createRecurringPayment,
  RECURRING_PAYMENT_SERVICE_ERROR_CODES,
} from "@/services/recurring-payment-service";
import { createTransaction } from "@/services/transaction-service";
import { createTransfer } from "@/services/transfer-service";
import { resolveInitialTransactionAccountSelection } from "@/utils/account-selection";
import { useBudgetAlert } from "@/hooks/useBudgetAlert";
import { BudgetAlertModal } from "@/components/budget/BudgetAlertModal";
import {
  validateTransactionForm,
  type TransactionValidationErrors,
} from "@/validation/transaction-validation";
import type {
  CurrencyType,
  RecurringFrequency,
  TransactionType,
  Transaction,
} from "@monyvi/db";
import {
  evaluateAmountExpression,
  formatAmountInput,
  getCurrencyRate,
  parsePositiveFiniteAmountInput,
} from "@monyvi/logic";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePreferredCurrency } from "@/hooks/usePreferredCurrency";

export default function AddTransaction(): React.ReactNode {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const budgetAlert = useBudgetAlert();
  const { t } = useTranslation("transactions");

  const { accounts } = useAccounts();

  const [type, setType] = useState<TransactionType | "TRANSFER">("EXPENSE");
  const [amount, setAmount] = useState<string>("");
  const [targetAmount, setTargetAmount] = useState<string>("");

  // Selection State
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null
  );
  const [toAccountId, setToAccountId] = useState<string | null>(null); // For Transfer
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");

  // Optional Fields
  const [counterparty, setCounterparty] = useState<string | undefined>(
    undefined
  );
  const [note, setNote] = useState<string | undefined>(undefined);
  const [date, setDate] = useState(new Date());
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringName, setRecurringName] = useState("");
  const [recurringFrequency, setRecurringFrequency] =
    useState<RecurringFrequency>("MONTHLY");
  const [recurringAutoCreate, setRecurringAutoCreate] = useState(false);

  // UI State
  const [isOptionalExpanded, setIsOptionalExpanded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<TransactionValidationErrors>({});
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [activeAmountField, setActiveAmountField] = useState<
    "amount" | "targetAmount"
  >("amount");
  const hasInitializedAccountSelectionRef = useRef(false);
  const hasUserSelectedAccountRef = useRef(false);
  const { isDark } = useTheme();

  // Hooks
  const {
    expenseCategories,
    incomeCategories,
    isLoading: _categoriesLoading,
  } = useCategories();
  const { latestRates } = useMarketRates();
  const { showToast } = useToast();
  const { preferredCurrency } = usePreferredCurrency();

  // Derived Values
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);
  const toAccount = accounts.find((a) => a.id === toAccountId);

  const relevantCategories =
    type === "EXPENSE" ? expenseCategories : incomeCategories;

  // Use global category map — supports L2/L3 categories
  // that are not in the root-level categories list
  const categoryMap = useCategoryLookup();
  const selectedCategory = categoryMap.get(selectedCategoryId) ?? null;
  // For income: when only 1 L1 category, fetch its L2 children for chips
  const singleIncomeL1Id =
    type === "INCOME" && incomeCategories.length === 1
      ? incomeCategories[0].id
      : null;
  const { children: incomeL2Children } = useCategoryChildren(singleIncomeL1Id);

  // Categories to show in chips: income L2 when only 1 L1, otherwise L1
  const chipCategories = useMemo(() => {
    if (singleIncomeL1Id && incomeL2Children.length > 0) {
      return incomeL2Children;
    }
    return relevantCategories;
  }, [singleIncomeL1Id, incomeL2Children, relevantCategories]);

  // Categories to pass as root to the modal
  const modalRootCategories = relevantCategories;

  const hasAccounts = accounts.length > 0;
  const canTransfer = accounts.length >= 2;

  // Initialize Defaults
  useEffect(() => {
    if (!hasAccounts) {
      hasInitializedAccountSelectionRef.current = false;
      hasUserSelectedAccountRef.current = false;
      return;
    }

    if (
      hasInitializedAccountSelectionRef.current ||
      hasUserSelectedAccountRef.current
    ) {
      return;
    }

    const selection = resolveInitialTransactionAccountSelection(accounts);
    if (!selection.selectedAccountId) return;

    setSelectedAccountId(selection.selectedAccountId);
    setToAccountId(selection.toAccountId);
    hasInitializedAccountSelectionRef.current = true;
  }, [accounts, hasAccounts]);

  // Track the previous type to only auto-reset category on type change.
  // Without this, selecting L2/L3 categories resets to L1 because
  // the effect would validate against the L1-only relevantCategories.
  const prevTypeRef = useRef(type);

  useEffect(() => {
    if (relevantCategories.length === 0) return;

    const typeChanged = prevTypeRef.current !== type;
    prevTypeRef.current = type;

    // Auto-select first category when: no selection yet, or type just changed
    if (!selectedCategoryId || typeChanged) {
      setSelectedCategoryId(relevantCategories[0].id);
    }

    // Reset keypad target to main amount when switching away from TRANSFER
    if (typeChanged && type !== "TRANSFER") {
      setActiveAmountField("amount");
    }
  }, [relevantCategories, selectedCategoryId, type]);

  // Calculator Logic
  const handleKeyPress = async (key: CalculatorKey): Promise<void> => {
    // Clear amount error on interaction
    if (formErrors.amount) {
      setFormErrors((prev) => ({ ...prev, amount: undefined }));
    }

    if (key === "DONE") {
      await handleSave();
      return;
    }

    // Determine which setter to use based on active field
    const isTargetField = activeAmountField === "targetAmount";
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

  // Convert amount logic
  const calculateResult = (expr: string): number | null => {
    return evaluateAmountExpression(expr);
  };

  // Auto-calculate target amount for transfers
  useEffect(() => {
    if (
      type === "TRANSFER" &&
      selectedAccount &&
      toAccount &&
      amount &&
      selectedAccount.currency !== toAccount.currency
    ) {
      const numAmount = calculateResult(amount);
      if (numAmount !== null && numAmount > 0) {
        if (latestRates) {
          const rate = getCurrencyRate(
            latestRates,
            selectedAccount.currency,
            toAccount.currency
          );
          setTargetAmount((numAmount * rate).toFixed(2));
        }
      }
    }
  }, [type, selectedAccount, toAccount, amount, latestRates]);

  const createRecurring = async (
    amount: number,
    type: TransactionType,
    currency: CurrencyType
  ): Promise<string> => {
    if (!selectedAccountId) {
      throw new Error(t("please_select_an_account"));
    }

    const recurring = await createRecurringPayment({
      name: recurringName,
      amount,
      currency,
      type,
      accountId: selectedAccountId,
      categoryId: selectedCategoryId,
      frequency: recurringFrequency,
      startDate: date,
      action: recurringAutoCreate ? "AUTO_CREATE" : "NOTIFY",
    });
    return recurring.id;
  };

  const validateAndCreateTransfer = async (amount: number): Promise<void> => {
    if (!toAccountId) {
      setFormErrors({ toAccountId: t("please_select_destination_account") });
      setIsSubmitting(false);
      return;
    }

    if (!selectedAccountId || !selectedAccount) {
      setFormErrors({ fromAccountId: t("please_select_source_account") });
      setIsSubmitting(false);
      return;
    }

    const parsedTargetAmount = targetAmount
      ? parsePositiveFiniteAmountInput(targetAmount)
      : null;
    if (targetAmount && parsedTargetAmount === null) {
      setFormErrors({ amount: t("invalid_amount") });
      return;
    }

    const exchangeRate =
      parsedTargetAmount !== null && amount > 0
        ? parsedTargetAmount / amount
        : undefined;

    try {
      await createTransfer({
        amount,
        currency: selectedAccount.currency,
        fromAccountId: selectedAccountId,
        toAccountId,
        date,
        notes: note,
        convertedAmount: parsedTargetAmount ?? undefined,
        exchangeRate,
      });

      showToast({
        type: "success",
        title: t("transfer_created"),
        message: t("transfer_created_message"),
      });
    } catch (error: unknown) {
      showToast({
        type: "error",
        title: t("update_error"),
        message: t("transaction_creation_failed"),
      });
      throw error;
    }
  };

  const validateAndCreateTransaction = async ({
    amount,
    note,
    type,
    linkedRecurringId,
  }: {
    amount: number;
    note?: string;
    type: TransactionType;
    linkedRecurringId?: string;
  }): Promise<Transaction | undefined> => {
    if (!selectedAccountId || !selectedAccount) {
      setFormErrors({ accountId: t("please_select_an_account") });
      setIsSubmitting(false);
      return undefined;
    }

    return createTransaction({
      amount,
      currency: selectedAccount.currency,
      categoryId: selectedCategoryId,
      counterparty,
      accountId: selectedAccountId,
      note,
      source: "MANUAL",
      type,
      date,
      linkedRecurringId,
    });
  };

  // Handle Save
  const handleSave = async (): Promise<void> => {
    // Clear previous errors
    setFormErrors({});

    // Build form data for validation
    const formData =
      type === "TRANSFER"
        ? { amount, fromAccountId: selectedAccountId, toAccountId }
        : {
            amount,
            accountId: selectedAccountId,
            categoryId: selectedCategoryId,
          };

    const { isValid, errors } = validateTransactionForm(type, formData, {
      accountRequired: t("please_select_an_account"),
      sourceAccountRequired: t("please_select_source_account"),
      destinationAccountRequired: t("please_select_destination_account"),
    });
    if (!isValid) {
      setFormErrors(errors);
      return;
    }

    const finalAmount = calculateResult(amount);
    if (finalAmount === null || finalAmount <= 0) {
      setFormErrors({ amount: t("invalid_amount") });
      return;
    }

    setIsSubmitting(true);
    try {
      let alertTriggered = false;

      if (type === "TRANSFER") {
        await validateAndCreateTransfer(finalAmount);
      } else {
        let linkedRecurringId: string | undefined;

        if (isRecurring && recurringName && selectedAccount) {
          linkedRecurringId = await createRecurring(
            finalAmount,
            type,
            selectedAccount.currency
          );
        }

        const tx = await validateAndCreateTransaction({
          amount: finalAmount,
          note,
          type,
          linkedRecurringId,
        });

        // F-02: Show success feedback immediately before non-critical alert check
        showToast({
          type: "success",
          title: t("transaction_created"),
          message: t("transaction_created_message"),
        });

        // Check budget alerts for expense transactions (non-blocking to the success flow)
        if (tx && type === "EXPENSE") {
          alertTriggered = await budgetAlert.checkAfterTransaction(tx);
        }
      }

      // If a budget alert was triggered, stay on screen to show the modal
      if (!alertTriggered) {
        router.back();
      }
    } catch (error: unknown) {
      const recurringPaymentErrorMessage = getRecurringPaymentErrorMessage(
        error,
        t
      );

      if (recurringPaymentErrorMessage) {
        showToast({
          type: "error",
          title: t("transaction_creation_failed"),
          message: recurringPaymentErrorMessage,
        });
      } else if (type !== "TRANSFER") {
        showToast({
          type: "error",
          title: t("update_error"),
          message: t("transaction_creation_failed"),
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <PageHeader
        title={t("new_transaction")}
        showBackButton={true}
        backIcon="arrow"
        rightAction={{
          label: t("save"),
          onPress: handleSave,
          loading: isSubmitting,
        }}
      />

      <ScrollView
        className="flex-1 bg-slate-50 dark:bg-slate-900"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* Type Tabs */}
        <View className="mt-4">
          <TypeTabs selectedType={type} onSelect={setType} />
        </View>

        {/* Amount Display — hidden when transfer has no valid accounts */}
        {!(type === "TRANSFER" && !canTransfer) && (
          <>
            {/* Insufficient balance warning */}
            {type === "EXPENSE" &&
              selectedAccount &&
              amount &&
              parsePositiveFiniteAmountInput(amount) !== null &&
              parsePositiveFiniteAmountInput(amount)! >
                selectedAccount.balance && (
                <Text className="text-amber-500 text-xs font-medium text-center mb-1">
                  ⚠️ {t("warning_negative_balance")} -
                  {formatAmountInput(
                    (
                      parsePositiveFiniteAmountInput(amount)! -
                      selectedAccount.balance
                    ).toFixed(2)
                  )}{" "}
                  {selectedAccount.currency}
                </Text>
              )}
            <AmountDisplay
              amount={amount}
              currency={selectedAccount?.currency ?? preferredCurrency}
              type={type}
              mainColor={selectedCategory?.color}
              onPress={
                isOptionalExpanded
                  ? () => setIsOptionalExpanded(false)
                  : activeAmountField === "targetAmount"
                    ? () => setActiveAmountField("amount")
                    : undefined
              }
            />
            {formErrors.amount && (
              <Text className="text-red-500 text-xs font-medium text-center mt-1">
                {formErrors.amount}
              </Text>
            )}
          </>
        )}

        {/* Form Content */}
        <View className="px-6 mt-">
          {type === "TRANSFER" ? (
            canTransfer ? (
              <TransferFields
                accounts={accounts}
                fromAccountId={selectedAccountId}
                toAccountId={toAccountId}
                onSelectFrom={(id) => {
                  hasUserSelectedAccountRef.current = true;
                  setFormErrors((prev) => ({
                    ...prev,
                    fromAccountId: undefined,
                  }));
                  setSelectedAccountId(id);
                }}
                onSelectTo={(id) => {
                  hasUserSelectedAccountRef.current = true;
                  setFormErrors((prev) => ({
                    ...prev,
                    toAccountId: undefined,
                  }));
                  setToAccountId(id);
                }}
                amount={amount}
                targetAmount={targetAmount}
                onChangeTargetAmount={setTargetAmount}
                fromAccountError={formErrors.fromAccountId}
                toAccountError={formErrors.toAccountId}
                exchangeRate={
                  selectedAccount && toAccount
                    ? latestRates
                      ? getCurrencyRate(
                          latestRates,
                          selectedAccount.currency,
                          toAccount.currency
                        )
                      : undefined
                    : undefined
                }
                isTargetAmountActive={activeAmountField === "targetAmount"}
                onFocusTargetAmount={() => setActiveAmountField("targetAmount")}
              />
            ) : (
              <View className="flex-1 items-center justify-center py-16">
                <EmptyStateCard
                  onPress={() => router.push("/add-account")}
                  icon="swap-horizontal-outline"
                  title={t("need_more_accounts")}
                  description={t("need_more_accounts_description")}
                  height={160}
                  borderRadius={20}
                  className="w-full"
                />
              </View>
            )
          ) : (
            <>
              <View className="flex-row gap-4 mb-4">
                {/* Account Field */}
                <View className="flex-1">
                  <Text className="input-label">
                    {t("account").toUpperCase()}
                  </Text>
                  {hasAccounts ? (
                    <TouchableOpacity
                      onPress={() => {
                        setFormErrors((prev) => ({
                          ...prev,
                          accountId: undefined,
                        }));
                        setIsAccountModalOpen(true);
                      }}
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
                        {selectedAccount?.name || t("select")}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <EmptyStateCard
                      onPress={() => router.push("/add-account")}
                      icon="wallet-outline"
                      title={t("no_accounts_found")}
                      description={t("tap_here_to_add_one")}
                      height={56}
                      borderRadius={16}
                      className="mt-0.5"
                    />
                  )}
                  {formErrors.accountId && (
                    <Text className="text-red-500 text-xs font-medium mt-1">
                      {formErrors.accountId}
                    </Text>
                  )}
                </View>

                {/* Category Field */}
                <View className="flex-1">
                  <Text className="input-label">
                    {t("category").toUpperCase()}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setFormErrors((prev) => ({
                        ...prev,
                        categoryId: undefined,
                      }));
                      setIsCategoryModalOpen(true);
                    }}
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
                      {selectedCategory ? (
                        <CategoryIcon
                          iconName={selectedCategory.icon}
                          iconLibrary={
                            selectedCategory.iconLibrary as IconLibrary
                          }
                          size={18}
                          color={selectedCategory.color}
                        />
                      ) : (
                        <Ionicons
                          name="grid-outline"
                          size={18}
                          color={
                            isDark ? palette.slate[400] : palette.slate[500]
                          }
                        />
                      )}
                    </View>
                    <Text
                      numberOfLines={1}
                      className="flex-1 text-sm font-semibold text-slate-900 dark:text-white"
                    >
                      {selectedCategory?.displayName || t("select_category")}
                    </Text>
                  </TouchableOpacity>
                  {formErrors.categoryId && (
                    <Text className="text-red-500 text-xs font-medium mt-1">
                      {formErrors.categoryId}
                    </Text>
                  )}
                </View>
              </View>

              {/* Category Chips (2-row horizontal scroll grid) */}
              <CategoryPicker
                selectedCategory={selectedCategory}
                categories={chipCategories}
                onOpenPicker={() => setIsCategoryModalOpen(true)}
                onSelectCategory={(cat) => setSelectedCategoryId(cat.id)}
                hideMainSelector={true}
              />
            </>
          )}

          {/* Optional Section (expanded content) — hidden for transfers */}
          {type !== "TRANSFER" && isOptionalExpanded && (
            <OptionalSection
              expanded={isOptionalExpanded}
              onToggleExpand={() => setIsOptionalExpanded(false)}
              transactionType={type}
              fields={{
                counterparty,
                note,
                date,
                isRecurring,
                recurringName,
                recurringFrequency,
                recurringAutoCreate,
              }}
              onChange={(updates) => {
                if (updates.counterparty !== undefined)
                  setCounterparty(updates.counterparty);
                if (updates.note !== undefined) setNote(updates.note);
                if (updates.date !== undefined) setDate(updates.date);
                if (updates.isRecurring !== undefined)
                  setIsRecurring(updates.isRecurring);
                if (updates.recurringName !== undefined)
                  setRecurringName(updates.recurringName);
                if (updates.recurringFrequency !== undefined)
                  setRecurringFrequency(updates.recurringFrequency);
                if (updates.recurringAutoCreate !== undefined)
                  setRecurringAutoCreate(updates.recurringAutoCreate);
              }}
            />
          )}
        </View>
      </ScrollView>

      {/* "Add more details" bar — hidden for transfers */}
      {type !== "TRANSFER" && !isOptionalExpanded && (
        <TouchableOpacity
          onPress={() => setIsOptionalExpanded(true)}
          className="flex-row items-center justify-center border-t border-slate-200 bg-slate-50 py-2 dark:border-slate-800 dark:bg-slate-900"
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

      {/* Keypad - Fixed at bottom */}
      {/* Hide keypad when optional section is expanded or when transfer has no accounts */}
      {!(type === "TRANSFER" && !canTransfer) && (
        <CalculatorKeypad
          onKeyPress={handleKeyPress}
          hide={isOptionalExpanded}
        />
      )}

      {/* Bottom spacer for safe area if keypad is hidden */}
      {isOptionalExpanded && <View style={{ height: insets.bottom }} />}

      {/* Modals */}
      <AccountSelectorModal
        visible={isAccountModalOpen}
        accounts={accounts}
        selectedId={selectedAccountId}
        onSelect={(id) => {
          hasUserSelectedAccountRef.current = true;
          setSelectedAccountId(id);
        }}
        onClose={() => setIsAccountModalOpen(false)}
      />

      {type !== "TRANSFER" && (
        <CategorySelectorModal
          visible={isCategoryModalOpen}
          rootCategories={modalRootCategories}
          selectedId={selectedCategoryId}
          type={type}
          onSelect={setSelectedCategoryId}
          onClose={() => setIsCategoryModalOpen(false)}
        />
      )}

      {/* Budget Alert Modal */}
      <BudgetAlertModal
        visible={budgetAlert.isVisible}
        alert={budgetAlert.alert}
        onDismiss={() => {
          budgetAlert.dismiss();
          router.back();
        }}
        onViewBudget={budgetAlert.viewBudget}
      />
    </View>
  );
}

function getRecurringPaymentErrorMessage(
  error: unknown,
  t: (key: string) => string
): string | null {
  const message = error instanceof Error ? error.message : undefined;

  if (message === RECURRING_PAYMENT_SERVICE_ERROR_CODES.ACCOUNT_UNAVAILABLE) {
    return t("recurring_payment_account_unavailable");
  }

  if (message === RECURRING_PAYMENT_SERVICE_ERROR_CODES.CATEGORY_UNAVAILABLE) {
    return t("recurring_payment_category_unavailable");
  }

  return null;
}
