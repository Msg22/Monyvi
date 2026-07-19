import React from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { palette } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import type {
  GroupingPeriod,
  TransactionTypeFilter,
} from "@/hooks/useTransactionsGrouping";
import { translatePeriod } from "@/utils/period-translation";
import { useTranslation } from "react-i18next";

interface TransactionFiltersBarProps {
  period: GroupingPeriod;
  onPeriodPress: () => void;
  selectedTypes: readonly TransactionTypeFilter[];
  allTypesCount: number;
  onTypePress: () => void;
  searchQuery: string;
  onSearchChange: (text: string) => void;
  searchPlaceholder?: string;
  containerClassName?: string;
}

export function TransactionFiltersBar({
  period,
  onPeriodPress,
  selectedTypes,
  allTypesCount,
  onTypePress,
  searchQuery,
  onSearchChange,
  searchPlaceholder = "Search transactions...",
  containerClassName = "px-5 pb-4",
}: TransactionFiltersBarProps): React.JSX.Element {
  const { isDark } = useTheme();
  const { t } = useTranslation("common");

  return (
    <View className={containerClassName}>
      <View className="flex-row mb-3 flex-wrap gap-2">
        {/* Period Filter Pill */}
        <TouchableOpacity
          testID="filter-period"
          className="flex-row items-center bg-white dark:bg-slate-800 py-2.5 px-4 rounded-3xl border border-slate-200 dark:border-slate-700 gap-2 flex-1"
          // eslint-disable-next-line react-native/no-inline-styles
          style={{
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 2,
            elevation: 1,
          }}
          onPress={onPeriodPress}
          activeOpacity={0.7}
        >
          <Ionicons
            name="calendar-outline"
            size={18}
            color={isDark ? palette.nileGreen[400] : palette.nileGreen[600]}
          />
          <Text className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex-1">
            {translatePeriod(t, period)}
          </Text>
          <Ionicons
            name="chevron-down"
            size={16}
            color={isDark ? palette.slate[500] : palette.slate[400]}
          />
        </TouchableOpacity>

        {/* Type Filter Pill */}
        <TouchableOpacity
          testID="filter-type"
          className="flex-row items-center bg-white dark:bg-slate-800 py-2.5 px-4 rounded-3xl border border-slate-200 dark:border-slate-700 gap-2 flex-1 shadow-sm"
          onPress={onTypePress}
          activeOpacity={0.7}
        >
          <Ionicons
            name="funnel-outline"
            size={18}
            color={isDark ? palette.nileGreen[400] : palette.nileGreen[600]}
          />
          <Text
            className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex-1"
            numberOfLines={1}
          >
            {selectedTypes.length === allTypesCount
              ? "All Types"
              : selectedTypes.length === 0
                ? "No Types"
                : selectedTypes.join(", ")}
          </Text>
          <Ionicons
            name="chevron-down"
            size={16}
            color={isDark ? palette.slate[500] : palette.slate[400]}
          />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View className="bg-white dark:bg-slate-900 flex-row items-center px-4 h-12 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <Ionicons
          name="search-outline"
          size={20}
          color={isDark ? palette.slate[500] : palette.slate[400]}
        />
        <TextInput
          testID="search-input"
          className="flex-1 ms-3 text-slate-800 dark:text-slate-100 text-[16px]"
          placeholder={searchPlaceholder}
          placeholderTextColor={palette.slate[400]}
          value={searchQuery}
          onChangeText={onSearchChange}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => onSearchChange("")}>
            <Ionicons
              name="close-circle"
              size={20}
              color={isDark ? palette.slate[500] : palette.slate[400]}
            />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
