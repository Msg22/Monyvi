import { Ionicons } from "@expo/vector-icons";
import type { ReviewableTransaction } from "@monyvi/logic";
import React, { useCallback, useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, { FadeInDown } from "react-native-reanimated";
import { PageHeader } from "@/components/navigation/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { palette } from "@/constants/colors";
import { ANDROID_SAFE_LIST_PROPS } from "@/constants/virtualized-list-policy";
import { useTheme } from "@/context/ThemeContext";
import { useAccountDisplayNames } from "@/hooks/useAccountDisplayNames";
import {
  type ReviewListItem,
  type TransactionReviewMode,
  useTransactionReviewState,
} from "@/hooks/useTransactionReviewState";
import { TransactionEditModal } from "./edit-modal/TransactionEditModal";
import { getExpandedContent } from "./get-expanded-content";
import { ReviewActionBar } from "./ReviewActionBar";
import { ReviewFiltersSheet } from "./ReviewFiltersSheet";
import {
  ReviewTransactionItemSkeleton,
  TransactionItem,
} from "./TransactionItem";
import { resolveTransactionReviewProvider } from "@/utils/transaction-review-provider";
import { PartialSmsResultsNotice } from "./PartialSmsResultsNotice";
import type { SmsScanSafeguardSummary } from "@/services/sms-parser-orchestrator";

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
  readonly workspaceVariant?: "default" | "sms";
  readonly partialResults?: {
    readonly safeguardSummary: SmsScanSafeguardSummary;
    readonly retryableCount: number;
    readonly canRetry: boolean;
    readonly isRetrying: boolean;
    readonly hasRetryError: boolean;
    readonly onRetry: () => void;
  };
}

export const TRANSACTION_REVIEW_LIST_RENDER_CONFIG = {
  initialNumToRender: 8,
  maxToRenderPerBatch: 8,
  updateCellsBatchingPeriod: 50,
  windowSize: 5,
} as const;

