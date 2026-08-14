import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  Modal,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useColorScheme,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";

import { palette } from "@/constants/colors";
import { useModalBottomInset } from "@/hooks/useModalBottomInset";
import type {
  BudgetDashboardFilters as DashboardFilters,
  BudgetDashboardPeriodFilter,
  BudgetDashboardScopeFilter,
  BudgetDashboardStatusFilter,
} from "@/contracts/budget-dashboard";

interface BudgetDashboardFiltersProps {
  readonly filters: DashboardFilters;
  readonly onSelectScope: (scope: BudgetDashboardScopeFilter) => void;
  readonly onSelectPeriod: (period: BudgetDashboardPeriodFilter) => void;
  readonly onSelectStatus: (status: BudgetDashboardStatusFilter) => void;
}

type OpenSelector = "period" | "status" | null;

const SCOPE_OPTIONS: readonly BudgetDashboardScopeFilter[] = [
  "ALL",
  "CATEGORY",
  "GLOBAL",
];
const PERIOD_OPTIONS: readonly BudgetDashboardPeriodFilter[] = [
  "ALL",
  "WEEKLY",
  "MONTHLY",
  "CUSTOM",
];
const STATUS_OPTIONS: readonly BudgetDashboardStatusFilter[] = [
  "ALL",
  "ACTIVE",
  "PAUSED",
  "EXPIRED",
];

const SCOPE_LABEL_KEYS = {
  ALL: "filter_all",
  CATEGORY: "category_type",
  GLOBAL: "global_type",
} as const;
const PERIOD_LABEL_KEYS = {
  ALL: "filter_all",
  WEEKLY: "filter_weekly",
  MONTHLY: "filter_monthly",
  CUSTOM: "filter_custom",
} as const;
const STATUS_LABEL_KEYS = {
  ALL: "filter_all",
  ACTIVE: "filter_active",
  PAUSED: "filter_paused",
  EXPIRED: "filter_expired",
} as const;

interface FilterCardProps {
  readonly testID: string;
  readonly label: string;
  readonly value: string;
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly isExpanded: boolean;
  readonly onPress: () => void;
}

function FilterCard({
  label,
  value,
  icon,
  isExpanded,
  onPress,
  testID,
}: FilterCardProps): React.JSX.Element {
  return (
    <TouchableOpacity
      testID={testID}
      className="min-h-24 flex-1 flex-row items-center rounded-2xl border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-800"
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      accessibilityState={{ expanded: isExpanded }}
      onPress={onPress}
    >
      <Ionicons name={icon} size={29} color={palette.slate[400]} />
      <View className="ms-3 min-w-0 flex-1">
        <Text className="text-xs text-text-muted dark:text-slate-400">
          {label}
        </Text>
        <Text
          numberOfLines={1}
          className="mt-1 text-base font-semibold text-text-primary dark:text-slate-25"
        >
          {value}
        </Text>
      </View>
      <Ionicons name="chevron-down" size={20} color={palette.slate[400]} />
    </TouchableOpacity>
  );
}

