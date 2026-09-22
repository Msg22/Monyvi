import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { palette } from "@/constants/colors";
import { useLocale } from "@/context/LocaleContext";
import { useTheme } from "@/context/ThemeContext";

export interface AuthCallbackFailureViewProps {
  readonly onBack: () => void;
}

export function AuthCallbackFailureView({
  onBack,
}: AuthCallbackFailureViewProps): React.JSX.Element {
  const { t } = useTranslation("auth");
  const { fontFamily, isRTL } = useLocale();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const accentColor = isDark ? palette.nileGreen[400] : palette.nileGreen[700];

  return (
    <View
      testID="auth-callback-failure-view"
      className="flex-1 bg-background px-6 dark:bg-background-dark"
      style={{
        paddingTop: insets.top + 24,
        paddingBottom: insets.bottom + 24,
      }}
    >
      <View className="flex-1 items-center justify-center">
        <View className="mb-6 h-[92px] w-[92px] items-center justify-center rounded-full border border-nileGreen-500/20 bg-nileGreen-500/10">
          <Ionicons name="mail-unread-outline" size={43} color={accentColor} />
        </View>

        <Text
          accessibilityRole="header"
          className="text-center text-[27px] leading-[34px] text-text-primary dark:text-text-primary-dark"
          style={{
            fontFamily: fontFamily.bold,
            letterSpacing: isRTL ? 0 : -0.6,
          }}
        >
          {t("verification_link_failed_title")}
        </Text>

        <Text
          className="mt-3 max-w-[320px] text-center text-sm leading-[23px] text-text-secondary dark:text-text-secondary-dark"
          style={{ fontFamily: fontFamily.regular }}
        >
          {t("verification_link_failed_message")}
        </Text>
      </View>

      <Pressable
        testID="auth-callback-back"
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel={t("back_to_sign_in")}
        className="h-12 items-center justify-center rounded-[13px] bg-nileGreen-700 dark:bg-nileGreen-500"
      >
        <Text
          className="text-sm text-slate-25 dark:text-slate-950"
          style={{ fontFamily: fontFamily.semiBold }}
        >
          {t("back_to_sign_in")}
        </Text>
      </Pressable>
    </View>
  );
}
