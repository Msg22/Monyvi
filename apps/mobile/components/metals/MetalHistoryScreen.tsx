import { Ionicons } from "@expo/vector-icons";
import {
  FlatList,
  I18nManager,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  formatCanonicalDecimalForDisplay,
  resolvePuritySelection,
} from "@monyvi/logic";

import { MetalHoldingRender } from "@/components/metals/MetalHoldingRender";
import { resolveCurrencyDisplayDecimalPlaces } from "@/components/metals/portfolio-presentation";
import { Skeleton } from "@/components/ui/Skeleton";
import { palette } from "@/constants/colors";
import { shouldUseCompactLayout } from "@/constants/ui";
import { useTheme } from "@/context/ThemeContext";
import type {
  MetalHistoryCounts,
  MetalHistoryFilter,
  MetalHistoryItem,
  MetalHistoryReadModel,
} from "@/services/metal-history-read-model-service";

interface MetalHistoryScreenProps {
  readonly error: Error | null;
  readonly history: MetalHistoryReadModel;
  readonly isLoading: boolean;
  readonly isOffline: boolean;
  /**
   * True while rows for a newly selected filter are loading. The shell stays
   * mounted and only the list body shows a skeleton.
   */
  readonly isReplacingRows: boolean;
  readonly loadMore: () => void;
  readonly onFilterChange: (filter: MetalHistoryFilter) => void;
  readonly onOpenHolding: (holdingId: string) => void;
  readonly onRetry: () => void;
}

export function MetalHistoryScreen(
  props: MetalHistoryScreenProps
): React.JSX.Element {
  const { i18n, t } = useTranslation("metals");
  const insets = useSafeAreaInsets();
  const locale = resolveLocale(i18n.resolvedLanguage);

  if (props.isLoading) {
    return (
      <View
        testID="metal-history-loading"
        className="flex-1 gap-3 bg-background p-5 dark:bg-background-dark"
      >
        <Skeleton width="100%" height={44} borderRadius={12} />
        <Skeleton width="100%" height={120} borderRadius={16} />
      </View>
    );
  }

  return (
    <FlatList
      testID="metal-history-root"
      className="flex-1 bg-background dark:bg-background-dark"
      data={props.history.items}
      keyExtractor={(item) => item.holdingId}
      contentContainerClassName="px-5 pt-2"
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      onEndReached={props.history.hasMore ? props.loadMore : undefined}
      onEndReachedThreshold={0.4}
      ListHeaderComponent={
        <View className="pb-2">
          <Text className="text-base text-text-secondary dark:text-text-secondary-dark">
            {t("history.subtitle")}
          </Text>
          {props.isOffline ? (
            <Text className="mt-3 text-sm text-text-muted dark:text-text-muted-dark">
              {t("history.offline")}
            </Text>
          ) : null}
          <View className="mt-5">
            <FilterBar
              counts={props.history.counts}
              filter={props.history.filter}
              onFilterChange={props.onFilterChange}
            />
          </View>
          {props.error !== null ? <Retry onRetry={props.onRetry} /> : null}
        </View>
      }
      renderItem={({ item }) => (
        <HistoryRow
          item={item}
          locale={locale}
          onPress={() => props.onOpenHolding(item.holdingId)}
        />
      )}
      ListEmptyComponent={
        props.isReplacingRows ? (
          <HistoryListSkeleton />
        ) : (
          <Text className="py-12 text-center text-base text-text-secondary dark:text-text-secondary-dark">
            {props.error !== null
              ? t("history.load_error")
              : t("history.empty")}
          </Text>
        )
      }
      showsVerticalScrollIndicator={false}
    />
  );
}

function HistoryListSkeleton(): React.JSX.Element {
  return (
    <View testID="metal-history-list-skeleton" className="gap-3 pt-2">
      <Skeleton width="100%" height={84} borderRadius={16} />
      <Skeleton width="100%" height={84} borderRadius={16} />
      <Skeleton width="100%" height={84} borderRadius={16} />
    </View>
  );
}

