/**
 * CurrencyPickerStep Component
 *
 * Full-screen onboarding step that lets the user pick their currency.
 * Always shown during onboarding — the user's selection is the sole
 * source of truth for which currency to create the cash wallet in.
 *
 * The most likely currency (inferred from the device timezone) is
 * sorted to the top and pre-selected for convenience.
 *
 * Architecture & Design Rationale:
 * - Pattern: Presentational Component
 * - Why: Pure UI — receives callbacks via props, no side effects
 * - SOLID: SRP — only renders currency list and forwards selection
 *
 * @module CurrencyPickerStep
 */

import { palette } from "@/constants/colors";
import { ANDROID_SAFE_LIST_PROPS } from "@/constants/virtualized-list-policy";
import { useTheme } from "@/context/ThemeContext";
import { detectCurrencyFromTimezone } from "@/utils/currency-detection";
import type { CurrencyType } from "@monyvi/db";
import { CurrencyInfo, SUPPORTED_CURRENCIES } from "@monyvi/logic";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CurrencyPickerStepProps {
  /** Called when the user taps "Continue" with the selected currency code. */
  readonly onCurrencySelected: (currency: CurrencyType) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Fixed item height for getItemLayout optimisation.
 * py-4 (32) + h-10 flag (40) = 72px content + mb-2 (8) margin = 80px per row.
 */
const CURRENCY_ITEM_HEIGHT = 80;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CurrencyPickerStep({
  onCurrencySelected,
}: CurrencyPickerStepProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const { t } = useTranslation("onboarding");
  const { t: tCommon } = useTranslation("common");

  // Detect suggested currency from timezone (one-time on mount)
  const suggestedCurrency = useMemo(
    (): CurrencyType => detectCurrencyFromTimezone() ?? "EGP",
    []
  );

  const [selectedCode, setSelectedCode] =
    useState<CurrencyType>(suggestedCurrency);

  // Sort currencies: suggested first, then rest in original order
  const sortedCurrencies = useMemo((): readonly CurrencyInfo[] => {
    const suggested = SUPPORTED_CURRENCIES.find(
      (c) => c.code === suggestedCurrency
    );
    if (!suggested) return SUPPORTED_CURRENCIES;

    const rest = SUPPORTED_CURRENCIES.filter(
      (c) => c.code !== suggestedCurrency
    );
    return [suggested, ...rest];
  }, [suggestedCurrency]);

  // Filter currencies based on search query
  const filteredCurrencies = useMemo((): readonly CurrencyInfo[] => {
    if (!searchQuery.trim()) return sortedCurrencies;

    const query = searchQuery.toLowerCase().trim();
    return sortedCurrencies.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.code.toLowerCase().includes(query)
    );
  }, [searchQuery, sortedCurrencies]);

  const handleSelect = useCallback((code: CurrencyType): void => {
    setSelectedCode(code);
  }, []);

  const handleContinue = useCallback((): void => {
    onCurrencySelected(selectedCode);
  }, [onCurrencySelected, selectedCode]);

  const renderCurrencyItem = useCallback(
    ({
      item,
      index,
    }: {
      item: CurrencyInfo;
      index: number;
    }): React.JSX.Element => {
      const isSelected = item.code === selectedCode;
      const isSuggested =
        index === 0 && item.code === suggestedCurrency && !searchQuery;

      // The selected/unselected backgrounds used to be NativeWind
      // `bg-color/opacity` classes, but that shorthand on `Pressable`/
      // `TouchableOpacity` triggers the NativeWind v4 CSS-interop race
      // (.claude/rules/android-modal-overlay-pattern.md "Dangerous
      // Classes"), which can silently strip the background on cold
      // Android start. Inline `backgroundColor` is race-immune.
      const rowBackgroundColor = isSelected
        ? isDark
          ? "rgba(16, 185, 129, 0.1)" // emerald-500 @ 10% (dark)
          : "rgba(16, 185, 129, 0.05)" // emerald-500 @ 5% (light)
        : isDark
          ? "rgba(255, 255, 255, 0.05)" // white @ 5% (dark)
          : "rgba(0, 0, 0, 0.03)"; // black @ 3% (light)

      return (
        <TouchableOpacity
          onPress={() => handleSelect(item.code)}
          className={`flex-row items-center py-4 px-4 mx-4 rounded-xl mb-2 ${
            isSelected
              ? "border-2 border-nileGreen-500"
              : "border border-transparent"
          }`}
          style={{ backgroundColor: rowBackgroundColor }}
          activeOpacity={0.7}
        >
          {/* Flag */}
          <View className="w-10 h-10 rounded-full items-center justify-center bg-slate-700/30 me-3">
            <Text className="text-xl">{item.flag}</Text>
          </View>

          {/* Name & Code */}
          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              <Text className="text-base font-semibold text-text-primary dark:text-text-primary-dark">
                {item.name}
              </Text>
              {isSuggested && (
                <View className="px-2 py-0.5 rounded-full bg-nileGreen-500/20">
                  <Text className="text-[10px] font-bold text-nileGreen-500">
                    {t("suggested")}
                  </Text>
                </View>
              )}
            </View>
            <Text className="text-xs text-text-secondary dark:text-text-secondary-dark mt-0.5">
              {item.code}
            </Text>
          </View>

          {/* Radio indicator */}
          <View
            className={`w-6 h-6 rounded-full items-center justify-center border-2 ${
              isSelected ? "border-nileGreen-500" : "border-slate-500"
            }`}
          >
            {isSelected && (
              <View className="w-3 h-3 rounded-full bg-nileGreen-500" />
            )}
          </View>
        </TouchableOpacity>
      );
    },
    [selectedCode, handleSelect, suggestedCurrency, searchQuery, t]
  );

  const keyExtractor = useCallback(
    (item: CurrencyInfo): string => item.code,
    []
  );

  return (
    <View className="flex-1 bg-background dark:bg-background-dark">
      {/* Background Gradient for Dark Mode */}
      {isDark && (
        <LinearGradient
          colors={theme.backgroundGradient}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* Header */}
      <View className="px-6 pb-4" style={{ paddingTop: insets.top + 16 }}>
        <Text className="text-3xl font-bold text-text-primary dark:text-text-primary-dark mb-2">
          {t("choose_your_currency")}
        </Text>
        <Text className="text-sm text-text-secondary dark:text-text-secondary-dark leading-5">
          {t("currency_description")}
        </Text>
      </View>

      {/* Search bar */}
      <View className="mx-6 mb-4">
        <View className="flex-row items-center px-4 py-3 rounded-xl bg-black/5 dark:bg-white/[0.08]">
          <Ionicons
            name="search"
            size={18}
            color={isDark ? palette.slate[400] : palette.slate[500]}
          />
          <TextInput
            className="flex-1 ms-2 text-base text-text-primary dark:text-text-primary-dark"
            placeholder={t("search_currency")}
            placeholderTextColor={
              isDark ? palette.slate[500] : palette.slate[400]
            }
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      </View>

      {/* Currency list */}
      <FlatList
        {...ANDROID_SAFE_LIST_PROPS}
        data={filteredCurrencies}
        renderItem={renderCurrencyItem}
        keyExtractor={keyExtractor}
        getItemLayout={(
          _data,
          index
        ): { length: number; offset: number; index: number } => ({
          length: CURRENCY_ITEM_HEIGHT,
          offset: CURRENCY_ITEM_HEIGHT * index,
          index,
        })}
        showsVerticalScrollIndicator={false}
        className="flex-1"
        keyboardShouldPersistTaps="handled"
      />

      {/* Continue button */}
      <View className="px-6" style={{ paddingBottom: insets.bottom + 16 }}>
        <TouchableOpacity
          onPress={handleContinue}
          className="rounded-2xl py-[18px] bg-nileGreen-500 items-center justify-center"
          // eslint-disable-next-line react-native/no-inline-styles
          style={{
            elevation: 4,
            shadowColor: palette.nileGreen[500],
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
          }}
          activeOpacity={0.8}
        >
          <Text className="text-white font-semibold text-lg">
            {tCommon("continue")}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
