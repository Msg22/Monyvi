import { AccountSelectorModal } from "@/components/modals/AccountSelectorModal";
import { CategorySelectorModal } from "@/components/modals/CategorySelectorModal";
import {
  FrequencyPickerModal,
  getFrequencyLabel,
} from "@/components/modals/FrequencyPickerModal";
import { RecurringPaymentEditActions } from "./RecurringPaymentEditActions";
import { RecurringPaymentSummaryCard } from "./RecurringPaymentSummaryCard";
import { Divider, ErrorText, FormRow } from "./RecurringPaymentFormRows";
import { TextField } from "@/components/ui/TextField";
import { palette } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { useFormScroll } from "@/hooks/useFormScroll";
import { calculateNextDueDate, formatDate } from "@/utils/dateHelpers";
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
import { formatAmountInput, parseAmountInput } from "@monyvi/logic";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
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
  TextInput,
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
  readonly endDate: Date | null;
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
  readonly onSubmit: (values: RecurringPaymentFormValues) => SubmitResult;
  readonly onPauseToggle?: () => Promise<void>;
  readonly onDelete?: () => Promise<void>;
}

export interface RecurringPaymentFormHandle {
  submit: () => void;
}

type FormErrors = Partial<
  Record<"name" | "amount" | "accountId" | "categoryId" | "endDate", string>
>;
type FormFieldName = keyof FormErrors;
type RecurringPaymentFormField = keyof RecurringPaymentFormValues;

