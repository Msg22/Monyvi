import { Skeleton } from "@/components/ui/Skeleton";
import { palette } from "@/constants/colors";
import type { CurrencyType } from "@monyvi/db";
import { formatCurrency } from "@monyvi/logic";
import { LinearGradient } from "expo-linear-gradient";
import React, { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import type { WealthBreakdownReadModel } from "@/services/net-worth-read-model-service";

interface WealthBreakdownSectionProps {
  readonly breakdown: WealthBreakdownReadModel | null;
  readonly currency: CurrencyType;
  readonly isLoading: boolean;
  readonly onAccountsPress: () => void;
  readonly onMetalsPress: () => void;
}

interface WealthTileProps {
  readonly accentClassName: string;
  readonly accessibilityLabel: string;
  readonly amountDecimal: string | null;
  readonly currency: CurrencyType;
  readonly label: string;
  readonly onPress: () => void;
  readonly shareLabel: string;
  readonly lightGradientColors: readonly [string, string, string];
  readonly darkGradientColors: readonly [string, string, string];
  readonly testID: string;
}

interface MetalAmountProps {
  readonly amount: string;
  readonly dotClassName: string;
  readonly hasDivider?: boolean;
  readonly label: string;
  readonly share: string;
}

export function WealthBreakdownSection({
  breakdown,
  currency,
  isLoading,
  onAccountsPress,
  onMetalsPress,
}: WealthBreakdownSectionProps): React.JSX.Element {
  const { t } = useTranslation("metals");
  const amount = useMemo(
    (): ((value: string | null) => string) => (value) =>
      formatDecimalCurrency(value, currency),
    [currency]
  );

  if (isLoading) {
    return (
      <View testID="wealth-breakdown-skeleton" className="my-4 gap-3">
        <Skeleton width="100%" height={260} borderRadius={24} />
      </View>
    );
  }

  if (breakdown === null) {
    return <View testID="wealth-breakdown-unavailable" />;
  }

  const metalsLabel = t("wealth_breakdown.metals");
  const netWorthLabel = t("wealth_breakdown.net_worth");
  const insideMetalsLabel = t("wealth_breakdown.inside_metals");
  const metalsSummaryLabel = t("wealth_breakdown.metals_summary", {
    currency,
    metals: metalsLabel,
  });
  const hasPositiveMetalsTotal = hasPositiveDecimal(
    breakdown.metals.amountDecimal
  );
  const hasPositiveGold = hasPositiveDecimal(
    breakdown.metals.gold.amountDecimal
  );
  const hasPositiveSilver = hasPositiveDecimal(
    breakdown.metals.silver.amountDecimal
  );
  const hasAnyPositiveMetal = hasPositiveGold || hasPositiveSilver;

  return (
    <View
      testID="wealth-breakdown-root"
      className="my-4 overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-700 bg-surface px-4 pb-4 pt-4  dark:bg-slate-900"
    >
      <View className="flex-row items-start justify-between gap-3">
        <Text
          numberOfLines={2}
          className="min-w-0 flex-1 text-lg font-bold text-text-primary dark:text-text-primary-dark"
        >
          {t("wealth_breakdown.title")}
        </Text>
        <View className="shrink-0 items-end pl-2">
          <Text className="text-[11px] text-text-secondary dark:text-text-secondary-dark">
            {netWorthLabel}
          </Text>
          <Text
            numberOfLines={1}
            className="mt-0.5 text-[15px] font-bold text-text-primary dark:text-text-primary-dark"
          >
            {amount(breakdown.totalNetWorthDecimal)}
          </Text>
        </View>
      </View>

      <View className="mt-3 flex-row gap-2.5">
        <WealthTile
          accentClassName="bg-nileGreen-500"
          amountDecimal={breakdown.accounts.amountDecimal}
          accessibilityLabel={t("wealth_breakdown.tile_accessibility", {
            amount: amount(breakdown.accounts.amountDecimal),
            label: t("wealth_breakdown.accounts"),
            share: t("wealth_breakdown.of_net_worth", {
              share: formatShare(breakdown.accounts.shareOfNetWorth),
            }),
          })}
          currency={currency}
          label={t("wealth_breakdown.accounts")}
          onPress={onAccountsPress}
          shareLabel={t("wealth_breakdown.of_net_worth", {
            share: formatShare(breakdown.accounts.shareOfNetWorth),
          })}
          lightGradientColors={ACCOUNT_LIGHT_GRADIENT}
          darkGradientColors={ACCOUNT_DARK_GRADIENT}
          testID="wealth-breakdown-accounts"
        />
        <WealthTile
          accentClassName="bg-gold-400"
          amountDecimal={breakdown.metals.amountDecimal}
          accessibilityLabel={t("wealth_breakdown.tile_accessibility", {
            amount: amount(breakdown.metals.amountDecimal),
            label: metalsLabel,
            share: t("wealth_breakdown.of_net_worth", {
              share: formatShare(breakdown.metals.shareOfNetWorth),
            }),
          })}
          currency={currency}
          label={metalsLabel}
          onPress={onMetalsPress}
          shareLabel={t("wealth_breakdown.of_net_worth", {
            share: formatShare(breakdown.metals.shareOfNetWorth),
          })}
          lightGradientColors={METALS_LIGHT_GRADIENT}
          darkGradientColors={METALS_DARK_GRADIENT}
          testID="wealth-breakdown-metals"
        />
      </View>

      {hasPositiveMetalsTotal && hasAnyPositiveMetal && (
        <View className="mt-4">
          <View className="flex-row items-end justify-between gap-3">
            <Text className="text-[13px] font-bold text-text-primary dark:text-text-primary-dark">
              {insideMetalsLabel}
            </Text>
            <Text
              numberOfLines={1}
              className="min-w-0 flex-1 text-right text-[9px] text-text-secondary dark:text-text-secondary-dark"
            >
              {metalsSummaryLabel}
            </Text>
          </View>

          <View className="mt-1.5 min-h-14 flex-row overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-800/50">
            {hasPositiveGold && (
              <MetalAmount
                amount={amount(breakdown.metals.gold.amountDecimal)}
                dotClassName="bg-gold-400"
                hasDivider={hasPositiveSilver}
                label={t("wealth_breakdown.gold")}
                share={t("wealth_breakdown.of_metals", {
                  share: formatShare(breakdown.metals.gold.shareOfMetals),
                })}
              />
            )}
            {hasPositiveSilver && (
              <MetalAmount
                amount={amount(breakdown.metals.silver.amountDecimal)}
                dotClassName="bg-silver-500"
                label={t("wealth_breakdown.silver")}
                share={t("wealth_breakdown.of_metals", {
                  share: formatShare(breakdown.metals.silver.shareOfMetals),
                })}
              />
            )}
          </View>
        </View>
      )}
    </View>
  );
}

function WealthTile({
  accentClassName,
  accessibilityLabel,
  amountDecimal,
  currency,
  label,
  onPress,
  shareLabel,
  lightGradientColors,
  darkGradientColors,
  testID,
}: WealthTileProps): React.JSX.Element {
  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      testID={testID}
      className="relative min-h-24 flex-1 overflow-hidden rounded-2xl bg-slate-25 dark:bg-slate-900"
    >
      <View pointerEvents="none" className="absolute inset-0 dark:hidden">
        <LinearGradient
          colors={lightGradientColors}
          locations={[0, 0.58, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ flex: 1 }}
        />
      </View>
      <View pointerEvents="none" className="absolute inset-0 hidden dark:flex">
        <LinearGradient
          colors={darkGradientColors}
          locations={[0, 0.58, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ flex: 1 }}
        />
      </View>
      <View
        pointerEvents="none"
        className={`absolute bottom-0 left-0 top-0 w-1 ${accentClassName}`}
      />
      <View className="px-4 py-3.5">
        <Text className="text-[11px] font-semibold text-text-primary dark:text-text-primary-dark">
          {label}
        </Text>
        <Text
          numberOfLines={1}
          className="mt-2 text-[15px] font-bold text-text-primary dark:text-text-primary-dark"
        >
          {formatDecimalCurrency(amountDecimal, currency)}
        </Text>
        <Text
          numberOfLines={1}
          className="mt-1 text-[10px] text-text-secondary dark:text-text-secondary-dark"
        >
          {shareLabel}
        </Text>
      </View>
    </Pressable>
  );
}

