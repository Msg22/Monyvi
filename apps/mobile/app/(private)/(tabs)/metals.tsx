/**
 * My Metals Screen
 *
 * Main page for the Metals tab. Composes all metals components and
 * connects them to the useMetalHoldings data hook.
 *
 * Architecture & Design Rationale:
 * - Pattern: Page-Level Composer (Atomic Design)
 * - Why: Composes atomic/molecular components into a full page.
 *   Data fetching is delegated to useMetalHoldings hook.
 * - SOLID: SRP — orchestrates layout and data flow only.
 *   OCP — adding a new section doesn't modify existing components.
 *
 * @module MyMetalsScreen
 */

import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import React, { useCallback, useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PageHeader } from "@/components/navigation/PageHeader";
import {
  AddHoldingModal,
  EmptyMetalsState,
  HoldingCard,
  LiveRatesStrip,
  type MetalTab,
  MetalSplitCards,
  MetalTabs,
  MetalsHeroCard,
} from "@/components/metals";
import { Skeleton } from "@/components/ui/Skeleton";
import { palette } from "@/constants/colors";
import { ANDROID_SAFE_LIST_PROPS } from "@/constants/virtualized-list-policy";
import { useMarketRates } from "@/hooks/useMarketRates";
import { useMetalHoldings, type MetalHolding } from "@/hooks/useMetalHoldings";
import { usePreferredCurrency } from "@/hooks/usePreferredCurrency";

// ---------------------------------------------------------------------------
// Skeleton Dimension Constants
// ---------------------------------------------------------------------------

const HERO_SKELETON_HEIGHT = 160;
const SPLIT_CARD_HEIGHT = 100;
const TABS_SKELETON_HEIGHT = 44;
const HOLDING_SKELETON_HEIGHT = 72;
const RADIUS_LARGE = 24;
const RADIUS_SMALL = 16;
const PERCENTAGE_MULTIPLIER = 100;

// ---------------------------------------------------------------------------
// Skeleton Loading Component
// ---------------------------------------------------------------------------

