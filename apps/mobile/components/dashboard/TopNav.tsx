import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import React, { memo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { MonyviLogo } from "../ui/MonyviLogo";

interface TopNavProps {
  onMenuPress?: () => void;
  /** Optional: shows a currency chip button when provided */
  currencyCode?: string;
  currencyFlag?: string;
  onCurrencyPress?: () => void;
  /** When true, the currency chip is disabled (e.g., while the preference loads) */
  isCurrencyLoading?: boolean;
}

/**
 * Renders the top navigation bar with branding and action controls.
 *
 * The greeting has been moved to a separate row below TopNav in the dashboard
 * to prevent crowding on narrow screens (<375px).
 *
 * Layout: [☰ Menu] [Monyvi Logo] ─── flex spacer ─── [🇪🇬 EGP ▾] [⚙] [🔔]
 */
function TopNavComponent({
  onMenuPress,
  currencyCode,
  currencyFlag,
  onCurrencyPress,
  isCurrencyLoading = false,
}: TopNavProps): React.ReactElement {
  const { theme } = useTheme();
  const { t } = useTranslation("common");

  // Top inset is handled by the parent StarryBackground, which applies
  // `paddingTop` sourced directly from `initialWindowMetrics.insets.top` on a
  // plain View (it does NOT use SafeAreaView). Nesting a SafeAreaView here
  // would reintroduce the double-inset behavior that caused the cold-start
  // scroll-jump reported in issue #234.
  return (
    <View className="pb-2">
      <View className="flex-row items-center mt-2">
        {/* Hamburger Menu */}
        {onMenuPress && (
          <TouchableOpacity
            onPress={onMenuPress}
            accessibilityLabel={t("open_menu")}
            accessibilityRole="button"
            className="me-3"
          >
            <Ionicons
              name="menu-outline"
              size={26}
              color={theme.text.primary}
            />
          </TouchableOpacity>
        )}

        {/* Logo */}
        <MonyviLogo width={100} height={31} />

        {/* Spacer */}
        <View className="flex-1" />

        {/* Right Side: Actions */}
        <View className="flex-row items-center gap-2">
          {/* Currency Chip */}
          {currencyCode && onCurrencyPress && (
            <TouchableOpacity
              onPress={onCurrencyPress}
              disabled={isCurrencyLoading}
              accessibilityLabel={t("change_currency")}
              accessibilityRole="button"
              // NativeWind v4 can crash on opacity classes for TouchableOpacity.
              // eslint-disable-next-line react-native/no-inline-styles
              style={{
                backgroundColor: theme.surfaceHighlight,
                opacity: isCurrencyLoading ? 0.5 : 1,
              }}
              className="flex-row items-center gap-1 px-2.5 py-1.5 rounded-full"
            >
              <Text className="text-sm">{currencyFlag ?? "💱"}</Text>
              <Text
                style={{ color: theme.text.primary }}
                className="text-xs font-bold"
              >
                {currencyCode}
              </Text>
              <Ionicons
                name="chevron-down"
                size={12}
                color={theme.text.secondary}
              />
            </TouchableOpacity>
          )}

          {/* Settings Button */}
          <TouchableOpacity
            style={{
              backgroundColor: theme.surfaceHighlight,
            }}
            className="w-10 h-10 rounded-full items-center justify-center"
            onPress={() => router.push("/settings")}
            accessibilityLabel={t("settings")}
            accessibilityRole="button"
          >
            <Ionicons
              name="settings-outline"
              size={22}
              color={theme.text.secondary}
            />
          </TouchableOpacity>

          {/* Notification Button — visually present, disabled until feature ships */}
          <TouchableOpacity
            accessibilityLabel={t("notifications")}
            accessibilityRole="button"
            accessibilityState={{ disabled: true }}
            disabled
            style={{ backgroundColor: theme.surfaceHighlight }}
            className="w-10 h-10 rounded-full items-center justify-center relative"
          >
            <Ionicons
              name="notifications-outline"
              size={22}
              color={theme.text.secondary}
            />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export const TopNav = memo(TopNavComponent);
