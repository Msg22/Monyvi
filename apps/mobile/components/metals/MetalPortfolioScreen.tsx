import { Skeleton } from "@/components/ui/Skeleton";
import { palette } from "@/constants/colors";
import { getTabContentBottomClearance } from "@/constants/ui";
import type { MetalPortfolioSectionReadiness } from "@/hooks/metal-portfolio-readiness";
import type { CurrencyType } from "@monyvi/db";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import type {
  MetalPortfolioFilter,
  MetalPortfolioHoldingInput,
  MetalPortfolioReadModel,
} from "@/services/metal-portfolio-read-model-service";
import { HoldingSeparator, MetalHoldingRow } from "./MetalPortfolioHoldingRow";
import {
  getPortfolioRateAccessibilityCopy,
  type PortfolioRateTrustState,
} from "./portfolio-rate-presentation";
import {
  formatCodeAmount,
  formatShortDate,
  getForwardChevronName,
  getPerformanceTextClass,
  getSoldResultLabelKey,
  parseOptionalNumber,
  parseShare,
  resolveLocale,
} from "./portfolio-presentation";

interface MetalPortfolioScreenProps {
  readonly bottomInset?: number;
  readonly currency: CurrencyType;
  readonly error: Error | null;
  readonly isLoading: boolean;
  readonly isOffline: boolean;
  readonly onFilterChange: (filter: MetalPortfolioFilter) => void;
  readonly onHistoryPress: () => void;
  readonly onHoldingPress: (holdingId: string) => void;
  readonly onRetry: () => void;
  readonly portfolio: MetalPortfolioReadModel | null;
  readonly rateProviderObservedAt?: Date | null;
  readonly readiness?: MetalPortfolioSectionReadiness;
  readonly recentHistory?: MetalPortfolioReadModel["recentHistory"] | null;
  readonly selectedFilter: MetalPortfolioFilter;
}

const FILTERS: readonly MetalPortfolioFilter[] = ["ALL", "GOLD", "SILVER"];

export function MetalPortfolioScreen({
  bottomInset = 0,
  currency,
  error,
  isLoading,
  isOffline,
  onFilterChange,
  onHistoryPress,
  onHoldingPress,
  onRetry,
  portfolio,
  rateProviderObservedAt = null,
  readiness,
  recentHistory,
  selectedFilter,
}: MetalPortfolioScreenProps): React.JSX.Element {
  const { t: tCommon } = useTranslation("common");
  const sectionReadiness =
    readiness ??
    createLegacyReadiness({
      isLoading,
      portfolio,
    });
  const displayedHoldings =
    sectionReadiness.holdings && portfolio !== null ? portfolio.holdings : [];
  const displayedHistory =
    recentHistory ??
    (sectionReadiness.recentHistory && portfolio !== null
      ? portfolio.recentHistory
      : null);

  return (
    <View
      testID="metal-portfolio-root"
      className="flex-1 bg-background dark:bg-background-dark"
    >
      <FlatList
        testID="metal-portfolio-list"
        data={displayedHoldings}
        keyExtractor={(holding): string => holding.id}
        renderItem={({ item }): React.JSX.Element => (
          <MetalHoldingRow
            currency={currency}
            holding={item}
            isRateCurrencyReady={sectionReadiness.rateCurrency}
            onPress={(): void => onHoldingPress(item.id)}
          />
        )}
        ItemSeparatorComponent={HoldingSeparator}
        contentContainerClassName="px-5 pt-2"
        contentContainerStyle={{
          paddingBottom: getTabContentBottomClearance(bottomInset),
        }}
        ListHeaderComponent={
          <PortfolioHeader
            currency={currency}
            error={error}
            isOffline={isOffline}
            onFilterChange={onFilterChange}
            onRetry={onRetry}
            portfolio={portfolio}
            rateProviderObservedAt={rateProviderObservedAt}
            readiness={sectionReadiness}
            selectedFilter={selectedFilter}
          />
        }
        ListEmptyComponent={
          sectionReadiness.holdings ? (
            portfolio === null ? null : (
              <EmptyPortfolioContent
                portfolio={portfolio}
                selectedFilter={selectedFilter}
              />
            )
          ) : (
            <HoldingsSectionSkeleton />
          )
        }
        ListFooterComponent={
          sectionReadiness.recentHistory ? (
            displayedHistory === null || displayedHistory.length === 0 ? null : (
              <RecentHistory
                currency={currency}
                holdings={displayedHistory}
                onHistoryPress={onHistoryPress}
                onHoldingPress={onHoldingPress}
                realizedSaleReady={sectionReadiness.realizedSale}
              />
            )
          ) : (
            <RecentHistorySkeleton />
          )
        }
        showsVerticalScrollIndicator={false}
      />
      {!sectionReadiness.summary &&
      !sectionReadiness.holdings &&
      !sectionReadiness.recentHistory &&
      error !== null ? (
        <View className="absolute inset-x-5 top-4">
          <ErrorState error={error} onRetry={onRetry} t={tCommon} />
        </View>
      ) : null}
    </View>
  );
}

