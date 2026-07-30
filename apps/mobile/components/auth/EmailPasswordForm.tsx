import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRef, useState, type RefObject } from "react";
import {
  Pressable,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
} from "react-native";
import { useTranslation } from "react-i18next";

import type { AuthMode, AuthPendingAction } from "@/components/auth/auth-types";
import { TextField } from "@/components/ui/TextField";
import { palette } from "@/constants/colors";
import { useLocale } from "@/context/LocaleContext";
import { useTheme } from "@/context/ThemeContext";

interface EmailPasswordFormProps {
  readonly mode: AuthMode;
  readonly isCompactViewport?: boolean;
  readonly pendingAction: AuthPendingAction;
  readonly errorMessage: string | null;
  readonly emailFieldRef?: RefObject<View | null>;
  readonly passwordFieldRef?: RefObject<View | null>;
  readonly onSubmit: (
    email: string,
    password: string,
    mode: AuthMode
  ) => Promise<void>;
  readonly onForgotPassword: (email: string) => Promise<void>;
  readonly onClearError?: () => void;
  readonly onEmailFocus?: () => void;
  readonly onPasswordFocus?: () => void;
}

interface FieldError {
  readonly field: "email" | "password";
  readonly message: string;
}

const MIN_PASSWORD_LENGTH = 6;

