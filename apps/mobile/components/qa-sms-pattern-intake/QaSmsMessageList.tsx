import { Ionicons } from "@expo/vector-icons";
import {
  containsQaSmsCurrencyLiteral,
  type QaInboxMessage,
} from "@monyvi/logic";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { palette } from "@/constants/colors";
import { Skeleton } from "@/components/ui/Skeleton";
import { QaSmsBottomSheetModal } from "./QaSmsBottomSheetModal";
import { QaSmsMessageEmptyState } from "./QaSmsMessageEmptyState";
import { QaSmsStickyFooter } from "./QaSmsStickyFooter";

interface QaSmsMessageListProps {
  readonly messages: readonly QaInboxMessage[];
  readonly selectedIds: readonly string[];
  readonly isLoading: boolean;
  readonly onToggle: (localSelectionId: string) => void;
  readonly onSelectNewest: (localSelectionIds: readonly string[]) => void;
  readonly onSanitize: () => void;
  readonly onRetry: () => void;
  readonly providerName: string;
  readonly onOpenFilters?: () => void;
  readonly bottomInset: number;
}

interface MessageRowProps {
  readonly message: QaInboxMessage;
  readonly rowIndex: number;
  readonly isSelected: boolean;
  readonly onToggle: (localSelectionId: string) => void;
}

type CurrencyFilter = "all" | "EGP" | "USD";
type SelectionFilter = "all" | "selected" | "unselected";