function HistoryRow({
  item,
  locale,
  onPress,
}: {
  readonly item: MetalHistoryItem;
  readonly locale: string;
  readonly onPress: () => void;
}): React.JSX.Element {
  const { t } = useTranslation("metals");
  const { isDark } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const isCompact = shouldUseCompactLayout(width, fontScale);
  const metalLabel = t(
    item.metalType === "GOLD" ? "metal.gold" : "metal.silver"
  );
  const formLabel = t(
    item.itemForm === null ? "form.unknown" : `form.${item.itemForm}`
  );
  const purityLabel = resolvePurityLabel(item, t);
  const metadata = [metalLabel, purityLabel, formLabel].join(" · ");
  const dateLabel = formatHistoryDate(item.occurredAt, locale);
  const statusLabel = t(`status.${item.status}`);
  const terminalSummary = getTerminalSummary(item, locale, t);
  const accessibilityLabel = [
    statusLabel,
    item.name,
    metadata,
    dateLabel,
    terminalSummary.label,
    terminalSummary.value,
  ].join(". ");

  return (
    <Pressable
      testID={`metal-history-item-${item.status}`}
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className="mb-3 flex-row items-center gap-3 rounded-2xl border border-slate-200 bg-surface p-4 dark:border-slate-700 dark:bg-slate-900"
      onPress={onPress}
    >
      <MetalHoldingRender itemForm={item.itemForm} metalType={item.metalType} />
      <View
        testID={`metal-history-item-content-${item.status}`}
        className={`min-w-0 flex-1 gap-3 ${isCompact ? "flex-col" : "flex-row items-center justify-between"}`}
      >
        <View className="min-w-0 flex-1">
          <Text
            testID={`metal-history-status-${item.status}`}
            className={`text-sm ${item.status === "sold" ? "text-nileGreen-700 dark:text-nileGreen-400" : "text-text-secondary dark:text-text-secondary-dark"}`}
          >
            {statusLabel}
          </Text>
          <Text className="mt-0.5 text-lg font-semibold text-text-primary dark:text-text-primary-dark">
            {item.name}
          </Text>
          <Text className="mt-0.5 text-sm text-text-secondary dark:text-text-secondary-dark">
            {metadata}
          </Text>
          <View className="mt-1 flex-row items-center gap-1">
            <Ionicons
              testID={`metal-history-calendar-${item.status}`}
              accessibilityElementsHidden
              importantForAccessibility="no"
              color={palette.nileGreen[600]}
              name="calendar-clear-outline"
              size={16}
            />
            <Text className="text-sm text-text-muted dark:text-text-muted-dark">
              {dateLabel}
            </Text>
          </View>
        </View>
        <View
          testID={`metal-history-terminal-summary-${item.status}`}
          className={isCompact ? "items-start" : "max-w-[40%] items-end"}
        >
          <Text
            className={`text-sm ${item.status === "sold" ? "text-nileGreen-700 dark:text-nileGreen-400" : "text-text-primary dark:text-text-primary-dark"}`}
          >
            {terminalSummary.label}
          </Text>
          <Text
            className={`mt-0.5 text-sm ${item.status === "sold" ? "font-medium text-nileGreen-700 dark:text-nileGreen-400" : "text-text-secondary dark:text-text-secondary-dark"}`}
            style={
              item.status === "sold" ? { writingDirection: "ltr" } : undefined
            }
          >
            {terminalSummary.value}
          </Text>
        </View>
      </View>
      <Ionicons
        accessibilityElementsHidden
        importantForAccessibility="no"
        color={isDark ? palette.slate[300] : palette.slate[500]}
        name={I18nManager.isRTL ? "chevron-back" : "chevron-forward"}
        size={20}
      />
    </Pressable>
  );
}

