import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { palette } from "@/constants/colors";
import { useModalBottomInset } from "@/hooks/useModalBottomInset";
import type {
  GroupingPeriod,
  TransactionTypeFilter,
} from "@/hooks/useTransactionsGrouping";
import type { TransactionReviewFilters } from "@/hooks/useTransactionReviewState";

interface ReviewFiltersSheetProps {
  readonly visible: boolean;
  readonly period: GroupingPeriod;
  readonly selectedTypes: readonly TransactionTypeFilter[];
  readonly searchQuery: string;
  readonly onApply: (filters: TransactionReviewFilters) => void;
  readonly onClose: () => void;
  readonly getResultCount: (filters: TransactionReviewFilters) => number;
}

const PERIOD_OPTIONS: readonly GroupingPeriod[] = [
  "today",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "six_months",
  "this_year",
  "all_time",
];

const SPECIFIC_TYPE_OPTIONS = [
  { value: "Income", labelKey: "income", icon: "trending-up" },
  { value: "Expense", labelKey: "expense", icon: "trending-down" },
  { value: "Transfer", labelKey: "transfer", icon: "swap-horizontal" },
] as const satisfies ReadonlyArray<{
  readonly value: Exclude<TransactionTypeFilter, "All">;
  readonly labelKey: string;
  readonly icon: keyof typeof Ionicons.glyphMap;
}>;

type SpecificTransactionType = (typeof SPECIFIC_TYPE_OPTIONS)[number]["value"];

function expandSelectedTypes(
  selectedTypes: readonly TransactionTypeFilter[]
): readonly SpecificTransactionType[] {
  if (selectedTypes.includes("All")) {
    return SPECIFIC_TYPE_OPTIONS.map((option) => option.value);
  }

  return SPECIFIC_TYPE_OPTIONS.map((option) => option.value).filter((type) =>
    selectedTypes.includes(type)
  );
}

function normalizeSelectedTypes(
  selectedTypes: readonly SpecificTransactionType[]
): readonly TransactionTypeFilter[] {
  return selectedTypes.length === SPECIFIC_TYPE_OPTIONS.length
    ? ["All"]
    : selectedTypes;
}

