import React from "react";
import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { palette } from "@/constants/colors";
import { formatLocalizedMoneyAmount } from "@/utils/localized-money-display";
import { PitchMockCard } from "./PitchMockCard";

/**
 * Mock card for the Offline-first pitch slide (iOS only).
 *
 * Mirrors `specs/026-onboarding-restructure/mockups/02b-slide-offline-ios.png`:
 *  - Top row: "⚡ INSTANT" pill (green).
 *  - Section heading: "RECENTLY ADDED".
 *  - 3-row recent transaction list — emoji + amount + category · time + chevron.
 *  - Footer row: lightning + "All saved instantly" + "{N} pending" pill.
 *
 * Numeric mock values are baked into the illustration and not translated —
 * see `// i18n-ignore` comments.
 */
interface MockTx {
  readonly emoji: string;
  readonly amount: number;
  readonly category: string;
  readonly time: string;
}

const MOCK_TX: readonly MockTx[] = [
  {
    emoji: "☕",
    amount: 200,
    category: "Food & Drinks",
    time: "12:45 PM",
  },
  { emoji: "🚌", amount: 85, category: "Transport", time: "12:52 PM" },
  { emoji: "🛒", amount: 340, category: "Groceries", time: "1:03 PM" },
];

export function Slide2Offline(): React.ReactElement {
  const { t, i18n } = useTranslation("onboarding");
  const language = i18n.dir() === "rtl" ? "ar" : "en";

  return (
    <PitchMockCard>
      {/* Status pills row */}
      <View className="flex-row items-center justify-between">
        <View className="rounded-full bg-nileGreen-500/15 px-3 py-1">
          <Text className="text-xs font-bold uppercase tracking-wider text-nileGreen-600 dark:text-nileGreen-300">
            {t("pitch_slide_offline_status_instant")}
          </Text>
        </View>
      </View>

      {/* Section heading */}
      <Text className="mt-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
        {t("pitch_slide_offline_recently_added")}
      </Text>

      {/* Recent transaction stack */}
      <View className="mt-2" style={{ gap: 8 }}>
        {MOCK_TX.map((tx) => (
          <View
            key={`${tx.amount}-${tx.time}`}
            className="flex-row items-center"
            style={{ gap: 10 }}
          >
            <View className="h-8 w-8 items-center justify-center rounded-full bg-slate-50 dark:bg-slate-700">
              <Text className="text-base">{tx.emoji}</Text>
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-slate-900 dark:text-white">
                {formatLocalizedMoneyAmount({
                  amount: tx.amount,
                  currency: "EGP",
                  language,
                  englishPresentation: "code-suffix",
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })}
              </Text>
              <Text className="text-xs text-slate-500 dark:text-slate-400">
                {/* i18n-ignore: mock category + timestamp string for the illustration */}
                {tx.category} · {tx.time}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={14}
              color={palette.slate[400]}
            />
          </View>
        ))}
      </View>

      {/* Footer */}
      <View className="mt-4 flex-row items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-700">
        <View className="flex-row items-center" style={{ gap: 6 }}>
          <Ionicons name="flash" size={12} color={palette.nileGreen[500]} />
          <Text className="text-xs font-medium text-nileGreen-600 dark:text-nileGreen-300">
            {t("pitch_slide_offline_all_saved")}
          </Text>
        </View>
        <View className="rounded-full bg-slate-100 px-2.5 py-0.5 dark:bg-slate-700">
          <Text className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">
            {t("pitch_slide_offline_pending", { count: 3 })}
          </Text>
        </View>
      </View>
    </PitchMockCard>
  );
}
