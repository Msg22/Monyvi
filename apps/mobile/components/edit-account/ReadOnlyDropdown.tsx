/**
 * ReadOnlyDropdown Component
 *
 * A disabled dropdown that displays a locked field with a custom styled tooltip.
 * Used for account type and currency fields in the Edit Account screen,
 * which cannot be changed after creation.
 *
 * Architecture & Design Rationale:
 * - Pattern: Presentational Component (no business logic)
 * - SOLID: SRP — displays a locked, read-only dropdown with tooltip
 * - Uses the reusable Tooltip component from components/ui/Tooltip.tsx
 *
 * @module ReadOnlyDropdown
 */

import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { palette } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { Tooltip } from "@/components/ui/Tooltip";
import { FieldLabel } from "@/components/ui/FieldLabel";

// ---------------------------------------------------------------------------
// Constants (tooltip config is now handled by the reusable Tooltip component)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReadOnlyDropdownProps {
  /** Label displayed above the dropdown */
  readonly label: string;
  /** The current value to display */
  readonly displayValue: string;
  /** Optional icon emoji to display */
  readonly icon?: string;
  /** Tooltip text explaining why the field is locked */
  readonly tooltipText?: string;
  /** Additional container className */
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * A read-only dropdown with a lock icon and custom styled tooltip.
 *
 * Tapping the lock icon reveals a tooltip explaining that the field
 * cannot be changed after creation.
 */
export function ReadOnlyDropdown({
  label,
  displayValue,
  icon,
  tooltipText,
  className = "",
}: ReadOnlyDropdownProps): React.JSX.Element {
  const { isDark } = useTheme();
  const { t } = useTranslation("accounts");
  const [showTooltip, setShowTooltip] = useState(false);
  const resolvedTooltipText = tooltipText ?? t("read_only_default_tooltip");

  const handleLockPress = useCallback((): void => {
    setShowTooltip((prev) => !prev);
  }, []);

  const handleTooltipDismiss = useCallback((): void => {
    setShowTooltip(false);
  }, []);

  return (
    <View className={`mb-4 ${className}`}>
      {/* Label */}
      <FieldLabel label={label} className="input-label mb-2" />

      {/* Dropdown-like container */}
      <View className="flex-row items-center justify-between rounded-2xl border border-slate-200 bg-slate-100 p-4 dark:border-slate-700 dark:bg-slate-800/50">
        {/* Left: Icon + Value */}
        <View className="flex-row items-center flex-1">
          {icon ? <Text className="text-lg me-2">{icon}</Text> : null}
          <Text className="text-base font-medium text-slate-500 dark:text-slate-400">
            {displayValue}
          </Text>
        </View>

        {/* Right: Lock icon + Tooltip trigger */}
        <View className="relative">
          <Pressable
            onPress={handleLockPress}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t("read_only_locked_label", { label })}
          >
            <Ionicons
              name="lock-closed"
              size={16}
              color={isDark ? palette.slate[500] : palette.slate[400]}
            />
          </Pressable>

          <Tooltip
            text={resolvedTooltipText}
            visible={showTooltip}
            onDismiss={handleTooltipDismiss}
            position="top"
            arrowAlignment="right"
          />
        </View>
      </View>
    </View>
  );
}