function MetalAmount({
  amount,
  dotClassName,
  hasDivider = false,
  label,
  share,
}: MetalAmountProps): React.JSX.Element {
  return (
    <View
      className={`min-w-0 flex-1 px-3 py-1.5 ${
        hasDivider ? "border-r border-slate-200 dark:border-slate-700/60" : ""
      }`}
    >
      <View className="flex-row items-center gap-2">
        <View className={`h-2 w-2 rounded-full ${dotClassName}`} />
        <Text
          numberOfLines={1}
          className="min-w-0 flex-1 text-[11px] font-bold text-text-primary dark:text-text-primary-dark"
        >
          {label}
        </Text>
      </View>
      <Text
        numberOfLines={1}
        className="mt-0.5 text-xs font-bold text-text-primary dark:text-text-primary-dark"
      >
        {amount}
      </Text>
      <Text
        numberOfLines={1}
        className="text-[9px] text-text-secondary dark:text-text-secondary-dark"
      >
        {share}
      </Text>
    </View>
  );
}

const ACCOUNT_LIGHT_GRADIENT = [
  palette.nileGreen[100],
  palette.nileGreen[50],
  palette.nileGreen[50],
] as const;

// These translucent stops blend over slate-900 to reproduce the mockup's
// subtle teal surface instead of a bright green-to-navy sweep.
const ACCOUNT_DARK_GRADIENT = [
  `${palette.nileGreen[800]}99`,
  `${palette.nileGreen[800]}8C`,
  `${palette.nileGreen[800]}66`,
] as const;

const METALS_LIGHT_GRADIENT = [
  palette.gold[100],
  `${palette.gold[100]}D9`,
  `${palette.gold[100]}66`,
] as const;

// The approved dark mockup uses a restrained bronze tint that fades into
// slate rather than a saturated orange band.
const METALS_DARK_GRADIENT = [
  `${palette.gold[600]}38`,
  `${palette.gold[600]}29`,
  `${palette.gold[800]}00`,
] as const;

function hasPositiveDecimal(value: string | null): boolean {
  const amount = value === null ? Number.NaN : Number(value);
  return Number.isFinite(amount) && amount > 0;
}

function formatDecimalCurrency(
  value: string | null,
  currency: CurrencyType
): string {
  const amount = value === null ? Number.NaN : Number(value);
  if (!Number.isFinite(amount)) {
    return "—";
  }
  return formatCurrency({
    amount,
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatShare(value: string | null): string {
  return value === null ? "—" : `${value}%`;
}
