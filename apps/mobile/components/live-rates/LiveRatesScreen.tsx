/**
 * Live Rates Screen
 *
 * Main orchestrator component for the Live Rates feature.
 * Composes all presentational sub-components and wires them to
 * the `useLiveRatesScreen` hook for data.
 *
 * Layout (per approved mockup):
 * 1. LiveRatesHeader — back arrow + title + connection indicator
 * 2. GoldHeroCard — 24K price + 21K/18K chips + trend
 * 3. MetalCard × 2 — Silver + Platinum side-by-side
 * 4. CurrencySection — section header + search + list
 * 5. LiveRatesFooter — "Updated X min ago"
 *
 * Architecture & Design Rationale:
 * - Pattern: Container/Presenter (screen orchestrator)
 * - Why: Clean separation — hook handles data, screen handles layout.
 * - SOLID: SRP — only composes layout. OCP — new sections added without modifying existing ones.
 *
 * @module LiveRatesScreen
 */

import { palette } from "@/constants/colors";
import { useLiveRatesScreen } from "@/hooks/useLiveRatesScreen";
import React from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";

import { CurrencySection } from "./CurrencySection";
import { GoldHeroCard } from "./GoldHeroCard";
import { LiveRatesEmptyState } from "./LiveRatesEmptyState";
import { LiveRatesFooter } from "./LiveRatesFooter";
import { LiveRatesHeader } from "./LiveRatesHeader";
import { LiveRatesScreenSkeleton } from "./LiveRatesScreenSkeleton";
import { MetalCard } from "./MetalCard";

// =============================================================================
// Component
// =============================================================================

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
          {/* Metals Section */}
          <View className="px-5 pt-2">
            {/* Gold Hero Card */}
            <GoldHeroCard
              price24k={metals.price24k}
              price21k={metals.price21k}
              price18k={metals.price18k}
              trendPercent={metals.goldTrendPercent}
            />

            {/* Silver + Platinum side-by-side */}
            <View className="flex-row mt-3" style={{ gap: 12 }}>
              <MetalCard
                metalName={t("silver")}
                price={metals.silverPrice}
                trendPercent={metals.silverTrendPercent}
                borderColor={palette.silver[500]}
              />
              <MetalCard
                metalName={t("platinum")}
                price={metals.platinumPrice}
                trendPercent={metals.platinumTrendPercent}
                borderColor={palette.slate[400]}
              />
            </View>
          </View>

          {/* Currency Section */}
          <CurrencySection
            currencies={currencies}
            searchQuery={searchQuery}
            onSearchChange={onSearchChange}
            isExpanded={isExpanded}
            onToggleExpand={onToggleExpand}
            preferredCurrencyLabel={preferredCurrencyLabel}
            showSeeAll={showSeeAll}
          />

          {/* Footer */}
          <LiveRatesFooter lastUpdatedText={lastUpdatedText} />
        </ScrollView>
      )}
    </View>
  );
}
