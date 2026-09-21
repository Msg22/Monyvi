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
  readonly onPrivacyPress: () => void;
  readonly onTermsPress: () => void;
}

export function VerificationPendingView({
  email,
  isResending,
  onResend,
  onBack,
  onPrivacyPress,
  onTermsPress,
}: VerificationPendingViewProps): React.JSX.Element {
  const { t } = useTranslation("auth");
  const { fontFamily, isRTL } = useLocale();
  const { isDark } = useTheme();
  const accentColor = isDark ? palette.nileGreen[400] : palette.nileGreen[700];
  const secondaryTextColor = isDark ? palette.slate[400] : palette.slate[500];
  const resendLabel = isResending ? t("resending_email") : t("resend_email");

  return (
    <View testID="verification-pending-view" className="flex-1">
      <View
        testID="verification-state-content"
        className="flex-1 items-center justify-center px-5"
        style={{ paddingBottom: 70 }}
      >
        <View className="mb-6 h-[92px] w-[92px] items-center justify-center rounded-full border border-nileGreen-500/20 bg-nileGreen-500/10">
          <Ionicons name="mail-outline" size={43} color={accentColor} />
        </View>

        <Text
          accessibilityRole="header"
          className="text-center text-text-primary dark:text-text-primary-dark"
          style={{
            fontFamily: fontFamily.bold,
            fontSize: 27,
            lineHeight: 31,
            letterSpacing: isRTL ? 0 : -0.6,
          }}
        >
          {t("check_your_inbox")}
        </Text>

        <Text
          className="mt-[13px] max-w-[295px] text-center text-text-secondary dark:text-text-secondary-dark"
          style={{
            fontFamily: fontFamily.regular,
            fontSize: 14,
            lineHeight: isRTL ? 27 : 22,
          }}
        >
          {t("verification_sent_message")}
        </Text>

        <View
          testID="verification-email-chip"
          className="mt-1 rounded-[7px] bg-slate-100 px-2 py-1 dark:bg-slate-800"
        >
          <Text
            className="text-text-primary dark:text-text-primary-dark"
            style={{
              fontFamily: fontFamily.semiBold,
              fontSize: 14,
              writingDirection: "ltr",
            }}
          >
            {email}
          </Text>
        </View>

        <Pressable
          onPress={() => {
            void onResend();
          }}
          disabled={isResending}
          accessibilityRole="button"
          accessibilityLabel={resendLabel}
          accessibilityState={{ disabled: isResending, busy: isResending }}
          className="mt-[22px] h-11 items-center justify-center rounded-[13px] border border-nileGreen-600 px-5"
          style={{ opacity: isResending ? 0.6 : 1 }}
        >
          <Text
            className="text-nileGreen-700 dark:text-nileGreen-300"
            style={{ fontFamily: fontFamily.semiBold, fontSize: 13 }}
          >
            {resendLabel}
          </Text>
        </Pressable>
      </View>

      <Pressable
        onPress={onBack}
        disabled={isResending}
        accessibilityRole="button"
        accessibilityLabel={t("back_to_sign_in")}
        accessibilityState={{ disabled: isResending }}
        className="h-[42px] flex-row items-center justify-center gap-[7px]"
        style={{ opacity: isResending ? 0.55 : 1 }}
      >
        <Ionicons
          name={isRTL ? "arrow-forward" : "arrow-back"}
          size={16}
          color={secondaryTextColor}
        />
        <Text
          className="text-text-secondary dark:text-text-secondary-dark"
          style={{ fontFamily: fontFamily.medium, fontSize: 12 }}
        >
          {t("back_to_sign_in")}
        </Text>
      </Pressable>

      <View
        testID="auth-privacy-footer"
        className="items-center border-t border-slate-200 pt-[14px] dark:border-slate-700"
        style={{ gap: 9 }}
      >
        <View
          testID="auth-trust-row"
          className="flex-row items-center"
          style={{ gap: 7 }}
        >
          <Ionicons
            name="shield-checkmark-outline"
            size={19}
            color={accentColor}
          />
          <Text
            className="text-text-secondary dark:text-text-secondary-dark"
            style={{ fontFamily: fontFamily.regular, fontSize: 11.5 }}
          >
            {t("private_by_design")}
          </Text>
        </View>

        <View
          testID="auth-legal-row"
          className="flex-row items-center"
          style={{ gap: 14 }}
        >
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t("privacy")}
            hitSlop={8}
            onPress={onPrivacyPress}
          >
            <Text
              className="text-nileGreen-700 dark:text-nileGreen-300"
              style={{ fontFamily: fontFamily.semiBold, fontSize: 11.5 }}
            >
              {t("privacy")}
            </Text>
          </Pressable>
          <View className="h-3 w-px bg-slate-200 dark:bg-slate-700" />
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t("terms")}
            hitSlop={8}
            onPress={onTermsPress}
          >
            <Text
              className="text-nileGreen-700 dark:text-nileGreen-300"
              style={{ fontFamily: fontFamily.semiBold, fontSize: 11.5 }}
            >
              {t("terms")}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