function getTerminalSummary(
  item: MetalHistoryItem,
  locale: string,
  t: (key: string) => string
): { readonly label: string; readonly value: string } {
  const facts = item.terminalFacts;
  if (facts === null || facts.kind !== item.status) {
    return {
      label: t("history.terminal_facts_unavailable"),
      value: "",
    };
  }
  if (facts.kind === "sold") {
    return {
      label: t("history.net_proceeds"),
      value: displayTerminalAmount(
        facts.netProceedsDecimal,
        facts.proceedsCurrency,
        locale,
        t("history.terminal_facts_unavailable")
      ),
    };
  }
  return {
    label: disposalReasonLabel(facts.reason, facts.treatment, t),
    value: t("history.no_sale_proceeds"),
  };
}

function displayTerminalAmount(
  value: string,
  currency: string,
  locale: string,
  unavailableCopy: string
): string {
  try {
    const decimalPlaces = resolveCurrencyDisplayDecimalPlaces(currency);
    return `${currency} ${formatCanonicalDecimalForDisplay(value, {
      locale,
      maximumFractionDigits: decimalPlaces,
      minimumFractionDigits: decimalPlaces,
    })}`;
  } catch {
    return unavailableCopy;
  }
}

function disposalReasonLabel(
  reason:
    | "lost_or_stolen"
    | "destroyed_or_damaged"
    | "given_away"
    | "donated"
    | "other",
  treatment: "write_off" | "external_transfer",
  t: (key: string) => string
): string {
  if (reason !== "other") return t(`disposal.reason_${reason}`);
  return `${t("disposal.reason_other")} · ${t(
    `disposal.treatment_${treatment}`
  )}`;
}

function FilterBar({
  counts,
  filter,
  onFilterChange,
}: {
  readonly counts: MetalHistoryCounts;
  readonly filter: MetalHistoryFilter;
  readonly onFilterChange: (filter: MetalHistoryFilter) => void;
}): React.JSX.Element {
  const { t } = useTranslation("metals");
  const filters: readonly MetalHistoryFilter[] = ["all", "sold", "disposed"];

  return (
    <View
      accessibilityRole="tablist"
      className="flex-row overflow-hidden rounded-xl border border-slate-300 bg-surface dark:border-slate-700 dark:bg-slate-900"
    >
      {filters.map((item, index) => {
        const isSelected = filter === item;
        const hasDivider = index < filters.length - 1;
        const count = counts[item];
        const label = t(`history.${item}`);

        return (
          <Pressable
            key={item}
            testID={`metal-history-filter-${item}`}
            accessibilityLabel={t("history.filter_accessibility", {
              count,
              label,
            })}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            className={`min-h-11 flex-1 items-center justify-center ${
              hasDivider
                ? "border-r border-slate-300 dark:border-slate-700"
                : ""
            } ${isSelected ? "bg-nileGreen-50 dark:bg-slate-800" : ""}`}
            onPress={() => onFilterChange(item)}
          >
            <Text
              className={
                isSelected
                  ? "font-semibold text-nileGreen-700 dark:text-nileGreen-400"
                  : "text-text-secondary dark:text-text-secondary-dark"
              }
            >
              {label} {count}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Retry({
  onRetry,
}: {
  readonly onRetry: () => void;
}): React.JSX.Element {
  const { t } = useTranslation("metals");
  return (
    <Pressable
      accessibilityRole="button"
      className="mt-4 min-h-11 items-center justify-center rounded-xl border border-nileGreen-500"
      onPress={onRetry}
    >
      <Text className="font-semibold text-nileGreen-700 dark:text-nileGreen-400">
        {t("history.retry")}
      </Text>
    </Pressable>
  );
}

function resolvePurityLabel(
  item: MetalHistoryItem,
  t: (key: string) => string
): string {
  if (
    item.purityCatalogVersion !== "1" ||
    item.purityCode === null ||
    item.purityFactorDecimal === null
  ) {
    return "—";
  }
  const purity = resolvePuritySelection(item.metalType, item.purityCode);
  if (
    !purity.available ||
    purity.entry.factorDecimal !== item.purityFactorDecimal
  ) {
    return "—";
  }
  return t(purity.entry.labelKey);
}

function resolveLocale(language: string | undefined): string {
  return language?.startsWith("ar") ? "ar-EG-u-nu-latn" : "en-GB";
}

function formatHistoryDate(date: Date, locale: string): string {
  return date.toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