function MetalsPageSkeleton(): React.JSX.Element {
  return (
    <View className="px-5 pt-4">
      {/* Hero Card Skeleton */}
      <Skeleton
        width="100%"
        height={HERO_SKELETON_HEIGHT}
        borderRadius={RADIUS_LARGE}
      />

      {/* Split Cards Skeleton */}
      <View className="flex-row gap-3 mt-6 mb-6">
        <View className="flex-1">
          <Skeleton
            width="100%"
            height={SPLIT_CARD_HEIGHT}
            borderRadius={RADIUS_SMALL}
          />
        </View>
        <View className="flex-1">
          <Skeleton
            width="100%"
            height={SPLIT_CARD_HEIGHT}
            borderRadius={RADIUS_SMALL}
          />
        </View>
      </View>

      {/* Tabs Skeleton */}
      <Skeleton
        width="100%"
        height={TABS_SKELETON_HEIGHT}
        borderRadius={RADIUS_SMALL}
      />

      {/* Holding Cards Skeleton */}
      <View className="mt-4 gap-3">
        <Skeleton
          width="100%"
          height={HOLDING_SKELETON_HEIGHT}
          borderRadius={RADIUS_SMALL}
        />
        <Skeleton
          width="100%"
          height={HOLDING_SKELETON_HEIGHT}
          borderRadius={RADIUS_SMALL}
        />
        <Skeleton
          width="100%"
          height={HOLDING_SKELETON_HEIGHT}
          borderRadius={RADIUS_SMALL}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HOLDING_KEY_EXTRACTOR = (item: MetalHolding): string => item.asset.id;

const FLAT_LIST_CONTENT_STYLE = { paddingBottom: 100 };

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

/**
 * Renders the My Metals screen with portfolio summary, holdings by type,
 * portfolio split, live rates strip, and add holding modal.
 */
export default function MyMetalsScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation("metals");
  const { latestRates, previousDayRate } = useMarketRates();
  const { preferredCurrency } = usePreferredCurrency();
  const {
    goldHoldings,
    silverHoldings,
    totalValue,
    profitLoss,
    portfolioSplit,
    isLoading,
  } = useMetalHoldings();

  const [activeTab, setActiveTab] = useState<MetalTab>("gold");
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMetalType, setModalMetalType] = useState<"GOLD" | "SILVER">(
    "GOLD"
  );

  const hasHoldings = goldHoldings.length > 0 || silverHoldings.length > 0;
  const activeHoldings = activeTab === "gold" ? goldHoldings : silverHoldings;

  // Compute 24h change for live rates strip
  const goldChangePercent =
    latestRates && previousDayRate && previousDayRate.goldUsdPerGram > 0
      ? ((latestRates.goldUsdPerGram - previousDayRate.goldUsdPerGram) /
          previousDayRate.goldUsdPerGram) *
        PERCENTAGE_MULTIPLIER
      : 0;

  const silverChangePercent =
    latestRates && previousDayRate && previousDayRate.silverUsdPerGram > 0
      ? ((latestRates.silverUsdPerGram - previousDayRate.silverUsdPerGram) /
          previousDayRate.silverUsdPerGram) *
        PERCENTAGE_MULTIPLIER
      : 0;

  const handleOpenModal = useCallback(
    (type: "GOLD" | "SILVER" = "GOLD"): void => {
      setModalMetalType(type);
      setModalVisible(true);
    },
    []
  );

  const handleCloseModal = useCallback((): void => {
    setModalVisible(false);
  }, []);

  const handleAddFromEmpty = useCallback((): void => {
    handleOpenModal("GOLD");
  }, [handleOpenModal]);

  const handleTabChange = useCallback((tab: MetalTab): void => {
    setActiveTab(tab);
  }, []);

  const renderHoldingItem = useCallback(
    ({ item }: { item: MetalHolding }): React.JSX.Element => (
      <HoldingCard holding={item} currency={preferredCurrency} />
    ),
    [preferredCurrency]
  );

  // ---------------------------------------------------------------------------
  // Header Content (rendered above FlatList)
  // ---------------------------------------------------------------------------
  const renderListHeader = useCallback(
    (): React.JSX.Element => (
      <View className="px-5 pt-2">
        {/* Hero Card */}
        <MetalsHeroCard
          totalValue={totalValue}
          profitLossAmount={profitLoss.amount}
          profitLossPercent={profitLoss.percent}
          currency={preferredCurrency}
        />

        {/* Portfolio Split */}
        <MetalSplitCards
          portfolioSplit={portfolioSplit}
          currency={preferredCurrency}
        />

        {/* Tabs */}
        <MetalTabs
          activeTab={activeTab}
          onTabChange={handleTabChange}
          goldCount={goldHoldings.length}
          silverCount={silverHoldings.length}
        />

        {/* Add Button for current tab */}
        <TouchableOpacity
          onPress={() =>
            handleOpenModal(activeTab === "gold" ? "GOLD" : "SILVER")
          }
          activeOpacity={0.8}
          className="flex-row items-center justify-center rounded-xl border border-dashed py-3 mb-3 border-slate-200 dark:border-slate-600"
        >
          <Ionicons name="add" size={18} color={palette.slate[400]} />
          <Text className="ms-1 text-sm font-semibold text-slate-400 dark:text-slate-500">
            {activeTab === "gold" ? t("add_gold") : t("add_silver")}
          </Text>
        </TouchableOpacity>
      </View>
    ),
    [
      totalValue,
      profitLoss,
      preferredCurrency,
      portfolioSplit,
      activeTab,
      handleTabChange,
      goldHoldings.length,
      silverHoldings.length,
      handleOpenModal,
      t,
    ]
  );

  const renderEmptyList = useCallback(
    (): React.JSX.Element => (
      <View className="items-center py-8 px-5">
        <Text className="text-sm text-slate-400 dark:text-slate-500">
          {activeTab === "gold"
            ? t("no_gold_holdings")
            : t("no_silver_holdings")}
        </Text>
      </View>
    ),
    [activeTab, t]
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <View className="flex-1">
      <PageHeader
        title={t("my_metals")}
        rightAction={{
          icon: "add-circle-outline",
          onPress: () => handleOpenModal(),
        }}
      />

      {isLoading ? (
        <MetalsPageSkeleton />
      ) : !hasHoldings ? (
        <EmptyMetalsState onAddHolding={handleAddFromEmpty} />
      ) : (
        <FlatList
          data={activeHoldings}
          keyExtractor={HOLDING_KEY_EXTRACTOR}
          renderItem={renderHoldingItem}
          ListHeaderComponent={renderListHeader}
          ListEmptyComponent={renderEmptyList}
          contentContainerStyle={FLAT_LIST_CONTENT_STYLE}
          showsVerticalScrollIndicator={false}
          // Performance optimizations
          {...ANDROID_SAFE_LIST_PROPS}
          maxToRenderPerBatch={10}
          windowSize={5}
          initialNumToRender={8}
        />
      )}

      {/* Live Rates Strip */}
      {latestRates && !isLoading ? (
        <LiveRatesStrip
          goldPricePerGramUsd={latestRates.goldUsdPerGram}
          silverPricePerGramUsd={latestRates.silverUsdPerGram}
          goldChangePercent={goldChangePercent}
          silverChangePercent={silverChangePercent}
          bottomInset={insets.bottom}
        />
      ) : null}

      {/* Add Holding Modal */}
      <AddHoldingModal
        visible={modalVisible}
        onClose={handleCloseModal}
        initialMetalType={modalMetalType}
      />
    </View>
  );
}
