import React from "react";
import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path } from "react-native-svg";
import { palette } from "@/constants/colors";
import {
  formatLocalizedMoneyAmount,
  formatLocalizedMoneyNumber,
} from "@/utils/localized-money-display";
import { PitchMockCard } from "./PitchMockCard";

/**
 * Mock card for the Live Market pitch slide.
 *
 * Mirrors `specs/026-onboarding-restructure/mockups/03-slide-live-market.png`
 * after the 2026-04-26 user-feedback round:
 *  - Localized mock net-worth amount + green "+2.1% ↑" pill on the right.
 *  - Smooth line-chart silhouette (replaces the previous bar-chart
 *    approximation, which the user flagged as not matching the mockup).
 *  - 3 asset rows: bullet + label + value with directional arrow.
 *  - Footer caption: pulsing-green "live" dot + "updated 2 min ago".
 *
 * Monetary values are fixed illustration data, but their digits, separators,
 * currency labels, and per-gram unit follow the active app locale.
 */
/**
 * Minutes-ago value baked into the "live · updated N min ago" footer.
 * Pulled out of the JSX so the magic number sits next to the other
 * mock-illustration values in this file (round-2 review #21).
 */
const MOCK_LIVE_AGE_MINUTES = 2;

interface MarketRow {
  readonly key: string;
  readonly bulletColor: string;
  readonly labelKey: string;
  readonly amount: number;
  readonly currency?: "EGP";
  readonly minimumFractionDigits: number;
  readonly maximumFractionDigits: number;
  readonly change: "up" | "down" | "flat";
  readonly tone: "amber" | "slate" | "green" | "red";
}

const MARKET_ROWS: readonly MarketRow[] = [
  {
    key: "gold",
    bulletColor: "#F59E0B",
    labelKey: "pitch_slide_live_market_gold_label",
    amount: 4218,
    currency: "EGP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    change: "up",
    tone: "amber",
  },
  {
    key: "silver",
    bulletColor: "#94A3B8",
    labelKey: "pitch_slide_live_market_silver_label",
    amount: 54.2,
    currency: "EGP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    change: "down",
    tone: "red",
  },
  {
    key: "usd",
    bulletColor: "#3B82F6",
    labelKey: "pitch_slide_live_market_usd_label",
    amount: 49.82,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    change: "flat",
    tone: "slate",
  },
];

const TONE_CLASS: Record<MarketRow["tone"], string> = {
  amber: "text-amber-600 dark:text-amber-400",
  slate: "text-slate-600 dark:text-slate-300",
  green: "text-nileGreen-600 dark:text-nileGreen-400",
  red: "text-red-500 dark:text-red-400",
};

const CHANGE_ICON: Record<
  MarketRow["change"],
  "arrow-up" | "arrow-down" | "remove"
> = {
  up: "arrow-up",
  down: "arrow-down",
  flat: "remove",
};

/**
 * Sparkline line chart — a smooth rising trend rendered with a single
 * cubic-bezier path inside an SVG. Replaces the prior bar-chart
 * approximation that didn't match the mockup.
 *
 * The path is hand-tuned to climb roughly left-to-right with a small dip,
 * matching the visual shape of `03-slide-live-market.png`.
 */
function ChartLine(): React.ReactElement {
  const width = 220;
  const height = 44;
  const stroke = palette.nileGreen[500];

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      <Path
        d="M0,32 C20,28 36,30 56,22 C76,14 96,18 116,16 C136,14 156,10 176,8 C196,6 208,4 220,2"
        stroke={stroke}
        strokeWidth={2.5}
        fill="none"
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * Pulsing green dot used as a "live" indicator. The dot is static (no
 * animation) for now — adding a Reanimated pulse is fine but unnecessary
 * for the visual fidelity the mockup shows.
 */
function LiveDot(): React.ReactElement {
  return (
    <View
      className="h-1.5 w-1.5 rounded-full bg-nileGreen-500"
      // Use accessibilityRole="image" to flag the dot as decorative for
      // screen readers; the "live · updated …" text carries the meaning.
      accessibilityRole="image"
    />
  );
}

export function Slide3LiveMarket(): React.ReactElement {
  const { t, i18n } = useTranslation("onboarding");
  const language = i18n.dir() === "rtl" ? "ar" : "en";
  const netWorth = formatLocalizedMoneyAmount({
    amount: 342180,
    currency: "EGP",
    language,
    englishPresentation: "code-prefix",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  const formatMarketValue = (row: MarketRow): string => {
    const amount = row.currency
      ? formatLocalizedMoneyAmount({
          amount: row.amount,
          currency: row.currency,
          language,
          englishPresentation: "code-suffix",
          minimumFractionDigits: row.minimumFractionDigits,
          maximumFractionDigits: row.maximumFractionDigits,
        })
      : formatLocalizedMoneyNumber({
          amount: row.amount,
          currency: "EGP",
          language,
          minimumFractionDigits: row.minimumFractionDigits,
          maximumFractionDigits: row.maximumFractionDigits,
        });

    return row.currency
      ? t("pitch_slide_live_market_per_gram", { amount })
      : amount;
  };

  return (
    <PitchMockCard>
      {/* Net worth header */}
      <Text className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
        {t("pitch_slide_live_market_net_worth_label")}
      </Text>

      <View className="mt-1 flex-row items-end justify-between">
        <Text className="text-2xl font-bold text-slate-900 dark:text-white">
          {netWorth}
        </Text>
        <View
          className="flex-row items-center rounded-full bg-nileGreen-500/15 px-2 py-0.5"
          style={{ columnGap: 2 }}
        >
          <Text className="text-[10px] font-semibold text-nileGreen-600 dark:text-nileGreen-300">
            {/* i18n-ignore: mock percentage display. */}
            +2.1%
          </Text>
          <Ionicons name="arrow-up" size={10} color={palette.nileGreen[600]} />
        </View>
      </View>

      {/* Sparkline line chart */}
      <View className="mt-3">
        <ChartLine />
      </View>

      {/* Asset rows */}
      <View className="mt-3" style={{ rowGap: 8 }}>
        {MARKET_ROWS.map((row) => (
          <View key={row.key} className="flex-row items-center">
            <View
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: row.bulletColor }}
            />
            <Text className="ms-2 flex-1 text-sm text-slate-700 dark:text-slate-200">
              {t(row.labelKey)}
            </Text>
            <View className="flex-row items-center" style={{ columnGap: 4 }}>
              <Text className={`text-sm font-semibold ${TONE_CLASS[row.tone]}`}>
                {formatMarketValue(row)}
              </Text>
              <Ionicons
                name={CHANGE_ICON[row.change]}
                size={10}
                color={
                  row.tone === "amber"
                    ? "#F59E0B" // amber-500 — not in the project palette today
                    : row.tone === "red"
                      ? "#EF4444"
                      : palette.slate[400]
                }
              />
            </View>
          </View>
        ))}
      </View>

      {/* Live caption — green dot + "live · updated N min ago" */}
      <View className="mt-3 flex-row items-center" style={{ columnGap: 6 }}>
        <LiveDot />
        <Text className="text-[10px] text-slate-400 dark:text-slate-500">
          {/* i18n-ignore-value: `minutes` is a baked-in mock value
              (matches "updated 2 min ago" in the mockup) — the message
              template itself IS localized. */}
          {t("pitch_slide_live_market_live_caption", {
            minutes: MOCK_LIVE_AGE_MINUTES,
          })}
        </Text>
      </View>
    </PitchMockCard>
  );
}