const TYPE_OPTIONS: ReadonlyArray<{
  readonly value: TransactionType;
  readonly labelKey: "expense" | "income";
  readonly icon: keyof typeof Ionicons.glyphMap;
}> = [
  { value: "EXPENSE", labelKey: "expense", icon: "receipt-outline" },
  { value: "INCOME", labelKey: "income", icon: "cash-outline" },
];

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
  "endDate",
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
        initialValues.endDate?.getTime() ?? "",
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
      initialValues.endDate,
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
  const hasScheduleChanges =
    initialValues.startDate.getTime() !== form.startDate.getTime() ||
    initialValues.frequency !== form.frequency;
  const displayDueDate = getDisplayDueDate({
    dueDate,
    initialValues,
    form,
    hasScheduleChanges,
  });
  const startDateMinimumDate = getStartDateMinimumDate(mode, form.startDate);

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
      setForm((prev) => ({ ...prev, [field]: value }));
      if (field in errors) {
        setErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    },
    [errors]
  );

  const handleSubmit = useCallback(async (): Promise<void> => {
    if (isSubmitting || isSubmitInFlightRef.current) return;

    const result = validateRecurringPaymentForm({
      name: form.name.trim(),
      amount: form.amount,
      accountId: form.accountId,
      categoryId: form.categoryId,
      startDate: form.startDate,
      endDate: form.endDate ?? null,
      endDateErrorMessage: t("end_date_before_due"),
    });

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
  }, [form, isSubmitting, onSubmit, scrollToFirstError]);

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
    (_event: DateTimePickerEvent, selectedDate?: Date): void => {
      setDatePickerField(Platform.OS === "ios" ? "startDate" : null);
      if (selectedDate) {
        updateField("startDate", selectedDate);
      }
    },
    [updateField]
  );

  const handleEndDateChange = useCallback(
    (_event: DateTimePickerEvent, selectedDate?: Date): void => {
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
              <FormRow
                testID="recurring-payment-start-date-row"
                icon="calendar-outline"
                label={t("start_date")}
                value={formatDate(form.startDate, "MMM d, yyyy")}
                description={t("due_payment_hint")}
                onPress={() => setDatePickerField("startDate")}
                iconColor={palette.nileGreen[500]}
                iconContainerClassName="bg-nileGreen-100 dark:bg-slate-700"
              />
              <Divider index={3} />
              <View ref={endDateFieldRef}>
                <FormRow
                  testID="recurring-payment-end-date-row"
                  icon="calendar-outline"
                  label={t("end_date")}
                  labelSuffix={t("optional")}
                  value={form.endDate ? formatDate(form.endDate, "MMM d, yyyy") : t("end_date_not_set")}
                  description={t("end_date_hint")}
                  actionLabel={form.endDate ? t("clear") : undefined}
                  onAction={form.endDate ? () => updateField("endDate", null) : undefined}
                  onPress={() => setDatePickerField("endDate")}
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
          {errors.endDate ? <ErrorText>{errors.endDate}</ErrorText> : null}
        </View>

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

interface AmountFieldProps {
  readonly fieldRef: React.RefObject<View | null>;
  readonly label: string;
  readonly value: string;
  readonly currency: CurrencyType;
  readonly error?: string;
  readonly isDark: boolean;
  readonly onFocus: () => void;
  readonly onChangeText: (value: string) => void;
}

function AmountField({
  fieldRef,
  label,
  value,
  currency,
  error,
  isDark,
  onFocus,
  onChangeText,
}: AmountFieldProps): React.JSX.Element {
  return (
    <View
      ref={fieldRef}
      testID="recurring-payment-amount-field"
      className="mb-4 w-full"
    >
      <Text className="input-label">{label}</Text>
      <View
        className={`flex-row items-center rounded-2xl border bg-white dark:bg-slate-800 ${
          error ? "border-red-500" : "border-slate-200 dark:border-slate-700"
        }`}
      >
        <Text
          testID="recurring-payment-amount-currency-prefix"
          className="ps-4 text-base font-bold text-nileGreen-500"
        >
          {currency}
        </Text>
        <TextInput
          testID="recurring-payment-amount-input"
          value={formatAmountInput(value)}
          onChangeText={(text) => onChangeText(parseAmountInput(text))}
          onFocus={onFocus}
          placeholder="0.00"
          placeholderTextColor={
            isDark ? palette.slate[600] : palette.slate[400]
          }
          keyboardType="decimal-pad"
          className="flex-1 p-4 ps-2 text-base font-semibold text-slate-900 dark:text-white"
        />
      </View>
      {error ? <ErrorText>{error}</ErrorText> : null}
    </View>
  );
}

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
  initialValues,
  form,
  hasScheduleChanges,
}: {
  readonly dueDate?: Date;
  readonly initialValues: RecurringPaymentFormValues;
  readonly form: RecurringPaymentFormValues;
  readonly hasScheduleChanges: boolean;
}): Date {
  if (dueDate && !hasScheduleChanges) {
    return dueDate;
  }


  const didStartDateChange =
    initialValues.startDate.getTime() !== form.startDate.getTime();
  const didFrequencyChange = initialValues.frequency !== form.frequency;
  if (dueDate && !didStartDateChange && didFrequencyChange) {
    return calculateNextDueDate(dueDate, form.frequency);
  }

  return form.startDate;
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

interface TypeTabsProps {
  readonly value: TransactionType;
  readonly onChange: (type: TransactionType) => void;
}

function TypeTabs({ value, onChange }: TypeTabsProps): React.JSX.Element {
  const { t } = useTranslation("transactions");

  return (
    <View testID="recurring-payment-type-tabs" className="flex-row gap-3 mb-5">
      {TYPE_OPTIONS.map((option) => {
        const isSelected = value === option.value;

        return (
          <TouchableOpacity
            key={option.value}
            className={`flex-1 h-12 rounded-full flex-row items-center justify-center border ${
              isSelected
                ? "bg-nileGreen-500 border-nileGreen-500"
                : "bg-slate-25 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
            }`}
            onPress={() => onChange(option.value)}
          >
            <Ionicons
              name={option.icon}
              size={17}
              color={isSelected ? "white" : palette.slate[500]}
            />
            <Text
              className={`ms-2 text-sm font-bold ${
                isSelected
                  ? "text-white"
                  : "text-text-secondary dark:text-text-secondary-dark"
              }`}
            >
              {t(option.labelKey)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
