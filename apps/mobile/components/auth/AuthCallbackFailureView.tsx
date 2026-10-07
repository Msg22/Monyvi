import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { palette } from "@/constants/colors";
import { useLocale } from "@/context/LocaleContext";
import { useTheme } from "@/context/ThemeContext";

export type AuthCallbackFailureType =
  | "verification"
  | "recovery"
  | "network"
  | "oauth";

export interface AuthCallbackFailureViewProps {
  readonly failureType?: AuthCallbackFailureType;
  readonly onBack: () => void;
  readonly onRetry?: () => void;
}

export function AuthCallbackFailureView({
  failureType = "verification",
  onBack,
  onRetry,
}: AuthCallbackFailureViewProps): React.JSX.Element {
  const { t } = useTranslation("auth");
  const { fontFamily, isRTL } = useLocale();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const accentColor = isDark ? palette.nileGreen[400] : palette.nileGreen[700];

  let iconName: keyof typeof Ionicons.glyphMap = "mail-unread-outline";
  let titleKey = "verification_link_failed_title";
  let messageKey = "verification_link_failed_message";

  if (failureType === "recovery") {
    iconName = "key-outline";
    titleKey = "recovery_link_failed_title";
    messageKey = "recovery_link_failed_message";
  } else if (failureType === "network") {
    iconName = "cloud-offline-outline";
    titleKey = "callback_network_failed_title";
    messageKey = "callback_network_failed_message";
  } else if (failureType === "oauth") {
    iconName = "alert-circle-outline";
    titleKey = "auth_callback_failed_title";
    messageKey = "auth_callback_failed_message";
  }

  const isNetworkFailure = failureType === "network" && Boolean(onRetry);

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
          <Ionicons name={iconName} size={43} color={accentColor} />
        </View>

        <Text
          accessibilityRole="header"
          className="text-center text-[27px] leading-[34px] text-text-primary dark:text-text-primary-dark"
          style={{
            fontFamily: fontFamily.bold,
            letterSpacing: isRTL ? 0 : -0.6,
          }}
        >
          {t(titleKey)}
        </Text>

        <Text
          className="mt-3 max-w-[320px] text-center text-sm leading-[23px] text-text-secondary dark:text-text-secondary-dark"
          style={{ fontFamily: fontFamily.regular }}
        >
          {t(messageKey)}
        </Text>
      </View>

      {isNetworkFailure ? (
        <View className="w-full">
          <Pressable
            testID="auth-callback-retry"
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel={t("retry")}
            className="h-12 w-full items-center justify-center rounded-[13px] bg-nileGreen-700 dark:bg-nileGreen-500"
          >
            <Text
              className="text-sm text-slate-25 dark:text-slate-950"
              style={{ fontFamily: fontFamily.semiBold }}
            >
              {t("retry")}
            </Text>
          </Pressable>
          <Pressable
            testID="auth-callback-back"
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={t("back_to_sign_in")}
            className="mt-3 h-12 w-full items-center justify-center rounded-[13px] border border-slate-300 dark:border-slate-700"
          >
            <Text
              className="text-sm text-text-primary dark:text-text-primary-dark"
              style={{ fontFamily: fontFamily.semiBold }}
            >
              {t("back_to_sign_in")}
            </Text>
          </Pressable>
        </View>
      ) : (
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
      )}
    </View>
  );
}
