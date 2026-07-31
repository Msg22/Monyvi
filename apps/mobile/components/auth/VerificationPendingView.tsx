import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { palette } from "@/constants/colors";
import { useLocale } from "@/context/LocaleContext";
import { useTheme } from "@/context/ThemeContext";

export interface VerificationPendingViewProps {
  readonly email: string;
  readonly isResending: boolean;
  readonly onResend: () => Promise<void>;
  readonly onBack: () => void;
}

export function VerificationPendingView({
  email,
  isResending,
  onResend,
  onBack,
}: VerificationPendingViewProps): React.JSX.Element {
  const { t } = useTranslation("auth");
  const { fontFamily, isRTL } = useLocale();
  const { isDark } = useTheme();
  const iconColor = isDark ? palette.nileGreen[400] : palette.nileGreen[700];
  const resendLabel = isResending ? t("resending_email") : t("resend_email");

  return (
    <View className="flex-1 justify-center py-10">
      <View className="items-center rounded-[28px] border border-slate-200 bg-slate-25/90 px-6 py-10 dark:border-slate-700 dark:bg-slate-900/90">
        <View className="mb-6 h-20 w-20 items-center justify-center rounded-full bg-nileGreen-500/15">
          <Ionicons name="mail-unread-outline" size={40} color={iconColor} />
        </View>
        <Text
          accessibilityRole="header"
          className="text-center text-2xl text-text-primary dark:text-text-primary-dark"
          style={{ fontFamily: fontFamily.bold }}
        >
          {t("check_your_inbox")}
        </Text>
        <Text
          className="mt-3 max-w-[310px] text-center text-base leading-6 text-text-secondary dark:text-text-secondary-dark"
          style={{ fontFamily: fontFamily.regular }}
        >
          {t("verification_sent_message", { email })}
        </Text>
        <Pressable
          onPress={() => {
            void onResend();
          }}
          disabled={isResending}
          accessibilityRole="button"
          accessibilityLabel={resendLabel}
          accessibilityState={{ disabled: isResending, busy: isResending }}
          className="mt-7 min-h-12 min-w-[180px] items-center justify-center rounded-2xl border border-nileGreen-600 px-6"
          style={{ opacity: isResending ? 0.6 : 1 }}
        >
          <Text
            className="text-sm text-nileGreen-700 dark:text-nileGreen-300"
            style={{ fontFamily: fontFamily.semiBold }}
          >
            {resendLabel}
          </Text>
        </Pressable>
        <Pressable
          onPress={onBack}
          disabled={isResending}
          accessibilityRole="button"
          accessibilityLabel={t("back_to_sign_in")}
          accessibilityState={{ disabled: isResending }}
          className="mt-3 min-h-11 flex-row items-center justify-center gap-2"
          style={{ opacity: isResending ? 0.55 : 1 }}
        >
          <Ionicons
            name={isRTL ? "arrow-forward" : "arrow-back"}
            size={16}
            color={isDark ? palette.slate[400] : palette.slate[500]}
          />
          <Text
            className="text-sm text-text-secondary dark:text-text-secondary-dark"
            style={{ fontFamily: fontFamily.medium }}
          >
            {t("back_to_sign_in")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
