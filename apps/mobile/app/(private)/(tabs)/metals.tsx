import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { router } from "expo-router";
import React, { useCallback } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { MetalPortfolioScreen } from "@/components/metals/MetalPortfolioScreen";
import { PageHeader } from "@/components/navigation/PageHeader";
import { isTrueMetalPortfolioEmpty } from "@/hooks/metal-portfolio-readiness";
import { useMetalPortfolio } from "@/hooks/useMetalPortfolio";
import { usePreferredCurrency } from "@/hooks/usePreferredCurrency";
import { useSuppressQuickActionFabWhenFocused } from "@/hooks/useQuickActionFabVisibility";

export default function MyMetalsRoute(): React.JSX.Element {
  const { t } = useTranslation("metals");
  const tabBarHeight = useBottomTabBarHeight();
  const { preferredCurrency } = usePreferredCurrency();
  const {
    error,
    isLoading,
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
        title={t("my_metals")}
        rightAction={{
          icon: "add",
          accessibilityLabel: t("add_metal_item"),
          testID: "metals-add-button",
          onPress: openAddHolding,
        }}
      />
      <MetalPortfolioScreen
        bottomInset={tabBarHeight}
        currency={preferredCurrency}
        error={error}
        isLoading={isLoading}
        onAddHoldingPress={openAddHolding}
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
    </View>
  );
}
