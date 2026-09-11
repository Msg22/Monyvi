import React from "react";
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
import { CURRENCY_PRECISION, DEFAULT_PRECISION } from "@monyvi/logic";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { palette } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { formatDate } from "@/utils/dateHelpers";
import { AlertThresholdSlider } from "./AlertThresholdSlider";
import {
  BUDGET_PERIOD_KEYS,
  BUDGET_PERIOD_LABELS,
  type BudgetFormController,
  type BudgetFormState,
} from "./budget-form-controller";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

function formatAmount(
  value: number,
  currency: BudgetFormState["currency"],
  locale: string
): string {
  const maximumFractionDigits = currency
    ? (CURRENCY_PRECISION[currency] ?? DEFAULT_PRECISION)
    : DEFAULT_PRECISION;
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
}

interface ScopeCardProps {
  readonly type: BudgetFormState["type"];
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly icon: IconName;
  readonly title: string;
  readonly description: string;
  readonly accessibilityLabel: string;
  readonly isDark: boolean;
  readonly onPress: (type: BudgetFormState["type"]) => void;
}

function ScopeCard(props: ScopeCardProps): React.JSX.Element {
  const selectedStyle = props.selected
    ? {
        backgroundColor: props.isDark
          ? `${palette.nileGreen[500]}33`
          : palette.nileGreen[50],
      }
    : undefined;
  return (
    <TouchableOpacity
      testID={`budget-scope-${props.type.toLowerCase()}`}
      onPress={() => props.onPress(props.type)}
      disabled={props.disabled}
      accessibilityRole="radio"
      accessibilityLabel={props.accessibilityLabel}
      accessibilityState={{ checked: props.selected, disabled: props.disabled }}
      activeOpacity={0.82}
      style={selectedStyle}
      className={`relative flex-1 rounded-2xl border p-4 ${
        props.selected
          ? "border-nileGreen-500"
          : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
      }`}
    >
      <View className="mb-3 h-11 w-11 items-center justify-center rounded-xl bg-nileGreen-100 dark:bg-nileGreen-900/50">
        <Ionicons name={props.icon} size={24} color={palette.nileGreen[500]} />
      </View>
      <Text className="text-base font-bold text-slate-900 dark:text-white">
        {props.title}
      </Text>
      <Text className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
        {props.description}
      </Text>
      {props.selected ? (
        <View className="absolute end-3 top-3 h-7 w-7 items-center justify-center rounded-full bg-nileGreen-500">
          <Ionicons name="checkmark" size={18} color="white" />
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function BudgetScopeSection({
  controller,
}: {
  readonly controller: BudgetFormController;
}): React.JSX.Element {
  const { t } = useTranslation("budgets");
  const { isDark } = useTheme();
  return (
    <>
      <Text className="mb-3 mt-2 text-base font-semibold text-slate-500 dark:text-slate-400">
        1. {t("budget_scope")}
      </Text>
      <View testID="budget-scope-selector" className="mb-7 flex-row gap-3">
        <ScopeCard
          type="GLOBAL"
          selected={controller.form.type === "GLOBAL"}
          disabled={controller.isEditMode}
          icon="earth-outline"
          title={t("global_type")}
          description={t("scope_global_description")}
          accessibilityLabel={t("accessibility_global_budget_type")}
          isDark={isDark}
          onPress={controller.handleScopeChange}
        />
        <ScopeCard
          type="CATEGORY"
          selected={controller.form.type === "CATEGORY"}
          disabled={controller.isEditMode}
          icon="restaurant-outline"
          title={t("category_type")}
          description={t("scope_category_description")}
          accessibilityLabel={t("accessibility_category_budget_type")}
          isDark={isDark}
          onPress={controller.handleScopeChange}
        />
      </View>
    </>
  );
}

function BudgetGeneralError({
  controller,
}: {
  readonly controller: BudgetFormController;
}): React.JSX.Element | null {
  if (!controller.errors.general) return null;
  return (
    <View className="mb-4 rounded-xl bg-red-50 p-3 dark:bg-red-900/20">
      <Text className="text-sm font-medium text-red-600 dark:text-red-400">
        {controller.errors.general}
      </Text>
    </View>
  );
}

function BudgetNameField({
  controller,
}: {
  readonly controller: BudgetFormController;
}): React.JSX.Element {
  const { t } = useTranslation("budgets");
  const { isDark } = useTheme();
  return (
    <>
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
            value={controller.form.name}
            onChangeText={(value) => controller.updateField("name", value)}
            placeholder={t("budget_name_placeholder")}
            placeholderTextColor={
              isDark ? palette.slate[600] : palette.slate[400]
            }
            className="mt-0.5 p-0 text-base font-medium text-slate-900 dark:text-white"
          />
        </View>
      </View>
      {controller.errors.name ? (
        <Text className="mb-3 text-xs font-medium text-red-500">
          {controller.errors.name}
        </Text>
      ) : null}
    </>
  );
}

function CategoryLoadError({
  controller,
}: {
  readonly controller: BudgetFormController;
}): React.JSX.Element {
  const { t } = useTranslation("budgets");
  return (
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
        onPress={controller.retryCategories}
      >
        <Text className="font-semibold text-nileGreen-600 dark:text-nileGreen-300">
          {t("retry")}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function CategorySelectorField({
  controller,
}: {
  readonly controller: BudgetFormController;
}): React.JSX.Element {
  const { t } = useTranslation("budgets");
  const { isDark } = useTheme();
  return (
    <TouchableOpacity
      onPress={controller.openCategoryModal}
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
            controller.categoryDisplayName
              ? "text-slate-900 dark:text-white"
              : "text-slate-400"
          }`}
        >
          {controller.categoryDisplayName ?? t("select_a_category")}
        </Text>
      </View>
      <Ionicons
        name="chevron-down"
        size={20}
        color={isDark ? palette.slate[400] : palette.slate[500]}
      />
    </TouchableOpacity>
  );
}

function BudgetCategoryField({
  controller,
}: {
  readonly controller: BudgetFormController;
}): React.JSX.Element | null {
  if (controller.form.type !== "CATEGORY") return null;
  return (
    <View className="mb-3">
      {controller.categoryError ? (
        <CategoryLoadError controller={controller} />
      ) : (
        <CategorySelectorField controller={controller} />
      )}
      {controller.errors.category ? (
        <Text className="mt-1 text-xs font-medium text-red-500">
          {controller.errors.category}
        </Text>
      ) : null}
    </View>
  );
}

function BudgetCurrencyControl({
  controller,
}: {
  readonly controller: BudgetFormController;
}): React.JSX.Element {
  const { t } = useTranslation("budgets");
  const { isDark } = useTheme();
  if (controller.isEditMode) {
    return (
      <View testID="budget-currency-read-only" className="me-2">
        <Text className="text-base font-bold text-nileGreen-500">
          {controller.form.currency ?? "—"}
        </Text>
      </View>
    );
  }
  return (
    <TouchableOpacity
      testID="budget-currency-selector"
      className="me-2 flex-row items-center"
      style={{ minHeight: 44 }}
      onPress={controller.openCurrencyPicker}
      accessibilityRole="button"
      accessibilityLabel={t("select_budget_currency")}
    >
      <Text className="text-base font-bold text-nileGreen-500">
        {controller.form.currency ?? controller.preferredCurrency}
      </Text>
      <Ionicons
        name="chevron-down"
        size={15}
        color={isDark ? palette.slate[400] : palette.slate[500]}
      />
    </TouchableOpacity>
  );
}

function BudgetLimitField({
  controller,
}: {
  readonly controller: BudgetFormController;
}): React.JSX.Element {
  const { t } = useTranslation("budgets");
  const { isDark } = useTheme();
  return (
    <>
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
            <BudgetCurrencyControl controller={controller} />
            <TextInput
              value={controller.form.amount}
              onChangeText={(value) => controller.updateField("amount", value)}
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
      {controller.errors.amount ? (
        <Text className="mb-3 text-xs font-medium text-red-500">
          {controller.errors.amount}
        </Text>
      ) : null}
    </>
  );
}

function BudgetCurrencyNotice({
  controller,
}: {
  readonly controller: BudgetFormController;
}): React.JSX.Element | null {
  const { t } = useTranslation("budgets");
  if (controller.isEditMode) return null;
  return (
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
  );
}

function BudgetPeriodField({
  controller,
}: {
  readonly controller: BudgetFormController;
}): React.JSX.Element {
  const { t } = useTranslation("budgets");
  return (
    <View className="mb-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <Text className="mb-3 text-sm font-medium text-slate-600 dark:text-slate-300">
        {t("period")}
      </Text>
      <View className="flex-row rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
        {BUDGET_PERIOD_KEYS.map((key) => {
          const selected = controller.form.period === key;
          return (
            <TouchableOpacity
              key={key}
              testID={`budget-period-${key.toLowerCase()}`}
              onPress={() => controller.updateField("period", key)}
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
                {t(BUDGET_PERIOD_LABELS[key])}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function CustomDateButton({
  label,
  value,
  onPress,
}: {
  readonly label: string;
  readonly value: Date;
  readonly onPress: () => void;
}): React.JSX.Element {
  return (
    <View className="flex-1">
      <Text className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">
        {label}
      </Text>
      <TouchableOpacity
        onPress={onPress}
        className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800"
      >
        <Text className="text-sm font-medium text-slate-900 dark:text-white">
          {formatDate(value, "MMM d, yyyy")}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function BudgetCustomDates({
  controller,
}: {
  readonly controller: BudgetFormController;
}): React.JSX.Element | null {
  const { t } = useTranslation("budgets");
  if (controller.form.period !== "CUSTOM") return null;
  return (
    <View className="mb-3">
      <View className="flex-row gap-3">
        <CustomDateButton
          label={t("start_date")}
          value={controller.form.periodStart}
          onPress={controller.openStartPicker}
        />
        <CustomDateButton
          label={t("end_date")}
          value={controller.form.periodEnd}
          onPress={controller.openEndPicker}
        />
      </View>
      {controller.errors.period ? (
        <Text className="mt-1 text-xs font-medium text-red-500">
          {controller.errors.period}
        </Text>
      ) : null}
    </View>
  );
}

function BudgetAlertField({
  controller,
}: {
  readonly controller: BudgetFormController;
}): React.JSX.Element {
  const { t, i18n } = useTranslation("budgets");
  const amount = `${controller.form.currency ?? ""} ${formatAmount(
    controller.preview.alertAmount,
    controller.form.currency,
    i18n.language
  )}`;
  return (
    <View className="mb-7 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <Text className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">
        {t("alert_threshold")}
      </Text>
      <AlertThresholdSlider
        value={controller.form.alertThreshold}
        onValueChange={(value) =>
          controller.updateField("alertThreshold", value)
        }
      />
      <Text className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        {t("warn_me_when_spent", { amount })}
      </Text>
    </View>
  );
}

function BudgetDetailsSection({
  controller,
}: {
  readonly controller: BudgetFormController;
}): React.JSX.Element {
  const { t } = useTranslation("budgets");
  return (
    <>
      <Text className="mb-3 text-base font-semibold text-slate-500 dark:text-slate-400">
        2. {t("budget_details")}
      </Text>
      <BudgetNameField controller={controller} />
      <BudgetCategoryField controller={controller} />
      <BudgetLimitField controller={controller} />
      <BudgetCurrencyNotice controller={controller} />
      <BudgetPeriodField controller={controller} />
      <BudgetCustomDates controller={controller} />
      <BudgetAlertField controller={controller} />
    </>
  );
}

function PreviewIdentityRow({
  controller,
}: {
  readonly controller: BudgetFormController;
}): React.JSX.Element {
  const { t } = useTranslation("budgets");
  const periodLabel = t(BUDGET_PERIOD_LABELS[controller.form.period]);
  const identity =
    controller.form.type === "GLOBAL"
      ? t("global_type")
      : (controller.categoryDisplayName ?? t("category_type"));
  return (
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
          {periodLabel}
        </Text>
        <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {controller.form.period === "CUSTOM"
            ? `${t("preview_ends_on")} ${controller.preview.secondaryDate}`
            : `${t("preview_resets_on")} ${controller.preview.secondaryDate}`}
        </Text>
      </View>
      <View className="flex-1 ps-4">
        <Text className="text-xs text-slate-500 dark:text-slate-400">
          {controller.form.type === "GLOBAL"
            ? t("budget_type")
            : t("category_type")}
        </Text>
        <Text className="mt-0.5 font-bold text-nileGreen-500">{identity}</Text>
        <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {controller.form.name.trim() || t("budget_name_placeholder")}
        </Text>
      </View>
    </View>
  );
}

function PreviewMetric({
  label,
  value,
  bordered = true,
}: {
  readonly label: string;
  readonly value: string;
  readonly bordered?: boolean;
}): React.JSX.Element {
  return (
    <View
      className={`flex-1 items-center px-1 ${
        bordered ? "border-e border-slate-200 dark:border-slate-700" : ""
      }`}
    >
      <Text className="text-center text-xs text-slate-500 dark:text-slate-400">
        {label}
      </Text>
      <Text className="mt-1 text-center text-sm font-bold text-nileGreen-500">
        {value}
      </Text>
    </View>
  );
}

function PreviewMetrics({
  controller,
}: {
  readonly controller: BudgetFormController;
}): React.JSX.Element {
  const { t, i18n } = useTranslation("budgets");
  const alertAmount = `${controller.form.currency ?? ""} ${formatAmount(
    controller.preview.alertAmount,
    controller.form.currency,
    i18n.language
  )}`;
  return (
    <View className="flex-row border-t border-slate-200 px-3 py-4 dark:border-slate-700">
      <PreviewMetric
        label={t("preview_budget_limit")}
        value={`${controller.form.currency ?? ""} ${controller.form.amount || "0.00"}`}
      />
      <PreviewMetric
        label={`${t("preview_alert_at")} ${controller.form.alertThreshold}%`}
        value={alertAmount}
      />
      <PreviewMetric
        label={t("preview_starts")}
        value={controller.preview.startDate}
        bordered={false}
      />
    </View>
  );
}

function BudgetPreviewSection({
  controller,
}: {
  readonly controller: BudgetFormController;
}): React.JSX.Element {
  const { t } = useTranslation("budgets");
  return (
    <>
      <Text className="mb-3 text-base font-semibold text-slate-500 dark:text-slate-400">
        3. {t("preview")}
      </Text>
      <View
        testID="budget-live-preview"
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
      >
        <PreviewIdentityRow controller={controller} />
        <PreviewMetrics controller={controller} />
      </View>
    </>
  );
}

function getSubmitPresentation(
  controller: BudgetFormController
): { readonly labelKey: string; readonly icon: IconName } {
  if (controller.isEditMode) {
    return { labelKey: "save_changes", icon: "checkmark-circle-outline" };
  }
  if (controller.isRenewalMode) {
    return { labelKey: "renew_budget", icon: "refresh-outline" };
  }
  return { labelKey: "create_budget", icon: "add-circle-outline" };
}

function BudgetPrimaryAction({
  controller,
}: {
  readonly controller: BudgetFormController;
}): React.JSX.Element {
  const { t } = useTranslation("budgets");
  const presentation = getSubmitPresentation(controller);
  return (
    <TouchableOpacity
      testID="budget-form-submit"
      onPress={() => void controller.handleSubmit()}
      accessibilityRole="button"
      accessibilityLabel={t(presentation.labelKey)}
      disabled={controller.isSubmitDisabled}
      accessibilityState={{ disabled: controller.isSubmitDisabled }}
      activeOpacity={0.85}
      className="items-center rounded-2xl bg-nileGreen-500 py-4"
    >
      {controller.isSubmitting ? (
        <ActivityIndicator color="white" />
      ) : (
        <View className="flex-row items-center gap-2">
          <Ionicons name={presentation.icon} size={22} color="white" />
          <Text className="text-base font-bold text-white">
            {t(presentation.labelKey)}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function BudgetCancelAction({
  controller,
}: {
  readonly controller: BudgetFormController;
}): React.JSX.Element {
  const { t } = useTranslation("budgets");
  return (
    <TouchableOpacity
      testID="budget-form-cancel"
      className="mt-2 items-center py-2"
      onPress={controller.cancelForm}
      disabled={controller.isSubmitting}
      accessibilityRole="button"
      accessibilityLabel={t("cancel")}
    >
      <Text className="font-bold text-nileGreen-500">{t("cancel")}</Text>
    </TouchableOpacity>
  );
}

function BudgetFormActions({
  controller,
}: {
  readonly controller: BudgetFormController;
}): React.JSX.Element {
  const { bottom } = useSafeAreaInsets();
  return (
    <View
      testID="budget-form-actions"
      style={{ paddingBottom: bottom + 16 }}
      className="border-t border-slate-200 bg-white px-5 pt-3 dark:border-slate-800 dark:bg-slate-950"
    >
      <BudgetPrimaryAction controller={controller} />
      <BudgetCancelAction controller={controller} />
    </View>
  );
}

export function BudgetFormScreen({
  controller,
}: {
  readonly controller: BudgetFormController;
}): React.JSX.Element {
  return (
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
        <BudgetGeneralError controller={controller} />
        <BudgetScopeSection controller={controller} />
        <BudgetDetailsSection controller={controller} />
        <BudgetPreviewSection controller={controller} />
      </ScrollView>
      <BudgetFormActions controller={controller} />
    </KeyboardAvoidingView>
  );
}