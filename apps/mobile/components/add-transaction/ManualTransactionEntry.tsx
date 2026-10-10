import { GroupedMoneyInput } from "@/components/ui/GroupedMoneyInput";
import { ManualAccountCategoryRow } from "@/components/add-transaction/manual-ui/ManualAccountCategoryRow";
import {
  CalculatorKey,
  CalculatorKeypad,
} from "@/components/add-transaction/CalculatorKeypad";
import { OptionalSection } from "@/components/add-transaction/OptionalSection";
import { TransferFields } from "@/components/add-transaction/TransferFields";
import { TypeTabs } from "@/components/add-transaction/TypeTabs";
import { AccountSelectorModal } from "@/components/modals/AccountSelectorModal";
import { CategorySelectorModal } from "@/components/modals/CategorySelectorModal";
import { EmptyStateCard } from "@/components/ui/EmptyStateCard";
import { useToast } from "@/components/ui/Toast";
import { useCategoryLookup } from "@/context/CategoriesContext";
import { useLocale } from "@/context/LocaleContext";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { useFormScroll } from "@/hooks/useFormScroll";
import { useMarketRates } from "@/hooks/useMarketRates";
import {
  createRecurringPayment,
  deleteRecurringPayment,
  RECURRING_PAYMENT_SERVICE_ERROR_CODES,
} from "@/services/recurring-payment-service";
import { createTransaction } from "@/services/transaction-service";
import { createTransfer } from "@/services/transfer-service";
import { getSelectedCurrentCurrencyRate } from "@/services/current-market-snapshot-calculations";
import { resolveInitialTransactionAccountSelection } from "@/utils/account-selection";
import { logger } from "@/utils/logger";
import { formatLocalizedMoneyAmount } from "@/utils/localized-money-display";
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
  parsePositiveFiniteAmountInput,
} from "@monyvi/logic";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Keyboard,
  ScrollView,
  Text,
  type TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePreferredCurrency } from "@/hooks/usePreferredCurrency";
import { shouldUseDenseRowCompactLayout } from "@/constants/ui";
const TRANSACTION_FIELD_ORDER: ReadonlyArray<
  keyof TransactionValidationErrors
> = [
  "amount",
  "accountId",
  "categoryId",
  "fromAccountId",
  "toAccountId",
  "recurringName",
];
export interface ManualTransactionEntryHandle {
  readonly save: () => Promise<void>;
}
interface ManualTransactionEntryProps {
  readonly onSubmittingChange?: (isSubmitting: boolean) => void;
  readonly isActive?: boolean;
}
export const ManualTransactionEntry = forwardRef<
  ManualTransactionEntryHandle,
  ManualTransactionEntryProps