function createLegacyReadiness({
  isLoading,
  portfolio,
}: {
  readonly isLoading: boolean;
  readonly portfolio: MetalPortfolioReadModel | null;
}): MetalPortfolioSectionReadiness {
  const ready = !isLoading && portfolio !== null;
  return {
    holdings: ready,
    rateCurrency: ready,
    recentHistory: ready,
    realizedSale: ready,
    summary: ready,
  };
}

function SummarySkeleton(): React.JSX.Element {
  return (
    <View testID="metal-portfolio-summary-skeleton" className="pt-3">
      <Skeleton width="58%" height={24} borderRadius={8} />
      <View className="mt-5 flex-row justify-between gap-5">
        <View className="flex-1 gap-3">
          <Skeleton width="100%" height={48} borderRadius={12} />
          <Skeleton width="70%" height={18} borderRadius={8} />
        </View>
        <View className="w-36 gap-3">
          <Skeleton width="100%" height={34} borderRadius={10} />
          <Skeleton width="90%" height={18} borderRadius={8} />
        </View>
      </View>
      <View className="mt-6 h-px bg-slate-200 dark:bg-slate-800" />
      <View className="mt-6 gap-4">
        <Skeleton width="100%" height={12} borderRadius={6} />
        <Skeleton width="72%" height={20} borderRadius={8} />
      </View>
    </View>
  );
}

function HoldingsSectionSkeleton(): React.JSX.Element {
  return (
    <View testID="metal-portfolio-holdings-skeleton" className="mt-6 gap-3">
      <Skeleton width="30%" height={26} borderRadius={8} />
      <Skeleton width="100%" height={112} borderRadius={18} />
      <Skeleton width="100%" height={112} borderRadius={18} />
    </View>
  );
}

function RecentHistorySkeleton(): React.JSX.Element {
  return (
    <View
      testID="metal-portfolio-history-skeleton"
      className="mt-5 border-t border-slate-200 pb-2 pt-4 dark:border-slate-800"
    >
      <Skeleton width="28%" height={26} borderRadius={8} />
      <View className="mt-4 gap-3">
        <Skeleton width="100%" height={50} borderRadius={12} />
        <Skeleton width="100%" height={50} borderRadius={12} />
      </View>
    </View>
  );
}

