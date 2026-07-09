import { Ionicons } from "@expo/vector-icons";
import type { ReviewableTransaction } from "@monyvi/logic";
import React, { useCallback, useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, { FadeIn, FadeInDown, FadeOut } from "react-native-reanimated";
import { PeriodFilterModal } from "@/components/modals/PeriodFilterModal";
import { TypeFilterModal } from "@/components/modals/TypeFilterModal";
import { TransactionFiltersBar } from "@/components/transactions/TransactionFiltersBar";
import { palette } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { useAccountDisplayNames } from "@/hooks/useAccountDisplayNames";
import {
  type ReviewListItem,
  type TransactionReviewMode,
  useTransactionReviewState,
} from "@/hooks/useTransactionReviewState";
import { TransactionEditModal } from "./edit-modal/TransactionEditModal";
import {
  getExpandedContent,
  OriginalContentBlock,
} from "./get-expanded-content";
import { ReviewActionBar } from "./ReviewActionBar";
import { TransactionItem } from "./TransactionItem";

export interface TransactionReviewProps {
  readonly transactions: readonly ReviewableTransaction[];
  readonly onSave: (
    selected: readonly ReviewableTransaction[],
    transactionAccountMap: ReadonlyMap<number, string>,
    toAccountMap: ReadonlyMap<number, string>
  ) => Promise<void>;
  readonly onDiscard: () => void;
  readonly isSaving: boolean;
}

export function TransactionReview({
  transactions,
  onSave,
  onDiscard,
  isSaving,
}: TransactionReviewProps): React.JSX.Element {
  const { isDark } = useTheme();
  const { t } = useTranslation("common");
  const { t: tTransactions } = useTranslation("transactions");
  const state = useTransactionReviewState({ transactions, onSave });
  const [isFiltersVisible, setIsFiltersVisible] = useState(false);
  const accountDisplayNames = useAccountDisplayNames();

  const hasActiveFilters =
    state.period !== "all_time" ||
    state.searchQuery.trim().length > 0 ||
    !(state.selectedTypes.length === 1 && state.selectedTypes[0] === "All");
  const isSelectionScopedToShown =
    state.reviewMode !== "all" || hasActiveFilters;
  const reviewModeOptions: ReadonlyArray<{
    readonly mode: TransactionReviewMode;
    readonly label: string;
    readonly count: number;
  }> = [
    {
      mode: "all",
      label: tTransactions("review_mode_all"),
      count: state.effectiveTransactions.length,
    },
    {
      mode: "needs_review",
      label: tTransactions("review_mode_needs_review"),
      count: state.needsReviewCount,
    },
    {
      mode: "auto_selected",
      label: tTransactions("review_mode_auto_selected"),
      count: state.autoSelectedCount,
    },
  ];
  const selectToggleLabel = state.allSelected
    ? isSelectionScopedToShown
      ? tTransactions("deselect_shown")
      : t("deselect_all")
    : isSelectionScopedToShown
      ? tTransactions("select_shown")
      : t("select_all");
  const emptyStateLabel =
    state.reviewMode === "needs_review"
      ? tTransactions("review_empty_needs_review")
      : state.reviewMode === "auto_selected"
        ? tTransactions("review_empty_auto_selected")
        : t("no_matching_filters");

  const renderItem = useCallback(
    ({ item }: { item: ReviewListItem }) => {
      if (item.kind === "header") {
        return (
          <Text className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1 pt-4 pb-2">
            {item.date}
          </Text>
        );
      }

      const tx = item.tx;
      const accountId =
        state.transactionOverrides.get(item.originalIndex)?.accountId ??
        state.accountMatches.get(item.originalIndex)?.accountId ??
        null;
      const rawAccountName =
        state.transactionOverrides.get(item.originalIndex)?.accountName ??
        state.accountMatches.get(item.originalIndex)?.accountName ??
        null;
      const accountName =
        (accountId ? accountDisplayNames.get(accountId) : null) ??
        rawAccountName;
      const content = getExpandedContent(tx);

      return (
        <TransactionItem
          transaction={tx}
          index={item.originalIndex}
          isSelected={state.selectedIndicesRef.current.has(item.originalIndex)}
          accountName={accountName}
          expandedContent={
            content ? (
              <OriginalContentBlock title={content.title} body={content.body} />
            ) : undefined
          }
          onToggleSelect={state.handleToggleItem}
          onPress={state.handleOpenEditModal}
          hasMissingInfo={state.invalidIndices.has(item.originalIndex)}
          reviewMeta={state.reviewMetaByIndex.get(item.originalIndex)}
        />
      );
    },
    [
      accountDisplayNames,
      state.accountMatches,
      state.handleOpenEditModal,
      state.handleToggleItem,
      state.invalidIndices,
      state.reviewMetaByIndex,
      state.selectedIndicesRef,
      state.transactionOverrides,
    ]
  );

  const keyExtractor = useCallback((item: ReviewListItem) => item.key, []);

  return (
    <View className="flex-1">
      {isFiltersVisible && (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
        >
          <TransactionFiltersBar
            period={state.period}
            onPeriodPress={() => state.setPeriodModalVisible(true)}
            selectedTypes={state.selectedTypes}
            allTypesCount={2}
            onTypePress={() => state.setTypeModalVisible(true)}
            searchQuery={state.searchQuery}
            onSearchChange={state.setSearchQuery}
            searchPlaceholder={t("search_placeholder_counterparty")}
            containerClassName="px-5 pb-2"
          />
        </Animated.View>
      )}

      <Animated.View
        entering={FadeInDown.delay(100)}
        className="px-5 py-4 bg-slate-50 dark:bg-slate-950/90 border-b border-slate-200 dark:border-slate-800"
      >
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <Text className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
              {tTransactions("review_summary_title")}
            </Text>
            <Text className="mt-1 text-sm text-slate-700 dark:text-slate-200">
              <Text className="font-bold text-slate-950 dark:text-white">
                {tTransactions("review_summary_found", {
                  count: state.effectiveTransactions.length,
                })}
              </Text>
              {"  "}
              <Text className="font-semibold text-nileGreen-700 dark:text-nileGreen-300">
                {tTransactions("review_summary_auto_selected", {
                  count: state.autoSelectedCount,
                })}
              </Text>
              {"  "}
              <Text className="font-semibold text-amber-600 dark:text-amber-300">
                {tTransactions("review_summary_needs_review", {
                  count: state.needsReviewCount,
                })}
              </Text>
            </Text>
            <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {tTransactions("review_trust_copy")}
            </Text>
          </View>

          <View className="flex-row items-center gap-3 pt-0.5">
            <TouchableOpacity
              onPress={() => setIsFiltersVisible((prev) => !prev)}
              activeOpacity={0.7}
              className="relative h-9 w-9 items-center justify-center rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
            >
              <Ionicons
                name={isFiltersVisible ? "funnel" : "funnel-outline"}
                size={18}
                color={
                  hasActiveFilters ? palette.nileGreen[400] : palette.slate[400]
                }
              />
              {hasActiveFilters && !isFiltersVisible && (
                <View className="absolute top-1 end-1 w-2.5 h-2.5 rounded-full bg-nileGreen-400" />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={state.handleToggleAll}
              activeOpacity={0.7}
              className="h-9 flex-row items-center rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3"
            >
              <Ionicons
                name={state.allSelected ? "checkbox" : "square-outline"}
                size={18}
                color={
                  state.allSelected
                    ? palette.nileGreen[400]
                    : palette.slate[400]
                }
              />
              <Text className="text-xs font-semibold text-slate-500 dark:text-slate-300 ms-1.5">
                {selectToggleLabel}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View className="mt-4 flex-row gap-2">
          {reviewModeOptions.map((option) => {
            const isActive = state.reviewMode === option.mode;
            return (
              <TouchableOpacity
                key={option.mode}
                onPress={() => state.setReviewMode(option.mode)}
                activeOpacity={0.8}
                className={`flex-1 min-h-10 items-center justify-center rounded-full border px-2 ${
                  isActive
                    ? "bg-nileGreen-600 border-nileGreen-600"
                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
                }`}
              >
                <Text
                  className={`text-[11px] font-bold text-center ${
                    isActive
                      ? "text-white"
                      : "text-slate-600 dark:text-slate-300"
                  }`}
                  numberOfLines={1}
                >
                  {option.label} ({option.count})
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {state.needsReviewCount > 0 && (
          <TouchableOpacity
            onPress={
              state.reviewMode === "needs_review"
                ? state.handleShowAll
                : state.handleReviewNeeds
            }
            activeOpacity={0.8}
            className="mt-3 min-h-11 items-center justify-center rounded-xl bg-slate-900 dark:bg-white"
          >
            <Text className="text-sm font-bold text-white dark:text-slate-950">
              {state.reviewMode === "needs_review"
                ? tTransactions("show_all")
                : tTransactions("review_items_count", {
                    count: state.needsReviewCount,
                  })}
            </Text>
          </TouchableOpacity>
        )}
      </Animated.View>

      {state.filteredTransactions.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <Ionicons
            name="search"
            size={40}
            color={isDark ? palette.slate[600] : palette.slate[400]}
          />
          <Text className="text-slate-500 dark:text-slate-400 mt-3 text-center text-sm">
            {emptyStateLabel}
          </Text>
        </View>
      ) : (
        <FlatList
          data={state.listItems}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          extraData={{
            selectedIndices: state.selectedIndices,
            reviewMode: state.reviewMode,
            reviewMetaByIndex: state.reviewMetaByIndex,
          }}
          contentContainerClassName="px-4 pb-36"
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          maxToRenderPerBatch={15}
          windowSize={7}
        />
      )}

      <ReviewActionBar
        selectedCount={state.selectedCount}
        isSaving={isSaving}
        onSave={state.handleSave}
        onDiscard={onDiscard}
      />

      <PeriodFilterModal
        visible={state.periodModalVisible}
        selectedPeriod={state.period}
        onSelect={state.setPeriod}
        onClose={() => state.setPeriodModalVisible(false)}
      />

      <TypeFilterModal
        visible={state.typeModalVisible}
        selectedTypes={state.selectedTypes}
        onToggle={state.handleTypeToggle}
        onClose={() => state.setTypeModalVisible(false)}
      />

      {state.editModalIndex !== null &&
        state.effectiveTransactions[state.editModalIndex] && (
          <TransactionEditModal
            visible={state.editModalIndex !== null}
            transaction={state.effectiveTransactions[state.editModalIndex]}
            currentAccountName={
              state.transactionOverrides.get(state.editModalIndex)
                ?.accountName ??
              state.accountMatches.get(state.editModalIndex)?.accountName ??
              null
            }
            currentAccountId={
              state.transactionOverrides.get(state.editModalIndex)?.accountId ??
              state.accountMatches.get(state.editModalIndex)?.accountId ??
              null
            }
            accounts={state.userAccounts}
            categoryMap={state.categoryMap}
            pendingAccounts={state.pendingAccounts}
            latestRates={state.latestRates}
            expenseCategories={state.expenseCategories}
            incomeCategories={state.incomeCategories}
            onSave={state.handleEditModalSave}
            onCreatePendingAccount={state.handleCreatePendingAccount}
            onClose={() => state.setEditModalIndex(null)}
          />
        )}
    </View>
  );
}
