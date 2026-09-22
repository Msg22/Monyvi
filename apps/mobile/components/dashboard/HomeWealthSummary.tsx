import type { CurrencyType } from "@monyvi/db";
import { parseCanonicalDecimal } from "@monyvi/logic";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import Animated, {
  FadeInDown,
  FadeOutUp,
  useReducedMotion,
} from "react-native-reanimated";

import { useUiPolishCopy } from "@/hooks/useUiPolishCopy";
import type { WealthBreakdownReadModel } from "@/services/net-worth-read-model-service";
import { TotalNetWorthCard } from "./TotalNetWorthCard";
import { WealthBreakdownSection } from "./WealthBreakdownSection";

interface HomeWealthSummaryProps {
  readonly breakdown: WealthBreakdownReadModel | null;
  readonly currency: CurrencyType;
  readonly isBreakdownLoading: boolean;
  readonly isLoading: boolean;
  readonly monthlyPercentageChange: number | null;
  readonly onAccountsPress: () => void;
  readonly onMetalsPress: () => void;
  readonly totalNetWorth: number | string | null;
  readonly totalNetWorthUsd: number | string | null;
}

const WEALTH_REVEAL_DURATION_MS = 180;

export function HomeWealthSummary({
  breakdown,
  currency,
  isBreakdownLoading,
  isLoading,
  monthlyPercentageChange,
  onAccountsPress,
  onMetalsPress,
  totalNetWorth,
  totalNetWorthUsd,
}: HomeWealthSummaryProps): React.JSX.Element {
  const copy = useUiPolishCopy();
  const prefersReducedMotion = Boolean(useReducedMotion());
  const [isExpanded, setIsExpanded] = useState(false);
  const canShowDisclosure =
    !isLoading && hasNonZeroCanonicalNetWorth(totalNetWorth);

  useFocusEffect(
    useCallback(() => {
      setIsExpanded(false);
      return () => {
        setIsExpanded(false);
      };
    }, [])
  );

  useEffect(() => {
    if (!canShowDisclosure) setIsExpanded(false);
  }, [canShowDisclosure]);

  const toggleBreakdown = useCallback((): void => {
    setIsExpanded((current) => !current);
  }, []);
  const closeBreakdown = useCallback((): void => {
    setIsExpanded(false);
  }, []);

  const revealDuration = getWealthRevealDuration(prefersReducedMotion);
  const entering = prefersReducedMotion
    ? undefined
    : FadeInDown.duration(revealDuration).withInitialValues({
        opacity: 0,
        transform: [{ translateY: -8 }],
      });
  const exiting = prefersReducedMotion ? undefined : FadeOutUp.duration(140);

  return (
    <>
      <TotalNetWorthCard
        breakdownDisclosure={
          canShowDisclosure
            ? {
                isExpanded,
                label: isExpanded
                  ? copy.wealth_breakdown.hide
                  : copy.wealth_breakdown.show,
                onPress: toggleBreakdown,
              }
            : undefined
        }
        isLoading={isLoading}
        monthlyPercentageChange={monthlyPercentageChange}
        preferredCurrency={currency}
        totalNetWorth={totalNetWorth}
        totalNetWorthUsd={totalNetWorthUsd}
      />
      {isExpanded && canShowDisclosure ? (
        <Animated.View
          entering={entering}
          exiting={exiting}
          testID="home-wealth-breakdown-reveal"
        >
          <WealthBreakdownSection
            breakdown={breakdown}
            closeAccessibilityLabel={copy.wealth_breakdown.close}
            currency={currency}
            isLoading={isBreakdownLoading}
            onAccountsPress={onAccountsPress}
            onClose={closeBreakdown}
            onMetalsPress={onMetalsPress}
          />
        </Animated.View>
      ) : null}
    </>
  );
}

export function hasNonZeroCanonicalNetWorth(
  value: number | string | null | undefined
): boolean {
  if (typeof value === "number") {
    return Number.isFinite(value) && value !== 0;
  }
  if (typeof value !== "string") return false;

  try {
    return !parseCanonicalDecimal(value).isZero();
  } catch {
    return false;
  }
}

export function getWealthRevealDuration(
  prefersReducedMotion: boolean
): 0 | typeof WEALTH_REVEAL_DURATION_MS {
  return prefersReducedMotion ? 0 : WEALTH_REVEAL_DURATION_MS;
}