export function BudgetDashboardFilters({
  filters,
  onSelectScope,
  onSelectPeriod,
  onSelectStatus,
}: BudgetDashboardFiltersProps): React.JSX.Element {
  const { t } = useTranslation("budgets");
  const colorScheme = useColorScheme();
  const bottomInset = useModalBottomInset();
  const [openSelector, setOpenSelector] = useState<OpenSelector>(null);
  const isDark = colorScheme === "dark";
  const selectedPeriodLabel = t(PERIOD_LABEL_KEYS[filters.period]);
  const selectedStatusLabel = t(STATUS_LABEL_KEYS[filters.status]);
  const selectorOptions = useMemo(
    () =>
      openSelector === "period"
        ? PERIOD_OPTIONS.map((value) => ({
            value,
            label: t(PERIOD_LABEL_KEYS[value]),
          }))
        : STATUS_OPTIONS.map((value) => ({
            value,
            label: t(STATUS_LABEL_KEYS[value]),
          })),
    [openSelector, t]
  );
  const selectedValue =
    openSelector === "period" ? filters.period : filters.status;

  return (
    <View testID="budget-dashboard-filters" className="pt-4">
      <View
        accessibilityRole="tablist"
        className="h-12 flex-row overflow-hidden rounded-full border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
      >
        {SCOPE_OPTIONS.map((scope) => {
          const isSelected = filters.scope === scope;
          return (
            <TouchableOpacity
              key={scope}
              testID={`budget-scope-${scope.toLowerCase()}`}
              className={`flex-1 items-center justify-center ${
                isSelected ? "bg-nileGreen-500" : ""
              }`}
              activeOpacity={0.8}
              accessibilityRole="tab"
              accessibilityLabel={t(SCOPE_LABEL_KEYS[scope])}
              accessibilityState={{ selected: isSelected }}
              onPress={() => onSelectScope(scope)}
            >
              <Text
                className={`text-sm font-semibold ${
                  isSelected
                    ? "text-slate-25"
                    : "text-text-primary dark:text-slate-200"
                }`}
              >
                {t(SCOPE_LABEL_KEYS[scope])}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View className="mt-4 flex-row gap-3">
        <FilterCard
          testID="budget-filter-period"
          label={t("period")}
          value={selectedPeriodLabel}
          icon="calendar-clear-outline"
          isExpanded={openSelector === "period"}
          onPress={() => setOpenSelector("period")}
        />
        <FilterCard
          testID="budget-filter-status"
          label={t("status")}
          value={selectedStatusLabel}
          icon="options-outline"
          isExpanded={openSelector === "status"}
          onPress={() => setOpenSelector("status")}
        />
      </View>

      <Modal
        visible={openSelector !== null}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setOpenSelector(null)}
      >
        <TouchableWithoutFeedback onPress={() => setOpenSelector(null)}>
          <View className="flex-1 justify-end bg-black/80">
            <TouchableWithoutFeedback>
              <View
                testID="budget-filter-option-sheet"
                className="overflow-hidden rounded-t-3xl bg-white dark:bg-slate-900"
                style={{ paddingBottom: bottomInset + 16 }}
              >
                <View className="flex-row items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
                  <Text className="text-lg font-bold text-text-primary dark:text-slate-25">
                    {t(
                      openSelector === "period"
                        ? "select_period"
                        : "select_status"
                    )}
                  </Text>
                  <TouchableOpacity
                    className="min-h-11 min-w-11 items-center justify-center"
                    accessibilityRole="button"
                    accessibilityLabel={t("close")}
                    onPress={() => setOpenSelector(null)}
                  >
                    <Ionicons
                      name="close"
                      size={24}
                      color={isDark ? palette.slate[300] : palette.slate[500]}
                    />
                  </TouchableOpacity>
                </View>
                <View className="px-5 py-2">
                  {selectorOptions.map((option) => {
                    const isSelected = option.value === selectedValue;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        testID={`budget-filter-option-${openSelector}-${option.value.toLowerCase()}`}
                        className="min-h-14 flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800"
                        activeOpacity={0.8}
                        accessibilityRole="radio"
                        accessibilityLabel={option.label}
                        accessibilityState={{ selected: isSelected }}
                        onPress={() => {
                          if (openSelector === "period") {
                            onSelectPeriod(
                              option.value as BudgetDashboardPeriodFilter
                            );
                          } else {
                            onSelectStatus(
                              option.value as BudgetDashboardStatusFilter
                            );
                          }
                          setOpenSelector(null);
                        }}
                      >
                        <Text
                          className={`text-base ${
                            isSelected
                              ? "font-semibold text-nileGreen-600 dark:text-nileGreen-400"
                              : "text-text-primary dark:text-slate-200"
                          }`}
                        >
                          {option.label}
                        </Text>
                        {isSelected ? (
                          <Ionicons
                            name="checkmark-circle"
                            size={22}
                            color={palette.nileGreen[500]}
                          />
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}