function PortfolioHeader({
  currency,
  error,
  isOffline,
  onFilterChange,
  onRetry,
  portfolio,
  rateProviderObservedAt,
  readiness,
  selectedFilter,
}: {
  readonly currency: CurrencyType;
  readonly error: Error | null;
  readonly isOffline: boolean;
  readonly onFilterChange: (filter: MetalPortfolioFilter) => void;
  readonly onRetry: () => void;
  readonly portfolio: MetalPortfolioReadModel | null;
  readonly rateProviderObservedAt: Date | null;
  readonly readiness: MetalPortfolioSectionReadiness;
  readonly selectedFilter: MetalPortfolioFilter;
}): React.JSX.Element {
  const { t } = useTranslation("metals");
  const { t: tCommon } = useTranslation("common");
  return (
    <>
      {readiness.summary && portfolio !== null ? (
        <PortfolioSummary
          currency={currency}
          portfolio={portfolio}
          rateProviderObservedAt={rateProviderObservedAt}
          realizedSaleReady={readiness.realizedSale}
        />
      ) : (
        <SummarySkeleton />
      )}
      {readiness.holdings && portfolio !== null ? (
        <>
          <FilterBar
            activeHoldings={portfolio.activeHoldings}
            selectedFilter={selectedFilter}
            onFilterChange={onFilterChange}
          />
          {portfolio.listState === "POPULATED" ? <HoldingsHeader /> : null}
        </>
      ) : null}
      {isOffline ? (
        <Text className="mt-3 text-xs text-text-secondary dark:text-text-secondary-dark">
          {t("offline_mode")}
        </Text>
      ) : null}
      {error !== null &&
      (readiness.summary || readiness.holdings || readiness.recentHistory) ? (
        <ErrorState error={error} onRetry={onRetry} t={tCommon} />
      ) : null}
    </>
  );
}

function PortfolioSummary({
  currency,
  portfolio,
  rateProviderObservedAt,
  realizedSaleReady,
}: {
  readonly currency: CurrencyType;
  readonly portfolio: MetalPortfolioReadModel;
  readonly rateProviderObservedAt: Date | null;
  readonly realizedSaleReady: boolean;
}): React.JSX.Element {
  const { t, i18n } = useTranslation("metals");
  const locale = resolveLocale(i18n?.resolvedLanguage);
  const holdingCount = portfolio.activeHoldings.length;
  const performanceValue = parseOptionalNumber(
    portfolio.currentPerformanceDecimal
  );
  const realizedProfitLoss = portfolio.soldResultDecimal;
  const performanceUnavailable =
    portfolio.currentPerformanceDecimal === null &&
    portfolio.activeTotalDecimal !== null;
  const rateAccessibilityCopy = getPortfolioRateAccessibilityCopy(
    portfolio.rateStatus.state,
    rateProviderObservedAt,
    i18n?.resolvedLanguage
  );

  return (
    <View className="pt-3">
      <Text className="text-base font-medium text-nileGreen-700 dark:text-nileGreen-400">
        {t("portfolio.active_portfolio")}
      </Text>
      <View className="mt-4 flex-row items-start justify-between gap-5">
        <View
          accessible
          accessibilityLabel={t("portfolio.total_accessibility", {
            amount: formatCodeAmount(
              portfolio.activeTotalDecimal,
              currency,
              locale
            ),
            status: t(
              rateAccessibilityCopy.key,
              rateAccessibilityCopy.values
            ),
          })}
          className="min-w-0 flex-1"
        >
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.72}
            className="text-[36px] font-medium leading-[44px] text-text-primary dark:text-text-primary-dark"
          >
            {formatCodeAmount(portfolio.activeTotalDecimal, currency, locale)}
          </Text>
          <Text className="mt-1 text-base text-text-secondary dark:text-text-secondary-dark">
            {t("portfolio.active_portfolio_value")}
          </Text>
        </View>
        <View className="w-[156px] pt-1">
          <View className="flex-row items-baseline gap-2">
            <Text className="text-[28px] font-medium text-text-primary dark:text-text-primary-dark">
              {holdingCount}
            </Text>
            <Text className="min-w-0 flex-1 text-sm text-text-secondary dark:text-text-secondary-dark">
              {t("portfolio.active_holdings", { count: holdingCount })}
            </Text>
          </View>
          {portfolio.currentPerformanceDecimal === null ? (
            <Text className="mt-3 text-sm text-text-secondary dark:text-text-secondary-dark">
              {performanceUnavailable
                ? t(
                    portfolio.currentPerformanceUnavailableReason ===
                      "rate_reference"
                      ? "portfolio.performance_unavailable_rate_reference"
                      : "portfolio.performance_unavailable"
                  )
                : t("portfolio.current_value_unavailable", {
                    reason: t(`rate.${portfolio.rateStatus.state}`),
                  })}
            </Text>
          ) : (
            <>
              <Text
                numberOfLines={1}
                className={`mt-3 text-sm font-medium ${getPerformanceTextClass(
                  performanceValue
                )}`}
              >
                {formatCodeAmount(
                  portfolio.currentPerformanceDecimal,
                  currency,
                  locale,
                  true
                )}
              </Text>
              <Text className="mt-1 text-xs text-text-secondary dark:text-text-secondary-dark">
                {t("portfolio.since_purchase_label")}
              </Text>
            </>
          )}
        </View>
      </View>
      {!realizedSaleReady ? (
        <View
          testID="metal-portfolio-realized-sale-skeleton"
          className="mt-7 flex-row gap-2"
        >
          <Skeleton width={120} height={20} borderRadius={8} />
          <Skeleton width="40%" height={16} borderRadius={8} />
        </View>
      ) : realizedProfitLoss === null ? null : (
        <View className="mt-7 flex-row flex-wrap items-baseline gap-x-2 gap-y-1">
          <Text className="text-base font-medium text-text-primary dark:text-text-primary-dark">
            {formatCodeAmount(realizedProfitLoss, currency, locale)}
          </Text>
          <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">
            {t(getSoldResultLabelKey(realizedProfitLoss, "summary"))}
          </Text>
        </View>
      )}
      <View className="mt-6 h-px bg-slate-200 dark:bg-slate-800" />
      <AllocationBar allocation={portfolio.allocation} />
      {holdingCount === 0 ? null : (
        <RateStatus
          providerObservedAt={rateProviderObservedAt}
          state={portfolio.rateStatus.state}
        />
      )}
    </View>
  );
}

