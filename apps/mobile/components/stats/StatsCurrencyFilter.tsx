import { Ionicons } from "@expo/vector-icons";
import type { CurrencyType } from "@monyvi/db";
import { SORTED_SUPPORTED_CURRENCIES, type CurrencyInfo } from "@monyvi/logic";
import React, { useMemo, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";

import { palette } from "@/constants/colors";

interface StatsCurrencyFilterProps {
  readonly availableCurrencies: readonly CurrencyType[];
  readonly selectedCurrency: CurrencyType;
  readonly onSelectCurrency: (currency: CurrencyType) => void;
}

export function StatsCurrencyFilter({
  availableCurrencies,
  selectedCurrency,
  onSelectCurrency,
}: StatsCurrencyFilterProps): React.JSX.Element | null {
  const { t } = useTranslation("common");
  const [isOpen, setIsOpen] = useState(false);

  const items = useMemo(
    () => getCurrencyItems(availableCurrencies),
    [availableCurrencies]
  );
  const selectedItem = items.find((item) => item.code === selectedCurrency);
  const isDisabled = items.length <= 1;

  if (items.length === 0) {
    return null;
  }

  return (
    <View className="relative z-20">
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-xs font-semibold uppercase tracking-wide text-text-muted dark:text-text-muted-dark">
            {t("currency")}
          </Text>
          <Text
            testID="stats-currency-scope"
            numberOfLines={1}
            className="mt-0.5 text-sm text-text-secondary dark:text-text-secondary-dark"
          >
            {t("stats_currency_scope", { currency: selectedCurrency })}
          </Text>
        </View>

        <TouchableOpacity
          testID="stats-currency-trigger"
          accessibilityRole="button"
          accessibilityLabel={t("select_currency")}
          accessibilityState={{ disabled: isDisabled, expanded: isOpen }}
          activeOpacity={0.7}
          disabled={isDisabled}
          onPress={() => setIsOpen((current) => !current)}
          className="min-h-11 flex-row items-center rounded-2xl border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-800"
        >
          {selectedItem ? (
            <Text className="me-2 text-lg">{selectedItem.flag}</Text>
          ) : null}
          <Text className="text-sm font-bold text-text-primary dark:text-text-primary-dark">
            {selectedCurrency}
          </Text>
          {!isDisabled ? (
            <Ionicons
              name={isOpen ? "chevron-up" : "chevron-down"}
              size={16}
              color={palette.slate[500]}
              style={{ marginStart: 8 }}
            />
          ) : null}
        </TouchableOpacity>
      </View>

      {isOpen ? (
        <View
          testID="stats-currency-menu"
          className="absolute end-0 top-12 z-30 min-w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
          style={{ elevation: 8 }}
        >
          <ScrollView className="max-h-72" showsVerticalScrollIndicator={false}>
            {items.map((item) => {
              const isSelected = item.code === selectedCurrency;

              return (
                <TouchableOpacity
                  key={item.code}
                  testID={`stats-currency-option-${item.code}`}
                  activeOpacity={0.7}
                  onPress={() => {
                    onSelectCurrency(item.code);
                    setIsOpen(false);
                  }}
                  className={`min-h-11 flex-row items-center px-4 py-2.5 ${
                    isSelected
                      ? "bg-nileGreen-50 dark:bg-nileGreen-900"
                      : "bg-white dark:bg-slate-800"
                  }`}
                >
                  <Text className="me-3 text-lg">{item.flag}</Text>
                  <View className="min-w-0 flex-1">
                    <Text
                      className={`text-sm font-semibold ${
                        isSelected
                          ? "text-nileGreen-700 dark:text-nileGreen-400"
                          : "text-text-primary dark:text-text-primary-dark"
                      }`}
                    >
                      {item.code}
                    </Text>
                    <Text
                      numberOfLines={1}
                      className="text-xs text-text-muted dark:text-text-muted-dark"
                    >
                      {item.name}
                    </Text>
                  </View>
                  <Text className="ms-3 text-sm text-text-secondary dark:text-text-secondary-dark">
                    {item.symbol}
                  </Text>
                  {isSelected ? (
                    <Ionicons
                      name="checkmark"
                      size={18}
                      color={palette.nileGreen[500]}
                      style={{ marginStart: 8 }}
                    />
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function getCurrencyItems(
  availableCurrencies: readonly CurrencyType[]
): CurrencyInfo[] {
  const availableSet = new Set(availableCurrencies);
  return SORTED_SUPPORTED_CURRENCIES.filter((currency) =>
    availableSet.has(currency.code)
  );
}
