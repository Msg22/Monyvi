import { Skeleton } from "@/components/ui/Skeleton";
import { palette } from "@/constants/colors";
import type { CurrencyType } from "@monyvi/db";
import { formatCurrency } from "@monyvi/logic";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  FlatList,
  I18nManager,
  Image,
  Pressable,
  Text,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";

import type {
  MetalPortfolioFilter,
  MetalPortfolioHoldingInput,
  MetalPortfolioReadModel,
} from "@/services/metal-portfolio-read-model-service";
import { getMetalHoldingPresentation } from "./portfolio-presentation";

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
  readonly selectedFilter: MetalPortfolioFilter;
}

interface MetalHoldingRowProps {
  readonly currency: CurrencyType;
  readonly holding: MetalPortfolioHoldingInput;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly onPress: () => void;
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
  selectedFilter,
}: MetalPortfolioScreenProps): React.JSX.Element {
  const { t: tCommon } = useTranslation("common");

  if (isLoading) {
    return <PortfolioSkeleton />;
  }

  if (portfolio === null) {
    return (
      <View
        testID="metal-portfolio-root"
        className="flex-1 bg-background dark:bg-background-dark"
      >
        <ErrorState error={error} onRetry={onRetry} t={tCommon} />
      </View>
    );
  }

  return (
    <View
      testID="metal-portfolio-root"
      className="flex-1 bg-background dark:bg-background-dark"
    >
      <FlatList
        data={portfolio.holdings}
        keyExtractor={(holding): string => holding.id}
        renderItem={({ item, index }): React.JSX.Element => (
          <MetalHoldingRow
            currency={currency}
            holding={item}
            isFirst={index === 0}
            isLast={index === portfolio.holdings.length - 1}
            onPress={(): void => onHoldingPress(item.id)}
          />
        )}
        contentContainerClassName="px-5 pt-2"
        contentContainerStyle={{ paddingBottom: bottomInset + 24 }}
        ListHeaderComponent={
          <PortfolioHeader
            currency={currency}
            error={error}
            isOffline={isOffline}
            onFilterChange={onFilterChange}
            onRetry={onRetry}
            portfolio={portfolio}
            selectedFilter={selectedFilter}
          />
        }
        ListEmptyComponent={
          <EmptyPortfolioContent
            portfolio={portfolio}
            selectedFilter={selectedFilter}
          />
        }
        ListFooterComponent={
          portfolio.recentHistory.length === 0 ? null : (
            <RecentHistory
              currency={currency}
              holdings={portfolio.recentHistory}
              onHistoryPress={onHistoryPress}
              onHoldingPress={onHoldingPress}
            />
          )
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

function PortfolioSkeleton(): React.JSX.Element {
  return (
    <View
      testID="metal-portfolio-skeleton"
      className="flex-1 bg-background px-5 pt-4 dark:bg-background-dark"
    >
      <Skeleton width="62%" height={28} borderRadius={8} />
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
      <View className="mt-8 gap-4">
        <Skeleton width="100%" height={14} borderRadius={7} />
        <Skeleton width="100%" height={46} borderRadius={12} />
        <Skeleton width="32%" height={28} borderRadius={8} />
        <Skeleton width="100%" height={112} borderRadius={18} />
        <Skeleton width="100%" height={112} borderRadius={18} />
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
  selectedFilter,
}: {
  readonly currency: CurrencyType;
  readonly error: Error | null;
  readonly isOffline: boolean;
  readonly onFilterChange: (filter: MetalPortfolioFilter) => void;
  readonly onRetry: () => void;
  readonly portfolio: MetalPortfolioReadModel;
  readonly selectedFilter: MetalPortfolioFilter;
}): React.JSX.Element {
  const { t } = useTranslation("metals");
  const { t: tCommon } = useTranslation("common");

  return (
    <>
      <PortfolioSummary currency={currency} portfolio={portfolio} />
      <FilterBar
        activeHoldings={portfolio.activeHoldings}
        selectedFilter={selectedFilter}
        onFilterChange={onFilterChange}
      />
      {isOffline ? (
        <Text className="mt-3 text-xs text-text-secondary dark:text-text-secondary-dark">
          {t("offline_mode")}
        </Text>
      ) : null}
      {error !== null ? (
        <ErrorState error={error} onRetry={onRetry} t={tCommon} />
      ) : null}
      {portfolio.listState === "POPULATED" ? <HoldingsHeader /> : null}
    </>
  );
}

function PortfolioSummary({
  currency,
  portfolio,
}: {
  readonly currency: CurrencyType;
  readonly portfolio: MetalPortfolioReadModel;
}): React.JSX.Element {
  const { t } = useTranslation("metals");
  const holdingCount = portfolio.activeHoldings.length;
  const performanceValue = parseOptionalNumber(
    portfolio.currentPerformanceDecimal
  );
  const realizedProfitLoss = portfolio.soldResultDecimal;

  return (
    <View
      accessible
      accessibilityLabel={t("portfolio.total_accessibility", {
        amount: formatCodeAmount(portfolio.activeTotalDecimal, currency),
        status:
          portfolio.rateStatus.state === "fresh"
            ? t("portfolio.current_rate")
            : t(`rate.${portfolio.rateStatus.state}`),
      })}
      className="pt-3"
    >
      <Text className="text-base font-medium text-nileGreen-700 dark:text-nileGreen-400">
        {t("portfolio.active_portfolio")}
      </Text>

      <View className="mt-4 flex-row items-start justify-between gap-5">
        <View className="min-w-0 flex-1">
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.72}
            className="text-[36px] font-medium leading-[44px] text-text-primary dark:text-text-primary-dark"
          >
            {formatCodeAmount(portfolio.activeTotalDecimal, currency)}
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
              {t("portfolio.current_value_unavailable", {
                reason: t(`rate.${portfolio.rateStatus.state}`),
              })}
            </Text>
          ) : (
            <>
              <Text
                numberOfLines={1}
                className={`mt-3 text-sm font-medium ${getPerformanceTextClass(performanceValue)}`}
              >
                {formatCodeAmount(
                  portfolio.currentPerformanceDecimal,
                  currency,
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

      {realizedProfitLoss === null ? null : (
        <View className="mt-7 flex-row flex-wrap items-baseline gap-x-2 gap-y-1">
          <Text className="text-base font-medium text-text-primary dark:text-text-primary-dark">
            {formatCodeAmount(realizedProfitLoss, currency)}
          </Text>
          <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">
            {t(getRealizedProfitLossLabelKey(realizedProfitLoss, "summary"))}
          </Text>
        </View>
      )}

      <View className="mt-6 h-px bg-slate-200 dark:bg-slate-800" />
      <AllocationBar allocation={portfolio.allocation} />
      <RateStatus portfolio={portfolio} />
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
  const hasMixedAllocation = goldShare > 0 && silverShare > 0;

  if (!hasMixedAllocation) {
    return null;
  }

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
  portfolio,
}: {
  readonly portfolio: MetalPortfolioReadModel;
}): React.JSX.Element {
  const { t } = useTranslation("metals");
  const label = formatRateUpdatedLabel(
    portfolio.rateStatus.ageMs,
    portfolio.rateStatus.state,
    t
  );

  return (
    <View className="mt-7 flex-row items-center gap-2">
      <Ionicons name="time-outline" size={20} color={palette.nileGreen[600]} />
      <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">
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

function MetalHoldingRow({
  currency,
  holding,
  isFirst,
  isLast,
  onPress,
}: MetalHoldingRowProps): React.JSX.Element {
  const { t } = useTranslation("metals");
  const presentation = getMetalHoldingPresentation(holding);
  const metal = t(presentation.metalKey);
  const form = t(presentation.formKey);
  const metadata = [metal, presentation.purityLabel, form]
    .filter((value): value is string => value !== null)
    .join(" · ");
  const purchaseDetail = formatPurchaseDetail(holding, t);
  const performanceValue = parseOptionalNumber(
    holding.currentPerformanceDecimal
  );

  return (
    <Pressable
      accessible
      accessibilityLabel={holding.name}
      accessibilityRole="button"
      onPress={onPress}
      testID={`metal-portfolio-holding-${holding.id}`}
      className={`flex-row items-center border-x border-slate-200 bg-surface px-3 py-3 dark:border-slate-800 dark:bg-slate-900 ${
        isFirst ? "rounded-t-2xl border-t" : ""
      } ${isLast ? "rounded-b-2xl border-b" : "border-b"}`}
    >
      <HoldingImage form={form} metal={metal} presentation={presentation} />

      <View className="min-w-0 flex-1 px-3">
        <Text
          numberOfLines={1}
          className="text-base font-medium text-text-primary dark:text-text-primary-dark"
        >
          {holding.name}
        </Text>
        <View className="mt-1 flex-row flex-wrap items-center">
          <Text className="text-xs text-text-secondary dark:text-text-secondary-dark">
            {metadata}
            {metadata.length > 0 ? " · " : ""}
          </Text>
          <Text className="text-xs text-nileGreen-700 dark:text-nileGreen-400">
            {t("status.active")}
          </Text>
        </View>
        {purchaseDetail === null ? null : (
          <Text className="mt-1 text-xs text-text-secondary dark:text-text-secondary-dark">
            {purchaseDetail}
          </Text>
        )}
      </View>

      <View className="max-w-[132px] items-end">
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          className="text-sm font-semibold text-text-primary dark:text-text-primary-dark"
        >
          {formatCodeAmount(holding.currentValueDecimal, currency)}
        </Text>
        {holding.currentPerformanceDecimal === null ? (
          <Text className="mt-2 text-right text-[11px] text-text-secondary dark:text-text-secondary-dark">
            {t("portfolio.current_value_unavailable", {
              reason: t("rate.missing"),
            })}
          </Text>
        ) : (
          <>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              className={`mt-2 text-xs font-medium ${getPerformanceTextClass(performanceValue)}`}
            >
              {formatCodeAmount(
                holding.currentPerformanceDecimal,
                currency,
                true
              )}
            </Text>
            <Text className="mt-1 text-[11px] text-text-secondary dark:text-text-secondary-dark">
              {t("portfolio.since_purchase_label")}
            </Text>
          </>
        )}
      </View>

      <Ionicons
        name={getForwardChevronName()}
        size={20}
        color={palette.slate[500]}
      />
    </Pressable>
  );
}

function HoldingImage({
  form,
  metal,
  presentation,
}: {
  readonly form: string;
  readonly metal: string;
  readonly presentation: ReturnType<typeof getMetalHoldingPresentation>;
}): React.JSX.Element {
  const { t } = useTranslation("metals");

  if (presentation.render.kind === "object") {
    return (
      <Image
        accessible
        accessibilityLabel={t(presentation.render.accessibilityLabelKey, {
          metal,
          form,
        })}
        source={presentation.render.source}
        resizeMode="contain"
        className="h-20 w-20"
      />
    );
  }

  return (
    <View
      accessible
      accessibilityLabel={t(presentation.render.accessibilityLabelKey)}
      className="h-20 w-20 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800"
    >
      <Text className="text-xs font-semibold text-text-secondary dark:text-text-secondary-dark">
        {metal}
      </Text>
    </View>
  );
}

function RecentHistory({
  currency,
  holdings,
  onHistoryPress,
  onHoldingPress,
}: {
  readonly currency: CurrencyType;
  readonly holdings: readonly MetalPortfolioHoldingInput[];
  readonly onHistoryPress: () => void;
  readonly onHoldingPress: (holdingId: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation("metals");

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
                {formatShortDate(holding.occurredAt)}
              </Text>
            </View>
            <View className="max-w-[180px] flex-row items-center gap-2">
              {isSold ? (
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  className="text-right text-xs text-text-secondary dark:text-text-secondary-dark"
                >
                  {t(
                    getRealizedProfitLossLabelKey(
                      holding.soldResultDecimal,
                      "history"
                    )
                  )}{" "}
                  ·{" "}
                  <Text className="font-medium text-text-primary dark:text-text-primary-dark">
                    {formatCodeAmount(holding.soldResultDecimal, currency)}
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
  if (error === null) {
    return null;
  }

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

function formatPurchaseDetail(
  holding: MetalPortfolioHoldingInput,
  t: (key: string, values?: Record<string, string>) => string
): string | null {
  const weight =
    holding.weightGramsDecimal === null
      ? null
      : `${holding.weightGramsDecimal} g`;

  if (weight === null) {
    return null;
  }

  if (holding.purchaseDate === null) {
    return weight;
  }

  return `${weight} · ${t("portfolio.bought_on", {
    date: formatShortDate(holding.purchaseDate),
  })}`;
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatRateUpdatedLabel(
  ageMs: number | null,
  state: MetalPortfolioReadModel["rateStatus"]["state"],
  t: (key: string, values?: Record<string, string>) => string
): string {
  if (ageMs === null || !Number.isFinite(ageMs)) {
    return t(`rate.${state}`);
  }

  const updatedAt = new Date(Date.now() - Math.max(0, ageMs));
  const now = new Date();
  const time = updatedAt.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const sameDay =
    updatedAt.getFullYear() === now.getFullYear() &&
    updatedAt.getMonth() === now.getMonth() &&
    updatedAt.getDate() === now.getDate();
  const when = sameDay
    ? `${t("portfolio.today")}, ${time}`
    : `${formatShortDate(updatedAt)}, ${time}`;

  return t("portfolio.rates_updated", {
    when,
  });
}

function getForwardChevronName(): "chevron-back" | "chevron-forward" {
  return I18nManager.isRTL ? "chevron-back" : "chevron-forward";
}

function getRealizedProfitLossLabelKey(
  value: string | null,
  context: "summary" | "history"
):
  | "portfolio.realized_loss"
  | "portfolio.realized_loss_from_sold_metals"
  | "portfolio.realized_profit"
  | "portfolio.realized_profit_from_sold_metals"
  | "portfolio.realized_result"
  | "portfolio.realized_result_from_sold_metals" {
  const parsedValue = parseOptionalNumber(value);
  const suffix = context === "summary" ? "_from_sold_metals" : "";

  if (parsedValue !== null && parsedValue > 0) {
    return `portfolio.realized_profit${suffix}`;
  }
  if (parsedValue !== null && parsedValue < 0) {
    return `portfolio.realized_loss${suffix}`;
  }
  return `portfolio.realized_result${suffix}`;
}

function formatCodeAmount(
  value: string | null,
  currency: CurrencyType,
  signed = false
): string {
  const numericValue = value === null ? Number.NaN : Number(value);
  if (!Number.isFinite(numericValue)) {
    return "—";
  }

  const absoluteFormatted = formatCurrency({
    amount: Math.abs(numericValue),
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const numericPart = stripCurrencyDecoration(absoluteFormatted, currency);
  const sign = signed
    ? numericValue > 0
      ? "+ "
      : numericValue < 0
        ? "- "
        : ""
    : numericValue < 0
      ? "- "
      : "";

  return `${sign}${currency} ${numericPart}`;
}

function stripCurrencyDecoration(
  formatted: string,
  currency: CurrencyType
): string {
  const withoutCode = formatted
    .replace(new RegExp(`^${currency}\\s*`), "")
    .replace(new RegExp(`\\s*${currency}$`), "");
  return withoutCode.replace(/^[^\d]+/, "");
}

function parseShare(value: string | null): number {
  if (value === null) {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function parseOptionalNumber(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getPerformanceTextClass(value: number | null): string {
  if (value === null || value === 0) {
    return "text-text-secondary dark:text-text-secondary-dark";
  }
  return value > 0
    ? "text-nileGreen-700 dark:text-nileGreen-400"
    : "text-red-600 dark:text-red-500";
}
