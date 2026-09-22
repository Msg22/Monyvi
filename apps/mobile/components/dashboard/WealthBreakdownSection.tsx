import { Skeleton } from "@/components/ui/Skeleton";
import { palette } from "@/constants/colors";
import { shouldUseCompactLayout } from "@/constants/ui";
import type { CurrencyType } from "@monyvi/db";
import {
  formatCanonicalDecimalForDisplay,
  resolveCurrencyDisplayMinorUnits,
} from "@monyvi/logic";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useMemo } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { useTranslation } from "react-i18next";

import { resolveLocale } from "@/components/metals/portfolio-presentation";
import type { WealthBreakdownReadModel } from "@/services/net-worth-read-model-service";

interface WealthBreakdownSectionProps {
  readonly breakdown: WealthBreakdownReadModel | null;
  readonly closeAccessibilityLabel?: string;
  readonly currency: CurrencyType;
  readonly isLoading: boolean;
  readonly onAccountsPress: () => void;
  readonly onClose?: () => void;
  readonly onMetalsPress: () => void;
}

interface WealthTileProps {
  readonly accentClassName: string;
  readonly accessibilityLabel: string;
  readonly amountDecimal: string | null;
  readonly currency: CurrencyType;
  readonly label: string;
  readonly locale: string;
  readonly onPress: () => void;
  readonly shareLabel: string;
  readonly lightGradientColors: readonly [string, string, string];
  readonly darkGradientColors: readonly [string, string, string];
  readonly testID: string;
}

interface MetalAmountProps {
  readonly amount: string;
  readonly countLabel: string;
  readonly dotClassName: string;
  readonly label: string;
  readonly share: string;
  readonly testID: string;
}

