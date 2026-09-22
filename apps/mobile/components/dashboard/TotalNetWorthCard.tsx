import { TotalNetWorthSkeleton } from "@/components/dashboard/skeletons/TotalNetWorthSkeleton";
import { palette } from "@/constants/colors";
import type { CurrencyType } from "@monyvi/db";
import {
  formatCanonicalDecimalForDisplay,
  formatCurrency,
  resolveCurrencyDisplayMinorUnits,
} from "@monyvi/logic";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Dimensions, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { WealthDisclosure } from "./WealthDisclosure";

interface BreakdownDisclosureProps {
  readonly isExpanded: boolean;
  readonly label: string;
  readonly onPress: () => void;
}

interface Props {
  readonly breakdownDisclosure?: BreakdownDisclosureProps;
  readonly isLoading: boolean;
  readonly monthlyPercentageChange: number | null;
  readonly preferredCurrency: CurrencyType;
  readonly totalNetWorth: number | string | null;
  readonly totalNetWorthUsd: number | string | null;
}

const { width } = Dimensions.get("window");

function TotalNetWorthCardComponent({
  breakdownDisclosure,
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
  const isRtl =
    typeof i18n.dir === "function"
      ? i18n.dir(i18n.resolvedLanguage) === "rtl"
      : i18n.resolvedLanguage === "ar";
  const locale = isRtl ? "ar-EG" : "en-US";
  const amountTextStyle = {
    textAlign: isRtl ? ("right" as const) : ("left" as const),
    writingDirection: "ltr" as const,
  };

  return (
    <View
      className="relative mb-2 mt-4 items-center justify-center"
      testID="total-net-worth-card"
    >
      <View
        className="absolute bottom-[-35px] z-[-1] items-center"
        style={{ width, height: 60 }}
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
        className="relative w-full overflow-hidden rounded-3xl border border-nileGreen-500 px-6 pt-6 shadow-lg"
      >
        <View className="absolute bottom-0 start-0 end-0 top-0 overflow-hidden rounded-3xl">
          <View className="absolute -bottom-20 -end-10 h-64 w-64 rotate-45 transform bg-white/5" />
          <View className="absolute bottom-10 -end-4 h-32 w-32 rotate-12 transform bg-white/5" />
          <View className="absolute -bottom-10 end-20 h-32 w-32 -rotate-12 transform bg-white/5" />
        </View>

        <View className="z-10 w-full pb-5">
          <View className="flex-row flex-wrap items-start justify-between gap-3">
            <Text className="min-w-0 flex-1 text-start text-lg font-semibold text-white">
              {t("total_net_worth")}
            </Text>
            {monthlyPercentageChangeFormatted ? (
              <View className="flex-row items-center gap-1 rounded-full border border-white/10 bg-white/10 px-3 py-2">
                <Ionicons
                  name={arrowIcon}
                  style={{ transform: [{ rotate: arrowRotation }] }}
                  size={13}
                  color={arrowColor}
                />
                <Text
                  className="text-sm font-bold"
                  style={{ color: arrowColor }}
                >
                  {monthlyPercentageChangeFormatted}{" "}
                  <Text className="font-medium text-slate-100">
                    {t("month")}
                  </Text>
                </Text>
              </View>
            ) : null}
          </View>

          <View
            className={`mt-5 w-full ${isRtl ? "items-end" : "items-start"}`}
            testID="total-net-worth-values"
          >
            <Text
              adjustsFontSizeToFit
              className="text-[38px] font-extrabold leading-[46px] tracking-tight text-white"
              minimumFontScale={0.5}
              numberOfLines={1}
              style={amountTextStyle}
              testID="total-net-worth-primary-value"
            >
              {formatNetWorthAmount(totalNetWorth, preferredCurrency, locale)}
            </Text>
            {!isPreferredCurrencyUSD && totalNetWorthUsd !== null ? (
              <Text
                adjustsFontSizeToFit
                className="mt-2 text-lg font-medium text-slate-100 opacity-80"
                minimumFontScale={0.75}
                numberOfLines={1}
                style={amountTextStyle}
                testID="total-net-worth-usd-equivalent"
              >
                ≈ {formatNetWorthAmount(totalNetWorthUsd, "USD", locale)}
              </Text>
            ) : null}
          </View>
        </View>

        {breakdownDisclosure ? (
          <View className="-mx-6 border-t border-white/10 px-6 py-2">
            <WealthDisclosure {...breakdownDisclosure} />
          </View>
        ) : (
          <View className="h-1" />
        )}
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
  const precision = resolveCurrencyDisplayMinorUnits(currency);
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
