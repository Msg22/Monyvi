import React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CURRENCY_PRECISION, DEFAULT_PRECISION } from "@monyvi/logic";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { palette } from "@/constants/colors";
import { shouldUseCompactLayout } from "@/constants/ui";
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

function formatPreviewAmount(
  value: number | null,
  currency: BudgetFormState["currency"],
  locale: string
): string {
  const formattedValue =
    value === null ? "—" : formatAmount(value, currency, locale);
  return currency ? `${currency} ${formattedValue}` : formattedValue;
}

function capitalizeFirst(value: string): string {
  if (value.length === 0) return value;
  return `${value[0]?.toUpperCase()}${value.slice(1)}`;
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

function ScopeIndicator({
  type,
  selected,
}: Pick<ScopeCardProps, "type" | "selected">): React.JSX.Element {
  return (
    <View
      testID={`budget-scope-${type.toLowerCase()}-indicator`}
      className={`ms-2 h-5 w-5 shrink-0 items-center justify-center rounded-full ${
        selected
          ? "bg-nileGreen-400"
          : "border-2 border-slate-400 dark:border-slate-600"
      }`}
    >
      {selected ? (
        <Ionicons name="checkmark" size={15} color={palette.slate[900]} />
      ) : null}
    </View>
  );
}

function ScopeCard(props: ScopeCardProps): React.JSX.Element {
  const selectedStyle = props.selected
    ? {
        backgroundColor: props.isDark
          ? `${palette.nileGreen[500]}1F`
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
      className={`relative min-h-20 flex-1 flex-row items-center rounded-2xl border px-3 py-3 ${
        props.selected
          ? "border-nileGreen-500"
          : "border-slate-200 bg-white dark:border-slate-700 dark:bg-surface-dark"
      }`}
    >
      <View className="me-2.5 h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-nileGreen-100 dark:bg-nileGreen-700/50">
        <Ionicons name={props.icon} size={22} color={palette.nileGreen[400]} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-bold text-slate-900 dark:text-white">
          {props.title}
        </Text>
        <Text className="mt-0.5 text-xs leading-4 text-slate-500 dark:text-slate-400">
          {props.description}
        </Text>
      </View>
      <ScopeIndicator type={props.type} selected={props.selected} />
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
      <Text className="mb-3 text-sm font-semibold text-slate-500 dark:text-slate-400">
        1. {t("budget_scope")}
      </Text>
      <View testID="budget-scope-selector" className="mb-6 flex-row gap-2.5">
        <ScopeCard
          type="GLOBAL"
          selected={controller.form.type === "GLOBAL"}
          disabled={controller.isEditMode}
          icon="globe-outline"
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
    <View className="mb-3 rounded-xl bg-red-50 p-3 dark:bg-red-900/20">
      <Text className="text-sm font-medium text-red-600 dark:text-red-400">
        {controller.errors.general}
      </Text>
    </View>
  );
}

function FieldIcon({ name }: { readonly name: IconName }): React.JSX.Element {
  return (
    <View className="me-3 h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-nileGreen-100 dark:bg-nileGreen-700/50">
      <Ionicons name={name} size={21} color={palette.nileGreen[400]} />
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
      <View className="mb-2.5 flex-row items-center rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-surface-dark">
        <FieldIcon name="document-text-outline" />
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
        <Text className="mb-2.5 text-xs font-medium text-red-500">
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
      className="rounded-2xl border border-red-300 bg-red-50 p-3 dark:border-red-700 dark:bg-red-900/20"
    >
      <Text className="text-sm text-red-600 dark:text-red-300">
        {t("category_load_error")}
      </Text>
      <TouchableOpacity
        className="mt-1 min-h-11 self-start justify-center"
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
      className="flex-row items-center rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-surface-dark"
    >
      <FieldIcon name="restaurant-outline" />
      <View className="flex-1">
        <Text className="text-xs text-slate-500 dark:text-slate-400">
          {t("category_type")}
        </Text>
        <Text
          numberOfLines={1}
          className={`mt-0.5 text-base font-medium ${
            controller.categoryDisplayName
              ? "text-slate-900 dark:text-white"
              : "text-slate-400 dark:text-slate-500"
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
    <View className="mb-2.5">
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
      className="me-2 min-h-11 flex-row items-center"
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
      <View className="mb-2.5 flex-row items-center rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-surface-dark">
        <FieldIcon name="wallet-outline" />
        <View className="flex-1">
          <Text className="text-xs text-slate-500 dark:text-slate-400">
            {capitalizeFirst(t("limit_label"))}
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
        <Text className="mb-2.5 text-xs font-medium text-red-500">
          {controller.errors.amount}
        </Text>
      ) : null}
    </>
  );
}

function BudgetPeriodField({
  controller,
}: {
  readonly controller: BudgetFormController;
}): React.JSX.Element {
  const { t } = useTranslation("budgets");
  return (
    <View
      testID="budget-period-card"
      className="mb-2.5 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-surface-dark"
    >
      <Text className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-300">
        {t("period")}
      </Text>
      <View
        testID="budget-period-segmented"
        className="flex-row rounded-xl bg-slate-100 p-1 dark:bg-slate-950"
      >
        {BUDGET_PERIOD_KEYS.map((key) => {
          const selected = controller.form.period === key;
          return (
            <TouchableOpacity
              key={key}
              testID={`budget-period-${key.toLowerCase()}`}
              onPress={() => controller.updateField("period", key)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              className={`flex-1 items-center rounded-lg py-2 ${
                selected ? "bg-nileGreen-500" : "bg-transparent"
              }`}
            >
              <Text
                className={`text-sm font-bold ${
                  selected ? "text-white" : "text-slate-600 dark:text-slate-300"
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
      <Text className="mb-1.5 text-sm font-medium text-slate-600 dark:text-slate-300">
        {label}
      </Text>
      <TouchableOpacity
        onPress={onPress}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-surface-dark"
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
    <View className="mb-2.5">
      <View className="flex-row gap-2.5">
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

function BudgetAlertSentence({
  amount,
}: {
  readonly amount: string;
}): React.JSX.Element {
  const { t } = useTranslation("budgets");
  const marker = "__BUDGET_ALERT_AMOUNT__";
  const sentence = t("warn_me_when_spent", { amount: marker });
  const markerIndex = sentence.indexOf(marker);
  if (markerIndex < 0) {
    return (
      <Text className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
        {t("warn_me_when_spent", { amount })}
      </Text>
    );
  }
  const prefix = sentence.slice(0, markerIndex);
  const suffix = sentence.slice(markerIndex + marker.length);
  return (
    <Text className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
      {prefix}
      <Text className="font-medium text-nileGreen-500">{amount}</Text>
      {suffix}
    </Text>
  );
}

function BudgetAlertField({
  controller,
}: {
  readonly controller: BudgetFormController;
}): React.JSX.Element {
  const { i18n } = useTranslation("budgets");
  const amount = formatPreviewAmount(
    controller.preview.alertAmount,
    controller.form.currency,
    i18n.language
  );
  return (
    <View className="mb-6 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-surface-dark">
      <AlertThresholdSlider
        variant="mockup"
        value={controller.form.alertThreshold}
        onValueChange={(value) =>
          controller.updateField("alertThreshold", value)
        }
      />
      <BudgetAlertSentence amount={amount} />
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
      <Text className="mb-3 text-sm font-semibold text-slate-500 dark:text-slate-400">
        2. {t("budget_details")}
      </Text>
      <BudgetNameField controller={controller} />
      <BudgetCategoryField controller={controller} />
      <BudgetLimitField controller={controller} />
      <BudgetPeriodField controller={controller} />
      <BudgetCustomDates controller={controller} />
      <BudgetAlertField controller={controller} />
    </>
  );
}

function PreviewIdentityColumn({
  label,
  value,
  detail,
  bordered,
}: {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly bordered: boolean;
}): React.JSX.Element {
  const borderClass = bordered
    ? "border-e border-slate-200 pe-3 dark:border-slate-700/70"
    : "ps-3";
  return (
    <View className={`min-w-0 flex-1 ${borderClass}`}>
      <Text className="text-xs text-slate-500 dark:text-slate-400">
        {label}
      </Text>
      <Text
        numberOfLines={1}
        className="mt-0.5 text-sm font-bold text-nileGreen-500"
      >
        {value}
      </Text>
      <Text
        numberOfLines={1}
        className="mt-0.5 text-xs text-slate-500 dark:text-slate-400"
      >
        {detail}
      </Text>
    </View>
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
  const periodDetail =
    controller.form.period === "CUSTOM"
      ? `${t("preview_ends_on")} ${controller.preview.secondaryDate}`
      : `${t("preview_resets_on")} ${controller.preview.secondaryDate}`;
  return (
    <View className="flex-row items-stretch px-3 py-3">
      <View className="me-3 h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-nileGreen-100 dark:bg-nileGreen-700/50">
        <Ionicons
          name="calendar-outline"
          size={22}
          color={palette.nileGreen[400]}
        />
      </View>
      <PreviewIdentityColumn
        label={t("period")}
        value={periodLabel}
        detail={periodDetail}
        bordered={true}
      />
      <PreviewIdentityColumn
        label={
          controller.form.type === "GLOBAL"
            ? t("budget_type")
            : t("category_type")
        }
        value={identity}
        detail={controller.form.name.trim() || t("budget_name_placeholder")}
        bordered={false}
      />
    </View>
  );
}

function PreviewMetric({
  label,
  value,
  compact,
  bordered = true,
}: {
  readonly label: string;
  readonly value: string;
  readonly compact: boolean;
  readonly bordered?: boolean;
}): React.JSX.Element {
  const containerClass = compact
    ? `w-full items-start px-1 py-2 ${
        bordered ? "border-b border-slate-200 dark:border-slate-700/70" : ""
      }`
    : `flex-1 items-center px-1 ${
        bordered ? "border-e border-slate-200 dark:border-slate-700/70" : ""
      }`;
  const textAlignmentClass = compact ? "text-start" : "text-center";
  return (
    <View className={containerClass}>
      <Text
        className={`${textAlignmentClass} text-xs text-slate-500 dark:text-slate-400`}
      >
        {label}
      </Text>
      <Text
        numberOfLines={1}
        className={`mt-0.5 ${textAlignmentClass} text-sm font-bold text-nileGreen-500`}
      >
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
  const { width, fontScale } = useWindowDimensions();
  const compact = shouldUseCompactLayout(width, fontScale);
  const limitAmount = formatPreviewAmount(
    controller.preview.amount,
    controller.form.currency,
    i18n.language
  );
  const alertAmount = formatPreviewAmount(
    controller.preview.alertAmount,
    controller.form.currency,
    i18n.language
  );
  return (
    <View
      testID="budget-preview-metrics"
      className={`${compact ? "flex-col" : "flex-row"} border-t border-slate-200 px-3 py-3 dark:border-slate-700/70`}
    >
      <PreviewMetric
        label={t("preview_budget_limit")}
        value={limitAmount}
        compact={compact}
      />
      <PreviewMetric
        label={`${t("preview_alert_at")} ${controller.form.alertThreshold}%`}
        value={alertAmount}
        compact={compact}
      />
      <PreviewMetric
        label={t("preview_starts")}
        value={controller.preview.startDate}
        compact={compact}
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
      <Text className="mb-3 text-sm font-semibold text-slate-500 dark:text-slate-400">
        3. {t("preview")}
      </Text>
      <View
        testID="budget-live-preview"
        className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-surface-dark"
      >
        <PreviewIdentityRow controller={controller} />
        <PreviewMetrics controller={controller} />
      </View>
    </>
  );
}

interface SubmitPresentation {
  readonly labelKey: string;
  readonly accessibilityLabelKey: string;
  readonly icon: IconName;
}

function getSubmitPresentation(
  controller: BudgetFormController
): SubmitPresentation {
  if (controller.isEditMode) {
    return {
      labelKey: "save_changes",
      accessibilityLabelKey: "save_changes",
      icon: "checkmark-circle-outline",
    };
  }
  if (controller.isRenewalMode) {
    return {
      labelKey: "renew_budget",
      accessibilityLabelKey: "renew_budget",
      icon: "refresh-outline",
    };
  }
  return {
    labelKey: "accessibility_create_budget",
    accessibilityLabelKey: "create_budget",
    icon: "add-circle-outline",
  };
}

function BudgetPrimaryAction({
  controller,
}: {
  readonly controller: BudgetFormController;
}): React.JSX.Element {
  const { t } = useTranslation("budgets");
  const presentation = getSubmitPresentation(controller);
  return (
    <View className="overflow-hidden rounded-2xl">
      <LinearGradient
        testID="budget-form-submit-gradient"
        colors={[palette.nileGreen[400], palette.nileGreen[500]]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
      >
        <TouchableOpacity
          testID="budget-form-submit"
          onPress={() => void controller.handleSubmit()}
          accessibilityRole="button"
          accessibilityLabel={t(presentation.accessibilityLabelKey)}
          disabled={controller.isSubmitDisabled}
          accessibilityState={{ disabled: controller.isSubmitDisabled }}
          activeOpacity={0.85}
          className="min-h-11 items-center justify-center px-4"
        >
          {controller.isSubmitting ? (
            <ActivityIndicator color={palette.slate[900]} />
          ) : (
            <View className="flex-row items-center gap-2">
              <Ionicons
                name={presentation.icon}
                size={22}
                color={palette.slate[900]}
              />
              <Text className="text-base font-bold text-slate-900">
                {t(presentation.labelKey)}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </LinearGradient>
    </View>
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
      className="mt-1 min-h-10 items-center justify-center"
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
      style={{ paddingBottom: bottom + 8 }}
      className="bg-background px-4 pt-3 dark:bg-background-dark"
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
      className="flex-1 bg-background dark:bg-background-dark"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        className="flex-1 px-4"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 16, paddingTop: 16 }}
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
