import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useState, type RefObject } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { EmailPasswordForm } from "@/components/auth/EmailPasswordForm";
import { FinancialFlowIllustration } from "@/components/auth/FinancialFlowIllustration";
import { SocialLoginButtons } from "@/components/auth/SocialLoginButtons";
import type { AuthMode, AuthPendingAction } from "@/components/auth/auth-types";
import { palette } from "@/constants/colors";
import { useLocale } from "@/context/LocaleContext";
import { useTheme } from "@/context/ThemeContext";
import type { OAuthProvider } from "@/services/supabase";

export interface FormViewProps {
  readonly isKeyboardVisible: boolean;
  readonly isCompactViewport: boolean;
  readonly pendingAction: AuthPendingAction;
  readonly emailError: string | null;
  readonly networkError: string | null;
  readonly emailFieldRef?: RefObject<View | null>;
  readonly passwordFieldRef?: RefObject<View | null>;
  readonly onOAuth: (provider: OAuthProvider) => Promise<void>;
  readonly onEmailSubmit: (
    email: string,
    password: string,
    mode: AuthMode
  ) => Promise<void>;
  readonly onForgotPassword: (email: string) => Promise<void>;
  readonly onClearError: () => void;
  readonly onClearNetworkError: () => void;
  readonly onPrivacyPress: () => void;
  readonly onTermsPress: () => void;
  readonly onEmailFocus?: () => void;
  readonly onPasswordFocus?: () => void;
}

