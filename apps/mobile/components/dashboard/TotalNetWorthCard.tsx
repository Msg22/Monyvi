import { palette } from "@/constants/colors";
import { TotalNetWorthSkeleton } from "@/components/dashboard/skeletons/TotalNetWorthSkeleton";
import { CurrencyType } from "@monyvi/db";
import {
  formatCanonicalDecimalForDisplay,
  formatCurrency,
  resolveMetalsCurrencyMinorUnits,
} from "@monyvi/logic";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import React from "react";
import { Dimensions, Text, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

interface Props {
  totalNetWorth: number | string | null;
  totalNetWorthUsd: number | string | null;
  preferredCurrency: CurrencyType;
  monthlyPercentageChange: number | null;
  isLoading: boolean;
}

const { width } = Dimensions.get("window");

function TotalNetWorthCardComponent({
  totalNetWorth,
  totalNetWorthUsd,
  preferredCurrency,
  monthlyPercentageChange,
  isLoading,
}: Props): React.JSX.Element {
  const { t, i18n } = useTranslation("common");

  if (isLoading) {
    return <TotalNetWorthSkeleton />;
  }

  const isPositive =
    monthlyPercentageChange !== null && monthlyPercentageChange >= 0;
  const arrowIcon = isPositive ? "arrow-up" : "arrow-down";
  const arrowColor = isPositive ? palette.nileGreen[400] : palette.red[400];
  const arrowRotation = isPositive ? "40deg" : "-40deg";
  const isPreferredCurrencyUSD = preferredCurrency === "USD";
  const monthlyPercentageChangeFormatted =
    monthlyPercentageChange !== null
      ? `${monthlyPercentageChange >= 0 ? "+" : ""}${monthlyPercentageChange.toFixed(1)}%`
      : null;
  const glowWidth = width;
  const glowHeight = 60;
  const locale = i18n.resolvedLanguage === "ar" ? "ar-EG" : "en-US";

  return (
    <View className="relative my-4 items-center justify-center">
      <View
        className="absolute bottom-[-35px] items-center z-[-1]"
        style={{ width: glowWidth, height: glowHeight }}
      >
        <Svg height="100%" width="100%">
          <Defs>
            <RadialGradient
              id="card-glow"
              cx="50%"
              cy="0%"
              rx="50%"
              ry="100%"
              fx="50%"
              fy="0%"
              gradientUnits="userSpaceOnUse"
            >
              <Stop
                offset="0%"
                stopColor={palette.nileGreen[500]}
                stopOpacity="0.4"
              />
              <Stop
                offset="100%"
                stopColor={palette.nileGreen[500]}
                stopOpacity="0"
              />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#card-glow)" />
        </Svg>
      </View>

      <LinearGradient
        colors={[palette.nileGreen[800], palette.nileGreen[600]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className="relative min-h-[180px] w-full items-center overflow-hidden rounded-2xl border border-white/10 p-6 shadow-lg"
      >
        <View className="absolute bottom-0 start-0 end-0 top-0 overflow-hidden rounded-[24px]">
          <View className="absolute -bottom-20 -end-10 h-64 w-64 rotate-45 transform bg-white/5" />
          <View className="absolute bottom-10 -end-4 h-32 w-32 rotate-12 transform bg-white/5" />
          <View className="absolute -bottom-10 end-20 h-32 w-32 -rotate-12 transform bg-white/5" />
        </View>

        <View className="z-10 items-center gap-1">
          <Text className="text-sm font-medium tracking-wide text-slate-300 opacity-90">
            {t("total_net_worth")}
          </Text>
          <Text
            className="mt-1 text-[42px] font-extrabold tracking-tight text-white text-center"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            {formatNetWorthAmount(totalNetWorth, preferredCurrency, locale)}
          </Text>
          {!isPreferredCurrencyUSD && totalNetWorthUsd !== null && (
            <Text className="text-base font-medium text-slate-100 opacity-80">
              ≈{formatNetWorthAmount(totalNetWorthUsd, "USD", locale)}
            </Text>
          )}
          {monthlyPercentageChangeFormatted && (
            <View className="mt-2 flex-row items-center gap-1 rounded-full bg-white/10 px-3 py-1">
              <Ionicons
                name={arrowIcon}
                style={{ transform: [{ rotate: arrowRotation }] }}
                size={12}
                color={arrowColor}
              />
              <Text className="text-xs font-bold" style={{ color: arrowColor }}>
                {monthlyPercentageChangeFormatted} {t("month")}
              </Text>
            </View>
          )}
        </View>
      </LinearGradient>
    </View>
  );
}

function formatNetWorthAmount(
  value: number | string | null,
  currency: CurrencyType,
  locale: string
): string {
  if (value === null) return "—";
  if (typeof value === "number") {
    return formatCurrency({ amount: value, currency });
  }
  const precision = resolveMetalsCurrencyMinorUnits(`currency:${currency}`);
  if (precision === null) return "—";
  try {
    const amount = formatCanonicalDecimalForDisplay(value, {
      locale,
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    });
    return `${currency} ${amount}`;
  } catch {
    return "—";
  }
}

export const TotalNetWorthCard = React.memo(TotalNetWorthCardComponent);
