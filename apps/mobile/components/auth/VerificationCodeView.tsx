import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type TextInput as TextInputType,
} from "react-native";
import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/ui/Skeleton";
import { palette } from "@/constants/colors";
import { RESPONSIVE_BREAKPOINTS } from "@/constants/ui";
import { useLocale } from "@/context/LocaleContext";
import { useTheme } from "@/context/ThemeContext";

interface VerificationCodeViewProps {
  readonly email: string;
  readonly code: string;
  readonly verificationError: string | null;
  readonly verificationExpiresAtMs: number | null;
  readonly resendAvailableAtMs: number | null;
  readonly resendLimitUntilMs: number | null;
  readonly isResendLimitReached: boolean;
  readonly isVerifying: boolean;
  readonly isResending: boolean;
  readonly onCodeChange: (value: string) => void;
  readonly onResend: () => Promise<void>;
  readonly onBack: () => void;
}

function formatVerificationDigit(
  digit: string | undefined,
  _language: string
): string {
  return digit ?? "";
}

function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function VerificationCodeView({
  email,
  code,
  verificationError,
  verificationExpiresAtMs,
  resendAvailableAtMs,
  resendLimitUntilMs,
  isResendLimitReached,
  isVerifying,
  isResending,
  onCodeChange,
  onResend,
  onBack,
}: VerificationCodeViewProps): React.JSX.Element {
  const { t } = useTranslation("auth");
  const { fontFamily, isRTL, language } = useLocale();
  const { isDark } = useTheme();
  const { width: viewportWidth } = useWindowDimensions();
  const inputRef = useRef<TextInputType>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const expiryLabel = useMemo(() => {
    if (verificationExpiresAtMs === null) {
      return t("verification_code_expires_generic");
    }
    return t("verification_code_expires_in", {
      time: formatCountdown(verificationExpiresAtMs - nowMs),
    });
  }, [nowMs, t, verificationExpiresAtMs]);

  const cooldownRemaining =
    resendAvailableAtMs === null ? 0 : resendAvailableAtMs - nowMs;
  const isCoolingDown = cooldownRemaining > 0;
  const isLimitActive =
    isResendLimitReached &&
    (resendLimitUntilMs === null || resendLimitUntilMs > nowMs);
  const resendLabel = isResending
    ? t("resending_email")
    : isLimitActive
      ? t("resend_code")
      : isCoolingDown
        ? t("resend_in", { time: formatCountdown(cooldownRemaining) })
        : t("resend_code");
  const actionsDisabled = isVerifying || isResending;
  const resendDisabled = actionsDisabled || isCoolingDown || isLimitActive;
  const accentColor = isDark ? palette.nileGreen[400] : palette.nileGreen[600];
  const secondaryTextColor = isDark ? palette.slate[400] : palette.slate[500];

  const isCompact = viewportWidth < RESPONSIVE_BREAKPOINTS.compactPhone;
  const horizontalPadding = isCompact ? 16 : 24;
  const otpGap = isCompact ? 6 : 8;
  const availableOtpWidth = viewportWidth - horizontalPadding * 2 - otpGap * 5;
  const otpCellSize = Math.min(48, Math.max(0, availableOtpWidth / 6));

  return (
    <View
      testID="verification-code-view"
      className="flex-1 w-full max-w-[400px] self-center"
    >
      <View className="flex-1 items-center justify-center">
        <View className="mb-6 h-20 w-20 items-center justify-center rounded-full border border-nileGreen-500/25 bg-nileGreen-500/10">
          <Ionicons name="mail-outline" size={36} color={accentColor} />
          <View className="absolute bottom-[14px] right-[13px] h-6 w-6 items-center justify-center rounded-full bg-background dark:bg-background-dark">
            <Ionicons name="checkmark-circle" size={24} color={accentColor} />
          </View>
        </View>

        <Text
          accessibilityRole="header"
          className="text-center text-text-primary dark:text-text-primary-dark"
          style={{
            fontFamily: fontFamily.bold,
            fontSize: isRTL ? 26 : 28,
            lineHeight: isRTL ? 38 : 34,
            letterSpacing: isRTL ? 0 : -0.6,
          }}
        >
          {t("verify_your_email")}
        </Text>

        <Text
          className="mt-3 max-w-[330px] text-center text-text-secondary dark:text-text-secondary-dark"
          style={{
            fontFamily: fontFamily.regular,
            fontSize: 15,
            lineHeight: 23,
          }}
        >
          {t("verification_code_sent_message")}
        </Text>

        <View
          testID="verification-email-chip"
          className="mt-2 h-8 justify-center rounded-2xl bg-slate-100 px-3 dark:bg-slate-800"
        >
          <Text
            className="text-[14px] text-text-primary dark:text-text-primary-dark"
            style={{ fontFamily: fontFamily.semiBold, writingDirection: "ltr" }}
          >
            {email}
          </Text>
        </View>

        <Pressable
          testID="verification-code-cells"
          accessible={false}
          onPress={() => inputRef.current?.focus()}
          className="relative mt-7 w-full"
        >
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            className="flex-row justify-center"
            style={{ direction: "ltr", columnGap: otpGap }}
          >
            {Array.from({ length: 6 }, (_, index) => (
              <View
                key={index}
                testID={`verification-code-cell-${index}`}
                className="items-center justify-center rounded-[10px] border border-nileGreen-500 bg-white/70 dark:bg-slate-900/60"
                style={{ width: otpCellSize, height: otpCellSize }}
              >
                <Text
                  className="text-[25px] text-text-primary dark:text-text-primary-dark"
                  style={{ fontFamily: fontFamily.semiBold }}
                >
                  {formatVerificationDigit(code[index], language)}
                </Text>
              </View>
            ))}
          </View>

          <TextInput
            ref={inputRef}
            testID="verification-code-input"
            value={code}
            onChangeText={onCodeChange}
            editable={!actionsDisabled}
            maxLength={6}
            keyboardType="number-pad"
            inputMode="numeric"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            accessibilityLabel={t("verification_code_input")}
            accessibilityHint={t("verification_code_input_hint")}
            accessibilityState={{
              disabled: actionsDisabled,
              busy: isVerifying,
            }}
            className="absolute inset-0 bg-transparent text-left text-transparent opacity-[0.02]"
            style={{ writingDirection: "ltr" }}
            selectionColor="transparent"
            caretHidden
          />
        </Pressable>

        {verificationError ? (
          <Text
            testID="verification-code-error"
            accessibilityRole="alert"
            className="mt-3 max-w-[330px] text-center text-xs text-red-600 dark:text-red-500"
            style={{ fontFamily: fontFamily.regular }}
          >
            {verificationError}
          </Text>
        ) : null}

        {isVerifying ? (
          <View
            testID="verification-code-busy-feedback"
            className="mt-5 h-[23px] items-center justify-center"
          >
            <Skeleton width={120} height={12} borderRadius={6} />
          </View>
        ) : (
          <Text
            className="mt-5 text-center text-text-secondary dark:text-text-secondary-dark"
            style={{
              fontFamily: fontFamily.regular,
              fontSize: 15,
              lineHeight: 23,
            }}
          >
            {expiryLabel}
          </Text>
        )}

        <Pressable
          onPress={() => {
            void onResend();
          }}
          disabled={resendDisabled}
          accessibilityRole="button"
          accessibilityLabel={resendLabel}
          accessibilityState={{
            disabled: resendDisabled,
            busy: isResending,
          }}
          className={`mt-7 h-[52px] w-full items-center justify-center rounded-[14px] ${
            resendDisabled
              ? "border border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-800"
              : "bg-nileGreen-600 dark:bg-nileGreen-500"
          }`}
          style={{ opacity: resendDisabled ? 0.6 : 1 }}
        >
          <Text
            className={`text-[15px] ${
              resendDisabled
                ? "text-text-secondary dark:text-text-secondary-dark"
                : "text-white"
            }`}
            style={{ fontFamily: fontFamily.semiBold }}
          >
            {resendLabel}
          </Text>
        </Pressable>

        {isLimitActive ? (
          <Text
            testID="verification-resend-limit"
            accessibilityRole="alert"
            className="mt-3 max-w-[330px] self-center text-center text-xs text-red-600 dark:text-red-500"
            style={{ fontFamily: fontFamily.regular }}
          >
            {t("resend_limit_reached")}
          </Text>
        ) : null}

        <Pressable
          onPress={onBack}
          disabled={actionsDisabled}
          accessibilityRole="button"
          accessibilityLabel={t("back_to_sign_in")}
          accessibilityState={{ disabled: actionsDisabled }}
          className="mt-6 h-11 flex-row items-center justify-center gap-[7px]"
          style={{ opacity: actionsDisabled ? 0.55 : 1, direction: "ltr" }}
        >
          <Ionicons name="arrow-back" size={16} color={secondaryTextColor} />
          <Text
            className="text-xs text-text-secondary dark:text-text-secondary-dark"
            style={{ fontFamily: fontFamily.medium }}
          >
            {t("back_to_sign_in")}
          </Text>
        </Pressable>
      </View>

      <View className="mt-4 items-center gap-[9px] border-t border-slate-200 pt-4 dark:border-slate-700">
        <View className="flex-row items-center gap-[7px]">
          <Ionicons
            name="shield-checkmark-outline"
            size={19}
            color={accentColor}
          />
          <Text
            className="text-[11.5px] text-text-secondary dark:text-text-secondary-dark"
            style={{ fontFamily: fontFamily.regular }}
          >
            {t("private_by_design")}
          </Text>
        </View>
        <View className="flex-row items-center gap-3.5">
          <Text
            className="text-[11.5px] text-nileGreen-700 dark:text-nileGreen-300"
            style={{ fontFamily: fontFamily.semiBold }}
          >
            {t("privacy")}
          </Text>
          <View className="h-3 w-px bg-slate-200 dark:bg-slate-700" />
          <Text
            className="text-[11.5px] text-nileGreen-700 dark:text-nileGreen-300"
            style={{ fontFamily: fontFamily.semiBold }}
          >
            {t("terms")}
          </Text>
        </View>
      </View>
    </View>
  );
}

export { formatVerificationDigit };
export type { VerificationCodeViewProps };
