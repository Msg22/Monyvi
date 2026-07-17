import { IconLibrary } from "@/components/common/CategoryIcon";
import { DeleteConfirmationModal } from "@/components/modals/DeleteConfirmationModal";
import { PeriodFilterModal } from "@/components/modals/PeriodFilterModal";
import { RecurringEditModal } from "@/components/modals/RecurringEditModal";
import { TypeFilterModal } from "@/components/modals/TypeFilterModal";
import { PageHeader } from "@/components/navigation/PageHeader";
import { GroupHeader } from "@/components/transactions/GroupHeader";
import { QuickEditModal } from "@/components/transactions/QuickEditModal";
import { TransactionCard } from "@/components/transactions/TransactionCard";
import { TransactionFiltersBar } from "@/components/transactions/TransactionFiltersBar";
import { TransferCard } from "@/components/transactions/TransferCard";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { palette } from "@/constants/colors";
import { ANDROID_SAFE_LIST_PROPS } from "@/constants/virtualized-list-policy";
import { TAB_BAR_HEIGHT } from "@/constants/ui";
import { useTheme } from "@/context/ThemeContext";
import { batchDeleteDisplayTransactions } from "@/services/transaction-service";
import {
  useTransactionsGrouping,
  type DisplayTransaction,
  type GroupingPeriod,
  type TransactionTypeFilter,
} from "@/hooks/useTransactionsGrouping";
import { usePreferredCurrency } from "@/hooks/usePreferredCurrency";
import {
  useHistoricalRates,
  computeEquivalentText,
  toDateKey,
} from "@/hooks/useHistoricalRates";
import { useSync } from "@/providers/SyncProvider";
import { formatSignedTransactionAmount } from "@/utils/financial-display";
import { logger } from "@/utils/logger";
import { updateTransaction, updateTransfer } from "@/services";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, SectionList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Render the Transactions screen with filters, search, grouped list, selection, and quick-edit flows.
 *
 * The component displays period and type filters, a search bar, and a sectioned list of transactions
 * and transfers. It supports pull-to-refresh, multi-select with batch delete, quick in-place edits
 * for category and amount (including handling for recurring items), and navigation to add/edit screens.
 *
 * @returns The Transactions screen as a JSX element
 */
