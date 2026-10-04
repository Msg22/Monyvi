import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  Text,
  TextInput,
  View,
  type TextInput as TextInputType,
} from "react-native";
import { useTranslation } from "react-i18next";

import { palette } from "@/constants/colors";
import { useLocale } from "@/context/LocaleContext";
import { useTheme } from "@/context/ThemeContext";

interface VerificationCodeViewProps {
  readonly email: string;
  readonly code: string;
  readonly verificationError: string | null;
  readonly verificationExpiresAtMs: number | null;
  readonly resendAvailableAtMs: number | null;
  readonly resendLimitUntilMs: number | null;
  readonly isVerifying: boolean;
  readonly isResending: boolean;
  readonly onCodeChange: (value: string) => void;
  readonly onResend: () => Promise<void>;
  readonly onBack: () => void;
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
  isVerifying,
  isResending,
  onCodeChange,
  onResend,
  onBack,
}: VerificationCodeViewProps): React.JSX.Element {
  const { t } = useTranslation("auth");
  const { fontFamily, isRTL } = useLocale();
  const { isDark } = useTheme();
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
    resendLimitUntilMs !== null && resendLimitUntilMs > nowMs;
  const resendLabel = isResending
    ? t("resending_email")
    : isLimitActive
      ? t("resend_try_later")
      : isCoolingDown
        ? t("resend_in", { time: formatCountdown(cooldownRemaining) })
        : t("resend_email");
  const actionsDisabled = isVerifying || isResending;
  const resendDisabled = actionsDisabled || isCoolingDown || isLimitActive;
  const accentColor = isDark ? palette.nileGreen[400] : palette.nileGreen[600];
  const secondaryTextColor = isDark ? palette.slate[400] : palette.slate[500];

  return (
    <View testID="verification-code-view" className="flex-1">
      <View className="flex-1 items-center justify-center px-1 pb-8">
        <View className="mb-6 h-[92px] w-[92px] items-center justify-center rounded-full border border-nileGreen-500/25 bg-nileGreen-500/10">
          <Ionicons name="mail-outline" size={42} color={accentColor} />
          <View className="absolute bottom-[19px] right-[18px] h-6 w-6 items-center justify-center rounded-full bg-background dark:bg-background-dark">
            <Ionicons
              name="checkmark-circle"
              size={24}
              color={accentColor}
            />
          </View>
        </View>

        <Text
          accessibilityRole="header"
          className="text-center text-[27px] leading-[32px] text-text-primary dark:text-text-primary-dark"
          style={{ fontFamily: fontFamily.bold, letterSpacing: isRTL ? 0 : -0.6 }}
        >
          {t("verify_your_email")}
        </Text>

        <Text
          className="mt-3 max-w-[330px] text-center text-sm text-text-secondary dark:text-text-secondary-dark"
          style={{ fontFamily: fontFamily.regular, lineHeight: isRTL ? 26 : 22 }}
        >
          {t("verification_code_sent_message")}
        </Text>

        <View
          testID="verification-email-chip"
          className="mt-2 rounded-[8px] bg-slate-100 px-3 py-1.5 dark:bg-slate-800"
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
          className="relative mt-7 w-full max-w-[360px]"
        >
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            className="flex-row justify-center gap-2"
            style={{ direction: "ltr" }}
          >
            {Array.from({ length: 6 }, (_, index) => (
              <View
                key={index}
                testID={`verification-code-cell-${index}`}
                className="h-[58px] w-[48px] items-center justify-center rounded-[10px] border border-nileGreen-500 bg-white/70 dark:bg-slate-900/60"
              >
                <Text
                  className="text-[25px] text-text-primary dark:text-text-primary-dark"
                  style={{ fontFamily: fontFamily.semiBold }}
                >
                  {code[index] ?? ""}
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
            style={{
              position: "absolute",
              inset: 0,
              color: "transparent",
              backgroundColor: "transparent",
              opacity: 0.02,
              writingDirection: "ltr",
              textAlign: "left",
            }}
            selectionColor="transparent"
            caretHidden
          />
        </Pressable>

        {verificationError ? (
          <Text
            testID="verification-code-error"
            accessibilityRole="alert"
            className="mt-3 max-w-[330px] text-center text-xs text-error dark:text-error-dark"
            style={{ fontFamily: fontFamily.regular }}
          >
            {verificationError}
          </Text>
        ) : null}

        <Text
          className="mt-5 text-center text-sm text-text-secondary dark:text-text-secondary-dark"
          style={{ fontFamily: fontFamily.regular }}
        >
          {isVerifying ? t("verifying_code") : expiryLabel}
        </Text>

        <Pressable
          onPress={() => {
            void onResend();
          }}
          disabled={resendDisabled}
          accessibilityRole="button"
          accessibilityLabel={resendLabel}
          accessibilityState={{ disabled: resendDisabled, busy: isResending }}
          className="mt-7 h-12 w-full max-w-[285px] items-center justify-center rounded-[13px] border border-slate-300 dark:border-slate-600"
          style={{ opacity: resendDisabled ? 0.6 : 1 }}
        >
          <Text
            className="text-[14px] text-text-secondary dark:text-text-secondary-dark"
            style={{ fontFamily: fontFamily.semiBold }}
          >
            {resendLabel}
          </Text>
        </Pressable>
      </View>

      <Pressable
        onPress={onBack}
        disabled={actionsDisabled}
        accessibilityRole="button"
        accessibilityLabel={t("back_to_sign_in")}
        accessibilityState={{ disabled: actionsDisabled }}
        className="h-[42px] flex-row items-center justify-center gap-[7px]"
        style={{ opacity: actionsDisabled ? 0.55 : 1 }}
      >
        <Ionicons
          name={isRTL ? "arrow-forward" : "arrow-back"}
          size={16}
          color={secondaryTextColor}
        />
        <Text
          className="text-xs text-text-secondary dark:text-text-secondary-dark"
          style={{ fontFamily: fontFamily.medium }}
        >
          {t("back_to_sign_in")}
        </Text>
      </Pressable>

      <View className="items-center gap-[9px] border-t border-slate-200 pt-[14px] dark:border-slate-700">
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

export type { VerificationCodeViewProps };
