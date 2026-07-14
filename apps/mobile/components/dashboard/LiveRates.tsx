import type { CurrencyType, MarketRate } from "@monyvi/db";
import {
  CURRENCY_INFO_MAP,
  getCurrencyRate,
  getMetalPrice,
} from "@monyvi/logic";
import { FontAwesome5, Ionicons, MaterialIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { palette } from "@/constants/colors";
import { LiveRatesSkeleton } from "@/components/dashboard/skeletons/LiveRatesSkeleton";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "react-i18next";
import { formatTimeAgo } from "@/utils/dateHelpers";

interface Rate {
  id: string;
  label: string;
  value: string;
  trend: "up" | "down" | "flat";
  type: "currency" | "gold" | "silver";
}

interface LiveRatesProps {
  readonly latestRates: MarketRate | null;
  readonly previousDayRate: MarketRate | null;
  readonly isLoading: boolean;
  readonly lastUpdated: Date | null;
  readonly isStale: boolean;
  readonly preferredCurrency: CurrencyType;
}

// Pill style configurations using Tailwind classes
const pillConfig = {
  currency: {
    container: "bg-slate-100 dark:bg-slate-700/30",
    label: "text-slate-700 dark:text-slate-300",
  },
  gold: {
    container: "bg-gold-50 dark:bg-gold-400/20",
    label: "text-gold-800 dark:text-gold-400",
  },
  silver: {
    container: "bg-silver-bg dark:bg-slate-500/20",
    label: "text-slate-600 dark:text-slate-400",
  },
};

/**
 * Calculate trend direction by comparing current vs previous values
 */
function calculateTrend(
  current: number,
  previous: number | null | undefined
): "up" | "down" | "flat" {
  if (previous === null || previous === undefined || previous === 0) {
    return "flat";
  }
  if (current > previous) return "up";
  if (current < previous) return "down";
  return "flat";
}

/**
 * Build the currency pair rate entry (e.g. USD/EGP).
 * When the preferred currency IS USD, uses EUR as a reference instead.
 */
function buildCurrencyRate(
  latestRates: MarketRate,
  previousDayRate: MarketRate | null,
  preferredCurrency: CurrencyType
): Rate {
  const displayCurrency: CurrencyType =
    preferredCurrency === "USD" ? "EUR" : preferredCurrency;
  const currencyRate = getCurrencyRate(latestRates, "USD", displayCurrency);
  const previousRate = previousDayRate
    ? getCurrencyRate(previousDayRate, "USD", displayCurrency)
    : null;

  return {
    id: "1",
    label: `USD/${displayCurrency}`,
    value: currencyRate.toFixed(2),
    trend: calculateTrend(currencyRate, previousRate),
    type: "currency",
  };
}

/**
 * Build the gold 24K rate entry, priced per gram in the preferred currency.
 */
function buildGoldRate(
  latestRates: MarketRate,
  previousDayRate: MarketRate | null,
  preferredCurrency: CurrencyType,
  t: (key: string) => string
): Rate {
  const symbol =
    CURRENCY_INFO_MAP[preferredCurrency]?.symbol ?? preferredCurrency;
  const goldInPreferred = getMetalPrice("GOLD", latestRates, preferredCurrency);
  const prevGoldInPreferred = previousDayRate
    ? getMetalPrice("GOLD", previousDayRate, preferredCurrency)
    : null;

  return {
    id: "2",
    label: t("gold_24k_pill"),
    value: `${symbol} ${Math.round(goldInPreferred).toLocaleString()}/g`,
    trend: calculateTrend(goldInPreferred, prevGoldInPreferred),
    type: "gold",
  };
}

/**
 * Build the silver rate entry, priced per gram in the preferred currency.
 */
function buildSilverRate(
  latestRates: MarketRate,
  previousDayRate: MarketRate | null,
  preferredCurrency: CurrencyType,
  t: (key: string) => string
): Rate {
  const symbol =
    CURRENCY_INFO_MAP[preferredCurrency]?.symbol ?? preferredCurrency;
  const silverInPreferred = getMetalPrice(
    "SILVER",
    latestRates,
    preferredCurrency
  );
  const prevSilverInPreferred = previousDayRate
    ? getMetalPrice("SILVER", previousDayRate, preferredCurrency)
    : null;

  return {
    id: "3",
    label: t("silver_pill"),
    value: `${symbol} ${silverInPreferred.toFixed(2)}/g`,
    trend: calculateTrend(silverInPreferred, prevSilverInPreferred),
    type: "silver",
  };
}

/**
 * Assemble the full list of rates displayed in the LiveRates component.
 * Returns an empty array when no rate data is available.
 */
function buildRatesDisplay(
  latestRates: MarketRate | null,
  previousDayRate: MarketRate | null,
  preferredCurrency: CurrencyType,
  t: (key: string) => string
): Rate[] {
  if (!latestRates) {
    return [];
  }

  return [
    buildCurrencyRate(latestRates, previousDayRate, preferredCurrency),
    buildGoldRate(latestRates, previousDayRate, preferredCurrency, t),
    buildSilverRate(latestRates, previousDayRate, preferredCurrency, t),
  ];
}

/**
 * Selects the React element used as the icon inside a rate pill.
 *
 * Uses the preferredCurrency to determine which flag to show for currency pills
 * (treats `"USD"` as `"EUR"` for flag selection).
 *
 * @param type - The rate item type ("currency", "gold", or "silver")
 * @param color - Color to apply to icon glyphs (ignored for flag text)
 * @param preferredCurrency - The user's preferred currency used to pick a flag
 * @returns A React element to render inside the pill (flag text for currency, coin icons for gold/silver), or `null` if the type is unrecognized
 */
function getPillIcon(
  type: Rate["type"],
  color: string,
  preferredCurrency: CurrencyType
): React.ReactElement | null {
  const displayCurrency =
    preferredCurrency === "USD" ? "EUR" : preferredCurrency;
  const flag = CURRENCY_INFO_MAP[displayCurrency]?.flag ?? "🌐";
  switch (type) {
    case "currency":
      return <Text className="text-sm">{flag}</Text>;
    case "gold":
      return <FontAwesome5 name="coins" size={14} color={color} />;
    case "silver":
      return <FontAwesome5 name="coins" size={12} color={color} solid />;
    default:
      return null;
  }
}

/**
 * Render a horizontal list of live currency and precious-metal rates as pill-style UI.
 *
 * Displays loading and staleness indicators, adapts labels and values to `preferredCurrency`,
 * and optionally shows a "Last updated" timestamp when `lastUpdated` is provided.
 *
 * @returns The React element rendering the live rates pills, status indicators, and timestamp.
 */
function LiveRatesComponent({
  latestRates,
  previousDayRate,
  isLoading = false,
  lastUpdated,
  isStale,
  preferredCurrency,
}: LiveRatesProps): React.ReactElement {
  const { isDark } = useTheme();
  const { t } = useTranslation("common");
  const { t: tMetals } = useTranslation("metals");
  const ratesDisplay = useMemo(
    () =>
      buildRatesDisplay(
        latestRates,
        previousDayRate,
        preferredCurrency,
        tMetals
      ),
    [latestRates, previousDayRate, preferredCurrency, tMetals]
  );

  const handlePress = useCallback((): void => {
    router.push("/live-rates" as never);
  }, []);

  // Show the skeleton only on the true first load (no cached rates yet).
  // During a pull-to-refresh of existing rates, keep the stale pills on
  // screen and rely on the small inline spinner in the header — that's a
  // "refresh indicator", not a "content loading" state. Both guards are
  // required: `isLoading` alone would clobber existing pills on refresh;
  // `ratesDisplay.length === 0` alone would render an empty block when
  // the first load fails.
  const showSkeleton = isLoading && ratesDisplay.length === 0;
  if (showSkeleton) {
    return <LiveRatesSkeleton />;
  }

  return (
    <View className="my-4">
      <View className="mb-3 flex-row items-center justify-between">
        <View className="flex-row items-center">
          <Text className="header-text ms-1 text-slate-800 dark:text-slate-50">
            {t("live_rates")}
          </Text>
          {isLoading && (
            <ActivityIndicator
              size="small"
              className="ms-2"
              color={palette.nileGreen[500]}
            />
          )}
          {isStale && (
            <View className="ms-2 flex-row items-center">
              <Ionicons
                name="alert-circle-outline"
                size={16}
                color={palette.orange[500]}
              />
            </View>
          )}
        </View>
        <TouchableOpacity
          onPress={handlePress}
          activeOpacity={0.7}
          className="flex-row items-center"
        >
          <Text className="text-sm font-medium text-nileGreen-600 dark:text-nileGreen-400">
            {t("view_all_rates")}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={isDark ? palette.nileGreen[400] : palette.nileGreen[600]}
          />
        </TouchableOpacity>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingHorizontal: 4 }}
      >
        {ratesDisplay.map((rate) => {
          const config = pillConfig[rate.type];
          const iconColor =
            rate.type === "gold"
              ? isDark
                ? palette.gold[400]
                : palette.gold[600]
              : isDark
                ? palette.slate[400]
                : palette.slate[600];

          return (
            <View
              key={rate.id}
              className={`flex-row items-center rounded-full px-3 py-2 ${config.container}`}
            >
              <View className="me-1.5">
                {getPillIcon(rate.type, iconColor, preferredCurrency)}
              </View>

              <Text className={`me-1 text-[13px] font-medium ${config.label}`}>
                {rate.label}:
              </Text>
              <Text className="stat-value">{rate.value}</Text>

              {rate.trend !== "flat" && (
                <MaterialIcons
                  name={
                    rate.trend === "up" ? "arrow-drop-up" : "arrow-drop-down"
                  }
                  size={22}
                  color={
                    rate.trend === "up"
                      ? palette.nileGreen[500]
                      : palette.red[500]
                  }
                  style={{ marginStart: 2, marginEnd: -4 }}
                />
              )}
            </View>
          );
        })}
      </ScrollView>
      {lastUpdated && (
        <Text className="ms-1 mt-2 text-xs text-slate-500 dark:text-slate-400">
          {t("last_updated")} {formatTimeAgo(lastUpdated)}
        </Text>
      )}
    </View>
  );
}

export const LiveRates = React.memo(LiveRatesComponent);
