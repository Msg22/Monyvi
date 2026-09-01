import { Skeleton } from "@/components/ui/Skeleton";
import type { CurrencyType } from "@monyvi/db";
import { formatCurrency } from "@monyvi/logic";
import React from "react";
import { FlatList, Image, Pressable, Text, View } from "react-native";
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
  readonly onRetry: () => void;
  readonly portfolio: MetalPortfolioReadModel | null;
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
  onRetry,
  portfolio,
  selectedFilter,
}: MetalPortfolioScreenProps): React.JSX.Element {
  const { t } = useTranslation("metals");
  const { t: tCommon } = useTranslation("common");

  if (isLoading) {
    return <PortfolioSkeleton />;
  }

  if (portfolio === null) {
    return (
      <View
        testID="metal-portfolio-root"
        className="flex-1 bg-slate-50 dark:bg-slate-950"
      >
        <ErrorState error={error} onRetry={onRetry} t={tCommon} />
      </View>
    );
  }

  return (
    <View
      testID="metal-portfolio-root"
      className="flex-1 bg-slate-50 dark:bg-slate-950"
    >
      <View className="px-5 pt-3">
        <PortfolioSummary currency={currency} portfolio={portfolio} />
        <FilterBar
          activeHoldings={portfolio.activeHoldings}
          selectedFilter={selectedFilter}
          onFilterChange={onFilterChange}
          t={t}
        />
        {isOffline ? (
          <Text className="mt-3 text-sm text-text-secondary dark:text-text-secondary-dark">
            {t("offline_mode")}
          </Text>
        ) : null}
        <RateStatus portfolio={portfolio} t={t} />
        {error !== null ? (
          <ErrorState error={error} onRetry={onRetry} t={tCommon} />
        ) : null}
      </View>
      <PortfolioContent
        bottomInset={bottomInset}
        currency={currency}
        portfolio={portfolio}
        selectedFilter={selectedFilter}
        t={t}
      />
    </View>
  );
}

