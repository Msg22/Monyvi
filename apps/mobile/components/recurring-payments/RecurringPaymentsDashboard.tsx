import { CategoryIcon } from "@/components/common/CategoryIcon";
import { getFrequencyLabel } from "@/components/modals/FrequencyPickerModal";
import { Skeleton } from "@/components/ui/Skeleton";
import { palette } from "@/constants/colors";
import { useCategoryLookup } from "@/context/CategoriesContext";
import { useTheme } from "@/context/ThemeContext";
import { useModalBottomInset } from "@/hooks/useModalBottomInset";
import type { SortOption } from "@/services/recurring-payments-dashboard-read-model";
import { getCategoryIconConfig } from "@/utils/category-icon-config";
import { getDueText } from "@/utils/dateHelpers";
import { getRecurringPaymentDueLabel } from "@/utils/recurring-payment-due-labels";
import { getPaymentIcon } from "@/utils/recurring-helpers";
import { Ionicons } from "@expo/vector-icons";
import type {
  CurrencyType,
  RecurringPayment,
  RecurringStatus,
} from "@monyvi/db";
import { formatCurrency } from "@monyvi/logic";
import React from "react";
import { useTranslation } from "react-i18next";
import {
  Modal,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";

interface StatusTabsProps {
  readonly activeTab: RecurringStatus;
  readonly onTabChange: (tab: RecurringStatus) => void;
  readonly counts: Record<RecurringStatus, number>;
}

interface HeroSummaryProps {
  readonly next7Days: number;
  readonly overdueCount: number;
  readonly thisMonth: number;
  readonly currencyCode: CurrencyType;
}

interface NextPaymentInsightProps {
  readonly payment: RecurringPayment | null;
  readonly onPress: (payment: RecurringPayment) => void;
}

interface PaymentRowProps {
  readonly payment: RecurringPayment;
  readonly onPress: () => void;
}

interface SortControlProps {
  readonly selectedSort: SortOption;
  readonly onPress: () => void;
}

interface SortPaymentsModalProps {
  readonly visible: boolean;
  readonly selectedSort: SortOption;
  readonly onSelect: (sort: SortOption) => void;
  readonly onClose: () => void;
}

const SORT_OPTIONS: ReadonlyArray<{
  readonly value: SortOption;
  readonly labelKey: string;
  readonly icon: keyof typeof Ionicons.glyphMap;
}> = [
  { value: "next_due", labelKey: "next_due", icon: "calendar-outline" },
  {
    value: "highest_amount",
    labelKey: "highest_amount",
    icon: "arrow-down-circle-outline",
  },
  {
    value: "lowest_amount",
    labelKey: "lowest_amount",
    icon: "arrow-up-circle-outline",
  },
  { value: "name_a_z", labelKey: "name_a_z", icon: "text-outline" },
];

const STATUS_TABS: readonly RecurringStatus[] = [
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
];

export function StatusTabs({
  activeTab,
  onTabChange,
  counts,
}: StatusTabsProps): React.JSX.Element {
  const { t } = useTranslation("transactions");

  const statusLabels: Record<RecurringStatus, string> = {
    ACTIVE: t("status_active"),
    PAUSED: t("status_paused"),
    COMPLETED: t("status_completed"),
  };

  return (
    <View className="flex-row mb-5 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
      {STATUS_TABS.map((tab) => {
        const isSelected = activeTab === tab;
        return (
          <TouchableOpacity
            key={tab}
            testID={`recurring-status-tab-${tab}`}
            onPress={() => onTabChange(tab)}
            className={`flex-1 py-2.5 items-center justify-center ${
              isSelected ? "bg-nileGreen-600" : "bg-white dark:bg-slate-800"
            } ${tab !== "COMPLETED" ? "border-e border-slate-200 dark:border-slate-700" : ""}`}
          >
            <Text
              className={`text-center text-sm font-semibold ${
                isSelected ? "text-white" : "text-slate-700 dark:text-slate-300"
              }`}
            >
              {statusLabels[tab]} {counts[tab]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function HeroSummary({
  next7Days,
  overdueCount,
  thisMonth,
  currencyCode,
}: HeroSummaryProps): React.JSX.Element {
  const { t } = useTranslation("transactions");

  return (
    <View
      testID="recurring-payments-summary-card"
      className="rounded-xl border px-4 py-3 mb-2 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
    >
      <View className="flex-row">
        <View className="flex-1 pe-3">
          <Text className="text-xs font-medium text-text-muted dark:text-text-muted-dark">
            {t("due_this_month")}
          </Text>
          <Text className="text-2xl font-extrabold mt-0.5 text-nileGreen-700 dark:text-nileGreen-400">
            {formatCurrency({ amount: thisMonth, currency: currencyCode })}
          </Text>
        </View>

        <View className="w-[1px] bg-slate-200 dark:bg-slate-700 mx-1" />

        <View className="w-[112px] ps-3 justify-center gap-2">
          <MetricText
            label={t("next_7_days")}
            value={formatCurrency({
              amount: next7Days,
              currency: currencyCode,
            })}
            valueClassName="text-nileGreen-700 dark:text-nileGreen-400"
          />
          <MetricText
            label={t("overdue")}
            value={`${overdueCount}`}
            valueClassName={
              overdueCount > 0
                ? "text-red-500"
                : "text-text-primary dark:text-text-primary-dark"
            }
          />
        </View>
      </View>
    </View>
  );
}

export function NextPaymentInsight({
  payment,
  onPress,
}: NextPaymentInsightProps): React.JSX.Element | null {
  const { t } = useTranslation("transactions");

  if (!payment) return null;

  return (
    <TouchableOpacity
      testID="recurring-payments-next-insight"
      onPress={() => onPress(payment)}
      className="flex-row items-start rounded-xl border px-3 py-2.5 mb-3 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
    >
      <View className="w-9 h-9 rounded-lg items-center justify-center mt-0.5 bg-nileGreen-50 dark:bg-nileGreen-900">
        <Ionicons
          name="calendar-outline"
          size={18}
          color={palette.nileGreen[500]}
        />
      </View>
      <View className="flex-1 min-w-0 ms-3">
        <View className="flex-row items-start">
          <Text
            testID="recurring-payments-next-insight-title"
            className="flex-1 pe-2 text-sm font-semibold text-text-primary dark:text-text-primary-dark"
            numberOfLines={2}
          >
            {t("renews_next", {
              name: payment.name,
              due: getDueText(payment.nextDueDate),
            })}
          </Text>
          <View className="shrink-0 flex-row items-center">
            <Text
              testID="recurring-payments-next-insight-amount"
              className="shrink-0 text-sm font-bold me-2 text-nileGreen-700 dark:text-nileGreen-400"
            >
              {formatCurrency({
                amount: payment.amount,
                currency: payment.currency,
              })}
            </Text>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={palette.slate[400]}
            />
          </View>
        </View>
        <Text className="text-xs text-text-muted dark:text-text-muted-dark mt-0.5">
          {getDueText(payment.nextDueDate)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export function SortControl({
  selectedSort,
  onPress,
}: SortControlProps): React.JSX.Element {
  const { t } = useTranslation("transactions");
  const option = SORT_OPTIONS.find((item) => item.value === selectedSort);
  const label = t(option?.labelKey ?? "next_due");

  return (
    <TouchableOpacity
      testID="recurring-payments-sort-chip"
      onPress={onPress}
      className="flex-row items-center rounded-full border px-3 py-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
    >
      <Ionicons name="swap-vertical" size={15} color={palette.slate[500]} />
      <Text className="text-xs font-semibold text-slate-700 dark:text-slate-200 mx-1.5">
        {t("sort_by", { value: label })}
      </Text>
      <Ionicons name="chevron-down" size={14} color={palette.slate[500]} />
    </TouchableOpacity>
  );
}

export function PaymentRow({
  payment,
  onPress,
}: PaymentRowProps): React.JSX.Element {
  const { isDark } = useTheme();
  const { t } = useTranslation("transactions");
  const categoryMap = useCategoryLookup();
  const category = categoryMap.get(payment.categoryId);
  const iconConfig = category ? getCategoryIconConfig(category) : undefined;
  const typeLabel = payment.isIncome ? t("income") : t("expense");
  const dueLabel = getRecurringPaymentDueLabel(payment);
  const isOverdueLabel = payment.isOverdue && !payment.isCompleted;

  return (
    <TouchableOpacity
      testID={`recurring-payment-row-${payment.id}`}
      onPress={onPress}
      className="flex-row items-center p-3 rounded-xl border mb-3 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
      // eslint-disable-next-line react-native/no-inline-styles
      style={{
        shadowColor: palette.slate[900],
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
      }}
    >
      <View
        testID="recurring-payment-row"
        className="flex-1 flex-row items-center"
      >
        <View
          className={`w-12 h-12 rounded-2xl items-center justify-center me-3 ${
            payment.isIncome
              ? "bg-nileGreen-50 dark:bg-nileGreen-900"
              : "bg-slate-100 dark:bg-slate-700"
          }`}
        >
          {category ? (
            <CategoryIcon
              iconName={iconConfig?.iconName ?? "repeat-outline"}
              iconLibrary={iconConfig?.iconLibrary ?? "Ionicons"}
              color={iconConfig?.iconColor}
              size={20}
            />
          ) : (
            <Ionicons
              name={getPaymentIcon(payment.name)}
              size={22}
              color={
                payment.isIncome
                  ? palette.nileGreen[500]
                  : isDark
                    ? palette.slate[300]
                    : palette.slate[600]
              }
            />
          )}
        </View>

        <View className="flex-1 me-3">
          <Text
            className="text-base font-bold text-text-primary dark:text-text-primary-dark"
            numberOfLines={1}
          >
            {payment.name}
          </Text>
          <View className="flex-row items-center mt-1">
            <Text className="text-xs text-text-muted dark:text-text-muted-dark">
              {getFrequencyLabel(payment.frequency, t)} {typeLabel}
            </Text>
          </View>
          <View className="mt-1.5 self-start">
            <StatusPill status={payment.status} />
          </View>
        </View>

        <View className="items-end min-w-[82px]">
          <Text
            className={`text-base font-extrabold ${
              payment.isIncome
                ? "text-nileGreen-600 dark:text-nileGreen-400"
                : "text-text-primary dark:text-text-primary-dark"
            }`}
          >
            {formatCurrency({
              amount: payment.amount,
              currency: payment.currency,
            })}
          </Text>
          <View className="flex-row items-center mt-2">
            <Ionicons
              name="calendar-outline"
              size={13}
              color={palette.slate[500]}
            />
            <Text
              className={`text-xs font-medium ms-1 ${
                isOverdueLabel
                  ? "text-red-500"
                  : "text-text-muted dark:text-text-muted-dark"
              }`}
            >
              {dueLabel}
            </Text>
          </View>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={palette.slate[400]} />
    </TouchableOpacity>
  );
}

export function SortPaymentsModal({
  visible,
  selectedSort,
  onSelect,
  onClose,
}: SortPaymentsModalProps): React.JSX.Element | null {
  const { t } = useTranslation("transactions");
  const bottomInset = useModalBottomInset();

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View className="flex-1 bg-black/70 justify-end">
          <TouchableWithoutFeedback>
            <View className="rounded-t-3xl overflow-hidden bg-white dark:bg-slate-900">
              <View className="px-5 pt-5 pb-3 border-b border-slate-200 dark:border-slate-800">
                <View className="flex-row items-center justify-between">
                  <Text className="text-xl font-bold text-text-primary dark:text-text-primary-dark">
                    {t("sort_payments")}
                  </Text>
                  <TouchableOpacity onPress={onClose} className="p-1">
                    <Ionicons
                      name="close"
                      size={24}
                      color={palette.slate[500]}
                    />
                  </TouchableOpacity>
                </View>
                <Text className="text-sm text-text-muted dark:text-text-muted-dark mt-1">
                  {t("sort_payments_description")}
                </Text>
              </View>

              <View
                className="py-2"
                style={{ paddingBottom: bottomInset + 12 }}
              >
                {SORT_OPTIONS.map((option) => {
                  const isSelected = option.value === selectedSort;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      testID={`recurring-payments-sort-${option.value}`}
                      onPress={() => onSelect(option.value)}
                      className={`flex-row items-center px-5 py-4 ${
                        isSelected
                          ? "bg-nileGreen-50 dark:bg-nileGreen-900"
                          : "bg-white dark:bg-slate-900"
                      }`}
                    >
                      <Ionicons
                        name={option.icon}
                        size={20}
                        color={
                          isSelected
                            ? palette.nileGreen[600]
                            : palette.slate[500]
                        }
                      />
                      <Text
                        className={`flex-1 text-base ms-3 ${
                          isSelected
                            ? "font-bold text-nileGreen-700"
                            : "font-medium text-text-primary dark:text-text-primary-dark"
                        }`}
                      >
                        {t(option.labelKey)}
                      </Text>
                      {isSelected && (
                        <Ionicons
                          name="checkmark-circle"
                          size={20}
                          color={palette.nileGreen[600]}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

export function RecurringPaymentsSkeleton(): React.JSX.Element {
  return (
    <View testID="recurring-payments-loading" className="pt-3">
      <Skeleton width="42%" height={16} borderRadius={8} />
      <View className="mt-4 gap-3">
        <Skeleton width="100%" height={80} borderRadius={16} />
        <Skeleton width="100%" height={80} borderRadius={16} />
        <Skeleton width="100%" height={80} borderRadius={16} />
      </View>
    </View>
  );
}

function MetricText({
  label,
  value,
  valueClassName = "text-text-primary dark:text-text-primary-dark",
}: {
  readonly label: string;
  readonly value: string;
  readonly valueClassName?: string;
}): React.JSX.Element {
  return (
    <View>
      <Text className={`text-sm font-bold ${valueClassName}`}>{value}</Text>
      <Text className="text-[11px] text-text-muted dark:text-text-muted-dark mt-0.5">
        {label}
      </Text>
    </View>
  );
}

function StatusPill({
  status,
}: {
  readonly status: RecurringStatus;
}): React.JSX.Element {
  const { t } = useTranslation("transactions");
  const classes: Record<RecurringStatus, string> = {
    ACTIVE: "bg-nileGreen-50 dark:bg-nileGreen-900",
    PAUSED: "bg-gold-100 dark:bg-gold-800",
    COMPLETED: "bg-blue-50 dark:bg-blue-100",
  };
  const textClasses: Record<RecurringStatus, string> = {
    ACTIVE: "text-nileGreen-700 dark:text-nileGreen-400",
    PAUSED: "text-gold-800 dark:text-gold-400",
    COMPLETED: "text-blue-600 dark:text-blue-600",
  };

  return (
    <View className={`rounded-full px-2.5 py-0.5 ${classes[status]}`}>
      <Text className={`text-[10px] font-bold ${textClasses[status]}`}>
        {t(getStatusLabelKey(status))}
      </Text>
    </View>
  );
}

function getStatusLabelKey(status: RecurringStatus): string {
  const keys: Record<RecurringStatus, string> = {
    ACTIVE: "status_active",
    PAUSED: "status_paused",
    COMPLETED: "status_completed",
  };

  return keys[status];
}
