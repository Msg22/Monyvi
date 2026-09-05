import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { router } from "expo-router";
import React, { useCallback, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { AddHoldingModal } from "@/components/metals/AddHoldingModal";
import { MetalPortfolioScreen } from "@/components/metals/MetalPortfolioScreen";
import { PageHeader } from "@/components/navigation/PageHeader";
import { palette } from "@/constants/colors";
import { useMetalPortfolio } from "@/hooks/useMetalPortfolio";
import { usePreferredCurrency } from "@/hooks/usePreferredCurrency";

export default function MyMetalsRoute(): React.JSX.Element {
  const { t } = useTranslation("metals");
  const tabBarHeight = useBottomTabBarHeight();
  const { preferredCurrency } = usePreferredCurrency();
  const {
    error,
    isLoading,
    isOffline,
    onFilterChange,
    portfolio,
    refresh,
    selectedFilter,
  } = useMetalPortfolio();
  const [isAddHoldingVisible, setIsAddHoldingVisible] = useState(false);

  const openAddHolding = useCallback((): void => {
    setIsAddHoldingVisible(true);
  }, []);
  const closeAddHolding = useCallback((): void => {
    setIsAddHoldingVisible(false);
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
          label: t("add_holding"),
          iconColor: palette.nileGreen[600],
          darkIconColor: palette.nileGreen[400],
          transparent: true,
          onPress: openAddHolding,
        }}
      />
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
        selectedFilter={selectedFilter}
      />
      <AddHoldingModal
        visible={isAddHoldingVisible}
        onClose={closeAddHolding}
      />
    </View>
  );
}