function AllocationBar({
  allocation,
}: {
  readonly allocation: MetalPortfolioReadModel["allocation"];
}): React.JSX.Element | null {
  const { t } = useTranslation("metals");
  const goldShare = parseShare(allocation.gold);
  const silverShare = parseShare(allocation.silver);
  if (!(goldShare > 0 && silverShare > 0)) return null;
  return (
    <View testID="metal-portfolio-allocation" className="mt-6">
      <View className="h-3 flex-row overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <View
          testID="metal-portfolio-allocation-gold"
          className="h-full rounded-l-full bg-gold-600"
          style={{ width: `${goldShare}%` }}
        />
        <View
          testID="metal-portfolio-allocation-silver"
          className="h-full rounded-r-full bg-silver-500"
          style={{ width: `${silverShare}%` }}
        />
      </View>
      <View
        testID="metal-portfolio-allocation-legend"
        className="mt-5 flex-row items-center justify-between"
      >
        <AllocationLegend
          dotClassName="bg-gold-600"
          label={t("gold")}
          share={allocation.gold}
        />
        <AllocationLegend
          dotClassName="bg-silver-500"
          label={t("silver")}
          share={allocation.silver}
        />
      </View>
    </View>
  );
}

function AllocationLegend({
  dotClassName,
  label,
  share,
}: {
  readonly dotClassName: string;
  readonly label: string;
  readonly share: string | null;
}): React.JSX.Element {
  return (
    <View className="flex-row items-center gap-2">
      <View className={`h-3 w-3 rounded-full ${dotClassName}`} />
      <Text className="text-sm font-medium text-text-primary dark:text-text-primary-dark">
        {label}{" "}
        <Text className="font-normal text-text-secondary dark:text-text-secondary-dark">
          {share === null ? "—" : `${share}%`}
        </Text>
      </Text>
    </View>
  );
}

function RateStatus({
  providerObservedAt,
  state,
}: {
  readonly providerObservedAt: Date | null;
  readonly state: PortfolioRateTrustState;
}): React.JSX.Element {
  const { t, i18n } = useTranslation("metals");
  const copy = getPortfolioRateAccessibilityCopy(
    state,
    providerObservedAt,
    i18n?.resolvedLanguage
  );
  const label = t(copy.key, copy.values);
  return (
    <View className="mt-7 flex-row items-start gap-2">
      <Ionicons name="time-outline" size={20} color={palette.nileGreen[600]} />
      <Text
        testID="metal-portfolio-rate-updated"
        className="min-w-0 flex-1 text-sm leading-5 text-text-secondary dark:text-text-secondary-dark"
      >
        {label}
      </Text>
    </View>
  );
}

