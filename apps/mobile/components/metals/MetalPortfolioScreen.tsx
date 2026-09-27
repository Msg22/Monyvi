import { Skeleton } from "@/components/ui/Skeleton";
import { palette } from "@/constants/colors";
import {
  getTabContentBottomClearance,
  shouldUseCompactLayout,
} from "@/constants/ui";
import type { MetalPortfolioSectionReadiness } from "@/hooks/metal-portfolio-readiness";
import type { CurrencyType } from "@monyvi/db";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  FlatList,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";

import type {
  MetalPortfolioFilter,
  MetalPortfolioHoldingInput,
  MetalPortfolioPurityPriceTile,
  MetalPortfolioReadModel,
} from "@/services/metal-portfolio-read-model-service";
import { HoldingSeparator, MetalHoldingRow } from "./MetalPortfolioHoldingRow";
import {
  getPortfolioRateAccessibilityCopy,
  getPortfolioRateCompactLabel,
  resolvePortfolioRateCopy,
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
            displayedHistory === null ||
            displayedHistory.length === 0 ? null : (
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
      <Skeleton width="40%" height={20} borderRadius={6} />
      <View className="mt-4 flex-row justify-between gap-5">
        <View className="flex-1 gap-2">
          <Skeleton width="80%" height={38} borderRadius={10} />
          <Skeleton width="50%" height={16} borderRadius={6} />
        </View>
        <View className="w-24 items-end gap-2">
          <Skeleton width="60%" height={28} borderRadius={8} />
          <Skeleton width="90%" height={16} borderRadius={6} />
        </View>
      </View>
      <View className="mt-6">
        <Skeleton width="100%" height={9} borderRadius={999} />
        <View className="mt-3 flex-row justify-between">
          <Skeleton width="30%" height={16} borderRadius={6} />
          <Skeleton width="30%" height={16} borderRadius={6} />
        </View>
      </View>
      <View className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
        <View className="flex-row justify-between">
          <Skeleton width="35%" height={18} borderRadius={6} />
          <Skeleton width="40%" height={14} borderRadius={6} />
        </View>
        <View className="mt-3 flex-row flex-wrap justify-between gap-y-2">
          <Skeleton width="48%" height={54} borderRadius={11} />
          <Skeleton width="48%" height={54} borderRadius={11} />
          <Skeleton width="48%" height={54} borderRadius={11} />
          <Skeleton width="48%" height={54} borderRadius={11} />
        </View>
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
  onFilterChange,
  onRetry,
  portfolio,
  rateProviderObservedAt,
  readiness,
  selectedFilter,
}: {
  readonly currency: CurrencyType;
  readonly error: Error | null;
  readonly onFilterChange: (filter: MetalPortfolioFilter) => void;
  readonly onRetry: () => void;
  readonly portfolio: MetalPortfolioReadModel | null;
  readonly rateProviderObservedAt: Date | null;
  readonly readiness: MetalPortfolioSectionReadiness;
  readonly selectedFilter: MetalPortfolioFilter;
}): React.JSX.Element {
  const { t: tCommon } = useTranslation("common");
  return (
    <>
      {readiness.summary && portfolio !== null ? (
        portfolio.listState === "PORTFOLIO_EMPTY" ? null : (
          <PortfolioSummary
            currency={currency}
            portfolio={portfolio}
            rateProviderObservedAt={rateProviderObservedAt}
            realizedSaleReady={readiness.realizedSale}
          />
        )
      ) : (
        <SummarySkeleton />
      )}
      {readiness.holdings &&
      portfolio !== null &&
      portfolio.listState !== "PORTFOLIO_EMPTY" ? (
        <>
          <FilterBar
            activeHoldings={portfolio.activeHoldings}
            selectedFilter={selectedFilter}
            onFilterChange={onFilterChange}
          />
          {portfolio.listState === "POPULATED" ? <HoldingsHeader /> : null}
        </>
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
  const { fontScale, width } = useWindowDimensions();
  const isCompact = shouldUseCompactLayout(width, fontScale);
  const locale = resolveLocale(i18n?.resolvedLanguage);
  const holdingCount = portfolio.activeHoldings.length;
  const realizedProfitLoss = portfolio.soldResultDecimal;
  const rateAccessibilityCopy = getPortfolioRateAccessibilityCopy(
    portfolio.rateStatus.state,
    rateProviderObservedAt,
    i18n?.resolvedLanguage,
    new Date()
  );
  const rateAccessibilityLabel = resolvePortfolioRateCopy(
    rateAccessibilityCopy,
    t
  );

  const rateUpdatedLabel = getPortfolioRateCompactLabel(
    portfolio.rateStatus.state,
    rateProviderObservedAt,
    i18n?.resolvedLanguage,
    new Date(),
    t
  );

  return (
    <View className="pt-3">
      <Text className="text-[15px] font-semibold text-nileGreen-700 dark:text-nileGreen-400">
        {t("portfolio.active_portfolio")}
      </Text>
      <View
        testID="metal-portfolio-summary-layout"
        className={`mt-3 items-start gap-5 ${
          isCompact ? "flex-col" : "flex-row justify-between"
        }`}
      >
        <View
          accessible
          accessibilityLabel={t("portfolio.total_accessibility", {
            amount: formatCodeAmount(
              portfolio.activeTotalDecimal,
              currency,
              locale
            ),
            status: rateAccessibilityLabel,
          })}
          className="min-w-0 flex-1"
        >
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.72}
            className="text-[32px] font-bold leading-[38px] text-text-primary dark:text-text-primary-dark"
          >
            {formatCodeAmount(portfolio.activeTotalDecimal, currency, locale)}
          </Text>
          <Text className="mt-1 text-xs text-text-secondary dark:text-text-secondary-dark">
            {t("portfolio.active_portfolio_value")}
          </Text>
        </View>
        <View className={isCompact ? "w-full" : "w-[156px] pt-1"}>
          <View className="flex-row items-baseline gap-1.5">
            <Text className="text-[22px] font-bold text-text-primary dark:text-text-primary-dark">
              {holdingCount}
            </Text>
            <Text className="min-w-0 flex-1 text-xs text-text-secondary dark:text-text-secondary-dark">
              {t(
                holdingCount === 1
                  ? "portfolio.active_holdings_one"
                  : "portfolio.active_holdings_other",
                { count: holdingCount }
              )}
            </Text>
          </View>
          {holdingCount === 0 ? null : (
            <PerformanceMetric
              currency={currency}
              locale={locale}
              portfolio={portfolio}
            />
          )}
        </View>
      </View>
      {!realizedSaleReady ? (
        <View
          testID="metal-portfolio-realized-sale-skeleton"
          className="mt-6 flex-row gap-2"
        >
          <Skeleton width={120} height={20} borderRadius={8} />
          <Skeleton width="40%" height={16} borderRadius={8} />
        </View>
      ) : realizedProfitLoss === null ? (
        portfolio.soldResultUnavailable ? (
          <Text className="mt-6 text-sm text-text-secondary dark:text-text-secondary-dark">
            {t("portfolio.sold_result_unavailable")}
          </Text>
        ) : null
      ) : (
        <View className="mt-6 flex-row flex-wrap items-baseline gap-x-2 gap-y-1">
          <Text className="text-base font-medium text-text-primary dark:text-text-primary-dark">
            {formatCodeAmount(realizedProfitLoss, currency, locale)}
          </Text>
          <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">
            {t(getSoldResultLabelKey(realizedProfitLoss, "summary"))}
          </Text>
        </View>
      )}
      <AllocationBar allocation={portfolio.allocation} />
      <PricesPerGramSection
        currency={currency}
        locale={locale}
        purityPriceTiles={portfolio.purityPriceTiles}
        rateUpdatedLabel={rateUpdatedLabel}
      />
    </View>
  );
}

function PerformanceMetric({
  currency,
  locale,
  portfolio,
}: {
  readonly currency: CurrencyType;
  readonly locale: string;
  readonly portfolio: MetalPortfolioReadModel;
}): React.JSX.Element {
  const { t } = useTranslation("metals");
  if (portfolio.currentPerformanceDecimal === null) {
    const performanceUnavailable = portfolio.activeTotalDecimal !== null;
    return (
      <Text className="mt-3 text-sm text-text-secondary dark:text-text-secondary-dark">
        {performanceUnavailable
          ? t(
              portfolio.currentPerformanceUnavailableReason === "rate_reference"
                ? "portfolio.performance_unavailable_rate_reference"
                : "portfolio.performance_unavailable"
            )
          : t("portfolio.current_value_unavailable", {
              reason: t(`rate.${portfolio.rateStatus.state}`),
            })}
      </Text>
    );
  }
  return (
    <>
      <Text
        numberOfLines={1}
        className={`mt-2 text-sm font-bold ${getPerformanceTextClass(
          parseOptionalNumber(portfolio.currentPerformanceDecimal)
        )}`}
      >
        {formatCodeAmount(
          portfolio.currentPerformanceDecimal,
          currency,
          locale,
          true
        )}
      </Text>
      <Text className="mt-0.5 text-xs text-text-secondary dark:text-text-secondary-dark">
        {t("portfolio.since_purchase_label")}
      </Text>
    </>
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
  const hasValue = goldShare > 0 || silverShare > 0;
  const goldShareLabel = allocation.gold !== null ? `${allocation.gold}%` : "—";
  const silverShareLabel =
    allocation.silver !== null ? `${allocation.silver}%` : "—";
  const allocationA11y = t("portfolio.allocation_accessibility", {
    goldShare: goldShareLabel,
    silverShare: silverShareLabel,
  });

  return (
    <View
      testID="metal-portfolio-allocation"
      className="mt-4 border-b border-slate-200 pb-4 dark:border-slate-800"
    >
      <View
        accessibilityRole="image"
        accessibilityLabel={allocationA11y}
        className="h-[9px] flex-row overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
      >
        {goldShare > 0 ? (
          <View
            testID="metal-portfolio-allocation-gold"
            className="h-full bg-gold-600"
            // eslint-disable-next-line react-native/no-inline-styles -- dynamic allocation width
            style={{ width: silverShare > 0 ? `${goldShare}%` : "100%" }}
          />
        ) : null}
        {silverShare > 0 ? (
          <View
            testID="metal-portfolio-allocation-silver"
            className={`h-full bg-silver-500 ${
              goldShare > 0
                ? "border-s border-background dark:border-background-dark"
                : ""
            }`}
            // eslint-disable-next-line react-native/no-inline-styles -- dynamic allocation width
            style={{ width: goldShare > 0 ? `${silverShare}%` : "100%" }}
          />
        ) : null}
      </View>
      <View
        testID="metal-portfolio-allocation-legend"
        className="mt-2.5 flex-row items-center justify-between"
      >
        <AllocationLegend
          dotClassName="bg-gold-600"
          label={t("gold")}
          share={hasValue ? allocation.gold : null}
        />
        <AllocationLegend
          dotClassName="bg-silver-500"
          label={t("silver")}
          share={hasValue ? allocation.silver : null}
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
    <View className="flex-row items-center gap-1.5">
      <View className={`h-2.5 w-2.5 rounded-full ${dotClassName}`} />
      <Text className="text-xs font-semibold text-text-primary dark:text-text-primary-dark">
        {label}{" "}
        <Text className="font-normal text-text-secondary dark:text-text-secondary-dark">
          {share === null ? "—" : `${share}%`}
        </Text>
      </Text>
    </View>
  );
}

function PricesPerGramSection({
  currency,
  locale,
  purityPriceTiles = [],
  rateUpdatedLabel,
}: {
  readonly currency: CurrencyType;
  readonly locale: string;
  readonly purityPriceTiles?: readonly MetalPortfolioPurityPriceTile[];
  readonly rateUpdatedLabel: string;
}): React.JSX.Element {
  const { t } = useTranslation("metals");
  const { width, fontScale } = useWindowDimensions();
  const isCompact = shouldUseCompactLayout(width, fontScale);

  return (
    <View testID="metal-portfolio-rates-section" className="mt-4">
      <View className="flex-row items-baseline justify-between gap-2.5">
        <Text className="text-base font-semibold text-text-primary dark:text-text-primary-dark">
          {t("portfolio.prices_per_gram")}
        </Text>
        <Text
          testID="metal-portfolio-rate-updated"
          className="text-[10px] text-text-secondary dark:text-text-secondary-dark"
        >
          ◷ {rateUpdatedLabel}
        </Text>
      </View>
      <View
        testID="metal-portfolio-rates-grid"
        className="mt-2.5 flex-row flex-wrap justify-between gap-y-2"
      >
        {purityPriceTiles.map((tile) => {
          const isGold = tile.metal === "GOLD";
          const metalName = t(isGold ? "gold" : "silver");
          const purityLabel = t(`portfolio.purity_tile.${tile.purityCode}`);
          const formattedPrice =
            tile.pricePerGramDecimal === null
              ? "—"
              : formatCodeAmount(tile.pricePerGramDecimal, currency, locale);
          const unit = t("portfolio.per_gram");

          return (
            <View
              key={tile.id}
              testID={`metal-rate-tile-${tile.id}`}
              accessible
              accessibilityRole="text"
              accessibilityLabel={`${metalName} ${purityLabel}. ${formattedPrice} ${unit}.`}
              className={`min-h-[54px] ${
                isCompact ? "w-full" : "w-[48.5%]"
              } rounded-[11px] border border-slate-200 bg-surface px-2.5 py-2 dark:border-slate-700 dark:bg-slate-800`}
            >
              <View className="flex-row items-center gap-1.5">
                <View
                  className={`h-2 w-2 rounded-full ${
                    isGold ? "bg-gold-600" : "bg-silver-500"
                  }`}
                />
                <Text
                  numberOfLines={1}
                  className="text-[11px] font-bold text-text-primary dark:text-text-primary-dark"
                >
                  {metalName} · {purityLabel}
                </Text>
              </View>
              <View className="mt-1 flex-row items-baseline gap-1">
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  className="text-sm font-bold text-text-primary dark:text-text-primary-dark"
                >
                  {formattedPrice}
                </Text>
                <Text className="text-[10px] text-text-secondary dark:text-text-secondary-dark">
                  {unit}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
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
      testID="metal-portfolio-filter-bar"
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
            className={`min-h-11 flex-1 items-center justify-center ${
              hasDivider
                ? "border-e border-slate-300 dark:border-slate-700"
                : ""
            } ${isSelected ? "bg-nileGreen-50 dark:bg-slate-800" : ""}`}
            onPress={(): void => onFilterChange(filter)}
            testID={`metal-portfolio-filter-${filter}`}
          >
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
    <Text className="mb-3 mt-6 text-lg font-semibold text-text-primary dark:text-text-primary-dark">
      {t("portfolio.items_heading")}
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
              ) : isSold ? (
                <Text className="text-right text-xs text-text-secondary dark:text-text-secondary-dark">
                  {t("portfolio.sale_result_unavailable")}
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
