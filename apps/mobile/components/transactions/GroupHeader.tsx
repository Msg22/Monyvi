import type { CurrencyType } from "@monyvi/db";
import { formatLocalizedMoneyAmount } from "@/utils/localized-money-display";
import { BlurView } from "expo-blur";
import React from "react";
import { Platform, Text, useColorScheme, View } from "react-native";

interface GroupHeaderProps {
  title: string;
  netWorth: number;
  income: number;
  expense: number;
  currencyCode: CurrencyType;
}

/**
 * Render a header for a transaction group showing the title, optional income/expense totals, and the formatted running balance.
 *
 * @param currencyCode - Currency to use when formatting income, expense, and net worth amounts
 * @returns A React element containing the group header UI with title, conditional income/expense badges, and the formatted balance
 */
export const GroupHeader = React.memo(function GroupHeader({
  title,
  netWorth,
  income,
  expense,
  currencyCode,
}: GroupHeaderProps): React.JSX.Element {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <View className="mt-4 mb-2 mx-4 rounded-xl overflow-hidden">
      {Platform.OS === "ios" ? (
        <BlurView
          intensity={20}
          tint={isDark ? "dark" : "light"}
          className="absolute inset-0"
        />
      ) : (
        <View className="absolute inset-0 bg-slate-200/80 dark:bg-slate-800/80" />
      )}

      <View className="flex-row justify-between items-center px-4 py-2.5">
        <Text className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide flex-1 me-2">
          {title}
        </Text>

        <View className="flex-col items-end">
          {/* Group Totals */}
          {(income > 0 || expense > 0) && (
            <View className="flex-row items-center gap-2 mb-0.5">
              {income > 0 && (
                <Text className="text-[11px] text-nileGreen-600 dark:text-nileGreen-400 font-semibold">
                  +
                  {formatLocalizedMoneyAmount({
                    amount: income,
                    currency: currencyCode,
                  })}
                </Text>
              )}
              {expense > 0 && (
                <Text className="text-[11px] text-red-500 dark:text-red-400 font-semibold">
                  -
                  {formatLocalizedMoneyAmount({
                    amount: expense,
                    currency: currencyCode,
                  })}
                </Text>
              )}
            </View>
          )}

          {/* Running Balance / Net Worth */}
          <Text className="text-[10px] text-slate-400 dark:text-slate-500">
            Bal:{" "}
            <Text className="text-slate-600 dark:text-slate-300 font-medium">
              {formatLocalizedMoneyAmount({
                amount: netWorth,
                currency: currencyCode,
              })}
            </Text>
          </Text>
        </View>
      </View>
    </View>
  );
});
