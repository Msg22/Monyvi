import { Ionicons } from "@expo/vector-icons";
import type { CurrencyType } from "@monyvi/db";
import { SORTED_SUPPORTED_CURRENCIES, type CurrencyInfo } from "@monyvi/logic";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
} from "react-native";
import { useTranslation } from "react-i18next";

import { palette } from "@/constants/colors";
import { useLocale } from "@/context/LocaleContext";

interface StatsCurrencyFilterProps {
  readonly availableCurrencies: readonly CurrencyType[];
  readonly selectedCurrency: CurrencyType;
  readonly onSelectCurrency: (currency: CurrencyType) => void;
}

interface StatsCurrencyOptionProps {
  readonly item: CurrencyInfo;
  readonly isSelected: boolean;
  readonly language: string;
  readonly onSelect: (currency: CurrencyType) => void;
}

export function StatsCurrencyFilter({
  availableCurrencies,
  selectedCurrency,
  onSelectCurrency,
}: StatsCurrencyFilterProps): React.JSX.Element | null {
  const { t } = useTranslation("common");
  const { language } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const [filterRowHeight, setFilterRowHeight] = useState(0);

  const items = useMemo(
    () => getCurrencyItems(availableCurrencies),
    [availableCurrencies]
  );
  const selectedItem = items.find((item) => item.code === selectedCurrency);
  const isDisabled = items.length <= 1;

  if (items.length === 0) {
    return null;
  }

  const handleSelect = (currency: CurrencyType): void => {
    onSelectCurrency(currency);
    setIsOpen(false);
  };

  const renderCurrencyItem = ({
    item,
  }: ListRenderItemInfo<CurrencyInfo>): React.JSX.Element => (
    <StatsCurrencyOption
      item={item}
      isSelected={item.code === selectedCurrency}
      language={language}
      onSelect={handleSelect}
    />
  );

  return (
    <View className="relative z-20">
      <View
        testID="stats-currency-filter-row"
        onLayout={(event: LayoutChangeEvent): void => {
          setFilterRowHeight(event.nativeEvent.layout.height);
        }}
        className="flex-row items-center justify-between gap-3"
      >
        <View className="min-w-0 flex-1">
          <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t("currency")}
          </Text>
          <Text
            testID="stats-currency-scope"
            numberOfLines={1}
            className="mt-0.5 text-sm text-text-secondary dark:text-text-secondary-dark"
          >
            {t("transactions")} · {selectedCurrency}
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
          className="absolute end-0 z-30 min-w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
          style={{ elevation: 8, top: filterRowHeight }}
        >
          <FlatList
            className="max-h-72"
            data={items}
            keyExtractor={(item): string => item.code}
            renderItem={renderCurrencyItem}
            showsVerticalScrollIndicator={false}
          />
        </View>
      ) : null}
    </View>
  );
}

function StatsCurrencyOption({
  item,
  isSelected,
  language,
  onSelect,
}: StatsCurrencyOptionProps): React.JSX.Element {
  const localizedName = getLocalizedCurrencyName(item, language);

  return (
    <TouchableOpacity
      testID={`stats-currency-option-${item.code}`}
      accessibilityRole="radio"
      accessibilityLabel={`${item.code}, ${localizedName}`}
      accessibilityState={{ selected: isSelected }}
      activeOpacity={0.7}
      onPress={() => onSelect(item.code)}
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
          className="text-xs text-slate-500 dark:text-slate-400"
        >
          {localizedName}
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
}

function getCurrencyItems(
  availableCurrencies: readonly CurrencyType[]
): CurrencyInfo[] {
  const metadataByCode = new Map(
    SORTED_SUPPORTED_CURRENCIES.map((currency) => [currency.code, currency])
  );

  return availableCurrencies.map((code) => {
    const metadata = metadataByCode.get(code);
    if (metadata) return metadata;

    return {
      code,
      name: code,
      symbol: code === "BTC" ? "₿" : code,
      flag: code === "BTC" ? "₿" : "💱",
    };
  });
}

function getLocalizedCurrencyName(
  item: CurrencyInfo,
  language: string
): string {
  try {
    const currencyPart = new Intl.NumberFormat(language, {
      style: "currency",
      currency: item.code,
      currencyDisplay: "name",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value;

    if (currencyPart && currencyPart !== item.code) {
      return currencyPart;
    }
  } catch {
    // Fall through to a language-neutral code when Intl lacks metadata.
  }

  return language.startsWith("en") ? item.name : item.code;
}