export function ReviewFiltersSheet({
  visible,
  period,
  selectedTypes,
  searchQuery,
  onApply,
  onClose,
  getResultCount,
}: ReviewFiltersSheetProps): React.JSX.Element {
  const { t } = useTranslation("common");
  const { t: tTransactions } = useTranslation("transactions");
  const bottomInset = useModalBottomInset();
  const [draftPeriod, setDraftPeriod] = useState<GroupingPeriod>(period);
  const [draftTypes, setDraftTypes] = useState<
    readonly SpecificTransactionType[]
  >(() => expandSelectedTypes(selectedTypes));
  const [draftSearchQuery, setDraftSearchQuery] = useState(searchQuery);

  useEffect(() => {
    if (!visible) return;
    setDraftPeriod(period);
    setDraftTypes(expandSelectedTypes(selectedTypes));
    setDraftSearchQuery(searchQuery);
  }, [period, searchQuery, selectedTypes, visible]);

  const draftFilters = useMemo(
    (): TransactionReviewFilters => ({
      period: draftPeriod,
      selectedTypes: normalizeSelectedTypes(draftTypes),
      searchQuery: draftSearchQuery,
    }),
    [draftPeriod, draftSearchQuery, draftTypes]
  );
  const resultCount = getResultCount(draftFilters);

  const handleTypeToggle = (type: SpecificTransactionType): void => {
    setDraftTypes((previousTypes) => {
      if (previousTypes.includes(type)) {
        return previousTypes.length === 1
          ? previousTypes
          : previousTypes.filter((previousType) => previousType !== type);
      }
      return [...previousTypes, type];
    });
  };

  const handleReset = (): void => {
    setDraftPeriod("all_time");
    setDraftTypes(SPECIFIC_TYPE_OPTIONS.map((option) => option.value));
    setDraftSearchQuery("");
  };

  const handleApply = (): void => {
    onApply(draftFilters);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-end"
      >
        <TouchableOpacity
          testID="review-filter-backdrop"
          activeOpacity={1}
          onPress={onClose}
          className="absolute inset-0"
        >
          <View className="flex-1 bg-black/70" />
        </TouchableOpacity>

        <View
          testID="review-filters-sheet"
          className="max-h-[86%] overflow-hidden rounded-t-2xl border-t border-border bg-surface dark:border-border-dark dark:bg-surface-dark"
          style={{ paddingBottom: bottomInset }}
        >
          <View className="items-center pt-2">
            <View className="h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />
          </View>

          <View className="flex-row items-center justify-between border-b border-border px-5 py-3 dark:border-border-dark">
            <Text className="text-lg font-bold text-text-primary dark:text-text-primary-dark">
              {tTransactions("review_filters_title")}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={10}
              className="h-9 w-9 items-center justify-center rounded-full"
              accessibilityRole="button"
              accessibilityLabel={t("close")}
            >
              <Ionicons name="close" size={22} color={palette.slate[400]} />
            </TouchableOpacity>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerClassName="px-5 py-4"
          >
            <View className="h-11 flex-row items-center rounded-lg border border-border bg-background px-3 dark:border-border-dark dark:bg-background-dark">
              <Ionicons
                name="search-outline"
                size={19}
                color={palette.slate[400]}
              />
              <TextInput
                testID="review-filter-search"
                value={draftSearchQuery}
                onChangeText={setDraftSearchQuery}
                placeholder={t("search_placeholder_counterparty")}
                placeholderTextColor={palette.slate[400]}
                className="ms-2 flex-1 text-base text-text-primary dark:text-text-primary-dark"
              />
            </View>

            <Text className="mb-2 mt-4 text-sm font-semibold text-text-secondary dark:text-text-secondary-dark">
              {t("select_period")}
            </Text>
            <View className="flex-row flex-wrap justify-between gap-y-2">
              {PERIOD_OPTIONS.map((option) => {
                const isSelected = draftPeriod === option;
                return (
                  <TouchableOpacity
                    key={option}
                    testID={`review-filter-period-${option}`}
                    onPress={() => setDraftPeriod(option)}
                    activeOpacity={0.75}
                    className={`h-10 w-[49%] flex-row items-center rounded-lg border px-3 ${
                      isSelected
                        ? "border-nileGreen-500 bg-nileGreen-50 dark:border-nileGreen-400 dark:bg-nileGreen-900"
                        : "border-border bg-background dark:border-border-dark dark:bg-background-dark"
                    }`}
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={17}
                      color={
                        isSelected ? palette.nileGreen[500] : palette.slate[400]
                      }
                    />
                    <Text
                      numberOfLines={1}
                      className={`ms-2 flex-1 text-sm font-medium ${
                        isSelected
                          ? "text-nileGreen-700 dark:text-nileGreen-400"
                          : "text-text-secondary dark:text-text-secondary-dark"
                      }`}
                    >
                      {t(`period_${option}`)}
                    </Text>
                    {isSelected && (
                      <Ionicons
                        name="checkmark-circle"
                        size={17}
                        color={palette.nileGreen[500]}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text className="mb-2 mt-4 text-sm font-semibold text-text-secondary dark:text-text-secondary-dark">
              {t("transaction_types")}
            </Text>
            <View className="overflow-hidden rounded-lg border border-border dark:border-border-dark">
              {SPECIFIC_TYPE_OPTIONS.map((option, index) => {
                const isSelected = draftTypes.includes(option.value);
                return (
                  <TouchableOpacity
                    key={option.value}
                    testID={`review-filter-type-${option.value}`}
                    onPress={() => handleTypeToggle(option.value)}
                    activeOpacity={0.75}
                    className={`h-11 flex-row items-center px-3 ${
                      index < SPECIFIC_TYPE_OPTIONS.length - 1
                        ? "border-b border-border dark:border-border-dark"
                        : ""
                    } bg-background dark:bg-background-dark`}
                  >
                    <View
                      className={`h-5 w-5 items-center justify-center rounded border-2 ${
                        isSelected
                          ? "border-nileGreen-500 bg-nileGreen-500"
                          : "border-slate-400"
                      }`}
                    >
                      {isSelected && (
                        <Ionicons
                          name="checkmark"
                          size={14}
                          color={palette.slate[25]}
                        />
                      )}
                    </View>
                    <View className="ms-3">
                      <Ionicons
                        name={option.icon}
                        size={18}
                        color={
                          isSelected
                            ? palette.nileGreen[500]
                            : palette.slate[400]
                        }
                      />
                    </View>
                    <Text className="ms-3 flex-1 text-sm font-medium text-text-primary dark:text-text-primary-dark">
                      {t(option.labelKey)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          <View className="flex-row items-center gap-3 border-t border-border px-5 py-2 dark:border-border-dark">
            <TouchableOpacity
              testID="review-filter-reset"
              onPress={handleReset}
              activeOpacity={0.75}
              className="h-11 min-w-24 items-center justify-center rounded-lg"
            >
              <Text className="text-sm font-semibold text-nileGreen-600 dark:text-nileGreen-400">
                {tTransactions("review_filters_reset")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="review-filter-apply"
              onPress={handleApply}
              activeOpacity={0.8}
              className="h-11 flex-1 items-center justify-center rounded-lg bg-nileGreen-600"
            >
              <Text className="text-sm font-bold text-white">
                {tTransactions("review_filters_show_count", {
                  count: resultCount,
                })}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
