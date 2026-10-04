import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ActivityIndicator, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MonyviLogo } from "@/components/ui/MonyviLogo";
import { palette } from "@/constants/colors";
import { useLocale } from "@/context/LocaleContext";
import { useTheme } from "@/context/ThemeContext";

export function AuthCallbackProcessingView(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation("auth");
  const { fontFamily, isRTL } = useLocale();
  const { isDark } = useTheme();
  const accentColor = isDark ? palette.nileGreen[400] : palette.nileGreen[600];
  const mutedColor = isDark ? palette.slate[500] : palette.slate[400];
  const gradientColors: readonly [string, string] = isDark
    ? [palette.slate[950], palette.slate[900]]
    : [palette.nileGreen[50], palette.slate[25]];

  const steps = [
    t("callback_step_verify_link"),
    t("callback_step_create_session"),
    t("callback_step_load_account"),
  ];

  return (
    <View
      testID="auth-callback-processing-view"
      className="flex-1 bg-background dark:bg-background-dark"
    >
      <LinearGradient
        colors={gradientColors}
        className="absolute inset-0"
        pointerEvents="none"
      />
      <View
        className="flex-1 px-7"
        style={{
          paddingTop: insets.top + 18,
          paddingBottom: insets.bottom + 24,
        }}
      >
        <View className="items-center">
          <MonyviLogo width={118} height={36} />
        </View>

        <View className="flex-1 items-center justify-center pb-8">
          <View className="h-[92px] w-[92px] items-center justify-center rounded-full border-[6px] border-slate-300/60 dark:border-slate-700">
            <ActivityIndicator
              testID="auth-callback-processing-indicator"
              size="large"
              color={accentColor}
            />
          </View>

          <Text
            accessibilityRole="header"
            className="mt-7 max-w-[310px] text-center text-[27px] leading-[34px] text-text-primary dark:text-text-primary-dark"
            style={{ fontFamily: fontFamily.bold }}
          >
            {t("callback_processing_title")}
          </Text>
          <Text
            className="mt-3 max-w-[310px] text-center text-sm leading-[22px] text-text-secondary dark:text-text-secondary-dark"
            style={{ fontFamily: fontFamily.regular }}
          >
            {t("callback_processing_message")}
          </Text>

          <View className="mt-8 w-full max-w-[330px] gap-4 rounded-2xl border border-slate-200 bg-white/50 p-5 dark:border-slate-700 dark:bg-slate-800/40">
            {steps.map((label, index) => (
              <View
                key={label}
                className="flex-row items-center justify-between"
                style={{ direction: isRTL ? "rtl" : "ltr" }}
              >
                <Text
                  className="text-sm text-text-secondary dark:text-text-secondary-dark"
                  style={{ fontFamily: fontFamily.regular }}
                >
                  {label}
                </Text>
                {index === 0 ? (
                  <ActivityIndicator size="small" color={accentColor} />
                ) : (
                  <Ionicons
                    name="ellipse-outline"
                    size={18}
                    color={mutedColor}
                  />
                )}
              </View>
            ))}
          </View>

          <Text
            className="mt-6 text-center text-xs text-text-muted dark:text-slate-500"
            style={{ fontFamily: fontFamily.regular }}
          >
            {t("callback_processing_hint")}
          </Text>
        </View>
      </View>
    </View>
  );
}
