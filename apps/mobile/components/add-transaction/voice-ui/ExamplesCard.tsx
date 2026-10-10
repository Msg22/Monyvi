import { useLocale } from "@/context/LocaleContext";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { palette } from "@/constants/colors";

export function ExamplesCard({
  isArabic,
}: {
  readonly isArabic: boolean;
}): React.JSX.Element {
  const { t: tCommon } = useTranslation("common");
  const { fontFamily } = useLocale();

  const examples = [
    tCommon("voice_ui_example_first"),
    tCommon("voice_ui_example_second"),
    tCommon("voice_ui_example_third"),
  ];
  const enIcons = [
    "restaurant-outline",
    "car-outline",
    "cafe-outline",
  ] as const;

  return (
    <View
      testID="voice-examples-card"
      className="rounded-2xl border border-slate-200 bg-slate-25 p-4 dark:border-slate-700 dark:bg-slate-800"
    >
      <View
        className="flex-row items-center gap-3"
        style={{ direction: "ltr" }}
      >
        <View
          importantForAccessibility="no-hide-descendants"
          className="h-10 w-10 items-center justify-center rounded-full bg-nileGreen-50 dark:bg-slate-700"
        >
          <Ionicons
            name="bulb-outline"
            size={20}
            color={palette.nileGreen[600]}
          />
        </View>
        <Text
          style={{ fontFamily: fontFamily.bold }}
          accessibilityRole="header"
          className={`min-w-0 flex-1 text-lg font-bold leading-7 text-slate-900 dark:text-slate-25 ${
            isArabic ? "text-right" : "text-left"
          }`}
        >
          {tCommon("voice_ui_examples_heading")}
        </Text>
      </View>
      <View className="mt-3 gap-2">
        {examples.map((example, index) => (
          <View
            key={index}
            className={`min-h-12 items-center gap-3 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-900 ${
              isArabic ? "flex-row-reverse" : "flex-row"
            }`}
          >
            {!isArabic ? (
              <View
                importantForAccessibility="no-hide-descendants"
                className="h-8 w-8 items-center justify-center"
              >
                <Ionicons
                  name={enIcons[index]}
                  size={20}
                  color={palette.slate[600]}
                />
              </View>
            ) : null}
            <Text
              style={{ fontFamily: fontFamily.regular }}
              className={`min-w-0 flex-1 text-sm leading-[22px] text-slate-700 dark:text-slate-200 ${
                isArabic ? "text-right" : "text-left"
              }`}
            >
              {isArabic ? `“${example}”` : example}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
