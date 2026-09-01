import { Skeleton } from "@/components/ui/Skeleton";
import type { CurrencyType } from "@monyvi/db";
import { formatCurrency } from "@monyvi/logic";
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
  readonly amountDecimal: string | null;
  readonly currency: CurrencyType;
  readonly label: string;
  readonly onPress: () => void;
  readonly shareLabel: string;
  readonly testID: string;
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
        <Skeleton width="100%" height={184} borderRadius={20} />
      </View>
    );
  }

  if (breakdown === null) {
    return <View testID="wealth-breakdown-unavailable" />;
  }

  return (
    <View
      testID="wealth-breakdown-root"
      className="my-4 rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
    >
      <Text className="text-lg font-bold text-text-primary dark:text-text-primary-dark">
        {t("wealth_breakdown.title")}
      </Text>
      <View className="mt-3 flex-row gap-3">
        <WealthTile
          accentClassName="bg-nileGreen-500"
          amountDecimal={breakdown.accounts.amountDecimal}
          currency={currency}
          label={t("wealth_breakdown.accounts")}
          onPress={onAccountsPress}
          shareLabel={t("wealth_breakdown.of_net_worth", {
            amount: amount(breakdown.accounts.amountDecimal),
            share: formatShare(breakdown.accounts.shareOfNetWorth),
          })}
          testID="wealth-breakdown-accounts"
        />
        <WealthTile
          accentClassName="bg-amber-500"
          amountDecimal={breakdown.metals.amountDecimal}
          currency={currency}
          label={t("wealth_breakdown.metals")}
          onPress={onMetalsPress}
          shareLabel={t("wealth_breakdown.of_net_worth", {
            amount: amount(breakdown.metals.amountDecimal),
            share: formatShare(breakdown.metals.shareOfNetWorth),
          })}
          testID="wealth-breakdown-metals"
        />
      </View>
      <View className="mt-4 rounded-2xl bg-slate-50 p-3 dark:bg-slate-900">
        <Text className="text-sm font-semibold text-text-primary dark:text-text-primary-dark">
          {t("wealth_breakdown.metals")}
        </Text>
        <View className="mt-2 flex-row flex-wrap gap-x-5 gap-y-2">
          <MetalAmount
            amount={amount(breakdown.metals.gold.amountDecimal)}
            label={t("wealth_breakdown.gold")}
            share={t("wealth_breakdown.of_metals", {
              amount: amount(breakdown.metals.gold.amountDecimal),
              share: formatShare(breakdown.metals.gold.shareOfMetals),
            })}
          />
          <MetalAmount
            amount={amount(breakdown.metals.silver.amountDecimal)}
            label={t("wealth_breakdown.silver")}
            share={t("wealth_breakdown.of_metals", {
              amount: amount(breakdown.metals.silver.amountDecimal),
              share: formatShare(breakdown.metals.silver.shareOfMetals),
            })}
          />
        </View>
      </View>
    </View>
  );
}

function WealthTile({
  accentClassName,
  amountDecimal,
  currency,
  label,
  onPress,
  shareLabel,
  testID,
}: WealthTileProps): React.JSX.Element {
  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${shareLabel}`}
      onPress={onPress}
      testID={testID}
      className="min-h-28 flex-1 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900"
    >
      <View className={`h-1 w-8 rounded-full ${accentClassName}`} />
      <Text className="mt-3 text-sm font-semibold text-text-primary dark:text-text-primary-dark">
        {label}
      </Text>
      <Text
        numberOfLines={1}
        className="mt-1 text-sm font-bold text-text-primary dark:text-text-primary-dark"
      >
        {formatDecimalCurrency(amountDecimal, currency)}
      </Text>
      <Text className="mt-1 text-xs text-text-secondary dark:text-text-secondary-dark">
        {shareLabel}
      </Text>
    </Pressable>
  );
}

function MetalAmount({
  amount,
  label,
  share,
}: {
  readonly amount: string;
  readonly label: string;
  readonly share: string;
}): React.JSX.Element {
  return (
    <View className="min-w-28 flex-1">
      <Text className="text-xs font-semibold text-text-primary dark:text-text-primary-dark">
        {label}
      </Text>
      <Text className="mt-1 text-sm font-bold text-text-primary dark:text-text-primary-dark">
        {amount}
      </Text>
      <Text className="mt-1 text-xs text-text-secondary dark:text-text-secondary-dark">
        {share}
      </Text>
    </View>
  );
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
