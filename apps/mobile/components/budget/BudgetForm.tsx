/**
 * BudgetForm Component
 *
 * Shared form for creating, editing, and renewing budgets.
 * Keeps persistence semantics intact while presenting the approved premium flow.
 *
 * @module BudgetForm
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { palette } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { useCategories } from "@/hooks/useCategories";
import { CategorySelectorModal } from "@/components/modals/CategorySelectorModal";
import { ConfirmationModal } from "@/components/modals/ConfirmationModal";
import { CurrencyPicker } from "@/components/currency/CurrencyPicker";
import { AlertThresholdSlider } from "./AlertThresholdSlider";
import type { Budget, BudgetPeriod } from "@monyvi/db";
import {
  createBudget,
  updateBudget,
  type CreateBudgetInput,
  type UpdateBudgetInput,
} from "@/services/budget-service";
import { useToast } from "@/components/ui/Toast";
import { router } from "expo-router";
import { useCategoryLookup } from "@/context/CategoriesContext";
import DateTimePicker from "@react-native-community/datetimepicker";
import { usePreferredCurrency } from "@/hooks/usePreferredCurrency";
import { formatDate } from "@/utils/dateHelpers";
import {
  getCurrentPeriodBounds,
  parsePositiveMoneyAmount,
} from "@monyvi/logic";
import {
  buildBudgetRenewalFormValues,
  resolveRenewalCategoryId,
  type BudgetFormInitialValues,
} from "./budget-renewal-form-values";

interface BudgetFormProps {
  readonly existingBudget?: Budget;
  readonly renewalSource?: Budget;
}

type FormState = BudgetFormInitialValues;

interface FormErrors {
  name?: string;
  amount?: string;
  category?: string;
  period?: string;
  general?: string;
}

const PERIOD_LABELS: Record<BudgetPeriod, string> = {
  WEEKLY: "weekly",
  MONTHLY: "monthly",
  CUSTOM: "custom_period",
};

const PERIOD_KEYS: BudgetPeriod[] = ["WEEKLY", "MONTHLY", "CUSTOM"];
const DEFAULT_THRESHOLD = 80;

function formatAmount(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

export function BudgetForm({
  existingBudget,
  renewalSource,
}: BudgetFormProps): React.JSX.Element {
  const isEditMode = !!existingBudget;
  const isRenewalMode = !!renewalSource && !isEditMode;
  const { isDark } = useTheme();
  const { t } = useTranslation("budgets");
  const { bottom: bottomInset } = useSafeAreaInsets();
  const {
    expenseCategories,
    isLoading: areCategoriesLoading,
    error: categoryError,
    retry: retryCategories,
  } = useCategories();
  const categoryMap = useCategoryLookup();
  const accessibleCategoryIds = useMemo(
    () => new Set(categoryMap.keys()),
    [categoryMap]
  );
  const { showToast } = useToast();
  const { preferredCurrency, isLoading: isPreferredCurrencyLoading } =
    usePreferredCurrency();

  const [form, setForm] = useState<FormState>(() => {
    if (renewalSource) {
      return buildBudgetRenewalFormValues(
        renewalSource,
        new Date(),
        areCategoriesLoading || categoryError
          ? undefined
          : accessibleCategoryIds
      );
    }

    return {
      name: existingBudget?.name ?? "",
      type: existingBudget?.type ?? "CATEGORY",
      categoryId: existingBudget?.categoryId ?? null,
      amount: existingBudget?.amount?.toString() ?? "",
      currency: existingBudget
        ? (existingBudget.currency ?? null)
        : preferredCurrency,
      period: existingBudget?.period ?? "MONTHLY",
      periodStart: existingBudget?.periodStart ?? new Date(),
      periodEnd: existingBudget?.periodEnd ?? new Date(),
      alertThreshold: existingBudget?.alertThreshold ?? DEFAULT_THRESHOLD,
    };
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isCurrencyPickerOpen, setIsCurrencyPickerOpen] = useState(false);
  const [hasUserSelectedCurrency, setHasUserSelectedCurrency] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showRenewalConfirmation, setShowRenewalConfirmation] = useState(false);

  const selectedCategory = form.categoryId
    ? categoryMap.get(form.categoryId)
    : null;
  const categoryDisplayName = selectedCategory?.displayName;

  const isWaitingForCreateCurrency =
    !isEditMode &&
    isPreferredCurrencyLoading &&
    !hasUserSelectedCurrency &&
    (!renewalSource || form.currency === null);

  useEffect(() => {
    if (!renewalSource || areCategoriesLoading || categoryError) return;
    const normalizedCategoryId = resolveRenewalCategoryId(
      renewalSource,
      accessibleCategoryIds
    );
    setForm((current) =>
      current.categoryId === renewalSource.categoryId &&
      current.categoryId !== normalizedCategoryId
        ? { ...current, categoryId: normalizedCategoryId }
        : current
    );
  }, [
    accessibleCategoryIds,
    areCategoriesLoading,
    categoryError,
    renewalSource,
  ]);

  useEffect(() => {
    if (isEditMode || isPreferredCurrencyLoading || hasUserSelectedCurrency) {
      return;
    }

    setForm((current) => {
      if (
        current.currency === preferredCurrency ||
        (renewalSource && current.currency !== null)
      ) {
        return current;
      }
      return { ...current, currency: preferredCurrency };
    });
  }, [
    hasUserSelectedCurrency,
    isEditMode,
    isPreferredCurrencyLoading,
    preferredCurrency,
    renewalSource,
  ]);

  const updateField = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]): void => {
      setForm((prev) => ({ ...prev, [key]: value }));

      const errorKeyMap: Partial<Record<keyof FormState, keyof FormErrors>> = {
        categoryId: "category",
        periodStart: "period",
        periodEnd: "period",
      };
      const errorKey = errorKeyMap[key] ?? (key as keyof FormErrors);

      setErrors((prev) => ({
        ...prev,
        [errorKey]: undefined,
        general: undefined,
      }));
    },
    []
  );

  const handleScopeChange = useCallback(
    (type: FormState["type"]): void => {
      if (isEditMode) return;
      setForm((current) => ({
        ...current,
        type,
        categoryId: type === "GLOBAL" ? null : current.categoryId,
      }));
      setErrors((current) => ({
        ...current,
        category: undefined,
        general: undefined,
      }));
    },
    [isEditMode]
  );

  const validate = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    if (!form.name.trim()) {
      newErrors.name = t("validation_name_required");
    }

    if (parsePositiveMoneyAmount(form.amount) === null) {
      newErrors.amount = t("validation_amount_invalid");
    }

    if (form.type === "CATEGORY") {
      if (areCategoriesLoading || categoryError) {
        newErrors.category = t("category_load_error");
      } else if (!form.categoryId) {
        newErrors.category = t("validation_category_required");
      }
    }

    if (
      form.period === "CUSTOM" &&
      form.periodEnd.getTime() <= form.periodStart.getTime()
    ) {
      newErrors.period = t("validation_date_order");
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [areCategoriesLoading, categoryError, form, t]);

  const persistBudget = useCallback(
    async (
      amount: number,
      currency: FormState["currency"]
    ): Promise<void> => {
      setIsSubmitting(true);
      try {
        if (isEditMode && existingBudget) {
          const input: UpdateBudgetInput = {
            name: form.name.trim(),
            amount,
            period: form.period,
            alertThreshold: form.alertThreshold,
            ...(form.period === "CUSTOM" && {
              periodStart: form.periodStart,
              periodEnd: form.periodEnd,
            }),
            ...(form.type === "CATEGORY" && {
              categoryId: form.categoryId ?? undefined,
            }),
          };

          await updateBudget(existingBudget.id, input);
          showToast({
            type: "success",
            title: t("budget_updated"),
            message: t("budget_updated_message"),
          });
        } else {
          if (!currency) {
            setErrors({ general: t("validation_currency_required") });
            return;
          }

          const input: CreateBudgetInput = {
            name: form.name.trim(),
            type: form.type,
            categoryId:
              form.type === "CATEGORY"
                ? (form.categoryId ?? undefined)
                : undefined,
            amount,
            currency,
            period: form.period,
            alertThreshold: form.alertThreshold,
            ...(form.period === "CUSTOM" && {
              periodStart: form.periodStart,
              periodEnd: form.periodEnd,
            }),
          };

          await createBudget(input);
          showToast({
            type: "success",
            title: t("budget_created"),
            message: t("budget_created_message"),
          });
        }

        router.back();
      } catch (err) {
        const message = err instanceof Error ? err.message : t("save_failed");
        setErrors({ general: message });
      } finally {
        setIsSubmitting(false);
      }
    }, [existingBudget, form, isEditMode, showToast, t]
  );

  const handleSubmit = useCallback(async (): Promise<void> => {
    if (isWaitingForCreateCurrency || !validate()) return;

    const amount = parsePositiveMoneyAmount(form.amount);
    if (amount === null) return;

    if (!isEditMode && !form.currency) {
      setErrors({ general: t("validation_currency_required") });
      return;
    }

    if (isRenewalMode) {
      setShowRenewalConfirmation(true);
      return;
    }

    await persistBudget(amount, form.currency);
  }, [
    form.amount,
    form.currency,
    isEditMode,
    isRenewalMode,
    isWaitingForCreateCurrency,
    persistBudget,
    t,
    validate,
  ]);

  const handleConfirmRenewal = useCallback(async (): Promise<void> => {
    if (!validate()) {
      setShowRenewalConfirmation(false);
      return;
    }

    const amount = parsePositiveMoneyAmount(form.amount);
    if (amount === null || !form.currency) {
      setShowRenewalConfirmation(false);
      return;
    }

    setShowRenewalConfirmation(false);
    await persistBudget(amount, form.currency);
  }, [form.amount, form.currency, persistBudget, validate]);

  const previewAmountNumber = parsePositiveMoneyAmount(form.amount) ?? 0;
  const previewAlertAmount =
    previewAmountNumber * (form.alertThreshold / 100);
  const previewPeriodLabel = t(PERIOD_LABELS[form.period]);
  const previewPeriodBounds = getCurrentPeriodBounds(
    form.period,
    form.period === "CUSTOM" ? form.periodStart : undefined,
    form.period === "CUSTOM" ? form.periodEnd : undefined
  );
  const previewResetOrEndDate =
    form.period === "CUSTOM"
      ? previewPeriodBounds.end
      : new Date(previewPeriodBounds.end.getTime() + 1);
  const previewDate = formatDate(previewPeriodBounds.start, "MMM d, yyyy");
  const previewSecondaryDate = formatDate(
    previewResetOrEndDate,
    "MMM d, yyyy"
  );
  const previewIdentity =
    form.type === "GLOBAL"
      ? t("global_type")
      : (categoryDisplayName ?? t("category_type"));
  const isSubmitDisabled =
    isSubmitting ||
    (form.type === "CATEGORY" && areCategoriesLoading) ||
    isWaitingForCreateCurrency;

  const selectedScopeClasses = "border-nileGreen-500";
  const idleScopeClasses =
    "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800";
  const selectedScopeStyle = useMemo(
    () => ({
      backgroundColor: isDark
        ? `${palette.nileGreen[500]}33`
        : palette.nileGreen[50],
    }),
    [isDark]
  );
  const actionFooterStyle = useMemo(
    () => ({ paddingBottom: bottomInset + 16 }),
    [bottomInset]
  );

  return (
    <>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="flex-1 px-5"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 28, paddingTop: 8 }}
        >
          {errors.general ? (
            <View className="mb-4 rounded-xl bg-red-50 p-3 dark:bg-red-900/20">
              <Text className="text-sm font-medium text-red-600 dark:text-red-400">
                {errors.general}
              </Text>
            </View>
          ) : null}

          <Text className="mb-3 mt-2 text-base font-semibold text-slate-500 dark:text-slate-400">
            1. {t("budget_scope")}
          </Text>

          <View testID="budget-scope-selector" className="mb-7 flex-row gap-3">
            <TouchableOpacity
              testID="budget-scope-global"
              onPress={() => handleScopeChange("GLOBAL")}
              disabled={isEditMode}
              accessibilityRole="radio"
              accessibilityLabel={t("accessibility_global_budget_type")}
              accessibilityState={{
                checked: form.type === "GLOBAL",
                disabled: isEditMode,
              }}
              activeOpacity={0.82}
              style={
                form.type === "GLOBAL" ? selectedScopeStyle : undefined
              }
              className={`relative flex-1 rounded-2xl border p-4 ${
                form.type === "GLOBAL"
                  ? selectedScopeClasses
                  : idleScopeClasses
              }`}
            >
              <View className="mb-3 h-11 w-11 items-center justify-center rounded-xl bg-nileGreen-100 dark:bg-nileGreen-900/50">
                <Ionicons
                  name="earth-outline"
                  size={24}
                  color={palette.nileGreen[500]}
                />
              </View>
              <Text className="text-base font-bold text-slate-900 dark:text-white">
                {t("global_type")}
              </Text>
              <Text className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                {t("scope_global_description")}
              </Text>
              {form.type === "GLOBAL" ? (
                <View className="absolute end-3 top-3 h-7 w-7 items-center justify-center rounded-full bg-nileGreen-500">
                  <Ionicons name="checkmark" size={18} color="white" />
                </View>
              ) : null}
            </TouchableOpacity>

            <TouchableOpacity
              testID="budget-scope-category"
              onPress={() => handleScopeChange("CATEGORY")}
              disabled={isEditMode}
              accessibilityRole="radio"
              accessibilityLabel={t("accessibility_category_budget_type")}
              accessibilityState={{
                checked: form.type === "CATEGORY",
                disabled: isEditMode,
              }}
              activeOpacity={0.82}
              style={
                form.type === "CATEGORY" ? selectedScopeStyle : undefined
              }
              className={`relative flex-1 rounded-2xl border p-4 ${
                form.type === "CATEGORY"
                  ? selectedScopeClasses
                  : idleScopeClasses
              }`}
            >
              <View className="mb-3 h-11 w-11 items-center justify-center rounded-xl bg-nileGreen-100 dark:bg-nileGreen-900/50">
                <Ionicons
                  name="restaurant-outline"
                  size={24}
                  color={palette.nileGreen[500]}
                />
              </View>
              <Text className="text-base font-bold text-slate-900 dark:text-white">
                {t("category_type")}
              </Text>
              <Text className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                {t("scope_category_description")}
              </Text>
              {form.type === "CATEGORY" ? (
                <View className="absolute end-3 top-3 h-7 w-7 items-center justify-center rounded-full bg-nileGreen-500">
                  <Ionicons name="checkmark" size={18} color="white" />
                </View>
              ) : null}
            </TouchableOpacity>
          </View>

          <Text className="mb-3 text-base font-semibold text-slate-500 dark:text-slate-400">
            2. {t("budget_details")}
          </Text>

          <View className="mb-3 flex-row items-center rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
            <View className="me-3 h-11 w-11 items-center justify-center rounded-xl bg-nileGreen-100 dark:bg-nileGreen-900/50">
              <Ionicons
                name="document-text-outline"
                size={22}
                color={palette.nileGreen[500]}
              />
            </View>
            <View className="flex-1">
              <Text className="text-xs text-slate-500 dark:text-slate-400">
                {t("budget_name")}
              </Text>
              <TextInput
                value={form.name}
                onChangeText={(value) => updateField("name", value)}
                placeholder={t("budget_name_placeholder")}
                placeholderTextColor={
                  isDark ? palette.slate[600] : palette.slate[400]
                }
                className="mt-0.5 p-0 text-base font-medium text-slate-900 dark:text-white"
              />
            </View>
          </View>
          {errors.name ? (
            <Text className="mb-3 text-xs font-medium text-red-500">
              {errors.name}
            </Text>
          ) : null}

          {form.type === "CATEGORY" ? (
            <View className="mb-3">
              {categoryError ? (
                <View
                  testID="budget-category-load-error"
                  className="rounded-2xl border border-red-300 bg-red-50 p-4 dark:border-red-700 dark:bg-red-900/20"
                >
                  <Text className="text-sm text-red-600 dark:text-red-300">
                    {t("category_load_error")}
                  </Text>
                  <TouchableOpacity
                    className="mt-2 min-h-11 self-start justify-center"
                    accessibilityRole="button"
                    accessibilityLabel={t("retry")}
                    onPress={retryCategories}
                  >
                    <Text className="font-semibold text-nileGreen-600 dark:text-nileGreen-300">
                      {t("retry")}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => setIsCategoryModalOpen(true)}
                  activeOpacity={0.82}
                  className="flex-row items-center rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800"
                >
                  <View className="me-3 h-11 w-11 items-center justify-center rounded-xl bg-nileGreen-100 dark:bg-nileGreen-900/50">
                    <Ionicons
                      name="restaurant-outline"
                      size={22}
                      color={palette.nileGreen[500]}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs text-slate-500 dark:text-slate-400">
                      {t("category_type")}
                    </Text>
                    <Text
                      numberOfLines={1}
                      className={`mt-0.5 text-base font-medium ${
                        categoryDisplayName
                          ? "text-slate-900 dark:text-white"
                          : "text-slate-400"
                      }`}
                    >
                      {categoryDisplayName ?? t("select_a_category")}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-down"
                    size={20}
                    color={isDark ? palette.slate[400] : palette.slate[500]}
                  />
                </TouchableOpacity>
              )}
              {errors.category ? (
                <Text className="mt-1 text-xs font-medium text-red-500">
                  {errors.category}
                </Text>
              ) : null}
            </View>
          ) : null}

          <View className="mb-3 flex-row items-center rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
            <View className="me-3 h-11 w-11 items-center justify-center rounded-xl bg-nileGreen-100 dark:bg-nileGreen-900/50">
              <Ionicons
                name="wallet-outline"
                size={22}
                color={palette.nileGreen[500]}
              />
            </View>
            <View className="flex-1">
              <Text className="text-xs text-slate-500 dark:text-slate-400">
                {t("budget_limit")}
              </Text>
              <View className="mt-0.5 flex-row items-center">
                {isEditMode ? (
                  <View testID="budget-currency-read-only" className="me-2">
                    <Text className="text-base font-bold text-nileGreen-500">
                      {form.currency ?? "—"}
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    testID="budget-currency-selector"
                    className="me-2 flex-row items-center"
                    onPress={() => setIsCurrencyPickerOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel={t("select_budget_currency")}
                  >
                    <Text className="text-base font-bold text-nileGreen-500">
                      {form.currency ?? preferredCurrency}
                    </Text>
                    <Ionicons
                      name="chevron-down"
                      size={15}
                      color={isDark ? palette.slate[400] : palette.slate[500]}
                    />
                  </TouchableOpacity>
                )}
                <TextInput
                  value={form.amount}
                  onChangeText={(value) => updateField("amount", value)}
                  placeholder="0.00"
                  placeholderTextColor={
                    isDark ? palette.slate[600] : palette.slate[400]
                  }
                  keyboardType="decimal-pad"
                  className="flex-1 p-0 text-base font-semibold text-slate-900 dark:text-white"
                />
              </View>
            </View>
          </View>
          {errors.amount ? (
            <Text className="mb-3 text-xs font-medium text-red-500">
              {errors.amount}
            </Text>
          ) : null}

          {!isEditMode ? (
            <View className="mb-3 flex-row items-center gap-2 rounded-xl bg-nileGreen-50 p-3 dark:bg-nileGreen-900/20">
              <Ionicons
                name="information-circle-outline"
                size={18}
                color={palette.nileGreen[500]}
              />
              <Text className="flex-1 text-xs text-nileGreen-700 dark:text-nileGreen-400">
                {t("budget_currency_immutable_info")}
              </Text>
            </View>
          ) : null}

          <View className="mb-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <Text className="mb-3 text-sm font-medium text-slate-600 dark:text-slate-300">
              {t("period")}
            </Text>
            <View className="flex-row rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
              {PERIOD_KEYS.map((key) => {
                const selected = form.period === key;
                return (
                  <TouchableOpacity
                    key={key}
                    testID={`budget-period-${key.toLowerCase()}`}
                    onPress={() => updateField("period", key)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    className={`flex-1 items-center rounded-lg py-2.5 ${
                      selected ? "bg-nileGreen-500" : "bg-transparent"
                    }`}
                  >
                    <Text
                      className={`text-sm font-bold ${
                        selected
                          ? "text-white"
                          : "text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      {t(PERIOD_LABELS[key])}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {form.period === "CUSTOM" ? (
            <View className="mb-3">
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Text className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                    {t("start_date")}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setShowStartPicker(true)}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800"
                  >
                    <Text className="text-sm font-medium text-slate-900 dark:text-white">
                      {formatDate(form.periodStart, "MMM d, yyyy")}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View className="flex-1">
                  <Text className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                    {t("end_date")}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setShowEndPicker(true)}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800"
                  >
                    <Text className="text-sm font-medium text-slate-900 dark:text-white">
                      {formatDate(form.periodEnd, "MMM d, yyyy")}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              {errors.period ? (
                <Text className="mt-1 text-xs font-medium text-red-500">
                  {errors.period}
                </Text>
              ) : null}
            </View>
          ) : null}

          <View className="mb-7 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <Text className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">
              {t("alert_threshold")}
            </Text>
            <AlertThresholdSlider
              value={form.alertThreshold}
              onValueChange={(value) => updateField("alertThreshold", value)}
            />
            <Text className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {t("warn_me_when_spent", {
                amount: `${form.currency ?? ""} ${formatAmount(previewAlertAmount)}`,
              })}
            </Text>
          </View>

          <Text className="mb-3 text-base font-semibold text-slate-500 dark:text-slate-400">
            3. {t("preview")}
          </Text>

          <View
            testID="budget-live-preview"
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
          >
            <View className="flex-row items-stretch px-4 py-4">
              <View className="me-3 h-12 w-12 items-center justify-center rounded-xl bg-nileGreen-100 dark:bg-nileGreen-900/50">
                <Ionicons
                  name="calendar-outline"
                  size={24}
                  color={palette.nileGreen[500]}
                />
              </View>
              <View className="flex-1 border-e border-slate-200 pe-3 dark:border-slate-700">
                <Text className="text-xs text-slate-500 dark:text-slate-400">
                  {t("period")}
                </Text>
                <Text className="mt-0.5 font-bold text-nileGreen-500">
                  {previewPeriodLabel}
                </Text>
                <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {form.period === "CUSTOM"
                    ? `${t("preview_ends_on")} ${previewSecondaryDate}`
                    : `${t("preview_resets_on")} ${previewSecondaryDate}`}
                </Text>
              </View>
              <View className="flex-1 ps-4">
                <Text className="text-xs text-slate-500 dark:text-slate-400">
                  {form.type === "GLOBAL" ? t("budget_type") : t("category_type")}
                </Text>
                <Text className="mt-0.5 font-bold text-nileGreen-500">
                  {previewIdentity}
                </Text>
                <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {form.name.trim() || t("budget_name_placeholder")}
                </Text>
              </View>
            </View>

            <View className="flex-row border-t border-slate-200 px-3 py-4 dark:border-slate-700">
              <View className="flex-1 items-center border-e border-slate-200 px-1 dark:border-slate-700">
                <Text className="text-center text-xs text-slate-500 dark:text-slate-400">
                  {t("preview_budget_limit")}
                </Text>
                <Text className="mt-1 text-center text-sm font-bold text-nileGreen-500">
                  {form.currency ?? ""} {form.amount || "0.00"}
                </Text>
              </View>
              <View className="flex-1 items-center border-e border-slate-200 px-1 dark:border-slate-700">
                <Text className="text-center text-xs text-slate-500 dark:text-slate-400">
                  {t("preview_alert_at")} {form.alertThreshold}%
                </Text>
                <Text className="mt-1 text-center text-sm font-bold text-nileGreen-500">
                  {form.currency ?? ""} {formatAmount(previewAlertAmount)}
                </Text>
              </View>
              <View className="flex-1 items-center px-1">
                <Text className="text-center text-xs text-slate-500 dark:text-slate-400">
                  {t("preview_starts")}
                </Text>
                <Text className="mt-1 text-center text-sm font-bold text-nileGreen-500">
                  {previewDate}
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>

        <View
          testID="budget-form-actions"
          style={actionFooterStyle}
          className="border-t border-slate-200 bg-white px-5 pt-3 dark:border-slate-800 dark:bg-slate-950"
        >
          <TouchableOpacity
            testID="budget-form-submit"
            onPress={() => void handleSubmit()}
            accessibilityRole="button"
            accessibilityLabel={
              isEditMode
                ? t("save_changes")
                : isRenewalMode
                  ? t("renew_budget")
                  : t("create_budget")
            }
            disabled={isSubmitDisabled}
            accessibilityState={{ disabled: isSubmitDisabled }}
            activeOpacity={0.85}
            className="items-center rounded-2xl bg-nileGreen-500 py-4"
          >
            {isSubmitting ? (
              <ActivityIndicator color="white" />
            ) : (
              <View className="flex-row items-center gap-2">
                <Ionicons
                  name={
                    isEditMode
                      ? "checkmark-circle-outline"
                      : isRenewalMode
                        ? "refresh-outline"
                        : "add-circle-outline"
                  }
                  size={22}
                  color="white"
                />
                <Text className="text-base font-bold text-white">
                  {isEditMode
                    ? t("save_changes")
                    : isRenewalMode
                      ? t("renew_budget")
                      : t("create_budget")}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            testID="budget-form-cancel"
            className="mt-2 items-center py-2"
            onPress={() => router.back()}
            disabled={isSubmitting}
            accessibilityRole="button"
            accessibilityLabel={t("cancel")}
          >
            <Text className="font-bold text-nileGreen-500">{t("cancel")}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <CategorySelectorModal
        visible={isCategoryModalOpen}
        rootCategories={expenseCategories}
        selectedId={form.categoryId}
        type="EXPENSE"
        onSelect={(id) => {
          updateField("categoryId", id);
          setIsCategoryModalOpen(false);
        }}
        onClose={() => setIsCategoryModalOpen(false)}
      />

      <CurrencyPicker
        visible={isCurrencyPickerOpen}
        selectedCurrency={form.currency ?? preferredCurrency}
        onSelect={(currency) => {
          setHasUserSelectedCurrency(true);
          updateField("currency", currency);
          setIsCurrencyPickerOpen(false);
        }}
        onClose={() => setIsCurrencyPickerOpen(false)}
      />

      <ConfirmationModal
        visible={showRenewalConfirmation}
        title={t("confirm_budget_renewal_title")}
        message={t("confirm_budget_renewal_message")}
        confirmLabel={t("confirm_budget_renewal_action")}
        cancelLabel={t("cancel")}
        onConfirm={() => void handleConfirmRenewal()}
        onCancel={() => setShowRenewalConfirmation(false)}
        variant="success"
        icon="refresh-outline"
        isConfirming={isSubmitting}
      />

      {showStartPicker ? (
        <DateTimePicker
          value={form.periodStart}
          mode="date"
          display="default"
          onChange={(_, date) => {
            setShowStartPicker(false);
            if (date) updateField("periodStart", date);
          }}
        />
      ) : null}

      {showEndPicker ? (
        <DateTimePicker
          value={form.periodEnd}
          mode="date"
          display="default"
          minimumDate={form.periodStart}
          onChange={(_, date) => {
            setShowEndPicker(false);
            if (date) updateField("periodEnd", date);
          }}
        />
      ) : null}
    </>
  );
}