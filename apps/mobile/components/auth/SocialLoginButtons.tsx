import React from "react";
import { Pressable, Text } from "react-native";
import { useTranslation } from "react-i18next";

import { GoogleMark } from "@/components/auth/GoogleMark";
import { useLocale } from "@/context/LocaleContext";
import type { OAuthProvider } from "@/services/supabase";

interface SocialLoginButtonsProps {
  readonly isLoading: boolean;
  readonly isDisabled: boolean;
  readonly onPress: (provider: OAuthProvider) => Promise<void>;
}

export function SocialLoginButtons({
  isLoading,
  isDisabled,
  onPress,
}: SocialLoginButtonsProps): React.JSX.Element {
  const { t } = useTranslation("auth");
  const { fontFamily } = useLocale();
  const label = isLoading ? t("opening_google") : t("continue_with_google");

  return (
    <Pressable
      testID="auth-google-button"
      onPress={() => {
        void onPress("google");
      }}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: isLoading, disabled: isDisabled }}
      className="min-h-12 flex-row items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-3.5 dark:border-slate-600 dark:bg-slate-800"
      style={{ opacity: isDisabled && !isLoading ? 0.6 : 1 }}
    >
      <GoogleMark size={20} />
      <Text
        className="ms-3 text-base text-text-primary dark:text-text-primary-dark"
        style={{ fontFamily: fontFamily.semiBold }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