function PortfolioSkeleton(): React.JSX.Element {
  return (
    <View testID="metal-portfolio-skeleton" className="flex-1 px-5 pt-4">
      <Skeleton width="100%" height={148} borderRadius={24} />
      <View className="mt-5 gap-3">
        <Skeleton width="100%" height={48} borderRadius={16} />
        <Skeleton width="100%" height={96} borderRadius={20} />
        <Skeleton width="100%" height={96} borderRadius={20} />
      </View>
    </View>
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
  const total = formatAmount(portfolio.activeTotalDecimal, currency);
  const performance = formatAmount(
    portfolio.currentPerformanceDecimal,
    currency
  );

  return (
    <View
      accessible
      accessibilityLabel={t("portfolio.total_accessibility", {
        amount: total,
        status:
          portfolio.rateStatus.state === "fresh"
            ? t("portfolio.current_rate")
            : t(`rate.${portfolio.rateStatus.state}`),
      })}
      className="rounded-3xl border border-amber-200 bg-white p-5 dark:border-amber-500/20 dark:bg-slate-800"
    >
      <Text className="text-sm font-medium text-text-secondary dark:text-text-secondary-dark">
        {t("portfolio.total")}
      </Text>
      <Text className="mt-1 text-3xl font-bold text-text-primary dark:text-text-primary-dark">
        {total}
      </Text>
      <Text className="mt-2 text-sm text-text-secondary dark:text-text-secondary-dark">
        {portfolio.currentPerformanceDecimal === null
          ? t("portfolio.current_value_unavailable", {
              reason: t(`rate.${portfolio.rateStatus.state}`),
            })
          : t("portfolio.since_purchase", { signedAmount: performance })}
      </Text>
      <View className="mt-4 flex-row gap-5">
        <Allocation label={t("gold")} share={portfolio.allocation.gold} />
        <Allocation label={t("silver")} share={portfolio.allocation.silver} />
      </View>
    </View>
  );
}

function Allocation({
  label,
  share,
}: {
  readonly label: string;
  readonly share: string | null;
}): React.JSX.Element {
  return (
    <View>
      <Text className="text-xs text-text-secondary dark:text-text-secondary-dark">
        {label}
      </Text>
      <Text className="mt-1 text-sm font-semibold text-text-primary dark:text-text-primary-dark">
        {share === null ? "—" : `${share}%`}
      </Text>
    </View>
  );
}

function FilterBar({
  activeHoldings,
  selectedFilter,
  onFilterChange,
  t,
}: {
  readonly activeHoldings: readonly MetalPortfolioHoldingInput[];
  readonly selectedFilter: MetalPortfolioFilter;
  readonly onFilterChange: (filter: MetalPortfolioFilter) => void;
  readonly t: (key: string, values?: Record<string, string | number>) => string;
}): React.JSX.Element {
  return (
    <View
      accessibilityRole="tablist"
      className="mt-5 flex-row rounded-2xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800"
    >
      {FILTERS.map((filter) => {
        const isSelected = filter === selectedFilter;
        const count = activeHoldings.filter(
          (holding) => filter === "ALL" || holding.metalType === filter
        ).length;
        const label = t(`portfolio.filter.${filter.toLowerCase()}`);
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
            className={`min-h-11 flex-1 items-center justify-center rounded-xl ${
              isSelected ? "bg-amber-100 dark:bg-amber-900" : ""
            }`}
            onPress={(): void => onFilterChange(filter)}
            testID={`metal-portfolio-filter-${filter}`}
          >
            <Text className="text-sm font-semibold text-text-primary dark:text-text-primary-dark">
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function RateStatus({
  portfolio,
  t,
}: {
  readonly portfolio: MetalPortfolioReadModel;
  readonly t: (key: string) => string;
}): React.JSX.Element | null {
  if (portfolio.rateStatus.state === "fresh") {
    return null;
  }
  return (
    <Text className="mt-3 text-sm text-text-secondary dark:text-text-secondary-dark">
      {t(`rate.${portfolio.rateStatus.state}`)}
    </Text>
  );
}

function PortfolioContent({
  bottomInset,
  currency,
  portfolio,
  selectedFilter,
  t,
}: {
  readonly bottomInset: number;
  readonly currency: CurrencyType;
  readonly portfolio: MetalPortfolioReadModel;
  readonly selectedFilter: MetalPortfolioFilter;
  readonly t: (key: string, values?: Record<string, string>) => string;
}): React.JSX.Element {
  if (portfolio.listState === "PORTFOLIO_EMPTY") {
    return (
      <View className="items-center px-5 py-10">
        <Text className="text-base font-semibold text-text-primary dark:text-text-primary-dark">
          {t("start_tracking_metals")}
        </Text>
        <Text className="mt-2 text-center text-sm text-text-secondary dark:text-text-secondary-dark">
          {t("empty_metals_description")}
        </Text>
      </View>
    );
  }

  if (portfolio.listState === "FILTER_EMPTY") {
    return (
      <View className="items-center px-5 py-10">
        <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">
          {t("portfolio.filter_empty", {
            filter: t(`portfolio.filter.${selectedFilter.toLowerCase()}`),
          })}
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={portfolio.holdings}
      keyExtractor={(holding): string => holding.id}
      renderItem={({ item }): React.JSX.Element => (
        <MetalHoldingRow currency={currency} holding={item} />
      )}
      contentContainerClassName="px-5 py-5"
      contentContainerStyle={{ paddingBottom: bottomInset + 24 }}
      ListFooterComponent={
        portfolio.recentHistory.length === 0 ? null : (
          <RecentHistory holdings={portfolio.recentHistory} />
        )
      }
    />
  );
}

function RecentHistory({
  holdings,
}: {
  readonly holdings: readonly MetalPortfolioHoldingInput[];
}): React.JSX.Element {
  const { t } = useTranslation("metals");
  return (
    <View className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <Text className="text-base font-semibold text-text-primary dark:text-text-primary-dark">
        {t("portfolio.recent_history")}
      </Text>
      {holdings.map((holding) => (
        <View
          key={holding.id}
          className="mt-3 flex-row items-center justify-between"
        >
          <Text className="flex-1 text-sm font-medium text-text-primary dark:text-text-primary-dark">
            {holding.name}
          </Text>
          <Text className="ms-3 text-xs text-text-secondary dark:text-text-secondary-dark">
            {t(`status.${holding.status}`)} ·{" "}
            {holding.occurredAt.toLocaleDateString()}
          </Text>
        </View>
      ))}
    </View>
  );
}

function MetalHoldingRow({
  currency,
  holding,
}: {
  readonly currency: CurrencyType;
  readonly holding: MetalPortfolioHoldingInput;
}): React.JSX.Element {
  const { t } = useTranslation("metals");
  const presentation = getMetalHoldingPresentation(holding);
  const metal = t(presentation.metalKey);
  const form = t(presentation.formKey);
  const weight =
    holding.weightGramsDecimal === null
      ? null
      : `${holding.weightGramsDecimal} g`;
  const purchaseDetail =
    weight === null
      ? null
      : holding.purchaseDate === null
        ? weight
        : t("portfolio.bought", {
            weight,
            date: holding.purchaseDate.toLocaleDateString(),
          });

  return (
    <View
      testID={`metal-portfolio-holding-${holding.id}`}
      className="mb-3 flex-row flex-wrap items-center rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
    >
      {presentation.render.kind === "object" ? (
        <Image
          accessible
          accessibilityLabel={t(presentation.render.accessibilityLabelKey, {
            metal,
            form,
          })}
          source={presentation.render.source}
          className="h-14 w-14 rounded-xl"
        />
      ) : (
        <View
          accessible
          accessibilityLabel={t(presentation.render.accessibilityLabelKey)}
          className="h-14 w-14 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-700"
        >
          <Text className="text-xs font-semibold text-text-secondary dark:text-text-secondary-dark">
            {metal}
          </Text>
        </View>
      )}
      <View className="min-w-44 flex-1 px-3">
        <Text
          numberOfLines={1}
          className="text-base font-semibold text-text-primary dark:text-text-primary-dark"
        >
          {holding.name}
        </Text>
        <Text className="mt-1 text-xs text-text-secondary dark:text-text-secondary-dark">
          {[metal, presentation.purityLabel, form, t("status.active")]
            .filter((value): value is string => value !== null)
            .join(" · ")}
        </Text>
        {purchaseDetail === null ? null : (
          <Text className="mt-1 text-xs text-text-secondary dark:text-text-secondary-dark">
            {purchaseDetail}
          </Text>
        )}
      </View>
      <View className="mt-3 min-w-28 flex-1 items-end">
        <Text className="text-sm font-bold text-text-primary dark:text-text-primary-dark">
          {formatAmount(holding.currentValueDecimal, currency)}
        </Text>
        {holding.currentPerformanceDecimal === null ? (
          <Text className="mt-1 text-xs text-text-secondary dark:text-text-secondary-dark">
            {t("portfolio.current_value_unavailable", {
              reason: t("rate.missing"),
            })}
          </Text>
        ) : (
          <Text className="mt-1 text-xs text-text-secondary dark:text-text-secondary-dark">
            {t("portfolio.since_purchase", {
              signedAmount: formatAmount(
                holding.currentPerformanceDecimal,
                currency
              ),
            })}
          </Text>
        )}
      </View>
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
    <View className="items-center px-5 py-6">
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

function formatAmount(value: string | null, currency: CurrencyType): string {
  const numericValue = value === null ? Number.NaN : Number(value);
  if (!Number.isFinite(numericValue)) {
    return "—";
  }
  return formatCurrency({
    amount: numericValue,
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}