>(function ManualTransactionEntry(
  { onSubmittingChange, isActive = true }: ManualTransactionEntryProps,
  ref
): React.ReactNode {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const budgetAlert = useBudgetAlert();
  const { t } = useTranslation("transactions");
  const { t: tCommon } = useTranslation("common");
  const { fontFamily } = useLocale();
  const { accounts } = useAccounts();
  const [type, setType] = useState<TransactionType | "TRANSFER">("EXPENSE");
  const [amount, setAmount] = useState<string>("");
  const [targetAmount, setTargetAmount] = useState<string>("");
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null
  );
  const [toAccountId, setToAccountId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
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
  const [isOptionalExpanded, setIsOptionalExpanded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  useEffect(() => {
    onSubmittingChange?.(isSubmitting);
  }, [isSubmitting, onSubmittingChange]);
  const [formErrors, setFormErrors] = useState<TransactionValidationErrors>({});
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [activeAmountField, setActiveAmountField] = useState<
    "amount" | "targetAmount" | null
  >(null);
  const amountInputRef = useRef<TextInput>(null);
  const targetAmountInputRef = useRef<TextInput>(null);
  const isSaveInFlightRef = useRef(false);
  const hasInitializedAccountSelectionRef = useRef(false);
  const hasUserSelectedAccountRef = useRef(false);
  const { width, fontScale } = useWindowDimensions();
  const shouldStackSelectorRow = shouldUseDenseRowCompactLayout(
    width,
    fontScale
  );
  const {
    expenseCategories,
    incomeCategories,
    isLoading: _categoriesLoading,
  } = useCategories();
  const { selectedSnapshot } = useMarketRates();
  const { showToast } = useToast();
  const { preferredCurrency } = usePreferredCurrency();
  const { scrollViewRef, getFieldRef, onScroll, scrollToFirstError } =
    useFormScroll<keyof TransactionValidationErrors>({
      bottomInset: insets.bottom,
    });
  useEffect(() => {
    if (!Object.values(formErrors).some(Boolean)) return;
    const frame = requestAnimationFrame(() => {
      scrollToFirstError(formErrors, TRANSACTION_FIELD_ORDER);
    });
    return () => cancelAnimationFrame(frame);
  }, [formErrors, scrollToFirstError]);
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);
  const parsedAmount = parsePositiveFiniteAmountInput(amount);
  const toAccount = accounts.find((a) => a.id === toAccountId);
  const relevantCategories =
    type === "EXPENSE" ? expenseCategories : incomeCategories;
  const categoryMap = useCategoryLookup();
  const selectedCategory = categoryMap.get(selectedCategoryId) ?? null;
  const modalRootCategories = relevantCategories;
  const hasAccounts = accounts.length > 0;
  const canTransfer = accounts.length >= 2;
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
  const prevTypeRef = useRef(type);
  useEffect(() => {
    if (relevantCategories.length === 0) return;
    const typeChanged = prevTypeRef.current !== type;
    prevTypeRef.current = type;
    if (!selectedCategoryId || typeChanged) {
      setSelectedCategoryId(relevantCategories[0].id);
    }
    if (typeChanged) {
      amountInputRef.current?.blur();
      targetAmountInputRef.current?.blur();
      setActiveAmountField(null);
    }
  }, [relevantCategories, selectedCategoryId, type]);

  useEffect(() => {
    if (isActive) return;
    amountInputRef.current?.blur();
    targetAmountInputRef.current?.blur();
    Keyboard.dismiss();
    setActiveAmountField(null);
  }, [isActive]);

  const dismissCalculator = (): void => {
    if (activeAmountField === "targetAmount") {
      targetAmountInputRef.current?.blur();
    } else {
      amountInputRef.current?.blur();
    }
    setActiveAmountField(null);
  };

  const focusAmountField = (
    field: "amount" | "targetAmount"
  ): void => {
    Keyboard.dismiss();
    if (isOptionalExpanded) {
      setIsOptionalExpanded(false);
    }
    setActiveAmountField(field);
  };

  const handleAmountChange = (value: string): void => {
    if (formErrors.amount) {
      setFormErrors((prev) => ({ ...prev, amount: undefined }));
    }
    setAmount(value);
  };

  const handleTargetAmountChange = (value: string): void => {
    if (formErrors.amount) {
      setFormErrors((prev) => ({ ...prev, amount: undefined }));
    }
    setTargetAmount(value);
  };

  const handleKeyPress = async (key: CalculatorKey): Promise<void> => {
    if (formErrors.amount) {
      setFormErrors((prev) => ({ ...prev, amount: undefined }));
    }
    const isTargetField = activeAmountField === "targetAmount";
    const currentValue = isTargetField ? targetAmount : amount;
    const setValue = isTargetField ? setTargetAmount : setAmount;
    if (key === "DONE") {
      const result = calculateResult(currentValue);
      if (result !== null) {
        setValue(Number(result.toFixed(10)).toString());
      }
      dismissCalculator();
      return;
    }
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
    const isOperator = ["+", "-", "*", "/"].includes(key);
    setValue((prev) => {
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
      if (isOperator && prev.length > 0) {
        const lastChar = prev[prev.length - 1];
        if (["+", "-", "*", "/"].includes(lastChar)) {
          return prev.slice(0, -1) + key;
        }
      }
      if (isOperator && prev.length === 0 && key !== "-") return prev;
      return prev + key;
    });
  };
  const calculateResult = (expr: string): number | null => {
    return evaluateAmountExpression(expr);
  };
  useEffect(() => {
    setTargetAmount("");
    if (
      type === "TRANSFER" &&
      selectedAccount &&
      toAccount &&
      amount &&
      selectedAccount.currency !== toAccount.currency
    ) {
      const numAmount = calculateResult(amount);
      if (numAmount !== null && numAmount > 0) {
        if (selectedSnapshot) {
          const rate = getSelectedCurrentCurrencyRate({
            fromCurrency: selectedAccount.currency,
            toCurrency: toAccount.currency,
            currentSnapshot: selectedSnapshot,
          });
          if (rate !== null) {
            setTargetAmount((numAmount * rate).toFixed(2));
          }
        }
      }
    }
  }, [type, selectedAccount, toAccount, amount, selectedSnapshot]);
  const createRecurring = async (
    amount: number,
    type: TransactionType,
    currency: CurrencyType
  ): Promise<string> => {
    if (!selectedAccountId) {
      throw new Error(t("please_select_an_account"));
    }
    try {
      const recurring = await createRecurringPayment({
        name: recurringName.trim(),
        amount,
        currency,
        type,
        accountId: selectedAccountId,
        categoryId: selectedCategoryId,
        frequency: recurringFrequency,
        startDate: date,
        initialOccurrenceRecorded: true,
        action: recurringAutoCreate ? "AUTO_CREATE" : "NOTIFY",
      });
      return recurring.id;
    } catch (error: unknown) {
      if (getRecurringPaymentErrorMessage(error, t) === null) {
        logger.error("Recurring payment operation failed", error, {
          operation: "create",
          source: "add-transaction",
        });
      }
      throw error;
    }
  };
  const validateAndCreateTransfer = async (
    amount: number
  ): Promise<boolean> => {
    if (!toAccountId) {
      setFormErrors({ toAccountId: t("please_select_destination_account") });
      setIsSubmitting(false);
      return false;
    }
    if (!selectedAccountId || !selectedAccount) {
      setFormErrors({ fromAccountId: t("please_select_source_account") });
      setIsSubmitting(false);
      return false;
    }
    const isCrossCurrency = selectedAccount.currency !== toAccount?.currency;
    const parsedTargetAmount =
      isCrossCurrency && targetAmount
        ? parsePositiveFiniteAmountInput(targetAmount)
        : null;
    if (isCrossCurrency && parsedTargetAmount === null) {
      setFormErrors({ amount: t("invalid_amount") });
      setIsSubmitting(false);
      return false;
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
      return true;
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
  const handleSave = async (): Promise<void> => {
    if (isSaveInFlightRef.current) return;
    isSaveInFlightRef.current = true;

    try {
      setFormErrors({});
    const evaluatedAmount = calculateResult(amount);
    const amountForValidation =
      evaluatedAmount === null ? amount : evaluatedAmount.toString();
    const formData =
      type === "TRANSFER"
        ? {
            amount: amountForValidation,
            fromAccountId: selectedAccountId,
            toAccountId,
          }
        : {
            amount: amountForValidation,
            accountId: selectedAccountId,
            categoryId: selectedCategoryId,
            isRecurring,
            recurringName,
          };
    const { isValid, errors } = validateTransactionForm(
      type,
      formData,
      {
        amountRequired: t("amount_required"),
        invalidAmount: t("invalid_amount"),
        amountMustBePositive: t("amount_must_be_positive"),
        amountMaximum: (maximum) =>
          t("amount_maximum_error", {
            maximum: maximum.toLocaleString("en-US"),
          }),
        amountPrecision: (precision) =>
          t("amount_precision_error", { precision }),
        accountRequired: t("please_select_an_account"),
        sourceAccountRequired: t("please_select_source_account"),
        destinationAccountRequired: t("please_select_destination_account"),
        recurringNameRequired: tCommon("recurring_name_required"),
      },
      { currency: selectedAccount?.currency }
    );
    if (!isValid) {
      setFormErrors(errors);
      if (errors.recurringName) {
        dismissCalculator();
        setIsOptionalExpanded(true);
      }
      return;
    }
    const finalAmount = evaluatedAmount;
    if (finalAmount === null || finalAmount <= 0) {
      setFormErrors({ amount: t("invalid_amount") });
      return;
    }
    setIsSubmitting(true);
    try {
      let alertTriggered = false;
      if (type === "TRANSFER") {
        if (!(await validateAndCreateTransfer(finalAmount))) return;
      } else {
        let createdRecurringPaymentId: string | undefined;
        let linkedRecurringId: string | undefined;
        if (isRecurring && selectedAccount) {
          createdRecurringPaymentId = await createRecurring(
            finalAmount,
            type,
            selectedAccount.currency
          );
          linkedRecurringId = createdRecurringPaymentId;
        }
        let tx: Transaction | undefined;
        try {
          tx = await validateAndCreateTransaction({
            amount: finalAmount,
            note,
            type,
            linkedRecurringId,
          });
        } catch (error: unknown) {
          if (createdRecurringPaymentId) {
            try {
              await deleteRecurringPayment(createdRecurringPaymentId);
            } catch (cleanupError: unknown) {
              logger.error(
                "Failed to remove recurring payment after transaction failure",
                cleanupError,
                { recurringPaymentId: createdRecurringPaymentId }
              );
            }
          }
          throw error;
        }
        showToast({
          type: "success",
          title: t("transaction_created"),
          message: t("transaction_created_message"),
        });
        if (tx && type === "EXPENSE") {
          alertTriggered = await budgetAlert.checkAfterTransaction(tx);
        }
      }
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
    } finally {
      isSaveInFlightRef.current = false;
    }
  };
  useImperativeHandle(
    ref,
    () => ({
      save: handleSave,
    }),
    [handleSave]
  );
  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-900">
      <ScrollView
        ref={scrollViewRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        className="flex-1 bg-slate-50 dark:bg-slate-900"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <View className="w-full max-w-[560px] self-center">
          <View className="mt-3">
            <TypeTabs
              compact
              selectedType={type}
              onSelect={(nextType) => {
                dismissCalculator();
                setType(nextType);
              }}
            />
          </View>

          {!(type === "TRANSFER" && !canTransfer) ? (
            <View
              ref={getFieldRef("amount")}
              collapsable={false}
              className="px-4"
            >
              {type === "EXPENSE" &&
              selectedAccount &&
              parsedAmount !== null &&
              parsedAmount > selectedAccount.balance ? (
                <Text className="mb-1 text-xs font-medium text-amber-500">
                  ⚠️ {t("warning_negative_balance")} -{" "}
                  {formatLocalizedMoneyAmount({
                    amount: parsedAmount - selectedAccount.balance,
                    currency: selectedAccount.currency,
                    englishPresentation: "code-suffix",
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </Text>
              ) : null}

              <GroupedMoneyInput
                testID="manual-amount-input"
                label={t("amount")}
                required
                value={amount}
                onCanonicalChange={handleAmountChange}
                inputRef={amountInputRef}
                showSoftInputOnFocus={false}
                onFocus={() => focusAmountField("amount")}
                onBlur={() =>
                  setActiveAmountField((current) =>
                    current === "amount" ? null : current
                  )
                }
                error={formErrors.amount}
                placeholder="0.00"
                className={`min-h-14 text-lg leading-7 ${
                  activeAmountField === "amount"
                    ? "border-nileGreen-500 dark:border-nileGreen-500"
                    : ""
                }`}
                style={{ fontFamily: fontFamily.medium }}
                labelClassName="mb-2 text-sm leading-5 font-normal text-text-secondary dark:text-text-secondary-dark"
                labelStyle={{ fontFamily: fontFamily.regular }}
                containerClassName="mb-3"
                trailingAdornment={
                  <Text className="text-sm font-medium text-text-secondary dark:text-text-secondary-dark">
                    {selectedAccount?.currency ?? preferredCurrency}
                  </Text>
                }
              />
            </View>
          ) : null}

          <View className="px-4">
            {type === "TRANSFER" ? (
              canTransfer ? (
                <TransferFields
                  accounts={accounts}
                  fromAccountId={selectedAccountId}
                  toAccountId={toAccountId}
                  onSelectFrom={(id) => {
                    dismissCalculator();
                    hasUserSelectedAccountRef.current = true;
                    setFormErrors((prev) => ({
                      ...prev,
                      fromAccountId: undefined,
                    }));
                    setSelectedAccountId(id);
                  }}
                  onSelectTo={(id) => {
                    dismissCalculator();
                    hasUserSelectedAccountRef.current = true;
                    setFormErrors((prev) => ({
                      ...prev,
                      toAccountId: undefined,
                    }));
                    setToAccountId(id);
                  }}
                  amount={amount}
                  targetAmount={targetAmount}
                  onChangeTargetAmount={handleTargetAmountChange}
                  targetAmountInputRef={targetAmountInputRef}
                  compactTargetAmount
                  fromAccountError={formErrors.fromAccountId}
                  toAccountError={formErrors.toAccountId}
                  fromAccountRef={getFieldRef("fromAccountId")}
                  toAccountRef={getFieldRef("toAccountId")}
                  exchangeRate={
                    selectedAccount && toAccount
                      ? (getSelectedCurrentCurrencyRate({
                          fromCurrency: selectedAccount.currency,
                          toCurrency: toAccount.currency,
                          currentSnapshot: selectedSnapshot,
                        }) ?? undefined)
                      : undefined
                  }
                  isTargetAmountActive={activeAmountField === "targetAmount"}
                  onFocusTargetAmount={() =>
                    focusAmountField("targetAmount")
                  }
                  onBlurTargetAmount={() =>
                    setActiveAmountField((current) =>
                      current === "targetAmount" ? null : current
                    )
                  }
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
              <ManualAccountCategoryRow
                selectedAccount={selectedAccount}
                selectedCategory={selectedCategory}
                hasAccounts={hasAccounts}
                isStacked={shouldStackSelectorRow}
                accountError={formErrors.accountId}
                categoryError={formErrors.categoryId}
                accountFieldRef={getFieldRef("accountId")}
                categoryFieldRef={getFieldRef("categoryId")}
                onOpenAccount={() => {
                  dismissCalculator();
                  setFormErrors((prev) => ({
                    ...prev,
                    accountId: undefined,
                  }));
                  setIsAccountModalOpen(true);
                }}
                onOpenCategory={() => {
                  dismissCalculator();
                  setFormErrors((prev) => ({
                    ...prev,
                    categoryId: undefined,
                  }));
                  setIsCategoryModalOpen(true);
                }}
                onAddAccount={() => {
                  dismissCalculator();
                  router.push("/add-account");
                }}
              />
            )}

            {type !== "TRANSFER" ? (
              <OptionalSection
                compactCollapsed
                expanded={isOptionalExpanded}
                onToggleExpand={() => {
                  dismissCalculator();
                  setIsOptionalExpanded((current) => !current);
                }}
                transactionType={type}
                recurringNameError={formErrors.recurringName}
                recurringNameRef={getFieldRef("recurringName")}
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
                  if (
                    updates.isRecurring === false ||
                    (updates.recurringName !== undefined &&
                      updates.recurringName.trim().length > 0)
                  ) {
                    setFormErrors((previous) => ({
                      ...previous,
                      recurringName: undefined,
                    }));
                  }
                }}
              />
            ) : null}
          </View>
        </View>
      </ScrollView>

      {activeAmountField !== null &&
      !isOptionalExpanded &&
      !(type === "TRANSFER" && !canTransfer) ? (
        <View className="w-full max-w-[560px] self-center">
          <CalculatorKeypad
            compact
            onKeyPress={(key) => {
              void handleKeyPress(key);
            }}
            actionLabel={t("done")}
          />
        </View>
      ) : null}
      {/* Modals */}
      <AccountSelectorModal
        visible={isAccountModalOpen}
        accounts={accounts}
        selectedId={selectedAccountId}
        onSelect={(id) => {
          dismissCalculator();
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
          onSelect={(id) => {
            dismissCalculator();
            setSelectedCategoryId(id);
          }}
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
});
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
  if (message === RECURRING_PAYMENT_SERVICE_ERROR_CODES.INVALID_START_DATE) {
    return t("due_payment_date_range");
  }
  return null;
}