export function FormView({
  isKeyboardVisible,
  isCompactViewport,
  pendingAction,
  emailError,
  networkError,
  emailFieldRef,
  passwordFieldRef,
  onOAuth,
  onEmailSubmit,
  onForgotPassword,
  onClearError,
  onClearNetworkError,
  onPrivacyPress,
  onTermsPress,
  onEmailFocus,
  onPasswordFocus,
}: FormViewProps): React.JSX.Element {
  const { t } = useTranslation("auth");
  const { fontFamily, isRTL } = useLocale();
  const { isDark } = useTheme();
  const [mode, setMode] = useState<AuthMode>("signIn");
  const isActionPending = pendingAction !== null;
  const flowColor = isDark ? palette.nileGreen[400] : palette.nileGreen[700];
  const mutedFlowColor = isDark ? palette.slate[600] : palette.slate[300];
  const surfaceColor = isDark ? palette.slate[800] : palette.slate[25];
  const heroHeight = isKeyboardVisible ? 82 : isCompactViewport ? 191 : 300;
  const heroCopyWidth = isKeyboardVisible
    ? "100%"
    : isCompactViewport
      ? 210
      : 225;
  const heroPaddingTop = isKeyboardVisible || isCompactViewport ? 0 : 42;
  const heroPaddingBottom = isKeyboardVisible || isCompactViewport ? 0 : 12;
  const illustrationWidth = isCompactViewport ? 160 : 205;
  const illustrationHeight = isCompactViewport ? 191 : 245;
  const illustrationTop = isCompactViewport ? 0 : 35;
  const illustrationEnd = isRTL ? (isCompactViewport ? -8 : -36) : -8;
  const modeGradientColors: readonly [string, string] = isDark
    ? [palette.nileGreen[500], palette.nileGreen[400]]
    : [palette.nileGreen[800], palette.nileGreen[600]];

  const selectMode = (nextMode: AuthMode): void => {
    if (nextMode === mode || isActionPending) {
      return;
    }

    setMode(nextMode);
    onClearError();
  };

  return (
    <View testID="auth-form-root" className="w-full flex-1">
      <View
        testID="auth-hero"
        className="relative justify-center"
        style={{
          minHeight: heroHeight,
          paddingTop: heroPaddingTop,
          paddingBottom: heroPaddingBottom,
        }}
      >
        <View
          testID="auth-hero-copy"
          className="z-10"
          style={{
            width: heroCopyWidth,
            alignSelf: "flex-start",
          }}
        >
          {!isKeyboardVisible ? (
            <Text
              className="mb-2 text-xs text-nileGreen-700 dark:text-nileGreen-300"
              style={{
                fontFamily: fontFamily.semiBold,
                fontWeight: "800",
                letterSpacing: isRTL ? 0 : 0.96,
                textAlign: isRTL ? "right" : "left",
                textTransform: isRTL ? "none" : "uppercase",
              }}
            >
              {t("welcome_title")}
            </Text>
          ) : null}
          <Text
            accessibilityRole="header"
            className="text-text-primary dark:text-text-primary-dark"
            style={{
              fontFamily: fontFamily.bold,
              fontSize: isKeyboardVisible
                ? 25
                : isRTL
                  ? isCompactViewport
                    ? 27
                    : 29
                  : isCompactViewport
                    ? 28
                    : 31,
              lineHeight: isKeyboardVisible
                ? 32
                : isRTL
                  ? isCompactViewport
                    ? 35
                    : 37
                  : isCompactViewport
                    ? 30
                    : 32,
              letterSpacing: isRTL ? 0 : -1.1,
              maxWidth: isCompactViewport ? 210 : 220,
              textAlign: isRTL ? "right" : "left",
            }}
          >
            {t("welcome_headline")}
          </Text>
          {!isKeyboardVisible ? (
            <Text
              className="text-sm text-text-secondary dark:text-text-secondary-dark"
              style={{
                fontFamily: fontFamily.regular,
                marginTop: 14,
                lineHeight: isRTL ? 25 : 22,
                maxWidth: 220,
                textAlign: isRTL ? "right" : "left",
              }}
            >
              {t("welcome_support")}
            </Text>
          ) : null}
        </View>

        {!isKeyboardVisible ? (
          <View
            testID="auth-illustration-container"
            className="absolute"
            style={{ end: illustrationEnd, top: illustrationTop }}
          >
            <FinancialFlowIllustration
              direction={isRTL ? "rtl" : "ltr"}
              flowColor={flowColor}
              mutedFlowColor={mutedFlowColor}
              accentColor={palette.gold[500]}
              accentSoftColor={isDark ? palette.gold[800] : palette.gold[100]}
              surfaceColor={surfaceColor}
              width={illustrationWidth}
              height={illustrationHeight}
            />
          </View>
        ) : null}
      </View>

      <View
        testID="auth-mode-switch"
        accessibilityRole="tablist"
        className="flex-row border border-nileGreen-700 dark:border-nileGreen-500"
        style={{
          height: 46,
          marginTop: 8,
          marginBottom: 22,
          borderRadius: 14,
          padding: 3,
        }}
      >
        <ModeButton
          testID="auth-mode-sign-in"
          label={t("sign_in")}
          isSelected={mode === "signIn"}
          isDisabled={isActionPending}
          fontFamily={fontFamily.semiBold}
          gradientColors={modeGradientColors}
          onPress={() => selectMode("signIn")}
        />
        <ModeButton
          testID="auth-mode-sign-up"
          label={t("create_account")}
          isSelected={mode === "signUp"}
          isDisabled={isActionPending}
          fontFamily={fontFamily.semiBold}
          gradientColors={modeGradientColors}
          onPress={() => selectMode("signUp")}
        />
      </View>

      {networkError ? (
        <View className="mb-4 flex-row items-center gap-3 rounded-2xl border border-red-400/30 bg-red-500/10 p-4">
          <Ionicons
            name="cloud-offline-outline"
            size={21}
            color={palette.red[500]}
          />
          <Text
            accessibilityRole="alert"
            accessibilityLabel={networkError}
            className="flex-1 text-sm text-red-600 dark:text-red-300"
            style={{ fontFamily: fontFamily.medium }}
          >
            {networkError}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("dismiss")}
            onPress={onClearNetworkError}
            className="min-h-11 min-w-11 items-center justify-center"
          >
            <Ionicons name="close" size={22} color={palette.red[500]} />
          </Pressable>
        </View>
      ) : null}

      {!isKeyboardVisible ? (
        <>
          <SocialLoginButtons
            isLoading={pendingAction === "google"}
            isDisabled={isActionPending}
            onPress={() => onOAuth("google")}
          />
          <View
            testID="auth-email-divider"
            className="flex-row items-center gap-3"
            style={{
              height: isCompactViewport && mode === "signIn" ? 31 : 46,
            }}
          >
            <View className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
            <Text
              className="text-xs text-text-muted dark:text-text-muted-dark"
              style={{ fontFamily: fontFamily.regular }}
            >
              {t("or_continue_with_email")}
            </Text>
            <View className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
          </View>
        </>
      ) : null}

      <EmailPasswordForm
        mode={mode}
        isCompactViewport={isCompactViewport}
        pendingAction={pendingAction}
        errorMessage={emailError}
        emailFieldRef={emailFieldRef}
        passwordFieldRef={passwordFieldRef}
        onSubmit={onEmailSubmit}
        onForgotPassword={onForgotPassword}
        onClearError={onClearError}
        onEmailFocus={onEmailFocus}
        onPasswordFocus={onPasswordFocus}
      />

      {!isKeyboardVisible ? (
        <View
          testID="auth-privacy-footer"
          className="items-center border-t border-slate-200 dark:border-slate-700"
          style={{
            marginTop: isCompactViewport ? (mode === "signIn" ? 19 : 20) : 34,
            paddingTop: 14,
            gap: 9,
          }}
        >
          <View
            testID="auth-trust-row"
            className="flex-row items-center"
            style={{ gap: 7 }}
          >
            <Ionicons
              name="shield-checkmark-outline"
              size={19}
              color={flowColor}
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
      ) : null}
    </View>
  );
}

interface ModeButtonProps {
  readonly testID: string;
  readonly label: string;
  readonly isSelected: boolean;
  readonly isDisabled: boolean;
  readonly fontFamily: string;
  readonly gradientColors: readonly [string, string];
  readonly onPress: () => void;
}

function ModeButton({
  testID,
  label,
  isSelected,
  isDisabled,
  fontFamily,
  gradientColors,
  onPress,
}: ModeButtonProps): React.JSX.Element {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: isSelected, disabled: isDisabled }}
      disabled={isDisabled}
      hitSlop={3}
      onPress={onPress}
      className="flex-1 overflow-hidden items-center justify-center"
      style={{ height: 40, borderRadius: 10, opacity: isDisabled ? 0.55 : 1 }}
    >
      {isSelected ? (
        <LinearGradient
          colors={gradientColors}
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            borderRadius: 10,
          }}
        />
      ) : null}
      <Text
        className={
          isSelected
            ? "text-sm text-slate-25 dark:text-nileGreen-900"
            : "text-sm text-nileGreen-700 dark:text-nileGreen-300"
        }
        style={{ fontFamily }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
