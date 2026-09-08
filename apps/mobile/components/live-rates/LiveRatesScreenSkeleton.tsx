/**
 * Live Rates Skeleton
 *
 * Composable loading placeholder that matches the Live Rates page layout shape:
 * - Hero card (full-width, 120px)
 * - Two side-by-side cards (half-width, 80px)
 * - Five currency row placeholders (full-width, 48px)
 *
 * Architecture & Design Rationale:
 * - Pattern: Composable Primitive (Atomic Design)
 * - Why: Composed from the shared Skeleton primitive for consistent shimmer.
 * - SOLID: SRP — only renders the loading layout shape.
 *
 * @module LiveRatesSkeleton
 */

import { Skeleton } from "@/components/ui/Skeleton";
import React from "react";
import { View } from "react-native";

// =============================================================================
// Constants
// =============================================================================

const HERO_HEIGHT = 120;
const CARD_HEIGHT = 80;
const ROW_HEIGHT = 48;
const CURRENCY_ROW_COUNT = 5;
const GAP = 12;

// =============================================================================
// Component
// =============================================================================

export function LiveRatesScreenSkeleton(): React.JSX.Element {
  return (
    <View testID="live-rates-skeleton" className="px-5 pt-2">
      {/* Hero Gold Card skeleton */}
      <Skeleton width="100%" height={HERO_HEIGHT} borderRadius={16} />

      {/* Side-by-side metal cards */}
      <View className="flex-row mt-3" style={{ gap: GAP }}>
        <Skeleton width="48%" height={CARD_HEIGHT} borderRadius={12} />
        <Skeleton width="48%" height={CARD_HEIGHT} borderRadius={12} />
      </View>

      {/* Currency section header skeleton */}
      <View className="flex-row items-center justify-between mt-5 mb-3">
        <Skeleton width={100} height={20} borderRadius={4} />
        <Skeleton width={60} height={20} borderRadius={10} />
      </View>

      {/* Currency row skeletons */}
      {Array.from({ length: CURRENCY_ROW_COUNT }).map((_, index) => (
        <Skeleton
          key={`currency-skeleton-${index}`}
          width="100%"
          height={ROW_HEIGHT}
          borderRadius={8}
          style={{ marginBottom: 8 }}
        />
      ))}
    </View>
  );
}
