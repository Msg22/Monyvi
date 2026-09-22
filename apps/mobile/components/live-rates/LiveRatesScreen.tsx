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

interface LiveRatesStatusProps {
  readonly isConnected: boolean;
  readonly refreshError:
    | "cached_refresh_failed"
    | "initial_refresh_failed"
    | null;
  readonly onRetryRefresh: () => void;
}

function LiveRatesStatus({
  isConnected,
  refreshError,
  onRetryRefresh,
}: LiveRatesStatusProps): React.JSX.Element | null {
  const { t } = useTranslation("metals");

  if (isConnected && refreshError !== "cached_refresh_failed") {
    return null;
  }

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
    </View>
  );
}

export function LiveRatesScreen(): React.JSX.Element {
  const { t } = useTranslation("metals");
  const {
    isLoading,
    isConnected,
    isLive,
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
      <LiveRatesHeader isLive={isLive} />

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

            <View testID="live-rates-silver-card" className="mt-3 w-full">
              <MetalCard
                metalName={t("silver")}
                price={metals.silverPrice}
                trendPercent={metals.silverTrendPercent}
                borderColor={palette.silver[500]}
                currencySymbol={metals.currencySymbol}
              />
            </View>

            <LiveRatesStatus
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