function normalizeSearchQuery(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function matchesSearchQuery(
  message: QaInboxMessage,
  providerName: string,
  normalizedQuery: string
): boolean {
  if (!normalizedQuery) return true;
  return [message.sender, message.body, providerName].some((value) =>
    value.toLocaleLowerCase().includes(normalizedQuery)
  );
}

interface SelectionFilterSheetProps {
  readonly visible: boolean;
  readonly currency: CurrencyFilter;
  readonly selection: SelectionFilter;
  readonly bottomInset: number;
  readonly onApply: (filters: {
    readonly currency: CurrencyFilter;
    readonly selection: SelectionFilter;
  }) => void;
  readonly onCancel: () => void;
}

function SelectionFilterSheet({
  visible,
  currency,
  selection,
  bottomInset,
  onApply,
  onCancel,
}: SelectionFilterSheetProps): React.JSX.Element {
  const { t } = useTranslation("qa-sms-pattern-intake");
  const [draftCurrency, setDraftCurrency] = useState(currency);
  const [draftSelection, setDraftSelection] = useState(selection);

  useEffect(() => {
    if (!visible) return;
    setDraftCurrency(currency);
    setDraftSelection(selection);
  }, [currency, selection, visible]);

  return (
    <QaSmsBottomSheetModal
      visible={visible}
      onClose={onCancel}
      bottomInset={bottomInset}
      testID="qa-sms-filter-sheet"
    >
      <View className="h-1.5 w-16 self-center rounded-full bg-slate-400" />
      <Text className="mt-6 text-2xl font-bold text-text-primary dark:text-slate-100">
        {t("filter_title")}
      </Text>
      <Text className="mt-6 text-sm font-semibold text-text-primary dark:text-slate-100">
        {t("filter_currency")}
      </Text>
      <View className="mt-2 flex-row overflow-hidden rounded-lg border border-slate-400">
        {(["all", "EGP", "USD"] as const).map((value) => (
          <TouchableOpacity
            key={value}
            testID={`qa-sms-filter-currency-${value.toLowerCase()}`}
            className="relative min-h-12 flex-1 items-center justify-center overflow-hidden border-e border-slate-400 last:border-e-0"
            onPress={() => setDraftCurrency(value)}
          >
            {draftCurrency === value ? (
              <View
                testID={`qa-sms-filter-currency-${value.toLowerCase()}-selected-background`}
                pointerEvents="none"
                className="absolute inset-0 bg-nileGreen-500/10"
              />
            ) : null}
            <Text className="z-10 font-semibold text-text-primary dark:text-slate-100">
              {value === "all" ? t("filter_all") : value}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text className="mt-6 text-sm font-semibold text-text-primary dark:text-slate-100">
        {t("filter_selection")}
      </Text>
      <View className="mt-2 flex-row overflow-hidden rounded-lg border border-slate-400">
        {(["all", "selected", "unselected"] as const).map((value) => (
          <TouchableOpacity
            key={value}
            testID={`qa-sms-filter-selection-${value}`}
            className="relative min-h-12 flex-1 items-center justify-center overflow-hidden border-e border-slate-400 last:border-e-0"
            onPress={() => setDraftSelection(value)}
          >
            {draftSelection === value ? (
              <View
                testID={`qa-sms-filter-selection-${value}-selected-background`}
                pointerEvents="none"
                className="absolute inset-0 bg-nileGreen-500/10"
              />
            ) : null}
            <Text className="z-10 font-semibold text-text-primary dark:text-slate-100">
              {t(`filter_${value}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View className="mt-7 flex-row gap-3">
        <TouchableOpacity
          className="min-h-14 flex-1 items-center justify-center rounded-lg border border-nileGreen-600"
          onPress={() => {
            setDraftCurrency("all");
            setDraftSelection("all");
          }}
        >
          <Text className="font-semibold text-nileGreen-700 dark:text-nileGreen-400">
            {t("filter_reset")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="qa-sms-apply-filters"
          className="min-h-14 flex-1 items-center justify-center rounded-lg bg-nileGreen-600"
          onPress={() =>
            onApply({
              currency: draftCurrency,
              selection: draftSelection,
            })
          }
        >
          <Text className="font-semibold text-white">{t("filter_apply")}</Text>
        </TouchableOpacity>
      </View>
    </QaSmsBottomSheetModal>
  );
}

const MessageRow = React.memo(function MessageRow({
  message,
  rowIndex,
  isSelected,
  onToggle,
}: MessageRowProps): React.JSX.Element {
  const date = new Date(message.receivedAtMs).toLocaleDateString();
  return (
    <TouchableOpacity
      testID={`qa-sms-message-${rowIndex}`}
      className="min-h-[92px] flex-row items-center border-b border-slate-200 px-5 py-4 dark:border-slate-800"
      onPress={() => onToggle(message.localSelectionId)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isSelected }}
    >
      <View
        className={`h-7 w-7 items-center justify-center rounded border ${
          isSelected
            ? "border-nileGreen-600 bg-nileGreen-600"
            : "border-slate-500"
        }`}
      >
        {isSelected ? (
          <Ionicons name="checkmark" size={19} color={palette.slate[25]} />
        ) : null}
      </View>
      <View className="ms-4 flex-1">
        <View className="flex-row items-center justify-between">
          <Text className="text-base font-semibold text-text-primary dark:text-slate-100">
            {message.sender}
          </Text>
          <Text className="text-sm text-text-muted dark:text-slate-400">
            {date}
          </Text>
        </View>
        <Text
          className="mt-1 text-sm leading-5 text-text-secondary dark:text-slate-400"
          numberOfLines={2}
        >
          {message.body}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={palette.slate[500]} />
    </TouchableOpacity>
  );
});

function getMessageKey(message: QaInboxMessage): string {
  return message.localSelectionId;
}

function MessageSkeletons(): React.JSX.Element {
  return (
    <View testID="qa-sms-message-skeletons" className="flex-1">
      {[0, 1, 2, 3, 4].map((index) => (
        <View
          key={index}
          testID={`qa-sms-message-skeleton-row-${index}`}
          className="min-h-[92px] flex-row items-center border-b border-slate-200 px-5 py-4 dark:border-slate-800"
        >
          <Skeleton width={28} height={28} borderRadius={5} />
          <View className="ms-4 flex-1">
            <View className="flex-row items-center justify-between">
              <Skeleton width="38%" height={18} />
              <Skeleton width="22%" height={14} />
            </View>
            <View className="mt-2">
              <Skeleton width="90%" height={14} />
            </View>
            <View className="mt-1.5">
              <Skeleton width="72%" height={14} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

export function QaSmsMessageList({
  messages,
  selectedIds,
  isLoading,
  onToggle,
  onSelectNewest,
  onSanitize,
  onRetry,
  providerName,
  onOpenFilters,
  bottomInset,
}: QaSmsMessageListProps): React.JSX.Element {
  const { t } = useTranslation("qa-sms-pattern-intake");
  const [isFilterOpen, setFilterOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState<CurrencyFilter>("all");
  const [selectionFilter, setSelectionFilter] =
    useState<SelectionFilter>("all");
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const normalizedSearchQuery = useMemo(
    () => normalizeSearchQuery(searchQuery),
    [searchQuery]
  );
  const visibleMessages = useMemo(() => {
    if (
      !normalizedSearchQuery &&
      currencyFilter === "all" &&
      selectionFilter === "all"
    ) {
      return messages;
    }
    return messages.filter((message) => {
      const matchesSearch = matchesSearchQuery(
        message,
        providerName,
        normalizedSearchQuery
      );
      const matchesCurrency =
        currencyFilter === "all" ||
        containsQaSmsCurrencyLiteral(message.body, currencyFilter);
      const isSelected = selected.has(message.localSelectionId);
      const matchesSelection =
        selectionFilter === "all" ||
        (selectionFilter === "selected" && isSelected) ||
        (selectionFilter === "unselected" && !isSelected);
      return matchesSearch && matchesCurrency && matchesSelection;
    });
  }, [
    currencyFilter,
    messages,
    normalizedSearchQuery,
    providerName,
    selected,
    selectionFilter,
  ]);
  const renderItem = useCallback(
    ({
      item,
      index,
    }: {
      readonly item: QaInboxMessage;
      readonly index: number;
    }): React.JSX.Element => (
      <MessageRow
        message={item}
        rowIndex={index}
        isSelected={selected.has(item.localSelectionId)}
        onToggle={onToggle}
      />
    ),
    [onToggle, selected]
  );
  const hasSelectableVisibleMessage = visibleMessages.some(
    ({ localSelectionId }) => !selected.has(localSelectionId)
  );
  const isBulkSelectionDisabled =
    isLoading || selectedIds.length >= 50 || !hasSelectableVisibleMessage;

  return (
    <View className="flex-1 bg-background dark:bg-background-dark">
      <View className="border-b border-slate-200 px-5 pb-3 pt-2 dark:border-slate-800">
        <Text className="text-sm font-semibold text-nileGreen-700 dark:text-nileGreen-400">
          {t("step_capture")}
        </Text>
        <View className="mt-3 flex-row gap-3">
          <View
            accessibilityLabel={t("verified_provider", {
              provider: providerName,
            })}
            className="h-12 flex-[1.55] flex-row items-center rounded-lg border border-slate-300 px-3 dark:border-slate-700"
          >
            <Ionicons
              name="business-outline"
              size={20}
              color={palette.slate[600]}
            />
            <Text
              className="ms-2 flex-1 text-sm font-medium text-text-primary dark:text-slate-100"
              numberOfLines={1}
            >
              {providerName}
            </Text>
          </View>
          <View className="h-12 flex-1 items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700">
            <Text className="text-base text-text-primary dark:text-slate-100">
              {t("currency_scope_label")}
            </Text>
          </View>
          <TouchableOpacity
            testID="qa-sms-open-filters"
            className="h-12 w-14 items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700"
            onPress={() => {
              onOpenFilters?.();
              setFilterOpen(true);
            }}
          >
            <Ionicons name="filter" size={22} color={palette.slate[600]} />
          </TouchableOpacity>
        </View>
        <View className="mt-3 h-12 flex-row items-center rounded-lg border border-slate-300 px-3 dark:border-slate-700">
          <Ionicons name="search" size={20} color={palette.slate[500]} />
          <TextInput
            testID="qa-sms-search-input"
            value={searchQuery}
            editable={!isLoading}
            accessibilityLabel={t("search_messages")}
            className="ms-2 flex-1 text-base text-text-primary dark:text-slate-100"
            placeholder={t("search_messages")}
            placeholderTextColor={palette.slate[500]}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity
              testID="qa-sms-clear-search"
              accessibilityLabel={t("clear_search")}
              className="h-10 w-10 items-center justify-center"
              onPress={() => setSearchQuery("")}
            >
              <Ionicons name="close" size={22} color={palette.slate[500]} />
            </TouchableOpacity>
          ) : null}
        </View>
        <View className="mt-3 min-h-10 flex-row items-center justify-between gap-3">
          {isLoading ? (
            <Skeleton width="42%" height={16} />
          ) : (
            <Text className="flex-1 text-sm text-text-secondary dark:text-slate-400">
              {t("message_selection_summary", {
                total: messages.length,
                selected: selectedIds.length,
                limit: 50,
              })}
            </Text>
          )}
          <TouchableOpacity
            testID="qa-sms-select-newest"
            disabled={isBulkSelectionDisabled}
            accessibilityState={{ disabled: isBulkSelectionDisabled }}
            className={`min-h-10 items-center justify-center rounded-lg border px-3 ${
              isBulkSelectionDisabled
                ? "border-slate-300 dark:border-slate-700"
                : "border-nileGreen-600"
            }`}
            onPress={() =>
              onSelectNewest(
                visibleMessages.map(({ localSelectionId }) => localSelectionId)
              )
            }
          >
            <Text
              className={`text-sm font-semibold ${
                isBulkSelectionDisabled
                  ? "text-slate-400 dark:text-slate-600"
                  : "text-nileGreen-700 dark:text-nileGreen-400"
              }`}
            >
              {t("select_newest")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View className="flex-1">
        {isLoading ? (
          <MessageSkeletons />
        ) : messages.length === 0 ? (
          <QaSmsMessageEmptyState onRetry={onRetry} />
        ) : visibleMessages.length === 0 ? (
          <View
            testID="qa-sms-search-empty-state"
            className="flex-1 items-center justify-center px-8"
          >
            <Ionicons
              name="search-outline"
              size={30}
              color={palette.slate[500]}
            />
            <Text className="mt-3 text-center text-base font-semibold text-text-primary dark:text-slate-100">
              {t("search_empty_title")}
            </Text>
            <Text className="mt-1 text-center text-sm text-text-secondary dark:text-slate-400">
              {t("search_empty_description")}
            </Text>
          </View>
        ) : (
          <FlatList
            testID="qa-sms-message-list"
            data={visibleMessages}
            renderItem={renderItem}
            keyExtractor={getMessageKey}
            extraData={selectedIds}
            showsVerticalScrollIndicator={false}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            updateCellsBatchingPeriod={50}
            windowSize={5}
            removeClippedSubviews
          />
        )}
      </View>

      <QaSmsStickyFooter
        testID="qa-sms-selection-footer"
        bottomInset={bottomInset}
        className="flex-row items-center border-t border-slate-200 bg-background px-5 pt-3 dark:border-slate-800 dark:bg-background-dark"
      >
        {isLoading ? (
          <>
            <Skeleton width="28%" height={18} />
            <View className="ms-4 flex-1" testID="qa-sms-loading-footer-action">
              <Skeleton width="100%" height={48} borderRadius={8} />
            </View>
          </>
        ) : (
          <>
            <Text className="me-4 text-base font-semibold text-text-primary dark:text-slate-100">
              {t("selected_count", { count: selectedIds.length })}
            </Text>
            <TouchableOpacity
              testID="qa-sms-sanitize-selected"
              disabled={selectedIds.length === 0}
              className={`min-h-12 flex-1 items-center justify-center rounded-lg ${
                selectedIds.length === 0
                  ? "bg-slate-200 dark:bg-slate-800"
                  : "bg-nileGreen-600"
              }`}
              onPress={onSanitize}
            >
              <Text className="text-base font-semibold text-white">
                {t("sanitize_selected")}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </QaSmsStickyFooter>
      <SelectionFilterSheet
        visible={isFilterOpen}
        currency={currencyFilter}
        selection={selectionFilter}
        bottomInset={bottomInset}
        onCancel={() => setFilterOpen(false)}
        onApply={(filters) => {
          setCurrencyFilter(filters.currency);
          setSelectionFilter(filters.selection);
          setFilterOpen(false);
        }}
      />
    </View>
  );
}

export type { QaSmsMessageListProps };
