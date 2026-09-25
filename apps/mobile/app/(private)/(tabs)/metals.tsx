import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { router } from "expo-router";
import React, { useCallback, useMemo } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { MetalPortfolioEmptyState } from "@/components/metals/MetalPortfolioEmptyState";
import { MetalPortfolioScreen } from "@/components/metals/MetalPortfolioScreen";
import { PageHeader } from "@/components/navigation/PageHeader";
import { palette } from "@/constants/colors";
import { isTrueMetalPortfolioEmpty } from "@/hooks/metal-portfolio-readiness";
import { useMetalPortfolio } from "@/hooks/useMetalPortfolio";
import { usePreferredCurrency } from "@/hooks/usePreferredCurrency";
import { useSuppressQuickActionFabWhenFocused } from "@/hooks/useQuickActionFabVisibility";
import { useUiPolishCopy } from "@/hooks/useUiPolishCopy";

export default function MyMetalsRoute(): React.JSX.Element {
  const { t } = useTranslation("metals");
  const copy = useUiPolishCopy();
  const tabBarHeight = useBottomTabBarHeight();
  const { preferredCurrency } = usePreferredCurrency();
  const {
    error,
    isLoading,
    isOffline,
    onFilterChange,
    portfolio,
    rateProviderObservedAt,
    readiness,
    recentHistory,
    refresh,
    selectedFilter,
  } = useMetalPortfolio();

  const isPortfolioEmpty =
    error === null && isTrueMetalPortfolioEmpty(portfolio, readiness);
  const hasHistory = useMemo(
    () =>
      Boolean(portfolio?.hasTerminalHistory) ||
      (recentHistory ?? portfolio?.recentHistory ?? []).length > 0,
    [portfolio?.hasTerminalHistory, portfolio?.recentHistory, recentHistory]
  );

  useSuppressQuickActionFabWhenFocused(isPortfolioEmpty);

  const openAddHolding = useCallback((): void => {
    router.push("/metals/add");
  }, []);
  const openHolding = useCallback((holdingId: string): void => {
    router.push({ pathname: "/metals/[id]", params: { id: holdingId } });
  }, []);
  const openHistory = useCallback((): void => {
    router.push("/metals/history");
  }, []);

  return (
    <View className="flex-1 bg-background dark:bg-background-dark">
      <PageHeader
        title={isPortfolioEmpty ? copy.metals_empty.header : t("my_metals")}
        rightAction={
          isPortfolioEmpty
            ? undefined
            : {
                icon: "add",
                label: t("add_holding"),
                iconColor: palette.nileGreen[600],
                darkIconColor: palette.nileGreen[400],
                transparent: true,
                onPress: openAddHolding,
              }
        }
      />
      {isPortfolioEmpty ? (
        <MetalPortfolioEmptyState
          bottomInset={tabBarHeight}
          hasHistory={hasHistory}
          onAddPress={openAddHolding}
          onHistoryPress={openHistory}
        />
      ) : (
        <MetalPortfolioScreen
          bottomInset={tabBarHeight}
          currency={preferredCurrency}
          error={error}
          isLoading={isLoading}
          isOffline={isOffline}
          onFilterChange={onFilterChange}
          onHistoryPress={openHistory}
          onHoldingPress={openHolding}
          onRetry={refresh}
          portfolio={portfolio}
          rateProviderObservedAt={rateProviderObservedAt}
          readiness={readiness}
          recentHistory={recentHistory}
          selectedFilter={selectedFilter}
        />
      )}
    </View>
  );
}
