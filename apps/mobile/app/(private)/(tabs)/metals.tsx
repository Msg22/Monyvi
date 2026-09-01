import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import React, { useCallback, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { AddHoldingModal } from "@/components/metals/AddHoldingModal";
import { MetalPortfolioScreen } from "@/components/metals/MetalPortfolioScreen";
import { PageHeader } from "@/components/navigation/PageHeader";
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

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <PageHeader
        title={t("my_metals")}
        rightAction={{ icon: "add-circle-outline", onPress: openAddHolding }}
      />
      <MetalPortfolioScreen
        bottomInset={tabBarHeight}
        currency={preferredCurrency}
        error={error}
        isLoading={isLoading}
        isOffline={isOffline}
        onFilterChange={onFilterChange}
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
