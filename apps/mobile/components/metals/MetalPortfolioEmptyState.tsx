import { METAL_RENDER_MANIFEST } from "@/assets/images/metals/manifest";
import { palette } from "@/constants/colors";
import {
  getTabContentBottomClearance,
  shouldUseCompactLayout,
} from "@/constants/ui";
import type { MetalPortfolioSectionReadiness } from "@/hooks/metal-portfolio-readiness";
import { useUiPolishCopy } from "@/hooks/useUiPolishCopy";
import type { MetalPortfolioReadModel } from "@/services/metal-portfolio-read-model-service";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  I18nManager,
  Image,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";

interface MetalPortfolioEmptyStateProps {
  readonly bottomInset?: number;
  readonly hasHistory?: boolean;
  readonly onAddPress: () => void;
  readonly onHistoryPress?: () => void;
}

export interface MetalEmptyStateLayout {
  readonly illustrationSize: number;
  readonly isCompact: boolean;
  readonly verticalGap: number;
}

export function MetalPortfolioEmptyState({
  bottomInset = 0,
  hasHistory = false,
  onAddPress,
  onHistoryPress,
}: MetalPortfolioEmptyStateProps): React.JSX.Element {
  const copy = useUiPolishCopy();
  const { t } = useTranslation("metals");
  const { fontScale, width } = useWindowDimensions();
  const layout = getMetalEmptyStateLayout(width, fontScale);

  return (
    <ScrollView
      className="flex-1 bg-background dark:bg-background-dark"
      contentContainerStyle={{
        flexGrow: 1,
        paddingBottom: getTabContentBottomClearance(bottomInset),
      }}
      showsVerticalScrollIndicator={false}
      testID="metal-portfolio-empty-state"
    >
      <View className="flex-1 justify-center px-5 py-4">
        <EmptyMetalsIllustration size={layout.illustrationSize} />

        <View
          className="items-center"
          style={{ marginTop: layout.verticalGap }}
        >
          <Text
            accessibilityRole="header"
            className="text-center text-[28px] font-bold leading-9 text-text-primary dark:text-text-primary-dark"
          >
            {copy.metals_empty.title}
          </Text>
          <Text className="mt-4 text-center text-base leading-6 text-text-secondary dark:text-text-secondary-dark">
            {copy.metals_empty.body}
          </Text>
        </View>

        <Pressable
          accessible
          accessibilityLabel={copy.metals_empty.cta}
          accessibilityRole="button"
          className="mt-7 min-h-14 w-full rounded-full"
          onPress={onAddPress}
          style={({ pressed }) => ({ opacity: pressed ? 0.78 : 1 })}
          testID="metal-empty-add"
        >
          <LinearGradient
            className="min-h-14 w-full flex-row items-center justify-center gap-4 rounded-full px-5 py-1.5"
            colors={[palette.nileGreen[400], palette.nileGreen[500]]}
            end={{ x: 1, y: 0 }}
            start={{ x: 0, y: 0 }}
            testID="metal-empty-add-gradient"
          >
            <View className="h-11 w-11 items-center justify-center rounded-full bg-nileGreen-900">
              <Ionicons name="add" size={30} color={palette.slate[25]} />
            </View>
            <Text className="min-w-0 shrink text-center text-lg font-bold text-slate-900">
              {copy.metals_empty.cta}
            </Text>
          </LinearGradient>
        </Pressable>

        {hasHistory && onHistoryPress ? (
          <Pressable
            accessibilityLabel={t("portfolio.recent_history")}
            accessibilityRole="button"
            className="mt-3 min-h-11 flex-row items-center justify-center gap-1"
            onPress={onHistoryPress}
            style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
            testID="metal-empty-history"
          >
            <Text className="text-sm font-semibold text-nileGreen-700 dark:text-nileGreen-400">
              {t("portfolio.recent_history")}
            </Text>
            <Ionicons
              name={I18nManager.isRTL ? "chevron-back" : "chevron-forward"}
              size={18}
              color={palette.nileGreen[600]}
            />
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

function EmptyMetalsIllustration({
  size,
}: {
  readonly size: number;
}): React.JSX.Element {
  const goldCoin = METAL_RENDER_MANIFEST["gold:coin"];
  const silverBar = METAL_RENDER_MANIFEST["silver:bar"];
  const height = size * 0.72;

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      className="self-center"
      style={{ width: size, height }}
      testID="metal-empty-illustration"
    >
      <View
        className="absolute rounded-full border border-nileGreen-600 bg-nileGreen-800 dark:bg-nileGreen-900"
        style={{
          bottom: 0,
          left: size * 0.04,
          width: size * 0.92,
          height: size * 0.2,
          transform: [{ scaleY: 0.5 }],
        }}
      />

      {silverBar.kind === "object" ? (
        <>
          <View
            className="absolute"
            style={{
              right: size * 0.07,
              top: size * 0.03,
              width: size * 0.59,
              height: size * 0.34,
              zIndex: 1,
              shadowColor: palette.slate[950],
              shadowOffset: { width: 0, height: 5 },
              shadowOpacity: 0.28,
              shadowRadius: 7,
              elevation: 4,
            }}
          >
            <Image
              accessible={false}
              resizeMode="contain"
              source={silverBar.source}
              style={{ width: "100%", height: "100%" }}
              testID="metal-empty-silver-bar-back"
            />
          </View>
          <View
            className="absolute"
            style={{
              right: size * 0.02,
              top: size * 0.18,
              width: size * 0.59,
              height: size * 0.34,
              zIndex: 2,
              shadowColor: palette.slate[950],
              shadowOffset: { width: 0, height: 5 },
              shadowOpacity: 0.28,
              shadowRadius: 7,
              elevation: 4,
            }}
          >
            <Image
              accessible={false}
              resizeMode="contain"
              source={silverBar.source}
              style={{ width: "100%", height: "100%" }}
              testID="metal-empty-silver-bar-front"
            />
          </View>
        </>
      ) : null}

      {goldCoin.kind === "object" ? (
        <View
          className="absolute"
          style={{
            left: size * 0.05,
            top: size * 0.22,
            width: size * 0.54,
            height: size * 0.54,
            zIndex: 3,
            shadowColor: palette.slate[950],
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.32,
            shadowRadius: 8,
            elevation: 5,
          }}
        >
          <Image
            accessible={false}
            resizeMode="contain"
            source={goldCoin.source}
            style={{ width: "100%", height: "100%" }}
            testID="metal-empty-gold-coin"
          />
        </View>
      ) : null}
    </View>
  );
}

export function isTrueMetalPortfolioEmpty(
  portfolio: MetalPortfolioReadModel | null,
  readiness: MetalPortfolioSectionReadiness | undefined
): boolean {
  return Boolean(
    readiness?.summary &&
      readiness.holdings &&
      portfolio !== null &&
      portfolio.listState === "PORTFOLIO_EMPTY" &&
      portfolio.activeHoldings.length === 0
  );
}

export function getMetalEmptyStateLayout(
  width: number,
  fontScale: number
): MetalEmptyStateLayout {
  const isCompact = shouldUseCompactLayout(width, fontScale);
  return {
    isCompact,
    illustrationSize: isCompact ? 244 : 316,
    verticalGap: isCompact ? 12 : 24,
  };
}
