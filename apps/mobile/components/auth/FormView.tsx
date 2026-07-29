import { Ionicons } from "@expo/vector-icons";
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

  const selectMode = (nextMode: AuthMode): void => {
    if (nextMode === mode || isActionPending) {
      return;
    }

    setMode(nextMode);
    onClearError();
  };

  return (
    <View className="w-full">
      <View className={isKeyboardVisible ? "mb-4" : "mb-7 min-h-[210px]"}>
        <View className={isKeyboardVisible ? "max-w-full" : "max-w-[58%]"}>
          {!isKeyboardVisible ? (
            <Text
              className="mb-3 text-xs uppercase tracking-[1.8px] text-nileGreen-700 dark:text-nileGreen-300"
              style={{
                fontFamily: fontFamily.semiBold,
                textAlign: isRTL ? "right" : "left",
              }}
            >
              {t("welcome_title")}
            </Text>
          ) : null}
          <Text
            accessibilityRole="header"
            className={
              isKeyboardVisible
                ? "text-3xl leading-10 text-text-primary dark:text-text-primary-dark"
                : "text-[34px] leading-[44px] text-text-primary dark:text-text-primary-dark"
            }
            style={{
              fontFamily: fontFamily.bold,
              textAlign: isRTL ? "right" : "left",
            }}
          >
            {t("welcome_headline")}
          </Text>
          {!isKeyboardVisible ? (
            <Text
              className="mt-4 text-[15px] leading-6 text-text-secondary dark:text-text-secondary-dark"
              style={{
                fontFamily: fontFamily.regular,
                textAlign: isRTL ? "right" : "left",
              }}
            >
              {t("welcome_support")}
            </Text>
          ) : null}
        </View>

        {!isKeyboardVisible ? (
          <View className="absolute end-[-12px] top-[-8px]">
            <FinancialFlowIllustration
              direction={isRTL ? "rtl" : "ltr"}
              flowColor={flowColor}
              mutedFlowColor={mutedFlowColor}
              accentColor={palette.gold[500]}
              accentSoftColor={isDark ? palette.gold[800] : palette.gold[100]}
              surfaceColor={surfaceColor}
              width={164}
              height={196}
            />
          </View>
        ) : null}
      </View>

      <View
        accessibilityRole="tablist"
        className="mb-5 flex-row rounded-2xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800"
      >
        <ModeButton
          testID="auth-mode-sign-in"
          label={t("sign_in")}
          isSelected={mode === "signIn"}
          isDisabled={isActionPending}
          fontFamily={fontFamily.semiBold}
          onPress={() => selectMode("signIn")}
        />
        <ModeButton
          testID="auth-mode-sign-up"
          label={t("sign_up")}
          isSelected={mode === "signUp"}
          isDisabled={isActionPending}
          fontFamily={fontFamily.semiBold}
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
          <View className="my-5 flex-row items-center gap-3">
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
        <View className="mt-6 flex-row flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <Ionicons
            name="shield-checkmark-outline"
            size={15}
            color={isDark ? palette.slate[400] : palette.slate[500]}
          />
          <Text
            className="text-xs text-text-muted dark:text-text-muted-dark"
            style={{ fontFamily: fontFamily.regular }}
          >
            {t("private_by_design")}
          </Text>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t("privacy")}
            onPress={onPrivacyPress}
            className="min-h-11 justify-center"
          >
            <Text
              className="text-xs text-nileGreen-700 underline dark:text-nileGreen-300"
              style={{ fontFamily: fontFamily.semiBold }}
            >
              {t("privacy")}
            </Text>
          </Pressable>
          <Text className="text-xs text-text-muted dark:text-text-muted-dark">
            ·
          </Text>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t("terms")}
            onPress={onTermsPress}
            className="min-h-11 justify-center"
          >
            <Text
              className="text-xs text-nileGreen-700 underline dark:text-nileGreen-300"
              style={{ fontFamily: fontFamily.semiBold }}
            >
              {t("terms")}
            </Text>
          </Pressable>
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
  readonly onPress: () => void;
}

function ModeButton({
  testID,
  label,
  isSelected,
  isDisabled,
  fontFamily,
  onPress,
}: ModeButtonProps): React.JSX.Element {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: isSelected, disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      className={`min-h-11 flex-1 items-center justify-center rounded-xl ${
        isSelected ? "bg-nileGreen-700 dark:bg-nileGreen-500" : "bg-transparent"
      }`}
      style={{ opacity: isDisabled ? 0.55 : 1 }}
    >
      <Text
        className={
          isSelected
            ? "text-sm text-slate-25"
            : "text-sm text-text-secondary dark:text-text-secondary-dark"
        }
        style={{ fontFamily }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