export default function TransactionsPlaceholder(): React.JSX.Element {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation("transactions");
  const { t: tCommon } = useTranslation("common");
  const [period, setPeriod] = useState<GroupingPeriod>("this_month");
  const [selectedTypes, setSelectedTypes] = useState<TransactionTypeFilter[]>([
    "Income",
    "Expense",
    "Transfer",
  ]);
  const [searchQuery, setSearchQuery] = useState("");
  const listBottomPadding = TAB_BAR_HEIGHT + insets.bottom + 24;

  // Modal State
  const [periodModalVisible, setPeriodModalVisible] = useState(false);
  const [typeModalVisible, setTypeModalVisible] = useState(false);

  // Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const isSelectionMode = selectedIds.size > 0;
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);

  // Data Hook - now accepts array of selected types directly
  const { groupedData, isLoading, refetch } = useTransactionsGrouping(
    period,
    selectedTypes,
    searchQuery
  );

  // Sync Hook
  const { sync } = useSync();
  const { preferredCurrency } = usePreferredCurrency();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ── Performance: cached flat transaction lookup (O(1) instead of O(n) per handler) ──
  const flatTransactionsMap = useMemo(() => {
    const map = new Map<string, DisplayTransaction>();
    for (const group of groupedData) {
      for (const tx of group.transactions) {
        map.set(tx.id, tx);
      }
    }
    return map;
  }, [groupedData]);

  // ── Batch-prefetch historical market rates for all visible transactions ──
  const transactionDates = useMemo(() => {
    const dates: Date[] = [];
    for (const group of groupedData) {
      for (const tx of group.transactions) {
        if (tx._type === "transaction" && tx.currency !== preferredCurrency) {
          dates.push(tx.date);
        }
      }
    }
    return dates;
  }, [groupedData, preferredCurrency]);

  const { ratesByDate } = useHistoricalRates(transactionDates);

  // ── Performance: memoized SectionList data & callbacks ──────────────
  const sections = useMemo(
    () =>
      groupedData.map((g) => ({
        title: g.title,
        netWorth: g.groupNetWorth,
        income: g.groupTotalIncome,
        expense: g.groupTotalExpense,
        data: g.transactions,
      })),
    [groupedData]
  );

  const sectionKeyExtractor = useCallback(
    (item: DisplayTransaction) => item.id,
    []
  );

  const renderSectionHeader = useCallback(
    ({
      section: { title, netWorth, income, expense },
    }: {
      section: {
        title: string;
        netWorth?: number;
        income: number;
        expense: number;
      };
    }) => (
      <GroupHeader
        title={title}
        netWorth={netWorth || 0}
        income={income}
        expense={expense}
        currencyCode={preferredCurrency}
      />
    ),
    [preferredCurrency]
  );

  const handleRefresh = async (): Promise<void> => {
    setIsRefreshing(true);
    try {
      await sync();
    } catch (error: unknown) {
      logger.error("Pull-to-refresh sync failed", error);
      showToast({
        type: "error",
        title: tCommon("error_generic"),
      });
    }
    // Also trigger local refetch just in case
    refetch();
    setIsRefreshing(false);
  };

  // Toast Hook
  const { showToast } = useToast();

  // Quick Edit State
  const [quickEdit, setQuickEdit] = useState<{
    visible: boolean;
    type: "CATEGORY" | "AMOUNT";
    transactionId: string;
    initialValue?: string | number;
    transactionType?: "INCOME" | "EXPENSE" | "TRANSFER";
    currency?: string;
    color?: string;
  }>({ visible: false, type: "CATEGORY", transactionId: "" });

  // Update handlers
  const handleUpdateTransaction = async (
    val: string | number
  ): Promise<void> => {
    const { transactionId, type: editType, transactionType } = quickEdit;

    try {
      if (transactionType === "TRANSFER") {
        // Transfer Update
        if (editType === "AMOUNT") {
          await updateTransfer(transactionId, { amount: Number(val) });
        }
      } else {
        // Transaction Update
        if (editType === "AMOUNT") {
          await updateTransaction(transactionId, { amount: Number(val) });
        } else {
          await updateTransaction(transactionId, { categoryId: String(val) });
        }
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refetch();
      showToast({
        type: "success",
        title: t("update_success"),
        message: t("update_success_message"),
      });
    } catch (e) {
      console.error(e);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showToast({
        type: "error",
        title: t("update_error"),
        message: t("update_error_message"),
      });
    }
  };

  // Selection Handlers
  const handleLongPress = useCallback((id: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handlePress = useCallback(
    (id: string): void => {
      if (isSelectionMode) {
        handleLongPress(id); // Toggle selection
      } else {
        // Navigate to edit — called from TransactionCard
        router.push({ pathname: "/edit-transaction", params: { id } });
      }
    },
    [isSelectionMode, handleLongPress]
  );

  const handleTransferPress = useCallback(
    (id: string): void => {
      if (isSelectionMode) {
        handleLongPress(id); // Toggle selection
      } else {
        // Navigate to edit — called from TransferCard
        router.push({ pathname: "/edit-transfer", params: { id } });
      }
    },
    [isSelectionMode, handleLongPress]
  );

  // Recurring Edit Modal State
  const [recurringEditModal, setRecurringEditModal] = useState<{
    visible: boolean;
    transactionId: string;
    action: "CATEGORY" | "AMOUNT";
  }>({
    visible: false,
    transactionId: "",
    action: "CATEGORY",
  });

  const handleRecurringOption = (scope: "THIS" | "TEMPLATE"): void => {
    const { transactionId, action } = recurringEditModal;
    setRecurringEditModal((prev) => ({ ...prev, visible: false }));

    const item = flatTransactionsMap.get(transactionId);

    if (!item) return;

    if (scope === "TEMPLATE") {
      // For now, if they choose template, we might want to navigate to the recurring edit screen
      // OR allow quick edit but apply to template logic.
      // Given the complexity of "Edit Template" via a quick edit modal (which is specific to this instance's amount/cat),
      // for "TEMPLATE", we should probably navigate to the Recurring Payment Edit screen or show a toast "Not implemented".
      // But per plan "Edit this and update template".
      // Let's just proceed with Quick Edit for now, but we'd need to pass a flag to updateTransaction?
      // updateTransaction doesn't support updating the RecurringPayment template yet.
      // So for scope "TEMPLATE", let's redirect to full edit or just allow "THIS" for now?
      // The user prompt only asked for the WARNING.
      // Let's clear the modal and open the Quick Edit, but ideally we passed "scope".
      // Since QuickEditModal handles a single transaction update, "Edit Template" implies logic change.
      // Let's just proceed to Quick Edit for both, but maybe show a Toast for Template saying "Updating template..."
      // actually, let's keep it simple: "Edit Only This" opens Quick Edit. "Edit Template" could navigate to recurring list.
      // But to be helpful, let's open Quick Edit for "THIS".
      // For "TEMPLATE", let's show "Coming soon" or navigate.
      // A better approach for P0 is ensuring they don't ACCIDENTALLY change template.
      // So checking "Edit This" allows proceeding.
      showToast({
        type: "info",
        title: tCommon("info"),
        message: t("edit_template_not_supported"),
      });
    } else {
      // Proceed with Quick Edit for "THIS" instance
      if (item._type === "transaction") {
        if (action === "CATEGORY") {
          setQuickEdit({
            visible: true,
            type: "CATEGORY",
            transactionId,
            initialValue: item.categoryId || "other",
            transactionType: item.isIncome ? "INCOME" : "EXPENSE",
          });
        } else {
          setQuickEdit({
            visible: true,
            type: "AMOUNT",
            transactionId,
            initialValue: item.amount,
            transactionType: item.isIncome ? "INCOME" : "EXPENSE",
            currency: item.currency,
            color: item.isIncome ? palette.nileGreen[500] : palette.red[500],
          });
        }
      }
    }
  };

  const handleCategoryPress = useCallback(
    (id: string): void => {
      const item = flatTransactionsMap.get(id);
      if (!item) return;

      if (item._type === "transaction") {
        if (item.linkedRecurringId) {
          setRecurringEditModal({
            visible: true,
            transactionId: id,
            action: "CATEGORY",
          });
          return;
        }

        setQuickEdit({
          visible: true,
          type: "CATEGORY",
          transactionId: id,
          initialValue: item.categoryId,
          transactionType: item.isIncome ? "INCOME" : "EXPENSE",
        });
      }
    },
    [flatTransactionsMap]
  );

  const handleAmountPress = useCallback(
    (id: string): void => {
      const item = flatTransactionsMap.get(id);
      if (!item) return;

      if (item._type === "transaction") {
        if (item.linkedRecurringId) {
          setRecurringEditModal({
            visible: true,
            transactionId: id,
            action: "AMOUNT",
          });
          return;
        }

        setQuickEdit({
          visible: true,
          type: "AMOUNT",
          transactionId: id,
          initialValue: item.amount,
          transactionType: item.isIncome ? "INCOME" : "EXPENSE",
          currency: item.currency,
          color: item.isIncome ? palette.nileGreen[500] : palette.red[500],
        });
      } else if (item._type === "transfer") {
        setQuickEdit({
          visible: true,
          type: "AMOUNT",
          transactionId: id,
          initialValue: item.amount,
          transactionType: "TRANSFER",
          currency: item.currency,
          color: palette.blue[500],
        });
      }
    },
    [flatTransactionsMap]
  );

  // ── renderItem declared after all handler deps are available ──
  const renderItem = useCallback(
    ({ item, index }: { item: DisplayTransaction; index: number }) => {
      if (item._type === "transfer") {
        return (
          <TransferCard
            id={item.id}
            amount={item.amount}
            currency={item.currency}
            date={item.date}
            fromAccountName={item.fromAccountName}
            toAccountName={item.toAccountName}
            notes={item.notes}
            displayNetWorth={item.displayNetWorth}
            currencyCode={preferredCurrency}
            isSelectionMode={isSelectionMode}
            isSelected={selectedIds.has(item.id)}
            onPress={handleTransferPress}
            onLongPress={handleLongPress}
            index={index}
          />
        );
      }
      return (
        <TransactionCard
          id={item.id}
          signedFormattedAmount={formatSignedTransactionAmount(item)}
          date={item.date}
          isExpense={item.isExpense}
          isIncome={item.isIncome}
          counterparty={item.counterparty}
          note={item.note}
          source={item.source}
          accountName={item.accountName}
          categoryName={item.categoryName}
          categoryIconName={item.categoryIconName}
          categoryIconLibrary={item.categoryIconLibrary as IconLibrary}
          displayNetWorth={item.displayNetWorth}
          currencyCode={preferredCurrency}
          isSelectionMode={isSelectionMode}
          isSelected={selectedIds.has(item.id)}
          onPress={handlePress}
          onLongPress={handleLongPress}
          index={index}
          onCategoryPress={handleCategoryPress}
          onAmountPress={handleAmountPress}
          equivalentAmountText={
            computeEquivalentText(
              item.amount,
              item.currency,
              preferredCurrency,
              ratesByDate.get(toDateKey(item.date))
            ) ?? undefined
          }
        />
      );
    },
    [
      preferredCurrency,
      isSelectionMode,
      selectedIds,
      handleTransferPress,
      handleLongPress,
      handlePress,
      handleCategoryPress,
      handleAmountPress,
      ratesByDate,
    ]
  );

  const handleSelectAll = useCallback((): void => {
    const allIds = Array.from(flatTransactionsMap.keys());
    if (selectedIds.size === allIds.length) {
      setSelectedIds(new Set()); // Deselect all
    } else {
      setSelectedIds(new Set(allIds));
    }
  }, [flatTransactionsMap, selectedIds.size]);

  const handleDeleteSelected = (): void => {
    setDeleteModalVisible(true);
  };

  const confirmDelete = async (): Promise<void> => {
    const ids = Array.from(selectedIds);
    const selectedItems = ids
      .map((id) => flatTransactionsMap.get(id))
      .filter((item): item is DisplayTransaction => item !== undefined);

    try {
      await batchDeleteDisplayTransactions(selectedItems);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {}
      );
      setSelectedIds(new Set());
      refetch();
      showToast({
        type: "success",
        title: t("delete_success"),
        message: t("delete_success_message", { count: selectedItems.length }),
      });
    } catch (error) {
      console.error("Failed to delete transactions:", error);
      showToast({
        type: "error",
        title: t("delete_failed"),
        message: t("delete_error_message"),
      });
    }
  };

  // Type Filter Toggle Handler
  const handleTypeToggle = (type: TransactionTypeFilter): void => {
    setSelectedTypes((prev) => {
      if (prev.includes(type)) {
        return prev.filter((t) => t !== type);
      } else {
        return [...prev, type];
      }
    });
  };

  return (
    <>
      <View className="flex-1">
        {/* Header Section */}
        <PageHeader
          title={tCommon("transactions")}
          selectionMode={
            isSelectionMode
              ? {
                  count: selectedIds.size,
                  totalCount: flatTransactionsMap.size,
                  onClear: () => setSelectedIds(new Set()),
                  onSelectAll: handleSelectAll,
                  onDelete: handleDeleteSelected,
                }
              : undefined
          }
          rightAction={
            isSelectionMode
              ? undefined
              : {
                  icon: "add",
                  onPress: () => router.push("/add-transaction"),
                }
          }
        />

        {/* Filters & Search Row */}
        <TransactionFiltersBar
          period={period}
          onPeriodPress={() => setPeriodModalVisible(true)}
          selectedTypes={selectedTypes}
          allTypesCount={3}
          onTypePress={() => setTypeModalVisible(true)}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search transactions..."
          containerClassName="px-5 pb-4"
        />

        {/* List Content */}
        {isLoading ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" color={palette.nileGreen[500]} />
          </View>
        ) : groupedData.length === 0 ? (
          <View className="flex-1 justify-center items-center px-6">
            <View className="bg-slate-100 dark:bg-slate-800 p-6 rounded-full mb-6">
              <Ionicons
                name="receipt-outline"
                size={48}
                color={isDark ? palette.slate[600] : palette.slate[400]}
              />
            </View>
            <Text className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2 text-center">
              {t("no_transactions")}
            </Text>
            <Text className="text-base text-slate-500 dark:text-slate-400 text-center mb-8">
              {t("start_tracking_spending")}
            </Text>
            <Button
              title={t("add_transaction")}
              onPress={() => router.push("/add-transaction")}
            />
          </View>
        ) : (
          <SectionList
            testID="transactions-list"
            sections={sections}
            keyExtractor={sectionKeyExtractor}
            renderSectionHeader={renderSectionHeader}
            contentContainerStyle={{
              flexGrow: 1,
              paddingBottom: listBottomPadding,
            }}
            onRefresh={handleRefresh}
            refreshing={isRefreshing}
            renderItem={renderItem}
            stickySectionHeadersEnabled={false}
            {...ANDROID_SAFE_LIST_PROPS}
            maxToRenderPerBatch={15}
            windowSize={7}
            initialNumToRender={15}
          />
        )}
      </View>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        visible={deleteModalVisible}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteModalVisible(false)}
        count={selectedIds.size}
      />

      {/* Quick Edit Modal */}
      {/* Need to import QuickEditModal at top */}
      <QuickEditModal
        visible={quickEdit.visible}
        type={quickEdit.type}
        transactionType={quickEdit.transactionType || "EXPENSE"}
        initialCategoryId={
          quickEdit.type === "CATEGORY"
            ? String(quickEdit.initialValue)
            : undefined
        }
        initialAmount={
          quickEdit.type === "AMOUNT"
            ? Number(quickEdit.initialValue)
            : undefined
        }
        currency={quickEdit.currency}
        amountColor={quickEdit.color}
        onClose={() => setQuickEdit((prev) => ({ ...prev, visible: false }))}
        onSave={handleUpdateTransaction}
      />

      {/* Filter Modals */}
      <PeriodFilterModal
        visible={periodModalVisible}
        selectedPeriod={period}
        onSelect={setPeriod}
        onClose={() => setPeriodModalVisible(false)}
      />
      <TypeFilterModal
        visible={typeModalVisible}
        selectedTypes={selectedTypes}
        onToggle={handleTypeToggle}
        onClose={() => setTypeModalVisible(false)}
      />

      <RecurringEditModal
        visible={recurringEditModal.visible}
        onEditThis={() => handleRecurringOption("THIS")}
        onEditTemplate={() => handleRecurringOption("TEMPLATE")}
        onCancel={() =>
          setRecurringEditModal((prev) => ({ ...prev, visible: false }))
        }
      />
    </>
  );
}
