import { palette } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { formatDate } from "@/utils/dateHelpers";
import type { CurrencyType } from "@monyvi/db";
import { formatLocalizedMoneyAmount } from "@/utils/localized-money-display";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import {
  configureReanimatedLogger,
  ReanimatedLogLevel,
} from "react-native-reanimated";
import { CategoryIcon, IconLibrary } from "../common/CategoryIcon";

configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});

interface BaseCardProps {
  id: string;
  isSelectionMode: boolean;
  isSelected: boolean;
  onPress: (id: string) => void;
  onLongPress: (id: string) => void;
  mainColor: string;
  iconName: string;
  iconLibrary: IconLibrary;
  title: string;
  amount: string;
  subtitle: string;
  isExpense: boolean;
  isIncome: boolean;
  counterparty?: string;
  details?: string;
  displayNetWorth: number | null;
  currencyCode: CurrencyType;
  date: Date;
  index?: number;
  onSwipeDelete?: (id: string) => void;
  onCategoryPress?: (id: string) => void;
  onAmountPress?: (id: string) => void;
  /** Optional formatted equivalent amount in preferred currency (e.g., "≈ $12.34") */
  equivalentAmountText?: string;
}

/**
 * Render a transaction card showing category, title, amount, details, net worth, and date with optional selection and inline edit affordances.
 *
 * @param id - Unique identifier for the transaction; passed to callback handlers.
 * @param isSelectionMode - When true, shows selection controls and disables editable affordances.
 * @param isSelected - When true, renders the card in a visually selected state.
 * @param onPress - Called with `id` when the card is tapped.
 * @param onLongPress - Called with `id` when the card is long-pressed (triggers haptic feedback first).
 * @param mainColor - Accent color used for the left border, icons, and amount text.
 * @param iconName - Name of the category icon to render.
 * @param iconLibrary - Icon library to use for the category icon.
 * @param title - Primary title text for the card (e.g., transaction description).
 * @param amount - Display string for the transaction amount.
 * @param subtitle - Secondary text (typically account name).
 * @param counterparty - Optional merchant or payer name; labeled "Merchant" when `isExpense` is true, otherwise "Payer".
 * @param isExpense - When true, treats `counterparty` as a merchant; otherwise as a payer.
 * @param details - Optional additional note or details to display below the subtitle.
 * @param displayNetWorth - Numeric value shown as the card's "NW" (net worth) display.
 * @param currencyCode - Currency to use when formatting the `displayNetWorth`.
 * @param date - Date to display on the card; formatted as day and abbreviated month in en-US.
 * @param onCategoryPress - Optional callback invoked with `id` when the category area is pressed (shows edit affordance when provided and not in selection mode).
 * @param onAmountPress - Optional callback invoked with `id` when the amount area is pressed (shows edit affordance when provided and not in selection mode).
 * @returns The rendered transaction card element.
 */
