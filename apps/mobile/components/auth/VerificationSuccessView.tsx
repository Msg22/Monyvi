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
  const { fontFamily, isRTL } = useLocale();
  const { isDark } = useTheme();
  const accentColor = isDark ? palette.nileGreen[400] : palette.nileGreen[600];

  return (
    <View
      testID="verification-success-view"
      className="flex-1 w-full max-w-[400px] self-center"
    >
      <View className="flex-1 items-center justify-center">
        <View
          testID="verification-success-illustration"
          className="relative mb-6 h-28 w-28 items-center justify-center rounded-full bg-nileGreen-100 dark:bg-nileGreen-500/15"
        >
          <View className="h-[72px] w-[72px] items-center justify-center rounded-full bg-nileGreen-600 dark:bg-nileGreen-500">
            <Ionicons name="checkmark" size={44} color={palette.slate[25]} />
          </View>
          <Ionicons
            name="sparkles"
            size={16}
            color={accentColor}
            className="absolute right-1 top-2"
          />
          <Ionicons
            name="sparkles"
            size={13}
            color={accentColor}
            className="absolute bottom-3 left-1"
          />
          <Ionicons
            name="sparkles"
            size={11}
            color={accentColor}
            className="absolute left-2 top-5"
          />
          <Ionicons
            name="sparkles"
            size={10}
            color={accentColor}
            className="absolute bottom-5 right-2"
          />
        </View>

        <Text
          accessibilityRole="header"
          className="text-center text-text-primary dark:text-text-primary-dark"
          style={{
            fontFamily: fontFamily.bold,
            fontSize: isRTL ? 26 : 28,
            lineHeight: isRTL ? 38 : 34,
          }}
        >
          {t("email_verified_title")}
        </Text>

        <Text
          className="mt-3 max-w-[315px] text-center text-text-secondary dark:text-text-secondary-dark"
          style={{
            fontFamily: fontFamily.regular,
            fontSize: 15,
            lineHeight: 23,
          }}
        >
          {t("email_verified_message")}
        </Text>

        {email ? (
          <View className="mt-2 h-8 justify-center rounded-2xl bg-slate-100 px-4 dark:bg-slate-800">
            <Text
              className="text-[14px] text-text-primary dark:text-text-primary-dark"
              style={{
                fontFamily: fontFamily.semiBold,
                writingDirection: "ltr",
              }}
            >
              {email}
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={onContinue}
          accessibilityRole="button"
          accessibilityLabel={t("continue_to_dashboard")}
          className="mt-7 h-[52px] w-full items-center justify-center rounded-[14px] bg-nileGreen-600 dark:bg-nileGreen-500"
        >
          <Text
            className="text-[15px] text-white"
            style={{ fontFamily: fontFamily.semiBold }}
          >
            {t("continue_to_dashboard")}
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

export type { VerificationSuccessViewProps };