export function TransactionReview({
  transactions,
  onSave,
  onDiscard,
  isSaving,
  title,
  subtitle,
  onBack,
  workspaceVariant = "default",
  partialResults,
}: TransactionReviewProps): React.JSX.Element {
  const { isDark } = useTheme();
  const { t } = useTranslation("common");
  const { t: tTransactions } = useTranslation("transactions");
  const state = useTransactionReviewState({ transactions, onSave });
  const [isFilterSheetVisible, setIsFilterSheetVisible] = useState(false);
  const accountDisplayNames = useAccountDisplayNames();
  const isSmsWorkspace = workspaceVariant === "sms";
  const {
    accountMatches,
    handleOpenEditModal,
    handleReviewNeeds,
    handleShowAutoSelected,
    handleToggleItem,
    invalidIndices,
    isReviewMetadataReady,
    reviewMetaByIndex,
    resolvedAccountMatchIndices,
    selectedIndicesRef,
    setReviewMode,
    transactionOverrides,
  } = state;

  const hasActiveFilters =
    state.period !== "all_time" ||
    state.searchQuery.trim().length > 0 ||
    !(state.selectedTypes.length === 1 && state.selectedTypes[0] === "All");
  const activeFilterCount =
    (state.period !== "all_time" ? 1 : 0) +
    (state.searchQuery.trim().length > 0 ? 1 : 0) +
    (state.selectedTypes.length === 1 && state.selectedTypes[0] === "All"
      ? 0
      : 1);
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
  const handleReviewModePress = useCallback(
    (mode: TransactionReviewMode) => {
      if (mode === "needs_review") {
        handleReviewNeeds();
        return;
      }

      if (mode === "auto_selected") {
        handleShowAutoSelected();
        return;
      }

      setReviewMode(mode);
    },
    [handleReviewNeeds, handleShowAutoSelected, setReviewMode]
  );

  const renderItem = useCallback(
    ({ item }: { item: ReviewListItem }) => {
      if (!resolvedAccountMatchIndices.has(item.originalIndex)) {
        return <ReviewTransactionItemSkeleton />;
      }

      const tx = item.tx;
      const accountId =
        transactionOverrides.get(item.originalIndex)?.accountId ??
        accountMatches.get(item.originalIndex)?.accountId ??
        null;
      const rawAccountName =
        transactionOverrides.get(item.originalIndex)?.accountName ??
        accountMatches.get(item.originalIndex)?.accountName ??
        null;
      const accountName =
        (accountId ? accountDisplayNames.get(accountId) : null) ??
        rawAccountName;
      const content = getExpandedContent(tx);
      const providerPresentation = resolveTransactionReviewProvider(tx);

      return (
        <TransactionItem
          transaction={tx}
          index={item.originalIndex}
          isSelected={selectedIndicesRef.current.has(item.originalIndex)}
          accountName={accountName}
          expandedContentTitle={content?.title}
          expandedContentBody={content?.body}
          onToggleSelect={handleToggleItem}
          onPress={handleOpenEditModal}
          hasMissingInfo={invalidIndices.has(item.originalIndex)}
          reviewMeta={reviewMetaByIndex.get(item.originalIndex)}
          isSmsWorkspace={isSmsWorkspace}
          institutionLogo={providerPresentation?.asset.logo ?? null}
        />
      );
    },
    [
      accountDisplayNames,
      accountMatches,
      handleOpenEditModal,
      handleToggleItem,
      invalidIndices,
      resolvedAccountMatchIndices,
      reviewMetaByIndex,
      selectedIndicesRef,
      transactionOverrides,
      isSmsWorkspace,
    ]
  );

  const keyExtractor = useCallback((item: ReviewListItem) => item.key, []);

  return (
    <View
      testID="transaction-review-screen"
      className="flex-1 bg-background dark:bg-background-dark"
    >
      {title && (
        <PageHeader
          title={title}
          subtitle={subtitle}
          variant="review"
          showDrawer={false}
          showBackButton={Boolean(onBack)}
          onBack={onBack}
          backAccessibilityLabel={t("back")}
        />
      )}

      <FlatList
        data={state.listItems}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        extraData={state.selectedIndices}
        ListHeaderComponent={
          <Animated.View
            entering={FadeInDown.delay(100)}
            className="px-5 pb-3 pt-3"
          >
            <View
              testID="review-summary-card"
              className="min-h-20 flex-row items-center rounded-lg border border-border bg-background px-3 py-2 dark:border-border-dark dark:bg-background-dark"
            >
              <View
                testID="review-summary-auto-selected"
                accessible
                accessibilityLabel={
                  isReviewMetadataReady
                    ? tTransactions("review_summary_auto_selected", {
                        count: state.autoSelectedCount,
                      })
                    : t("loading")
                }
                className="flex-1 flex-row items-center justify-center"
              >
                <View className="h-8 w-8 items-center justify-center rounded-full border border-nileGreen-500 bg-nileGreen-600">
                  <Ionicons
                    name="checkmark"
                    size={18}
                    color={palette.slate[25]}
                  />
                </View>
                <View className="ms-2">
                  {isReviewMetadataReady ? (
                    <Text className="text-2xl font-extrabold leading-7 text-nileGreen-600 dark:text-nileGreen-400">
                      {state.autoSelectedCount}
                    </Text>
                  ) : (
                    <View
                      testID="review-summary-auto-selected-count-skeleton"
                      className="h-7 justify-center"
                    >
                      <Skeleton width={32} height={22} borderRadius={5} />
                    </View>
                  )}
                  <Text
                    numberOfLines={1}
                    className="text-xs text-text-secondary dark:text-text-secondary-dark"
                  >
                    {tTransactions("review_auto_selected_label")}
                  </Text>
                </View>
              </View>

              <View className="mx-3 h-10 w-px bg-border dark:bg-border-dark" />

              <View
                testID="review-summary-needs-review"
                accessible
                accessibilityLabel={
                  isReviewMetadataReady
                    ? tTransactions("review_summary_needs_review", {
                        count: state.needsReviewCount,
                      })
                    : t("loading")
                }
                className="flex-1 flex-row items-center justify-center"
              >
                <View className="h-8 w-8 items-center justify-center rounded-lg border border-gold-400 bg-gold-50 dark:bg-slate-800">
                  <Ionicons
                    name="warning-outline"
                    size={18}
                    color={palette.gold[400]}
                  />
                </View>
                <View className="ms-2">
                  {isReviewMetadataReady ? (
                    <Text className="text-2xl font-extrabold leading-7 text-gold-800 dark:text-gold-400">
                      {state.needsReviewCount}
                    </Text>
                  ) : (
                    <View
                      testID="review-summary-needs-review-count-skeleton"
                      className="h-7 justify-center"
                    >
                      <Skeleton width={32} height={22} borderRadius={5} />
                    </View>
                  )}
                  <Text
                    numberOfLines={1}
                    className="text-xs text-text-secondary dark:text-text-secondary-dark"
                  >
                    {tTransactions("review_need_review_label")}
                  </Text>
                </View>
              </View>
            </View>

            <View
              testID="review-mode-control"
              className="mt-3 h-10 flex-row rounded-lg border border-border bg-surface p-1 dark:border-border-dark dark:bg-surface-dark"
            >
              {reviewModeOptions.map((option) => {
                const isActive = state.reviewMode === option.mode;
                return (
                  <TouchableOpacity
                    key={option.mode}
                    testID={`review-mode-${option.mode}`}
                    onPress={() => handleReviewModePress(option.mode)}
                    disabled={!isReviewMetadataReady}
                    accessibilityState={{
                      disabled: !isReviewMetadataReady,
                      selected: isActive,
                    }}
                    activeOpacity={0.8}
                    className={`flex-1 items-center justify-center rounded-md border px-2 ${
                      isActive
                        ? "border-gold-600 bg-background dark:border-gold-400 dark:bg-background-dark"
                        : "border-transparent"
                    }`}
                  >
                    <Text
                      className={`text-center text-sm font-semibold ${
                        isActive
                          ? "text-gold-800 dark:text-gold-400"
                          : "text-slate-600 dark:text-slate-300"
                      }`}
                      numberOfLines={1}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View
              testID="review-selection-row"
              className="mt-2 h-10 flex-row items-center justify-between gap-2"
            >
              <Text
                numberOfLines={1}
                className="flex-1 text-sm font-semibold text-text-secondary dark:text-text-secondary-dark"
              >
                {state.reviewMode === "needs_review"
                  ? tTransactions("review_needs_check_count", {
                      count: state.needsReviewCount,
                    })
                  : tTransactions("review_items_count", {
                      count: state.filteredTransactions.length,
                    })}
              </Text>
              <TouchableOpacity
                testID="review-select-toggle"
                onPress={state.handleToggleAll}
                disabled={!isReviewMetadataReady}
                accessibilityState={{ disabled: !isReviewMetadataReady }}
                activeOpacity={0.7}
                className="h-9 flex-row items-center px-1"
              >
                <View
                  className={`h-6 w-6 rounded-md border-2 ${
                    state.allSelected
                      ? "border-nileGreen-600 bg-nileGreen-500 dark:border-nileGreen-400"
                      : "border-nileGreen-600 dark:border-nileGreen-400"
                  } items-center justify-center`}
                >
                  {state.allSelected && (
                    <Ionicons
                      name="checkmark"
                      size={16}
                      color={palette.slate[25]}
                    />
                  )}
                </View>
                <Text
                  numberOfLines={1}
                  className="ms-2 text-sm font-semibold text-nileGreen-600 dark:text-nileGreen-400"
                >
                  {selectToggleLabel}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="review-filter-trigger"
                onPress={() => setIsFilterSheetVisible(true)}
                activeOpacity={0.7}
                className="relative h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface dark:border-border-dark dark:bg-surface-dark"
              >
                <Ionicons
                  name="funnel-outline"
                  size={18}
                  color={
                    hasActiveFilters
                      ? palette.nileGreen[400]
                      : palette.slate[400]
                  }
                />
                {activeFilterCount > 0 && (
                  <View className="absolute -end-1 -top-1 h-4 min-w-4 items-center justify-center rounded-full bg-nileGreen-500 px-1">
                    <Text className="text-[10px] font-bold text-white">
                      {activeFilterCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {partialResults && (
              <PartialSmsResultsNotice
                safeguardSummary={partialResults.safeguardSummary}
                retryableCount={partialResults.retryableCount}
                canRetry={partialResults.canRetry}
                isRetrying={partialResults.isRetrying}
                hasRetryError={partialResults.hasRetryError}
                onRetry={partialResults.onRetry}
              />
            )}
          </Animated.View>
        }
        ListEmptyComponent={
          <View className="min-h-64 items-center justify-center px-6">
            <Ionicons
              name="search"
              size={40}
              color={isDark ? palette.slate[600] : palette.slate[400]}
            />
            <Text className="mt-3 text-center text-sm text-text-muted dark:text-text-muted-dark">
              {emptyStateLabel}
            </Text>
          </View>
        }
        ListFooterComponent={
          state.listItems.length > 0 ? (
            <View className="flex-row items-center px-5 py-4">
              <Ionicons
                name="information-circle-outline"
                size={17}
                color={palette.nileGreen[400]}
              />
              <Text className="ms-2 flex-1 text-xs text-text-secondary dark:text-text-secondary-dark">
                {tTransactions("review_ai_accuracy_notice")}
              </Text>
            </View>
          ) : null
        }
        contentContainerClassName="pb-2"
        showsVerticalScrollIndicator={false}
        {...ANDROID_SAFE_LIST_PROPS}
        initialNumToRender={
          TRANSACTION_REVIEW_LIST_RENDER_CONFIG.initialNumToRender
        }
        maxToRenderPerBatch={
          TRANSACTION_REVIEW_LIST_RENDER_CONFIG.maxToRenderPerBatch
        }
        updateCellsBatchingPeriod={
          TRANSACTION_REVIEW_LIST_RENDER_CONFIG.updateCellsBatchingPeriod
        }
        windowSize={TRANSACTION_REVIEW_LIST_RENDER_CONFIG.windowSize}
      />

      <ReviewActionBar
        selectedCount={state.selectedCount}
        isSaving={isSaving}
        isReviewMetadataReady={state.isReviewMetadataReady}
        onSave={state.handleSave}
        onDiscard={onDiscard}
        isSmsWorkspace={isSmsWorkspace}
      />

      <ReviewFiltersSheet
        visible={isFilterSheetVisible}
        period={state.period}
        selectedTypes={state.selectedTypes}
        searchQuery={state.searchQuery}
        onApply={state.applyReviewFilters}
        onClose={() => setIsFilterSheetVisible(false)}
        getResultCount={state.getFilteredTransactionCount}
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