export function EmailPasswordForm({
  mode,
  isCompactViewport = false,
  pendingAction,
  errorMessage,
  emailFieldRef,
  passwordFieldRef,
  onSubmit,
  onForgotPassword,
  onClearError,
  onEmailFocus,
  onPasswordFocus,
}: EmailPasswordFormProps): React.JSX.Element {
  const { t } = useTranslation("auth");
  const { fontFamily, isRTL } = useLocale();
  const { isDark } = useTheme();
  const passwordInputRef = useRef<TextInput>(null);
  const passwordSelectionRef = useRef({ start: 0, end: 0 });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setPasswordVisible] = useState(false);
  const [fieldError, setFieldError] = useState<FieldError | null>(null);

  const isAnyActionPending = pendingAction !== null;
  const isEmailPending = pendingAction === "email";
  const isResetPending = pendingAction === "passwordReset";
  const iconColor = isDark ? palette.slate[400] : palette.slate[500];
  const fieldHeight = isCompactViewport ? 49 : 52;
  const buttonHeight = isCompactViewport ? 49 : 51;
  const buttonGradientColors: readonly [string, string] = isDark
    ? [palette.nileGreen[500], palette.nileGreen[400]]
    : [palette.nileGreen[800], palette.nileGreen[600]];

  const clearErrors = (): void => {
    setFieldError(null);
    onClearError?.();
  };

  const validateAndSubmit = async (): Promise<void> => {
    clearErrors();
    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setFieldError({
        field: "email",
        message: t("validation_email_required"),
      });
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setFieldError({ field: "email", message: t("validation_email_invalid") });
      return;
    }

    if (!password) {
      setFieldError({
        field: "password",
        message: t("validation_password_required"),
      });
      return;
    }

    if (mode === "signUp" && password.length < MIN_PASSWORD_LENGTH) {
      setFieldError({
        field: "password",
        message: t("validation_password_min", { min: MIN_PASSWORD_LENGTH }),
      });
      return;
    }

    await onSubmit(normalizedEmail, password, mode);
  };

  const togglePasswordVisibility = (): void => {
    setPasswordVisible((currentValue) => !currentValue);
    requestAnimationFrame(() => {
      passwordInputRef.current?.focus();
      passwordInputRef.current?.setNativeProps({
        selection: passwordSelectionRef.current,
      });
    });
  };

  const handleSelectionChange = (
    event: NativeSyntheticEvent<TextInputSelectionChangeEventData>
  ): void => {
    passwordSelectionRef.current = event.nativeEvent.selection;
  };

  const buttonLabel = isEmailPending
    ? mode === "signIn"
      ? t("signing_in")
      : t("creating_account")
    : mode === "signIn"
      ? t("sign_in")
      : t("create_account");

  return (
    <View testID="auth-credentials-form" className="w-full" style={{ gap: 11 }}>
      <View ref={emailFieldRef} collapsable={false}>
        <TextField
          testID="auth-email-input"
          label={t("email_address")}
          containerClassName=""
          labelClassName="text-xs text-text-primary dark:text-text-primary-dark"
          labelStyle={{ fontFamily: fontFamily.semiBold, marginBottom: 7 }}
          errorStyle={{ fontFamily: fontFamily.regular }}
          placeholder={t("email_address_placeholder")}
          className="text-sm font-normal"
          value={email}
          onChangeText={(nextEmail) => {
            setEmail(nextEmail);
            clearErrors();
          }}
          onFocus={onEmailFocus}
          error={fieldError?.field === "email" ? fieldError.message : undefined}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="emailAddress"
          autoComplete="email"
          editable={!isAnyActionPending}
          returnKeyType="next"
          style={{
            fontFamily: fontFamily.regular,
            fontSize: 14,
            height: fieldHeight,
            borderRadius: 14,
            paddingVertical: 0,
            writingDirection: "ltr",
            textAlign: "left",
          }}
          leadingAdornment={
            <Ionicons name="mail-outline" size={17} color={iconColor} />
          }
        />
      </View>

      <View ref={passwordFieldRef} collapsable={false}>
        <TextField
          testID="auth-password-input"
          inputRef={passwordInputRef}
          label={t("password")}
          containerClassName=""
          labelClassName="text-xs text-text-primary dark:text-text-primary-dark"
          labelStyle={{ fontFamily: fontFamily.semiBold, marginBottom: 7 }}
          errorStyle={{ fontFamily: fontFamily.regular }}
          placeholder={t("password_placeholder_label")}
          className="text-sm font-normal"
          value={password}
          onChangeText={(nextPassword) => {
            setPassword(nextPassword);
            clearErrors();
          }}
          onFocus={onPasswordFocus}
          onSelectionChange={handleSelectionChange}
          error={
            fieldError?.field === "password" ? fieldError.message : undefined
          }
          secureTextEntry={!isPasswordVisible}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType={mode === "signUp" ? "newPassword" : "password"}
          autoComplete={mode === "signUp" ? "new-password" : "current-password"}
          editable={!isAnyActionPending}
          returnKeyType="done"
          onSubmitEditing={() => {
            void validateAndSubmit();
          }}
          style={{
            fontFamily: fontFamily.regular,
            fontSize: 14,
            height: fieldHeight,
            borderRadius: 14,
            paddingVertical: 0,
            writingDirection: isRTL ? "rtl" : "ltr",
            textAlign: isRTL ? "right" : "left",
          }}
          leadingAdornment={
            <Ionicons name="lock-closed-outline" size={17} color={iconColor} />
          }
          trailingAdornment={
            <Pressable
              testID="auth-password-visibility"
              onPress={togglePasswordVisibility}
              disabled={isAnyActionPending}
              accessibilityRole="button"
              accessibilityLabel={
                isPasswordVisible ? t("hide_password") : t("show_password")
              }
              accessibilityState={{ disabled: isAnyActionPending }}
              className="items-center justify-center"
              style={{
                minWidth: 44,
                minHeight: 44,
                opacity: isAnyActionPending ? 0.5 : 1,
              }}
            >
              <Ionicons
                name={isPasswordVisible ? "eye-off-outline" : "eye-outline"}
                size={22}
                color={iconColor}
              />
            </Pressable>
          }
        />

        {errorMessage ? (
          <Text
            accessibilityRole="alert"
            className="mb-2 text-sm text-red-500"
            style={{ fontFamily: fontFamily.regular }}
          >
            {errorMessage}
          </Text>
        ) : null}

        {mode === "signIn" ? (
          <Pressable
            testID="auth-forgot-password"
            onPress={() => {
              void onForgotPassword(email.trim());
            }}
            disabled={isAnyActionPending}
            accessibilityRole="link"
            accessibilityLabel={
              isResetPending ? t("sending_reset") : t("forgot_password")
            }
            accessibilityState={{
              disabled: isAnyActionPending,
              busy: isResetPending,
            }}
            className="min-h-5 self-end justify-center"
            hitSlop={{ top: 24, right: 12, bottom: 0, left: 12 }}
            style={{ marginTop: 11, opacity: isAnyActionPending ? 0.55 : 1 }}
          >
            <Text
              className="text-xs text-nileGreen-700 dark:text-nileGreen-300"
              style={{ fontFamily: fontFamily.semiBold }}
            >
              {isResetPending ? t("sending_reset") : t("forgot_password")}
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          testID="auth-submit-button"
          onPress={() => {
            void validateAndSubmit();
          }}
          disabled={isAnyActionPending}
          accessibilityRole="button"
          accessibilityLabel={buttonLabel}
          accessibilityState={{
            disabled: isAnyActionPending,
            busy: isEmailPending,
          }}
          className="overflow-hidden items-center justify-center px-6"
          style={{
            height: buttonHeight,
            marginTop: 16,
            borderRadius: 14,
            opacity: isAnyActionPending ? 0.6 : 1,
          }}
        >
          <LinearGradient
            colors={buttonGradientColors}
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              borderRadius: 14,
            }}
          />
          <Text
            className="text-slate-25 dark:text-nileGreen-900"
            style={{ fontFamily: fontFamily.semiBold, fontSize: 15 }}
          >
            {buttonLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
