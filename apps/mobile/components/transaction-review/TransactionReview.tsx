import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
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
  readonly title?: string;
  readonly subtitle?: string;
  readonly onBack?: () => void;
}

export function TransactionReview({
  transactions,
  onSave,
  onDiscard,
  isSaving,
  title,
  subtitle,
  onBack,
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
    <View testID="transaction-review-screen" className="flex-1 bg-slate-950">
      {title && (
        <View className="px-7 pb-5 pt-8">
          <View className="flex-row items-center">
            {onBack && (
              <TouchableOpacity
                onPress={onBack}
                activeOpacity={0.75}
                className="me-5 h-11 w-11 items-center justify-center rounded-full"
                accessibilityRole="button"
                accessibilityLabel={t("back")}
              >
                <Ionicons name="arrow-back" size={34} color="white" />
              </TouchableOpacity>
            )}
            <View className="flex-1">
              <Text className="text-[28px] font-extrabold text-white">
                {title}
              </Text>
              {subtitle && (
                <Text className="mt-1 text-lg font-medium text-slate-300">
                  {subtitle}
                </Text>
              )}
            </View>
          </View>
        </View>
      )}

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

      <Animated.View entering={FadeInDown.delay(100)} className="px-7 pb-4">
        <LinearGradient
          colors={[palette.slate[950], palette.slate[900]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className="overflow-hidden rounded-[22px] border border-slate-700/80 px-6 py-5"
        >
          <View className="flex-row items-center">
            <View className="flex-1 flex-row items-center justify-center">
              <View className="h-12 w-12 items-center justify-center rounded-full border border-nileGreen-400 bg-nileGreen-600">
                <Ionicons name="checkmark" size={28} color="white" />
              </View>
              <View className="ms-4">
                <Text className="text-[40px] font-extrabold leading-[44px] text-nileGreen-400">
                  {state.autoSelectedCount}
                </Text>
                <Text className="text-base text-slate-300">
                  {tTransactions("review_auto_selected_label")}
                </Text>
              </View>
            </View>

            <View className="mx-6 h-20 w-px bg-slate-700" />

            <View className="flex-1 flex-row items-center justify-center">
              <View className="h-12 w-12 items-center justify-center rounded-2xl border border-gold-400 bg-gold-600/30">
                <Ionicons
                  name="warning-outline"
                  size={28}
                  color={palette.gold[400]}
                />
              </View>
              <View className="ms-4">
                <Text className="text-[40px] font-extrabold leading-[44px] text-gold-400">
                  {state.needsReviewCount}
                </Text>
                <Text className="text-base text-slate-300">
                  {tTransactions("review_need_review_label")}
                </Text>
              </View>
            </View>
          </View>

          <View className="mt-5 flex-row items-center justify-center">
            <Ionicons
              name="lock-closed-outline"
              size={20}
              color={palette.nileGreen[400]}
            />
            <Text className="ms-3 text-base font-medium text-slate-300">
              {tTransactions("review_trust_copy")}
            </Text>
          </View>
        </LinearGradient>

        <View className="mt-5 flex-row rounded-[18px] border border-slate-700/90 bg-slate-800/70 p-1">
          {reviewModeOptions.map((option) => {
            const isActive = state.reviewMode === option.mode;
            return (
              <TouchableOpacity
                key={option.mode}
                onPress={() => state.setReviewMode(option.mode)}
                activeOpacity={0.8}
                className={`flex-1 min-h-14 items-center justify-center rounded-2xl border px-2 ${
                  isActive
                    ? "border-gold-400 bg-slate-800"
                    : "border-transparent"
                }`}
              >
                <Text
                  className={`text-base font-semibold text-center ${
                    isActive ? "text-gold-400" : "text-slate-300"
                  }`}
                  numberOfLines={1}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View className="mt-5 flex-row items-center justify-between gap-3">
          <Text className="flex-1 text-lg font-semibold text-slate-300">
            {state.reviewMode === "needs_review"
              ? tTransactions("review_needs_check_count", {
                  count: state.needsReviewCount,
                })
              : tTransactions("review_items_count", {
                  count: state.filteredTransactions.length,
                })}
          </Text>
          <TouchableOpacity
            onPress={state.handleToggleAll}
            activeOpacity={0.7}
            className="h-11 flex-row items-center rounded-full px-2"
          >
            <View
              className={`h-8 w-8 rounded-lg border-2 ${
                state.allSelected
                  ? "border-nileGreen-400 bg-nileGreen-500"
                  : "border-nileGreen-400"
              } items-center justify-center`}
            >
              {state.allSelected && (
                <Ionicons name="checkmark" size={20} color="white" />
              )}
            </View>
            <Text className="ms-3 text-lg font-semibold text-nileGreen-400">
              {selectToggleLabel}
            </Text>
          </TouchableOpacity>
          <View className="flex-row items-center gap-3">
            <TouchableOpacity
              onPress={() => setIsFiltersVisible((prev) => !prev)}
              activeOpacity={0.7}
              className="relative h-12 w-12 items-center justify-center rounded-2xl border border-slate-700 bg-slate-800"
            >
              <Ionicons
                name={isFiltersVisible ? "funnel" : "funnel-outline"}
                size={24}
                color={
                  hasActiveFilters ? palette.nileGreen[400] : palette.slate[400]
                }
              />
              {hasActiveFilters && !isFiltersVisible && (
                <View className="absolute top-1 end-1 w-2.5 h-2.5 rounded-full bg-nileGreen-400" />
              )}
            </TouchableOpacity>
          </View>
        </View>
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
          contentContainerClassName="px-0 pb-52"
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          maxToRenderPerBatch={15}
          windowSize={7}
        />
      )}

      <ReviewActionBar
        selectedCount={state.selectedCount}
        needsReviewCount={state.needsReviewCount}
        reviewMode={state.reviewMode}
        isSaving={isSaving}
        onSave={state.handleSave}
        onDiscard={onDiscard}
        onReviewNeeds={state.handleReviewNeeds}
        onShowAll={state.handleShowAll}
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
