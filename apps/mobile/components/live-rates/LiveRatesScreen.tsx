import { palette } from "@/constants/colors";
import { useLiveRatesScreen } from "@/hooks/useLiveRatesScreen";
import React from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { CurrencySection } from "./CurrencySection";
import { GoldHeroCard } from "./GoldHeroCard";
import { LiveRatesEmptyState } from "./LiveRatesEmptyState";
import { LiveRatesFooter } from "./LiveRatesFooter";
import { LiveRatesHeader } from "./LiveRatesHeader";
import { LiveRatesScreenSkeleton } from "./LiveRatesScreenSkeleton";
import { MetalCard } from "./MetalCard";

interface LiveRatesTrustSummaryProps {
  readonly gold: "fresh" | "stale" | "unknown" | "missing";
  readonly silver: "fresh" | "stale" | "unknown" | "missing";
  readonly currencies: "fresh" | "stale" | "unknown" | "missing";
  readonly isConnected: boolean;
}

function LiveRatesTrustSummary({
  gold,
  silver,
  currencies,
  isConnected,
}: LiveRatesTrustSummaryProps): React.JSX.Element {
  const { t } = useTranslation("metals");
  const { t: tCommon } = useTranslation("common");

  return (
    <View className="mt-3" accessibilityLiveRegion="polite">
      {!isConnected && (
        <Text className="mb-2 text-xs font-medium text-text-secondary dark:text-text-secondary">
          {t("offline_mode")}
        </Text>
      )}
      <View className="flex-row flex-wrap gap-2">
        <Text
          testID="live-rates-trust-gold"
          className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-text-secondary dark:bg-slate-800 dark:text-text-secondary"
          accessibilityLabel={`${t("gold")}: ${t(`rate.${gold}`)}`}
        >
          {t("gold")} · {t(`rate.${gold}`)}
        </Text>
        <Text
          testID="live-rates-trust-silver"
          className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-text-secondary dark:bg-slate-800 dark:text-text-secondary"
          accessibilityLabel={`${t("silver")}: ${t(`rate.${silver}`)}`}
        >
          {t("silver")} · {t(`rate.${silver}`)}
        </Text>
        <Text
          testID="live-rates-trust-currencies"
          className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-text-secondary dark:bg-slate-800 dark:text-text-secondary"
          accessibilityLabel={`${tCommon("currencies")}: ${t(
            `rate.${currencies}`
          )}`}
        >
          {tCommon("currencies")} · {t(`rate.${currencies}`)}
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

            <View className="flex-row mt-3">
              <MetalCard
                metalName={t("silver")}
                price={metals.silverPrice}
                trendPercent={metals.silverTrendPercent}
                borderColor={palette.silver[500]}
                currencySymbol={metals.currencySymbol}
              />
            </View>

            <LiveRatesTrustSummary
              gold={rateTrust.gold}
              silver={rateTrust.silver}
              currencies={rateTrust.currencies}
              isConnected={isConnected}
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
