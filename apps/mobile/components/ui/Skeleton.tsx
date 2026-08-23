/**
 * Reusable Skeleton Shimmer Component
 *
 * A composable primitive for building loading placeholders.
 * Each page composes page-specific skeleton layouts from these primitives.
 *
 * Architecture & Design Rationale:
 * - Pattern: Composable Primitive (Atomic Design)
 * - Why: A single primitive can be composed into any page-specific loading layout.
 *   Avoids duplicating animation/shimmer logic per page.
 * - SOLID: SRP — renders only a shimmer block.
 *   Open/Closed — new layouts composed without modifying the primitive.
 *
 * @module Skeleton
 */

import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useState } from "react";
import {
  type LayoutChangeEvent,
  type StyleProp,
  View,
  type ViewStyle,
} from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { palette } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SkeletonProps {
  /** Width of the skeleton block (number for dp, string for percentage) */
  readonly width: number | string;
  /** Height of the skeleton block in dp */
  readonly height: number;
  /** Border radius for the skeleton block. Default: 8 */
  readonly borderRadius?: number;
  /** Additional styles to apply to the container */
  readonly style?: StyleProp<ViewStyle>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ANIMATION_DURATION_MS = 1200;

/** Shimmer base colors per theme */
const SHIMMER_COLORS = {
  light: {
    base: palette.slate[200],
    highlight: palette.slate[100],
  },
  dark: {
    base: palette.slate[700],
    highlight: palette.slate[600],
  },
} as const;

/** Multiplier for gradient width relative to container width */
const GRADIENT_WIDTH_MULTIPLIER = 2;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * A shimmer skeleton placeholder for loading states.
 *
 * Usage:
 * ```tsx
 * // Single skeleton block
 * <Skeleton width={200} height={20} borderRadius={4} />
 *
 * // Compose into a page skeleton
 * <View>
 *   <Skeleton width="100%" height={120} borderRadius={16} />
 *   <Skeleton width="60%" height={16} style={{ marginTop: 12 }} />
 *   <Skeleton width="40%" height={16} style={{ marginTop: 8 }} />
 * </View>
 * ```
 */
export function Skeleton({
  width,
  height,
  borderRadius = 8,
  style,
}: SkeletonProps): React.JSX.Element {
  const { isDark } = useTheme();
  const shimmerPosition = useSharedValue(-1);
  const isReducedMotion = useReducedMotion();
  const [containerWidth, setContainerWidth] = useState(0);

  const colors = isDark ? SHIMMER_COLORS.dark : SHIMMER_COLORS.light;

  // Start the shimmer animation
  useEffect(() => {
    if (isReducedMotion) {
      shimmerPosition.value = 0;
      return (): void => {
        cancelAnimation(shimmerPosition);
      };
    }

    shimmerPosition.value = withRepeat(
      withTiming(1, { duration: ANIMATION_DURATION_MS }),
      -1, // infinite repeat
      false // no reverse
    );
    return (): void => {
      cancelAnimation(shimmerPosition);
    };
  }, [isReducedMotion, shimmerPosition]);

  const handleLayout = useCallback((event: LayoutChangeEvent): void => {
    setContainerWidth(event.nativeEvent.layout.width);
  }, []);

  const containerStyle: ViewStyle = {
    width: width as number,
    height,
    borderRadius,
    backgroundColor: colors.base,
    overflow: "hidden",
  };

  const gradientWidth =
    containerWidth > 0 ? containerWidth * GRADIENT_WIDTH_MULTIPLIER : 0;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX:
          containerWidth > 0 ? shimmerPosition.value * containerWidth : 0,
      },
    ],
  }));

  const gradientContainerStyle: ViewStyle = {
    flex: 1,
    width: gradientWidth,
  };

  return (
    <View
      testID="skeleton-block"
      style={[containerStyle, style]}
      onLayout={handleLayout}
      accessible={false}
      importantForAccessibility="no"
    >
      {!isReducedMotion ? (
        <Animated.View
          testID="skeleton-shimmer"
          className="flex-1"
          style={animatedStyle}
        >
          <LinearGradient
            colors={[colors.base, colors.highlight, colors.base]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={gradientContainerStyle}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}
