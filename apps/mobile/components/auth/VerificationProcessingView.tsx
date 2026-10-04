import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { palette } from "@/constants/colors";
import { useLocale } from "@/context/LocaleContext";
import { useTheme } from "@/context/ThemeContext";

export function VerificationProcessingView(): React.JSX.Element {
  const { t } = useTranslation("auth");
  const { fontFamily } = useLocale();
  const { isDark } = useTheme();
  const accentColor = isDark ? palette.nileGreen[400] : palette.nileGreen[600];

  return (
    <View
      testID="verification-processing-view"
      className="flex-1 items-center justify-center px-5 pb-12"
    >
      <View className="h-[112px] w-[112px] items-center justify-center rounded-full border-[5px] border-slate-200 dark:border-slate-700">
        <Ionicons name="mail-outline" size={42} color={accentColor} />
        <View className="absolute inset-[-5px] items-center justify-start">
          <ActivityIndicator
            testID="verification-processing-indicator"
            size="large"
            color={accentColor}
          />
        </View>
      </View>

      <Text
        accessibilityRole="header"
        className="mt-8 text-center text-[27px] leading-[34px] text-text-primary dark:text-text-primary-dark"
        style={{ fontFamily: fontFamily.bold }}
      >
        {t("verifying_code_title")}
      </Text>

      <Text
        className="mt-3 max-w-[300px] text-center text-[15px] leading-[23px] text-text-secondary dark:text-text-secondary-dark"
        style={{ fontFamily: fontFamily.regular }}
      >
        {t("verifying_code_message")}
      </Text>
    </View>
  );
}
