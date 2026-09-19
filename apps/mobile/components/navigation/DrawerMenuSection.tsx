/**
 * DrawerMenuSection
 *
 * Renders a titled group of menu items inside the app drawer.
 * Extracted from AppDrawer to keep that file manageable (E4 in
 * dashboard-audit-plan v2).
 */

import { palette } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import type { Href } from "expo-router";
import React, { memo } from "react";
import { useTranslation } from "react-i18next";
import { Text, TouchableOpacity, View } from "react-native";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DrawerMenuItem {
  readonly id: string;
  readonly labelKey: string;
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly route?: Href;
}

interface DrawerMenuSectionProps {
  readonly titleKey: string;
  readonly items: readonly DrawerMenuItem[];
  readonly onItemPress: (route: Href) => void;
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function DrawerMenuSectionComponent({
  titleKey,
  items,
  onItemPress,
  className = "mb-4",
}: DrawerMenuSectionProps): React.JSX.Element {
  const { t: tCommon } = useTranslation("common");
  const { t: tDrawer } = useTranslation("drawer");
  const { isDark } = useTheme();

  const iconColor = isDark ? palette.slate[300] : palette.slate[600];

  return (
    <View className={className}>
      <Text className="text-xs font-semibold mb-2 text-slate-400 dark:text-slate-500">
        {tDrawer(titleKey)}
      </Text>
      {items.map((item) => (
        <TouchableOpacity
          key={item.id}
          onPress={() => item.route && onItemPress(item.route)}
          className="flex-row items-center py-3"
        >
          <Ionicons name={item.icon} size={22} color={iconColor} />
          <Text className="ms-4 text-base text-slate-800 dark:text-white">
            {tCommon(item.labelKey)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export const DrawerMenuSection = memo(DrawerMenuSectionComponent);