export const BaseCard = React.memo(function BaseCard({
  id,
  isSelectionMode,
  isSelected,
  onPress,
  onLongPress,
  mainColor,
  iconName,
  iconLibrary,
  title,
  amount,
  subtitle,
  counterparty,
  isExpense,
  details,
  displayNetWorth,
  currencyCode,
  date,
  onCategoryPress,
  onAmountPress,
  equivalentAmountText,
}: BaseCardProps): React.JSX.Element {
  const { isDark } = useTheme();
  return (
    <TouchableOpacity
      testID={`transaction-card-${id}`}
      activeOpacity={0.7}
      onPress={() => onPress(id)}
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(
          console.error
        );
        onLongPress(id);
      }}
      style={{ borderLeftColor: mainColor }}
      className={`bg-white dark:bg-slate-800 rounded-2xl mb-2 mx-4 p-3 shadow-sm border-t border-r border-b border-slate-200 dark:border-slate-700 border-l-4 ${
        isSelected
          ? "border-nileGreen-500 bg-nileGreen-50 dark:bg-nileGreen-900/25"
          : ""
      }`}
    >
      <View className="flex-row items-center">
        {/* Selection Checkbox */}
        {isSelectionMode && (
          <View className="me-3">
            <Ionicons
              name={isSelected ? "checkbox" : "square-outline"}
              size={24}
              color={
                isSelected
                  ? palette.nileGreen[500]
                  : isDark
                    ? palette.slate[500]
                    : palette.slate[400]
              }
            />
          </View>
        )}

        {/* Icon */}
        <TouchableOpacity
          testID={`card-category-${id}`}
          activeOpacity={0.7}
          onPress={() => onCategoryPress?.(id)}
          disabled={!onCategoryPress || isSelectionMode}
          className="w-10 h-10 rounded-full items-center justify-center me-3 relative"
          style={{ backgroundColor: `${mainColor}20` }}
        >
          <CategoryIcon
            iconName={iconName}
            iconLibrary={iconLibrary}
            size={20}
            color={mainColor}
          />
          {!isSelectionMode && onCategoryPress && (
            <View className="absolute -bottom-1 -end-1 bg-white dark:bg-slate-800 rounded-full p-0.5 border border-slate-200 dark:border-slate-700">
              <Ionicons
                name="pencil"
                size={8}
                color={isDark ? palette.slate[400] : palette.slate[500]}
              />
            </View>
          )}
        </TouchableOpacity>

        {/* Content */}
        <View className="flex-1">
          {/* Title Row */}
          <View className="flex-row justify-between items-center mb-1">
            <Text
              className="text-[15px] font-semibold text-slate-800 dark:text-slate-50 flex-1 me-2"
              numberOfLines={1}
            >
              {title}
            </Text>
            <TouchableOpacity
              testID={`card-amount-${id}`}
              activeOpacity={0.6}
              onPress={() => onAmountPress?.(id)}
              disabled={!onAmountPress || isSelectionMode}
              className="flex-row items-center gap-1"
            >
              <Text
                className="text-[15px] font-bold"
                style={{ color: mainColor }}
              >
                {amount}
              </Text>
              {!isSelectionMode && onAmountPress && (
                <View className="ms-1">
                  <Ionicons
                    name="pencil"
                    size={10}
                    style={{ color: mainColor }}
                  />
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Equivalent amount in preferred currency */}
          {equivalentAmountText ? (
            <Text className="text-[11px] text-slate-400 dark:text-slate-500 text-end mb-0.5">
              {equivalentAmountText}
            </Text>
          ) : null}

          {/* Details Row */}
          <View className="flex-row justify-between items-center">
            <View className="flex-1 me-2">
              {/* Subtitle (Account name) */}
              <Text
                className="text-xs font-medium text-slate-500 dark:text-slate-300 mb-0.5"
                numberOfLines={1}
              >
                {subtitle}
              </Text>
              {/* Merchant (if present) */}
              {counterparty && (
                <Text
                  className="text-[11px] text-slate-400 dark:text-slate-400 mb-0.5"
                  numberOfLines={1}
                >
                  {isExpense
                    ? "Merchant: " + counterparty
                    : "Payer: " + counterparty}
                </Text>
              )}
              {/* Details/Note (optional) */}
              {details && (
                <Text
                  className="text-[13px] text-slate-400 dark:text-slate-400"
                  numberOfLines={1}
                >
                  {details}
                </Text>
              )}
            </View>

            {/* Footer - NW + Date */}
            <View className="items-end">
              <View className="flex-row items-center">
                <Text className="text-[11px] text-slate-400 dark:text-slate-500">
                  Net Worth:{" "}
                </Text>
                <Text className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                  {displayNetWorth === null
                    ? "—"
                    : formatLocalizedMoneyAmount({
                        amount: displayNetWorth,
                        currency: currencyCode,
                      })}
                </Text>
              </View>
              <Text className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                {formatDate(date, "MMM d")}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});
