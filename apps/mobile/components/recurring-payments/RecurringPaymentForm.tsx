import { AccountSelectorModal } from "@/components/modals/AccountSelectorModal";
import { CategorySelectorModal } from "@/components/modals/CategorySelectorModal";
import {
  FrequencyPickerModal,
  getFrequencyLabel,
} from "@/components/modals/FrequencyPickerModal";
import { RecurringPaymentEditActions } from "./RecurringPaymentEditActions";
import { AmountField, TypeTabs } from "./RecurringPaymentFormFields";
import { RecurringPaymentSummaryCard } from "./RecurringPaymentSummaryCard";
import { Divider, ErrorText, FormRow } from "./RecurringPaymentFormRows";
import { TextField } from "@/components/ui/TextField";
import { palette } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { useFormScroll } from "@/hooks/useFormScroll";
import { formatDate } from "@/utils/dateHelpers";
import { validateRecurringPaymentForm } from "@/validation/recurring-payment-validation";
import type {
  Account,
  Category,
  CurrencyType,
  RecurringAction,
  RecurringFrequency,
  RecurringStatus,
  TransactionType,
} from "@monyvi/db";
import {
  getNextRecurringOccurrenceAfter,
  isOnOrBeforeDay,
  isSameLocalCalendarDay,
  MAX_TRANSACTION_AMOUNT,
} from "@monyvi/logic";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface RecurringPaymentFormValues {
  readonly name: string;
  readonly amount: string;
  readonly type: TransactionType;
  readonly accountId: string | null;
  readonly categoryId: string | null;
  readonly frequency: RecurringFrequency;
  readonly startDate: Date;
  readonly expectedNextDueDate?: Date;
  readonly endDate: Date | null;
  readonly reactivateAfterSaving: boolean;
  readonly action: RecurringAction;
  readonly notes: string;
}

type SubmitResult = Promise<void | false>;

interface RecurringPaymentFormProps {
  readonly mode: "create" | "edit";
  readonly initialValues: RecurringPaymentFormValues;
  readonly accounts: readonly Account[];
  readonly expenseCategories: readonly Category[];
  readonly incomeCategories: readonly Category[];
  readonly allCategories?: readonly Category[];
  readonly isSubmitting: boolean;
  readonly submitLabel: string;
  readonly status?: RecurringStatus;
  readonly dueDate?: Date;
  readonly recurrenceAnchorDate?: Date;
  readonly onSubmit: (values: RecurringPaymentFormValues) => SubmitResult;
  readonly onPauseToggle?: () => Promise<void>;
  readonly onDelete?: () => Promise<void>;
}
export interface RecurringPaymentFormHandle {
  submit: () => void;
}
type FormErrors = Partial<
  Record<
    "name" | "amount" | "accountId" | "categoryId" | "startDate" | "endDate",
    string
  >
>;
type FormFieldName = keyof FormErrors;
type RecurringPaymentFormField = keyof RecurringPaymentFormValues;
const ACTION_OPTIONS: ReadonlyArray<{
  readonly value: RecurringAction;
  readonly labelKey: string;
  readonly icon: keyof typeof Ionicons.glyphMap;
}> = [
  {
    value: "NOTIFY",
    labelKey: "notify_me",
    icon: "notifications-outline",
  },
  {
    value: "AUTO_CREATE",
    labelKey: "auto_create",
    icon: "flash-outline",
  },
];
const DEFAULT_CURRENCY: CurrencyType = "EGP";
const ERROR_FIELD_ORDER: readonly FormFieldName[] = [
  "name",
  "amount",
  "accountId",
  "categoryId",
  "startDate",
  "endDate",
];
const FORM_VALUE_FIELDS: readonly RecurringPaymentFormField[] = [
  "name",
  "amount",
  "type",
  "accountId",
  "categoryId",
  "frequency",
  "startDate",
  "expectedNextDueDate",
  "endDate",
  "reactivateAfterSaving",
  "action",
  "notes",
];

export const RecurringPaymentForm = React.forwardRef<
  RecurringPaymentFormHandle,
  RecurringPaymentFormProps
