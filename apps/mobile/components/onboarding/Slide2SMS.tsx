import React from "react";
import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { palette } from "@/constants/colors";
import { PitchMockCard } from "./PitchMockCard";

/**
 * Mock card for the SMS pitch slide (Android only).
 *
 * Mirrors `specs/026-onboarding-restructure/mockups/02a-slide-sms-android.png`:
 *  - Top: bank message bubble with a single envelope icon + sender + "2
 *    min ago".
 *  - Middle: down-arrow + "DETECTED" divider.
 *  - Bottom: parsed transaction card (amount + Groceries chip + "Auto-
 *    imported" + "Just now" status row).
 *
 * The previous implementation rendered TWO envelope icons (one inline
 * `<Text>📩</Text>` and another in the i18n string itself). Both are now
 * removed — there is exactly ONE envelope icon, sourced from
 * MaterialCommunityIcons, alongside an emoji-free i18n label
 * `"CIB Bank · 2 min ago"`.
 *
 * Numeric values ("485 EGP") are baked into the marketing illustration and
 * not translated — see `// i18n-ignore` comments.
 */
export function Slide2SMS(): React.ReactElement {
  const { t } = useTranslation("onboarding");

  return (
    <PitchMockCard>
      {/* Bank message bubble */}
      <View className="rounded-xl bg-slate-50 p-3 dark:bg-slate-700/60">
        <View className="flex-row items-center" style={{ columnGap: 6 }}>
          <MaterialCommunityIcons
            name="email-outline"
            size={14}
            color={palette.slate[500]}
          />
          <Text className="flex-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
            {t("pitch_slide_sms_bank_label")}
          </Text>
        </View>
        <Text className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          {t("pitch_slide_sms_bank_body")}
        </Text>
      </View>

      {/* Detected divider */}
      <View className="my-3 items-center">
        <Ionicons name="arrow-down" size={16} color={palette.slate[400]} />
        <Text className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          {t("pitch_slide_sms_detected")}
        </Text>
      </View>

      {/* Parsed transaction card */}
      <View className="rounded-xl border border-slate-100 p-3 dark:border-slate-700">
        <View className="flex-row items-center justify-between">
          <Text className="text-2xl font-bold text-slate-900 dark:text-white">
            {/* i18n-ignore: numeric mock value baked into the illustration */}
            485{" "}
            <Text className="text-base font-medium text-slate-500 dark:text-slate-400">
              {/* i18n-ignore: ISO currency code, not translatable */}
              EGP
            </Text>
          </Text>
          <View className="rounded-full bg-nileGreen-500/15 px-3 py-1">
            <Text className="text-xs font-semibold text-nileGreen-600 dark:text-nileGreen-300">
              {t("pitch_slide_sms_category_groceries")}
            </Text>
          </View>
        </View>

        <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {t("pitch_slide_sms_account")}
        </Text>

        <View className="mt-3 flex-row items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-700">
          <View className="flex-row items-center" style={{ columnGap: 6 }}>
            <Ionicons
              name="checkmark-circle"
              size={14}
              color={palette.nileGreen[500]}
            />
            <Text className="text-xs font-medium text-nileGreen-600 dark:text-nileGreen-300">
              {t("pitch_slide_sms_status_imported")}
            </Text>
          </View>
          <Text className="text-xs text-slate-400 dark:text-slate-500">
            {t("pitch_slide_sms_status_just_now")}
          </Text>
        </View>
      </View>
    </PitchMockCard>
  );
}