export function WealthBreakdownSection({
  breakdown,
  closeAccessibilityLabel,
  currency,
  isLoading,
  onAccountsPress,
  onClose,
  onMetalsPress,
}: WealthBreakdownSectionProps): React.JSX.Element {
  const { t, i18n } = useTranslation("metals");
  const { fontScale, width } = useWindowDimensions();
  const primaryTilesClass = getWealthTilesLayoutClass(width, fontScale);
  const locale = resolveLocale(i18n?.resolvedLanguage);
  const amount = useMemo(
    (): ((value: string | null) => string) => (value) =>
      formatDecimalCurrency(value, currency, locale),
    [currency, locale]
  );

  if (isLoading) {
    return (
      <View testID="wealth-breakdown-skeleton" className="mb-4 mt-2 gap-3">
        <Skeleton width="100%" height={260} borderRadius={24} />
      </View>
    );
  }

  if (breakdown === null) {
    return <View testID="wealth-breakdown-unavailable" />;
  }

  const metalsLabel = t("wealth_breakdown.metals");
  const insideMetalsLabel = t("wealth_breakdown.inside_metals");
  const metalsSummaryLabel = t("wealth_breakdown.metals_summary", {
    currency,
    metals: metalsLabel,
  });
  const hasOwnedMetals =
    breakdown.metals.gold.holdingCount > 0 ||
    breakdown.metals.silver.holdingCount > 0;

  return (
    <View
      testID="wealth-breakdown-root"
      className="mb-4 mt-2 overflow-hidden rounded-3xl border border-slate-200 bg-surface px-4 pb-4 pt-4 dark:border-slate-700 dark:bg-slate-900"
    >
      <View className="flex-row items-start justify-between gap-3">
        <Text
          className="min-w-0 flex-1 text-lg font-bold text-text-primary dark:text-text-primary-dark"
          accessibilityRole="header"
        >
          {t("wealth_breakdown.title")}
        </Text>
        {onClose ? (
          <Pressable
            accessibilityLabel={
              closeAccessibilityLabel ?? t("wealth_breakdown.title")
            }
            accessibilityRole="button"
            className="min-h-11 min-w-11 items-center justify-center rounded-full border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
            onPress={onClose}
            style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
            testID="wealth-breakdown-close"
          >
            <Ionicons
              color={palette.slate[500]}
              name="close"
              size={24}
            />
          </Pressable>
        ) : null}
      </View>

      <View
        testID="wealth-breakdown-primary-tiles"
        className={`mt-3 gap-2.5 ${primaryTilesClass}`}
      >
        <WealthTile
          accentClassName="bg-nileGreen-500"
          amountDecimal={breakdown.accounts.amountDecimal}
          accessibilityLabel={t("wealth_breakdown.tile_accessibility", {
            amount: amount(breakdown.accounts.amountDecimal),
            label: t("wealth_breakdown.accounts"),
            share: t("wealth_breakdown.of_net_worth", {
              share: formatShare(breakdown.accounts.shareOfNetWorth, locale),
            }),
          })}
          currency={currency}
          label={t("wealth_breakdown.accounts")}
          locale={locale}
          onPress={onAccountsPress}
          shareLabel={t("wealth_breakdown.of_net_worth", {
            share: formatShare(breakdown.accounts.shareOfNetWorth, locale),
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
              share: formatShare(breakdown.metals.shareOfNetWorth, locale),
            }),
          })}
          currency={currency}
          label={metalsLabel}
          locale={locale}
          onPress={onMetalsPress}
          shareLabel={t("wealth_breakdown.of_net_worth", {
            share: formatShare(breakdown.metals.shareOfNetWorth, locale),
          })}
          lightGradientColors={METALS_LIGHT_GRADIENT}
          darkGradientColors={METALS_DARK_GRADIENT}
          testID="wealth-breakdown-metals"
        />
      </View>

      {hasOwnedMetals ? (
        <View className="mt-4">
          <View className="flex-row flex-wrap items-end justify-between gap-3">
            <Text className="text-[13px] font-bold text-text-primary dark:text-text-primary-dark">
              {insideMetalsLabel}
            </Text>
            <Text className="min-w-0 flex-1 text-end text-[9px] text-text-secondary dark:text-text-secondary-dark">
              {metalsSummaryLabel}
            </Text>
          </View>

          <View
            testID="wealth-breakdown-metal-details"
            className={`mt-1.5 gap-2.5 ${primaryTilesClass}`}
          >
            <MetalAmount
              amount={amount(breakdown.metals.gold.amountDecimal)}
              countLabel={t("holding", {
                count: breakdown.metals.gold.holdingCount,
              })}
              dotClassName="bg-gold-400"
              label={t("wealth_breakdown.gold")}
              share={t("wealth_breakdown.of_metals", {
                share: formatShare(breakdown.metals.gold.shareOfMetals, locale),
              })}
              testID="wealth-breakdown-gold-detail"
            />
            <MetalAmount
              amount={amount(breakdown.metals.silver.amountDecimal)}
              countLabel={t("holding", {
                count: breakdown.metals.silver.holdingCount,
              })}
              dotClassName="bg-silver-500"
              label={t("wealth_breakdown.silver")}
              share={t("wealth_breakdown.of_metals", {
                share: formatShare(
                  breakdown.metals.silver.shareOfMetals,
                  locale
                ),
              })}
              testID="wealth-breakdown-silver-detail"
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function WealthTile({
  accentClassName,
  accessibilityLabel,
  amountDecimal,
  currency,
  label,
  locale,
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
      style={({ pressed }) => ({ opacity: pressed ? 0.78 : 1 })}
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
        className={`absolute bottom-0 start-0 top-0 w-1 ${accentClassName}`}
      />
      <View className="px-4 py-3.5">
        <Text className="text-[11px] font-semibold text-text-primary dark:text-text-primary-dark">
          {label}
        </Text>
        <Text className="mt-2 text-[15px] font-bold text-text-primary dark:text-text-primary-dark">
          {formatDecimalCurrency(amountDecimal, currency, locale)}
        </Text>
        <Text className="mt-1 text-[10px] text-text-secondary dark:text-text-secondary-dark">
          {shareLabel}
        </Text>
      </View>
    </Pressable>
  );
}

function MetalAmount({
  amount,
  countLabel,
  dotClassName,
  label,
  share,
  testID,
}: MetalAmountProps): React.JSX.Element {
  return (
    <View
      className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-100 px-3 py-2 dark:border-slate-700/60 dark:bg-slate-800/50"
      testID={testID}
    >
      <View className="flex-row items-center gap-2">
        <View className={`h-2 w-2 rounded-full ${dotClassName}`} />
        <Text className="min-w-0 flex-1 text-[11px] font-bold text-text-primary dark:text-text-primary-dark">
          {label}
        </Text>
      </View>
      <Text className="mt-0.5 text-xs font-bold text-text-primary dark:text-text-primary-dark">
        {amount}
      </Text>
      <Text className="text-[9px] text-text-secondary dark:text-text-secondary-dark">
        {share} · {countLabel}
      </Text>
    </View>
  );
}

const ACCOUNT_LIGHT_GRADIENT = [
  palette.nileGreen[100],
  palette.nileGreen[50],
  palette.nileGreen[50],
] as const;

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

const METALS_DARK_GRADIENT = [
  `${palette.gold[600]}38`,
  `${palette.gold[600]}29`,
  `${palette.gold[800]}00`,
] as const;

function formatDecimalCurrency(
  value: string | null,
  currency: CurrencyType,
  locale: string
): string {
  if (value === null) return "—";
  const maximumFractionDigits = resolveCurrencyDisplayMinorUnits(currency);
  try {
    const amount = formatCanonicalDecimalForDisplay(value, {
      locale,
      minimumFractionDigits: 0,
      maximumFractionDigits,
    });
    return `${amount} ${currency}`;
  } catch {
    return "—";
  }
}

function formatShare(value: string | null, locale: string): string {
  if (value === null) return "—";
  try {
    const amount = formatCanonicalDecimalForDisplay(value, {
      locale,
      maximumFractionDigits: 1,
    });
    const percent =
      new Intl.NumberFormat(locale, { style: "percent" })
        .formatToParts(0)
        .find((part) => part.type === "percentSign")?.value ?? "%";
    return `${amount}${percent}`;
  } catch {
    return "—";
  }
}

export function getWealthTilesLayoutClass(
  width: number,
  fontScale: number
): "flex-col" | "flex-row" {
  return shouldUseCompactLayout(width, fontScale) ? "flex-col" : "flex-row";
}