function FilterBar({
  activeHoldings,
  selectedFilter,
  onFilterChange,
}: {
  readonly activeHoldings: readonly MetalPortfolioHoldingInput[];
  readonly selectedFilter: MetalPortfolioFilter;
  readonly onFilterChange: (filter: MetalPortfolioFilter) => void;
}): React.JSX.Element {
  const { t } = useTranslation("metals");
  return (
    <View
      accessibilityRole="tablist"
      className="mt-8 flex-row overflow-hidden rounded-xl border border-slate-300 bg-surface dark:border-slate-700 dark:bg-slate-900"
    >
      {FILTERS.map((filter, index) => {
        const isSelected = filter === selectedFilter;
        const count = activeHoldings.filter(
          (holding) => filter === "ALL" || holding.metalType === filter
        ).length;
        const label = t(`portfolio.filter.${filter.toLowerCase()}`);
        const hasDivider = index < FILTERS.length - 1;
        const selectedBorderRadius =
          index === 0
            ? "rounded-l-[11px]"
            : index === FILTERS.length - 1
              ? "rounded-r-[11px]"
              : "";
        return (
          <Pressable
            key={filter}
            accessible
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={t("portfolio.filter_accessibility", {
              filterName: label,
              selectedState: isSelected
                ? t("portfolio.selected")
                : t("portfolio.not_selected"),
              count,
            })}
            className={`relative min-h-11 flex-1 items-center justify-center ${
              isSelected ? "z-10" : "z-0"
            } ${
              hasDivider
                ? "border-r border-slate-300 dark:border-slate-700"
                : ""
            }`}
            onPress={(): void => onFilterChange(filter)}
            testID={`metal-portfolio-filter-${filter}`}
          >
            {isSelected ? (
              <View
                pointerEvents="none"
                testID={`metal-portfolio-filter-border-${filter}`}
                className={`absolute inset-0 border border-nileGreen-600 dark:border-nileGreen-500 ${selectedBorderRadius}`}
              />
            ) : null}
            <Text
              className={`text-sm font-medium ${
                isSelected
                  ? "text-nileGreen-700 dark:text-nileGreen-400"
                  : "text-text-secondary dark:text-text-secondary-dark"
              }`}
            >
              {label}{" "}
              <Text className={isSelected ? "font-bold" : "font-normal"}>
                {count}
              </Text>
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function HoldingsHeader(): React.JSX.Element {
  const { t } = useTranslation("metals");
  return (
    <Text className="mb-3 mt-6 text-xl font-medium text-text-primary dark:text-text-primary-dark">
      {t("portfolio.holdings")}
    </Text>
  );
}

function EmptyPortfolioContent({
  portfolio,
  selectedFilter,
}: {
  readonly portfolio: MetalPortfolioReadModel;
  readonly selectedFilter: MetalPortfolioFilter;
}): React.JSX.Element {
  const { t } = useTranslation("metals");
  if (portfolio.listState === "PORTFOLIO_EMPTY") {
    return (
      <View className="items-center py-10">
        <Text className="text-base font-semibold text-text-primary dark:text-text-primary-dark">
          {t("start_tracking_metals")}
        </Text>
        <Text className="mt-2 text-center text-sm text-text-secondary dark:text-text-secondary-dark">
          {t("empty_metals_description")}
        </Text>
      </View>
    );
  }
  return (
    <View className="items-center py-10">
      <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">
        {t("portfolio.filter_empty", {
          filter: t(`portfolio.filter.${selectedFilter.toLowerCase()}`),
        })}
      </Text>
    </View>
  );
}

function RecentHistory({
  currency,
  holdings,
  onHistoryPress,
  onHoldingPress,
  realizedSaleReady,
}: {
  readonly currency: CurrencyType;
  readonly holdings: readonly MetalPortfolioHoldingInput[];
  readonly onHistoryPress: () => void;
  readonly onHoldingPress: (holdingId: string) => void;
  readonly realizedSaleReady: boolean;
}): React.JSX.Element {
  const { t, i18n } = useTranslation("metals");
  const locale = resolveLocale(i18n?.resolvedLanguage);
  return (
    <View className="mt-5 border-t border-slate-200 pb-2 pt-4 dark:border-slate-800">
      <View className="flex-row items-center justify-between">
        <Text className="text-xl font-medium text-text-primary dark:text-text-primary-dark">
          {t("portfolio.recent_history")}
        </Text>
        <Pressable
          accessible
          accessibilityLabel={t("portfolio.view_all")}
          accessibilityRole="button"
          className="flex-row items-center gap-1"
          onPress={onHistoryPress}
          testID="metal-portfolio-view-all"
        >
          <Text className="text-sm font-medium text-nileGreen-700 dark:text-nileGreen-400">
            {t("portfolio.view_all")}
          </Text>
          <Ionicons
            name={getForwardChevronName()}
            size={18}
            color={palette.nileGreen[600]}
          />
        </Pressable>
      </View>
      {holdings.map((holding) => {
        const isSold = holding.status === "sold";
        return (
          <Pressable
            key={holding.id}
            accessible
            accessibilityLabel={`${t(`status.${holding.status}`)}. ${holding.name}`}
            accessibilityRole="button"
            className="mt-4 flex-row items-center gap-3"
            onPress={(): void => onHoldingPress(holding.id)}
            testID={`metal-portfolio-history-${holding.id}`}
          >
            <View className="h-11 w-11 items-center justify-center rounded-xl bg-nileGreen-50 dark:bg-nileGreen-900">
              <Ionicons
                name="trending-up-outline"
                size={22}
                color={palette.nileGreen[600]}
              />
            </View>
            <View className="min-w-0 flex-1">
              <Text
                numberOfLines={1}
                className="text-sm font-medium text-text-primary dark:text-text-primary-dark"
              >
                {t(`status.${holding.status}`)} · {holding.name}
              </Text>
              <Text className="mt-1 text-xs text-text-secondary dark:text-text-secondary-dark">
                {formatShortDate(holding.occurredAt, locale)}
              </Text>
            </View>
            <View className="max-w-[180px] flex-row items-center gap-2">
              {isSold && !realizedSaleReady ? (
                <View
                  testID={`metal-portfolio-history-result-pending-${holding.id}`}
                  className="items-end"
                >
                  <Skeleton width={120} height={16} borderRadius={8} />
                </View>
              ) : isSold && holding.soldResultDecimal !== null ? (
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  className="text-right text-xs text-text-secondary dark:text-text-secondary-dark"
                >
                  {t(
                    getSoldResultLabelKey(holding.soldResultDecimal, "history")
                  )}{" "}
                  ·{" "}
                  <Text className="font-medium text-text-primary dark:text-text-primary-dark">
                    {formatCodeAmount(
                      holding.soldResultDecimal,
                      currency,
                      locale
                    )}
                  </Text>
                </Text>
              ) : null}
              <Ionicons
                name={getForwardChevronName()}
                size={18}
                color={palette.slate[500]}
              />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function ErrorState({
  error,
  onRetry,
  t,
}: {
  readonly error: Error | null;
  readonly onRetry: () => void;
  readonly t: (key: string) => string;
}): React.JSX.Element | null {
  if (error === null) return null;
  return (
    <View className="items-center py-5">
      <Text className="text-center text-sm text-text-secondary dark:text-text-secondary-dark">
        {t("error_generic")}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("retry")}
        className="mt-3 min-h-11 items-center justify-center rounded-xl border border-nileGreen-500 px-4"
        onPress={onRetry}
      >
        <Text className="text-sm font-semibold text-nileGreen-600 dark:text-nileGreen-400">
          {t("retry")}
        </Text>
      </Pressable>
    </View>
  );
}

