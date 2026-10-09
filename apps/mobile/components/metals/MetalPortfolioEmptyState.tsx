import { METAL_RENDER_MANIFEST } from "@/assets/images/metals/manifest";
import { palette } from "@/constants/colors";
import { shouldUseCompactLayout } from "@/constants/ui";
import { useTheme } from "@/context/ThemeContext";
import { useUiPolishCopy } from "@/hooks/useUiPolishCopy";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Image,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";

interface MetalPortfolioEmptyStateProps {
  readonly onAddPress?: () => void;
}

export interface MetalEmptyStateLayout {
  readonly illustrationSize: number;
  readonly verticalGap: number;
}

/**
 * Embedded below "Your items" in the same portfolio FlatList: rates, summary
 * and permanent History remain visible when there are no active holdings.
 */
export function MetalPortfolioEmptyState({
  onAddPress,
}: MetalPortfolioEmptyStateProps): React.JSX.Element {
  const copy = useUiPolishCopy();
  const { t } = useTranslation("metals");
  const { isDark } = useTheme();
  const { fontScale, width } = useWindowDimensions();
  const layout = getMetalEmptyStateLayout(width, fontScale);
  const addHoldingLabel = t("add_holding");

  return (
    <View
      className="w-full items-center py-5"
      testID="metal-portfolio-empty-state"
    >
      <EmptyMetalsIllustration size={layout.illustrationSize} />
      <View
        className="w-full items-center px-3"
        style={{ marginTop: layout.verticalGap }}
      >
        <Text
          accessibilityRole="header"
          className="max-w-full text-center text-xl font-bold leading-7 text-text-primary dark:text-text-primary-dark"
          testID="metal-empty-title"
        >
          {copy.metals_empty.title}
        </Text>
        <Text className="mt-2 max-w-full text-center text-base leading-6 text-text-secondary dark:text-text-secondary-dark">
          {copy.metals_empty.body}
        </Text>
      </View>
      {onAddPress ? (
        <Pressable
          accessible
          accessibilityLabel={addHoldingLabel}
          accessibilityRole="button"
          className="mt-5 min-h-11 max-w-full flex-row flex-wrap items-center justify-center gap-2 self-center rounded-xl border border-nileGreen-500 bg-transparent px-4 py-2.5"
          onPress={onAddPress}
          testID="metal-empty-add"
        >
          <Ionicons
            name="add"
            size={20}
            color={isDark ? palette.nileGreen[400] : palette.nileGreen[700]}
          />
          <Text className="shrink text-center text-sm font-semibold text-nileGreen-700 dark:text-nileGreen-400">
            {addHoldingLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
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
      {silverBar.kind === "object" ? (
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          className="absolute"
          style={{
            right: size * 0.08,
            top: size * 0.04,
            width: size * 0.62,
            height: size * 0.62,
            zIndex: 1,
            shadowColor: palette.slate[950],
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 4,
          }}
        >
          <Image
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            resizeMode="contain"
            source={silverBar.source}
            style={{ width: "100%", height: "100%" }}
            testID="metal-empty-silver-stack"
          />
        </View>
      ) : null}

      {goldCoin.kind === "object" ? (
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          className="absolute"
          style={{
            left: size * 0.08,
            top: size * 0.16,
            width: size * 0.52,
            height: size * 0.52,
            zIndex: 2,
            shadowColor: palette.slate[950],
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.32,
            shadowRadius: 8,
            elevation: 5,
          }}
        >
          <Image
            accessible={false}
            importantForAccessibility="no-hide-descendants"
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

export function getMetalEmptyStateLayout(
  width: number,
  fontScale: number
): MetalEmptyStateLayout {
  // Preserve the approved 196 × 141.12 reference at 360px. Only cap the
  // illustration on narrower screens; let localized text wrap naturally.
  const horizontalClearance = shouldUseCompactLayout(width, fontScale)
    ? 48
    : 64;
  return {
    illustrationSize: Math.min(196, Math.max(0, width - horizontalClearance)),
    verticalGap: 12,
  };
}
