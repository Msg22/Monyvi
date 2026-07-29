import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { palette } from "@/constants/colors";
import { useLocale } from "@/context/LocaleContext";
import { useTheme } from "@/context/ThemeContext";

export interface ResetSentViewProps {
  readonly email: string;
  readonly onBack: () => void;
}

export function ResetSentView({
  email,
  onBack,
}: ResetSentViewProps): React.JSX.Element {
  const { t } = useTranslation("auth");
  const { fontFamily, isRTL } = useLocale();
  const { isDark } = useTheme();
  const iconColor = isDark ? palette.nileGreen[400] : palette.nileGreen[700];

  return (
    <View className="flex-1 justify-center py-10">
      <View className="items-center rounded-[28px] border border-slate-200 bg-slate-25/90 px-6 py-10 dark:border-slate-700 dark:bg-slate-900/90">
        <View className="mb-6 h-20 w-20 items-center justify-center rounded-full bg-nileGreen-500/15">
          <Ionicons name="key-outline" size={40} color={iconColor} />
        </View>
        <Text
          accessibilityRole="header"
          className="text-center text-2xl text-text-primary dark:text-text-primary-dark"
          style={{ fontFamily: fontFamily.bold }}
        >
          {t("reset_link_sent")}
        </Text>
        <Text
          className="mt-3 max-w-[310px] text-center text-base leading-6 text-text-secondary dark:text-text-secondary-dark"
          style={{ fontFamily: fontFamily.regular }}
        >
          {t("reset_link_message", { email })}
        </Text>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={t("back_to_sign_in")}
          className="mt-7 min-h-12 flex-row items-center justify-center gap-2 rounded-2xl bg-nileGreen-700 px-6 dark:bg-nileGreen-500"
        >
          <Ionicons
            name={isRTL ? "arrow-forward" : "arrow-back"}
            size={16}
            color={palette.slate[25]}
          />
          <Text
            className="text-sm text-slate-25"
            style={{ fontFamily: fontFamily.semiBold }}
          >
            {t("back_to_sign_in")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
