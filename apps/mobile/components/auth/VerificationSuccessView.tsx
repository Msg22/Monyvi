import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { palette } from "@/constants/colors";
import { useLocale } from "@/context/LocaleContext";
import { useTheme } from "@/context/ThemeContext";

interface VerificationSuccessViewProps {
  readonly email?: string;
  readonly onContinue: () => void;
}

export function VerificationSuccessView({
  email,
  onContinue,
}: VerificationSuccessViewProps): React.JSX.Element {
  const { t } = useTranslation("auth");
  const { fontFamily } = useLocale();
  const { isDark } = useTheme();
  const accentColor = isDark ? palette.nileGreen[400] : palette.nileGreen[600];

  return (
    <View testID="verification-success-view" className="flex-1">
      <View className="flex-1 items-center justify-center px-3 pb-8">
        <View className="mb-7 h-[108px] w-[108px] items-center justify-center rounded-full bg-nileGreen-500/10">
          <View className="h-[72px] w-[72px] items-center justify-center rounded-full bg-nileGreen-500">
            <Ionicons name="checkmark" size={44} color={palette.slate[25]} />
          </View>
        </View>

        <Text
          accessibilityRole="header"
          className="text-center text-[28px] leading-[34px] text-text-primary dark:text-text-primary-dark"
          style={{ fontFamily: fontFamily.bold }}
        >
          {t("email_verified_title")}
        </Text>

        <Text
          className="mt-4 max-w-[315px] text-center text-[15px] leading-[23px] text-text-secondary dark:text-text-secondary-dark"
          style={{ fontFamily: fontFamily.regular }}
        >
          {t("email_verified_message")}
        </Text>

        {email ? (
          <View className="mt-6 rounded-[9px] bg-slate-100 px-4 py-2 dark:bg-slate-800">
            <Text
              className="text-[14px] text-text-primary dark:text-text-primary-dark"
              style={{ fontFamily: fontFamily.semiBold, writingDirection: "ltr" }}
            >
              {email}
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={onContinue}
          accessibilityRole="button"
          accessibilityLabel={t("continue_to_dashboard")}
          className="mt-8 h-12 w-full max-w-[310px] items-center justify-center rounded-[13px] bg-nileGreen-600"
        >
          <Text
            className="text-[15px] text-white"
            style={{ fontFamily: fontFamily.semiBold }}
          >
            {t("continue_to_dashboard")}
          </Text>
        </Pressable>
      </View>

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
            accessibilityRole="link"
            className="text-[11.5px] text-nileGreen-700 dark:text-nileGreen-300"
            style={{ fontFamily: fontFamily.semiBold }}
          >
            {t("privacy")}
          </Text>
          <View className="h-3 w-px bg-slate-200 dark:bg-slate-700" />
          <Text
            accessibilityRole="link"
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

export type { VerificationSuccessViewProps };
