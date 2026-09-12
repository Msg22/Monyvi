import { palette } from "@/constants/colors";
import { useLiveRatesScreen } from "@/hooks/useLiveRatesScreen";
import React from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";

import { CurrencySection } from "./CurrencySection";
import { GoldHeroCard } from "./GoldHeroCard";
import { LiveRatesEmptyState } from "./LiveRatesEmptyState";
import { LiveRatesFooter } from "./LiveRatesFooter";
import { LiveRatesHeader } from "./LiveRatesHeader";
import { LiveRatesScreenSkeleton } from "./LiveRatesScreenSkeleton";
import { MetalCard } from "./MetalCard";

interface LiveRatesTrustSummaryProps {
  readonly gold: LiveRatesTrustDisplay;
  readonly silver: LiveRatesTrustDisplay;
  readonly currencies: LiveRatesTrustDisplay;
  readonly isConnected: boolean;
  readonly refreshError:
    | "cached_refresh_failed"
    | "initial_refresh_failed"
    | null;
  readonly onRetryRefresh: () => void;
}

interface LiveRatesTrustDisplay {
  readonly state: "fresh" | "stale" | "unknown" | "missing" | "invalid";
  readonly dateTime: string | null;
  readonly ageText: string | null;
  readonly quality?: string | null;
  readonly source?: string | null;
}

function LiveRatesTrustSummary({
  gold,
  silver,
  currencies,
  isConnected,
  refreshError,
  onRetryRefresh,
}: LiveRatesTrustSummaryProps): React.JSX.Element {
  const { t } = useTranslation("metals");
  const { t: tCommon } = useTranslation("common");

  return (
    <View className="mt-3" accessibilityLiveRegion="polite">
      {!isConnected && (
        <Text className="mb-2 text-xs font-medium text-text-secondary dark:text-text-secondary-dark">
          {t("offline_mode")}
        </Text>
      )}
      {refreshError === "cached_refresh_failed" && (
        <View className="mb-2">
          <Text className="text-xs font-medium text-text-secondary dark:text-text-secondary-dark">
            {t("rate.refresh_failed_with_cache")}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("rate.retry_refresh")}
            className="mt-1 min-h-11 justify-center"
            onPress={onRetryRefresh}
          >
            <Text className="text-sm font-semibold text-nileGreen-600 dark:text-nileGreen-400">
              {t("rate.retry_refresh")}
            </Text>
          </Pressable>
        </View>
      )}
      <View className="flex-row flex-wrap gap-2">
        <Text
          testID="live-rates-trust-gold"
          className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-text-secondary dark:bg-slate-800 dark:text-text-secondary-dark"
          accessibilityLabel={`${t("gold")}: ${getRateCopy(t, gold)}`}
        >
          {t("gold")} · {getRateCopy(t, gold)}
        </Text>
        <Text
          testID="live-rates-trust-silver"
          className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-text-secondary dark:bg-slate-800 dark:text-text-secondary-dark"
          accessibilityLabel={`${t("silver")}: ${getRateCopy(t, silver)}`}
        >
          {t("silver")} · {getRateCopy(t, silver)}
        </Text>
        <Text
          testID="live-rates-trust-currencies"
          className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-text-secondary dark:bg-slate-800 dark:text-text-secondary-dark"
          accessibilityLabel={`${tCommon("currencies")}: ${getRateCopy(
            t,
            currencies
          )}`}
        >
          {tCommon("currencies")} · {getRateCopy(t, currencies)}
        </Text>
      </View>
    </View>
  );
}

export function LiveRatesScreen(): React.JSX.Element {
  const { t } = useTranslation("metals");
  const {
    isLoading,
    isConnected,
    isStale,
    hasData,
    metals,
    currencies,
    isExpanded,
    onToggleExpand,
    showSeeAll,
    preferredCurrencyLabel,
    searchQuery,
    onSearchChange,
    lastUpdatedText,
    isRefreshing,
    refreshError,
    onRefresh,
    rateTrust,
  } = useLiveRatesScreen();

  const refreshControl = (
    <RefreshControl
      refreshing={isRefreshing}
      onRefresh={onRefresh}
      tintColor={palette.nileGreen[500]}
      colors={[palette.nileGreen[500]]}
    />
  );

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-900">
      <LiveRatesHeader isConnected={isConnected} isStale={isStale} />

      {isLoading && !hasData ? (
        <LiveRatesScreenSkeleton />
      ) : !hasData ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={refreshControl}
        >
          {refreshError === "initial_refresh_failed" ? (
            <View
              accessibilityLiveRegion="polite"
              className="mx-5 mt-4 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30"
            >
              <Text className="text-sm text-red-700 dark:text-red-400">
                {t("rate.initial_refresh_failed")}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("rate.retry_refresh")}
                className="mt-2 min-h-11 justify-center"
                onPress={onRefresh}
              >
                <Text className="font-semibold text-nileGreen-700 dark:text-nileGreen-400">
                  {t("rate.retry_refresh")}
                </Text>
              </Pressable>
            </View>
          ) : null}
          <LiveRatesEmptyState />
        </ScrollView>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 16 }}
          refreshControl={refreshControl}
        >
          <View className="px-5 pt-2">
            <GoldHeroCard
              price24k={metals.price24k}
              price21k={metals.price21k}
              price18k={metals.price18k}
              trendPercent={metals.goldTrendPercent}
              currencySymbol={metals.currencySymbol}
            />

            <View className="flex-row mt-3" style={{ gap: 12 }}>
              <MetalCard
                metalName={t("silver")}
                price={metals.silverPrice}
                trendPercent={metals.silverTrendPercent}
                borderColor={palette.silver[500]}
                currencySymbol={metals.currencySymbol}
              />
              <View
                testID="live-rates-silver-layout-spacer"
                className="flex-1"
              />
            </View>

            <LiveRatesTrustSummary
              gold={rateTrust.gold}
              silver={rateTrust.silver}
              currencies={rateTrust.currencies}
              isConnected={isConnected}
              refreshError={refreshError}
              onRetryRefresh={onRefresh}
            />
          </View>

          <CurrencySection
            currencies={currencies}
            searchQuery={searchQuery}
            onSearchChange={onSearchChange}
            isExpanded={isExpanded}
            onToggleExpand={onToggleExpand}
            preferredCurrencyLabel={preferredCurrencyLabel}
            showSeeAll={showSeeAll}
          />

          <LiveRatesFooter lastUpdatedText={lastUpdatedText} />
        </ScrollView>
      )}
    </View>
  );
}

function getRateCopy(
  t: (key: string, options?: Readonly<Record<string, string>>) => string,
  rate: LiveRatesTrustDisplay
): string {
  const provenance = [
    rate.source ? t("rate.source", { source: rate.source }) : null,
    rate.quality ? t("rate.quality", { quality: rate.quality }) : null,
  ]
    .filter((value): value is string => value !== null)
    .join(" · ");
  const withProvenance = (copy: string): string =>
    provenance.length === 0 ? copy : `${copy} · ${provenance}`;
  if (rate.state === "fresh") {
    return withProvenance(t("rate.fresh", { dateTime: rate.dateTime ?? "" }));
  }
  if (rate.state === "stale" && typeof rate.ageText === "string") {
    return withProvenance(`${t("rate.stale")} · ${rate.ageText}`);
  }
  return withProvenance(t(`rate.${rate.state}`));
}