>(function RecurringPaymentForm(
  {
    mode,
    initialValues,
    accounts,
    expenseCategories,
    incomeCategories,
    allCategories = [],
    isSubmitting,
    submitLabel,
    status = "ACTIVE",
    dueDate,
    recurrenceAnchorDate,
    onSubmit,
    onPauseToggle,
    onDelete,
  },
  ref
): React.JSX.Element {
  const { t } = useTranslation("transactions");
  const { t: tCommon } = useTranslation("common");
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    scrollViewRef,
    getFieldRef,
    onScroll,
    scrollToField,
    scrollToFirstError,
  } = useFormScroll<FormFieldName>({
    bottomInset: insets.bottom,
  });

  const [form, setForm] = useState<RecurringPaymentFormValues>(initialValues);
  const [errors, setErrors] = useState<FormErrors>({});
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showFrequencyModal, setShowFrequencyModal] = useState(false);
  const [datePickerField, setDatePickerField] = useState<"startDate" | "endDate" | null>(null);
  const isSubmitInFlightRef = useRef(false);
  const dirtyFieldsRef = useRef<Set<RecurringPaymentFormField>>(new Set());
  const nameFieldRef = getFieldRef("name");
  const amountFieldRef = getFieldRef("amount");
  const accountFieldRef = getFieldRef("accountId");
  const categoryFieldRef = getFieldRef("categoryId");
  const startDateFieldRef = getFieldRef("startDate");
  const endDateFieldRef = getFieldRef("endDate");
  const initialValuesKey = useMemo(
    () =>
      [
        initialValues.name,
        initialValues.amount,
        initialValues.type,
        initialValues.accountId ?? "",
        initialValues.categoryId ?? "",
        initialValues.frequency,
        initialValues.startDate.getTime(),
        initialValues.expectedNextDueDate?.getTime() ?? "",
        initialValues.endDate?.getTime() ?? "",
        initialValues.reactivateAfterSaving,
        initialValues.action,
        initialValues.notes,
      ].join("|"),
    [
      initialValues.accountId,
      initialValues.action,
      initialValues.amount,
      initialValues.categoryId,
      initialValues.frequency,
      initialValues.name,
      initialValues.notes,
      initialValues.startDate,
      initialValues.expectedNextDueDate,
      initialValues.endDate,
      initialValues.reactivateAfterSaving,
      initialValues.type,
    ]
  );

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === form.accountId) ?? null,
    [accounts, form.accountId]
  );
  const selectedCurrency = selectedAccount?.currency ?? DEFAULT_CURRENCY;
  const rootCategories =
    form.type === "EXPENSE" ? expenseCategories : incomeCategories;
  const categoryLookupSource =
    allCategories.length > 0 ? allCategories : rootCategories;
  const categories = useMemo(
    () =>
      categoryLookupSource.filter((category) =>
        form.type === "EXPENSE" ? category.isExpense : category.isIncome
      ),
    [categoryLookupSource, form.type]
  );
  const selectedCategory = useMemo(
    () =>
      categories.find((category) => category.id === form.categoryId) ?? null,
    [categories, form.categoryId]
  );
  const didDuePaymentChange = !isSameLocalCalendarDay(
    initialValues.startDate,
    form.startDate
  );
  const didFrequencyChange = initialValues.frequency !== form.frequency;
  const effectiveRecurrenceAnchorDate = didDuePaymentChange
    ? form.startDate
    : didFrequencyChange
      ? (dueDate ?? form.startDate)
      : (recurrenceAnchorDate ?? initialValues.startDate);
  const hasScheduleChanges =
    didDuePaymentChange ||
    didFrequencyChange ||
    !areSameOptionalLocalCalendarDays(initialValues.endDate, form.endDate);
  const displayDueDate = getDisplayDueDate({
    dueDate,
    recurrenceAnchorDate: effectiveRecurrenceAnchorDate,
    initialValues,
    form,
    hasScheduleChanges,
    status,
  });
  const startDateMinimumDate = getStartDateMinimumDate(mode, form.startDate);
  const hasNoFurtherEligibleRecurrence = hasNoFurtherEligiblePayment(
    form.startDate,
    effectiveRecurrenceAnchorDate,
    form.frequency,
    form.endDate
  );
  const reactivationDueDate = didDuePaymentChange
    ? form.startDate
    : getReactivationDueDate(
        dueDate,
        effectiveRecurrenceAnchorDate,
        initialValues.endDate,
        form.frequency
      );
  const isReactivationAvailable =
    reactivationDueDate !== null &&
    (form.endDate === null ||
      isOnOrBeforeDay(reactivationDueDate, form.endDate));
  const hasDuePaymentAfterEndDate =
    form.endDate !== null && !isOnOrBeforeDay(form.startDate, form.endDate);

  useEffect(() => {
    const dirtyFields = dirtyFieldsRef.current;
    if (dirtyFields.size > 0) {
      setForm((prev) =>
        mergePristineInitialValues(prev, initialValues, dirtyFields)
      );
      return;
    }

    setForm(initialValues);
    setErrors({});
  }, [initialValues, initialValuesKey]);

  useEffect(() => {
    if (form.accountId || !initialValues.accountId) return;
    if (dirtyFieldsRef.current.has("accountId")) return;

    setForm((prev) => ({ ...prev, accountId: initialValues.accountId }));
    setErrors((prev) => ({ ...prev, accountId: undefined }));
  }, [form.accountId, initialValues.accountId]);

  const updateField = useCallback(
    <K extends keyof RecurringPaymentFormValues>(
      field: K,
      value: RecurringPaymentFormValues[K]
    ): void => {
      dirtyFieldsRef.current = new Set([...dirtyFieldsRef.current, field]);
      if (field === "startDate") {
        dirtyFieldsRef.current.add("expectedNextDueDate");
      }
      setForm((prev) => ({ ...prev, [field]: value }));
      if (field === "startDate") {
        setErrors((prev) => ({
          ...prev,
          startDate: undefined,
          endDate: undefined,
        }));
        return;
      }
      if (field in errors) {
        setErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    },
    [errors]
  );

  useEffect(() => {
    if (form.reactivateAfterSaving && !isReactivationAvailable) updateField("reactivateAfterSaving", false);
  }, [form.reactivateAfterSaving, isReactivationAvailable, updateField]);

  const handleSubmit = useCallback(async (): Promise<void> => {
    if (isSubmitting || isSubmitInFlightRef.current) return;

    const result = validateRecurringPaymentForm(
      {
        name: form.name.trim(),
        amount: form.amount,
        accountId: form.accountId,
        categoryId: form.categoryId,
        startDate: form.startDate,
        endDate: form.endDate ?? null,
      },
      {
        currency: selectedCurrency,
        originalStartDate: mode === "edit" ? initialValues.startDate : null,
        messages: {
          invalidAmount: t("invalid_amount"),
          positiveAmount: t("amount_must_be_positive"),
          amountMaximum: t("amount_maximum_error", {
            maximum: MAX_TRANSACTION_AMOUNT.toLocaleString("en-US"),
          }),
          amountPrecision: (precision) =>
            t("amount_precision_error", { precision }),
          invalidStartDate: t("invalid_due_payment_date"),
          startDateRange: t("due_payment_date_range"),
          invalidEndDate: t("invalid_end_date"),
          endDateBeforeDue: t("end_date_before_due"),
        },
      }
    );

    if (!result.isValid) {
      setErrors(result.errors);
      scrollToFirstError(result.errors, ERROR_FIELD_ORDER);
      return;
    }

    isSubmitInFlightRef.current = true;
    try {
      const didSubmit = await onSubmit(form);
      if (didSubmit !== false) dirtyFieldsRef.current = new Set();
    } finally {
      isSubmitInFlightRef.current = false;
    }
  }, [
    form,
    initialValues.startDate,
    isSubmitting,
    mode,
    onSubmit,
    scrollToFirstError,
    selectedCurrency,
    t,
  ]);

  useImperativeHandle(
    ref,
    () => ({
      submit: (): void => {
        void handleSubmit();
      },
    }),
    [handleSubmit]
  );

  const handleDateChange = useCallback(
    (event: DateTimePickerEvent, selectedDate?: Date): void => {
      if (event.type === "dismissed") {
        setDatePickerField(null);
        return;
      }
      setDatePickerField(Platform.OS === "ios" ? "startDate" : null);
      if (selectedDate) {
        updateField("startDate", selectedDate);
      }
    },
    [updateField]
  );

  const handleEndDateChange = useCallback(
    (event: DateTimePickerEvent, selectedDate?: Date): void => {
      if (event.type === "dismissed") {
        setDatePickerField(null);
        return;
      }
      setDatePickerField(Platform.OS === "ios" ? "endDate" : null);
      if (selectedDate) updateField("endDate", selectedDate);
    },
    [updateField]
  );

  const iconColor = isDark ? palette.slate[200] : palette.slate[700];
  const statusLabelKey =
    status === "PAUSED"
      ? "status_paused"
      : status === "COMPLETED"
        ? "status_completed"
        : "status_active";
  const frequencyDisplayLabel = getFrequencyTypeLabel(
    form.frequency,
    form.type,
    t
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1"
    >
      <ScrollView
        ref={scrollViewRef}
        className="flex-1 px-5"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <RecurringPaymentSummaryCard
          name={form.name}
          amount={form.amount}
          currency={selectedCurrency}
          frequency={frequencyDisplayLabel}
          dueDate={formatDate(displayDueDate, "MMM d, yyyy")}
          status={t(statusLabelKey)}
          statusKind={status}
          isIncome={form.type === "INCOME"}
          category={selectedCategory}
        />

        <TypeTabs
          value={form.type}
          onChange={(type) => {
            updateField("type", type);
            updateField("categoryId", null);
          }}
        />

        <View testID="recurring-payment-details-section" className="mb-2">
          <View ref={nameFieldRef}>
            <TextField
              testID="recurring-payment-name-input"
              label={t("name")}
              value={form.name}
              onChangeText={(name) => updateField("name", name)}
              placeholder={t("name_placeholder")}
              error={errors.name}
            />
          </View>
          <AmountField
            fieldRef={amountFieldRef}
            label={t("amount")}
            value={form.amount}
            currency={selectedCurrency}
            onChangeText={(amount) => updateField("amount", amount)}
            error={errors.amount}
            isDark={isDark}
            onFocus={() => scrollToField("amount")}
          />
        </View>

        <View
          ref={accountFieldRef}
          testID="recurring-payment-schedule-section"
          className="mb-6"
        >
          <View ref={categoryFieldRef}>
            <Text
              testID="recurring-payment-schedule-title"
              className="input-label"
            >
              {t("payment_schedule")}
            </Text>
            <View className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-25 dark:bg-slate-800 overflow-hidden">
              <FormRow
                testID="recurring-payment-account-row"
                icon="wallet-outline"
                label={t("linked_account")}
                value={selectedAccount?.name ?? tCommon("select")}
                onPress={() => setShowAccountModal(true)}
                iconColor={palette.nileGreen[500]}
                iconContainerClassName="bg-nileGreen-100 dark:bg-slate-700"
              />
              <Divider index={0} />
              <FormRow
                testID="recurring-payment-category-row"
                icon="grid-outline"
                label={t("category")}
                value={selectedCategory?.displayName ?? t("select_category")}
                onPress={() => setShowCategoryModal(true)}
                iconColor={palette.nileGreen[500]}
                iconContainerClassName="bg-nileGreen-100 dark:bg-slate-700"
              />
              <Divider index={1} />
              <FormRow
                testID="recurring-payment-frequency-row"
                icon="repeat-outline"
                label={t("frequency")}
                value={frequencyDisplayLabel}
                onPress={() => setShowFrequencyModal(true)}
                iconColor={palette.nileGreen[500]}
                iconContainerClassName="bg-nileGreen-100 dark:bg-slate-700"
              />
              <Divider index={2} />
              <View ref={startDateFieldRef}>
                <FormRow
                  testID="recurring-payment-start-date-row"
                  icon="calendar-outline"
                  label={t("start_date")}
                  value={formatDate(form.startDate, "MMM d, yyyy")}
                  description={t("due_payment_hint")}
                  onPress={() =>
                    setDatePickerField((current) =>
                      current === "startDate" ? null : "startDate"
                    )
                  }
                  iconColor={palette.nileGreen[500]}
                  iconContainerClassName="bg-nileGreen-100 dark:bg-slate-700"
                />
              </View>
              <Divider index={3} />
              <View ref={endDateFieldRef}>
                <FormRow
                  testID="recurring-payment-end-date-row"
                  icon="calendar-outline"
                  label={t("end_date")}
                  labelSuffix={t("optional")}
                  value={form.endDate ? formatDate(form.endDate, "MMM d, yyyy") : t("end_date_not_set")}
                  description={
                    hasNoFurtherEligibleRecurrence
                      ? t("end_date_no_further_payments")
                      : t("end_date_hint")
                  }
                  actionLabel={form.endDate ? t("clear") : undefined}
                  onAction={form.endDate ? () => updateField("endDate", null) : undefined}
                  onPress={() =>
                    setDatePickerField((current) =>
                      current === "endDate" ? null : "endDate"
                    )
                  }
                  iconColor={palette.nileGreen[500]}
                  iconContainerClassName="bg-nileGreen-100 dark:bg-slate-700"
                />
              </View>
            </View>
          </View>
          {errors.accountId ? <ErrorText>{errors.accountId}</ErrorText> : null}
          {errors.categoryId ? (
            <ErrorText>{errors.categoryId}</ErrorText>
          ) : null}
          {errors.startDate ? (
            <ErrorText>{errors.startDate}</ErrorText>
          ) : null}
          {hasDuePaymentAfterEndDate ? (
            <ErrorText>{t("end_date_before_due")}</ErrorText>
          ) : errors.endDate ? (
            <ErrorText>{errors.endDate}</ErrorText>
          ) : null}
        </View>

        {mode === "edit" && status === "COMPLETED" ? (
          <TouchableOpacity
            testID="recurring-payment-reactivate-after-saving"
            accessibilityRole="checkbox"
            accessibilityState={{
              checked: form.reactivateAfterSaving,
              disabled: !isReactivationAvailable,
            }}
            disabled={!isReactivationAvailable}
            onPress={() =>
              updateField(
                "reactivateAfterSaving",
                !form.reactivateAfterSaving
              )
            }
            className={`mb-6 flex-row items-center rounded-2xl border px-4 py-3 ${
              isReactivationAvailable
                ? "border-slate-200 dark:border-slate-700 bg-slate-25 dark:bg-slate-800"
                : "border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800"
            }`}
            // NativeWind opacity classes crash on TouchableOpacity.
            style={!isReactivationAvailable ? { opacity: 0.5 } : undefined}
          >
            <View
              className={`me-3 h-5 w-5 rounded border items-center justify-center ${
                form.reactivateAfterSaving
                  ? "border-nileGreen-500 bg-nileGreen-500"
                  : "border-slate-400 dark:border-slate-500"
              }`}
            >
              {form.reactivateAfterSaving ? (
                <Ionicons name="checkmark" size={16} color={palette.slate[25]} />
              ) : null}
            </View>
            <View className="flex-1">
              <Text
                className={`text-sm font-semibold ${
                  isReactivationAvailable
                    ? "text-text-primary dark:text-text-primary-dark"
                    : "text-text-muted dark:text-text-muted-dark"
                }`}
              >
                {t("reactivate_after_saving")}
              </Text>
              <Text className="mt-1 text-xs leading-4 text-text-secondary dark:text-text-secondary-dark">
                {isReactivationAvailable && reactivationDueDate
                  ? t("reactivate_after_saving_hint", {
                      date: formatDate(reactivationDueDate, "MMM d, yyyy"),
                    })
                  : t("reactivate_payment_unavailable")}
              </Text>
            </View>
          </TouchableOpacity>
        ) : null}

        <View testID="recurring-payment-action-section" className="mb-6">
          <Text testID="recurring-payment-action-title" className="input-label">
            {t("payment_action")}
          </Text>
          <Text className="px-1 mb-3 text-xs leading-4 text-text-secondary dark:text-text-secondary-dark">
            {t("payment_action_description")}
          </Text>
          <View className="flex-row gap-3">
            {ACTION_OPTIONS.map((option) => {
              const isSelected = form.action === option.value;

              return (
                <TouchableOpacity
                  key={option.value}
                  testID={`recurring-payment-action-${option.value}`}
                  className={`flex-1 h-12 rounded-2xl border flex-row items-center justify-center ${
                    isSelected
                      ? "bg-nileGreen-500 border-nileGreen-500"
                      : "bg-slate-25 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                  }`}
                  onPress={() => updateField("action", option.value)}
                >
                  <Ionicons
                    name={option.icon}
                    size={18}
                    color={isSelected ? "white" : iconColor}
                  />
                  <Text
                    className={`ms-2 text-sm font-bold ${
                      isSelected
                        ? "text-white"
                        : "text-text-primary dark:text-text-primary-dark"
                    }`}
                  >
                    {t(option.labelKey)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View testID="recurring-payment-notes-section">
          <TextField
            testID="recurring-payment-notes-input"
            label={t("notes_optional")}
            value={form.notes}
            onChangeText={(notes) => updateField("notes", notes)}
            placeholder={t("add_notes_placeholder")}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {mode === "edit" ? (
          <RecurringPaymentEditActions
            status={status}
            onPauseToggle={onPauseToggle}
            onDelete={onDelete}
          />
        ) : null}

        {mode === "edit" ? (
          <View
            testID="recurring-payment-save-separator"
            className="h-px bg-slate-200 dark:bg-slate-700 mb-5"
          />
        ) : null}

        <TouchableOpacity
          testID="recurring-payment-save-button"
          className={`rounded-2xl py-4 items-center ${
            isSubmitting ? "bg-slate-600" : "bg-nileGreen-500"
          }`}
          disabled={isSubmitting}
          onPress={() => void handleSubmit()}
        >
          <Text className="text-base font-bold text-white">{submitLabel}</Text>
        </TouchableOpacity>
      </ScrollView>

      {datePickerField ? (
        <DateTimePicker
          value={datePickerField === "startDate" ? form.startDate : (form.endDate ?? form.startDate)}
          mode="date"
          display="default"
          minimumDate={datePickerField === "startDate" ? startDateMinimumDate : form.startDate}
          onChange={datePickerField === "startDate" ? handleDateChange : handleEndDateChange}
        />
      ) : null}

      <AccountSelectorModal
        visible={showAccountModal}
        accounts={accounts as Account[]}
        selectedId={form.accountId}
        onSelect={(accountId) => updateField("accountId", accountId)}
        onClose={() => setShowAccountModal(false)}
      />
      <CategorySelectorModal
        visible={showCategoryModal}
        rootCategories={rootCategories}
        selectedId={form.categoryId}
        type={form.type}
        onSelect={(categoryId) => updateField("categoryId", categoryId)}
        onClose={() => setShowCategoryModal(false)}
      />
      <FrequencyPickerModal
        visible={showFrequencyModal}
        selectedFrequency={form.frequency}
        onSelect={(frequency) => updateField("frequency", frequency)}
        onClose={() => setShowFrequencyModal(false)}
      />
    </KeyboardAvoidingView>
  );
});

function getFrequencyTypeLabel(
  frequency: RecurringFrequency,
  type: TransactionType,
  t: (key: string) => string
): string {
  const frequencyLabel = toTitleCase(getFrequencyLabel(frequency, t));
  const typeLabel = toTitleCase(t(type === "INCOME" ? "income" : "expense"));

  return `${frequencyLabel} ${typeLabel}`;
}

function getDisplayDueDate({
  dueDate,
  recurrenceAnchorDate,
  initialValues,
  form,
  hasScheduleChanges,
  status,
}: {
  readonly dueDate?: Date;
  readonly recurrenceAnchorDate: Date;
  readonly initialValues: RecurringPaymentFormValues;
  readonly form: RecurringPaymentFormValues;
  readonly hasScheduleChanges: boolean;
  readonly status?: RecurringStatus;
}): Date {
  if (dueDate && !hasScheduleChanges) {
    return dueDate;
  }

  if (dueDate && status === "COMPLETED" && !form.reactivateAfterSaving) {
    return dueDate;
  }

  const shouldRetainFinalPaidOccurrence =
    dueDate !== undefined &&
    status === "COMPLETED" &&
    form.reactivateAfterSaving &&
    initialValues.endDate !== null &&
    isOnOrBeforeDay(dueDate, initialValues.endDate) &&
    !didRelaxEndDate(initialValues.endDate, form.endDate);
  if (shouldRetainFinalPaidOccurrence) {
    return dueDate;
  }

  const didStartDateChange = !isSameLocalCalendarDay(
    initialValues.startDate,
    form.startDate
  );
  const didFrequencyChange = initialValues.frequency !== form.frequency;
  const didRelaxCompletedEndDate =
    dueDate !== undefined &&
    status === "COMPLETED" &&
    initialValues.endDate !== null &&
    didRelaxEndDate(initialValues.endDate, form.endDate);
  if (
    dueDate &&
    !didStartDateChange &&
    didRelaxCompletedEndDate &&
    isOnOrBeforeDay(dueDate, initialValues.endDate)
  ) {
    return getNextRecurringOccurrenceAfter({
      startDate: recurrenceAnchorDate,
      currentOccurrence: dueDate,
      frequency: form.frequency,
    });
  }
  if (
    dueDate &&
    !didStartDateChange &&
    didFrequencyChange &&
    !(
      status === "COMPLETED" &&
      initialValues.endDate !== null &&
      !isOnOrBeforeDay(dueDate, initialValues.endDate)
    )
  ) {
    return getNextRecurringOccurrenceAfter({
      startDate: recurrenceAnchorDate,
      currentOccurrence: dueDate,
      frequency: form.frequency,
    });
  }

  if (dueDate && status === "COMPLETED") {
    return dueDate;
  }

  return form.startDate;
}

function didRelaxEndDate(
  initialEndDate: Date,
  nextEndDate: Date | null
): boolean {
  return nextEndDate === null || !isOnOrBeforeDay(nextEndDate, initialEndDate);
}

function areSameOptionalLocalCalendarDays(
  firstDate: Date | null,
  secondDate: Date | null
): boolean {
  if (firstDate === null || secondDate === null) {
    return firstDate === secondDate;
  }

  return isSameLocalCalendarDay(firstDate, secondDate);
}

function hasNoFurtherEligiblePayment(
  duePayment: Date,
  recurrenceAnchorDate: Date,
  frequency: RecurringFrequency,
  endDate: Date | null
): boolean {
  if (endDate === null || !isOnOrBeforeDay(duePayment, endDate)) {
    return false;
  }

  const nextDueDate = getNextRecurringOccurrenceAfter({
    startDate: recurrenceAnchorDate,
    currentOccurrence: duePayment,
    frequency,
  });

  return !isOnOrBeforeDay(nextDueDate, endDate);
}

function getReactivationDueDate(
  dueDate: Date | undefined,
  recurrenceAnchorDate: Date,
  initialEndDate: Date | null,
  frequency: RecurringFrequency
): Date | null {
  if (!dueDate) return null;

  return initialEndDate !== null && isOnOrBeforeDay(dueDate, initialEndDate)
    ? getNextRecurringOccurrenceAfter({
        startDate: recurrenceAnchorDate,
        currentOccurrence: dueDate,
        frequency,
      })
    : dueDate;
}

function getStartDateMinimumDate(
  mode: RecurringPaymentFormProps["mode"],
  startDate: Date
): Date {
  const today = new Date();

  if (mode === "edit" && startDate.getTime() < today.getTime()) {
    return startDate;
  }

  return today;
}

function mergePristineInitialValues(
  currentForm: RecurringPaymentFormValues,
  initialValues: RecurringPaymentFormValues,
  dirtyFields: ReadonlySet<RecurringPaymentFormField>
): RecurringPaymentFormValues {
  return FORM_VALUE_FIELDS.reduce<RecurringPaymentFormValues>(
    (nextForm, field) =>
      dirtyFields.has(field)
        ? nextForm
        : { ...nextForm, [field]: initialValues[field] },
    currentForm
  );
}

function toTitleCase(value: string): string {
  return value
    .trim()
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const lowerWord = word.toLocaleLowerCase();
      return lowerWord.charAt(0).toLocaleUpperCase() + lowerWord.slice(1);
    })
    .join(" ");
}
