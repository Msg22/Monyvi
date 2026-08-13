/**
 * PeriodFilterChips Component
 *
 * Horizontal row of filter chips (All | Weekly | Monthly | Custom)
 * with "All" selected by default. Used on the Budgets dashboard
 * to filter budgets by period type.
 *
 * Architecture & Design Rationale:
 * - Pattern: Controlled Presentational Component
 * - Why: Parent controls selected state via props.
 * - SOLID: SRP — renders filter chips only.
 *
 * @module PeriodFilterChips
 */

import React, { useCallback } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import type { BudgetPeriod } from "@monyvi/db";
import { palette } from "@/constants/colors";
import { useTranslation } from "react-i18next";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PeriodFilter = "ALL" | BudgetPeriod;

interface PeriodFilterChipsProps {
  /** Currently selected filter */
  readonly selected: PeriodFilter;
  /** Callback when a chip is tapped */
  readonly onSelect: (filter: PeriodFilter) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

interface ChipConfig {
  readonly key: PeriodFilter;
  readonly labelKey: string;
}

const CHIPS: readonly ChipConfig[] = [
  { key: "ALL", labelKey: "filter_all" },
  { key: "WEEKLY", labelKey: "filter_weekly" },
  { key: "MONTHLY", labelKey: "filter_monthly" },
  { key: "CUSTOM", labelKey: "filter_custom" },
] as const;

const ACTIVE_BG_COLOR = palette.nileGreen[500];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PeriodFilterChips({
  selected,
  onSelect,
}: PeriodFilterChipsProps): React.JSX.Element {
  const { t } = useTranslation("budgets");

  return (
    <View className="flex-grow-0 py-2 pt-4">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2 px-4 items-center"
      >
        {CHIPS.map((chip) => (
          <FilterChip
            key={chip.key}
            label={t(chip.labelKey)}
            testID={`budget-filter-${chip.key.toLowerCase()}`}
            isActive={selected === chip.key}
            onPress={() => onSelect(chip.key)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// FilterChip (internal)
// ---------------------------------------------------------------------------

interface FilterChipProps {
  readonly testID: string;
  readonly label: string;
  readonly isActive: boolean;
  readonly onPress: () => void;
}

function FilterChip({
  testID,
  label,
  isActive,
  onPress,
}: FilterChipProps): React.JSX.Element {
  const handlePress = useCallback((): void => {
    onPress();
  }, [onPress]);

  return (
    <TouchableOpacity
      testID={testID}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={label}
      activeOpacity={0.8}
      className={`rounded-full px-5 py-2.5 ${
        isActive ? "" : "bg-slate-100 dark:bg-slate-800"
      }`}
      style={isActive ? { backgroundColor: ACTIVE_BG_COLOR } : undefined}
    >
      <Text
        className={`text-[13px] font-semibold tracking-wide ${
          isActive ? "text-white" : "text-slate-600 dark:text-slate-300"
        }`}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}
