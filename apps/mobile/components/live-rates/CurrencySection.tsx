/**
 * Currency Section
 *
 * Section container for the currency list in Live Rates.
 * Includes section header ("Currencies" + search icon + "vs [X]" badge),
 * toggleable search input, FlatList of CurrencyRow items,
 * "See all currencies →" link, and empty state.
 *
 * Architecture & Design Rationale:
 * - Pattern: Composable Component (Atomic Design Level 3 — Organism)
 * - Why: Encapsulates the entire currency list section as a single unit.
 * - SOLID: SRP — manages only currency list presentation.
 *   OCP — adding new header badges or actions is additive.
 *
 * @module CurrencySection
 */

import type { CurrencyType } from "@monyvi/db";
import { palette } from "@/constants/colors";
import { ANDROID_SAFE_LIST_PROPS } from "@/constants/virtualized-list-policy";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useRef, useState } from "react";
import {
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";

import { CurrencyRow } from "./CurrencyRow";

// =============================================================================
// Constants
// =============================================================================

const ROW_HEIGHT = 48;

// =============================================================================
// Types
// =============================================================================

interface CurrencyDisplayItem {
  readonly code: CurrencyType;
  readonly name: string;
  readonly flag: string;
  readonly rate: string;
  readonly changePercent: number;
}

interface CurrencySectionProps {
  readonly currencies: readonly CurrencyDisplayItem[];
  readonly searchQuery: string;
  readonly onSearchChange: (query: string) => void;
  readonly isExpanded: boolean;
  readonly onToggleExpand: () => void;
  readonly preferredCurrencyLabel: string;
  readonly showSeeAll: boolean;
}

// =============================================================================
// Component
// =============================================================================

export function CurrencySection({
  currencies,
  searchQuery,
  onSearchChange,
  isExpanded,
  onToggleExpand,
  preferredCurrencyLabel,
  showSeeAll,
}: CurrencySectionProps): React.JSX.Element {
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const { t } = useTranslation("common");

  const toggleSearch = useCallback((): void => {
    if (isSearchVisible) {
      // Closing search — clear query
      onSearchChange("");
      setIsSearchVisible(false);
    } else {
      setIsSearchVisible(true);
      // Focus input after render
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isSearchVisible, onSearchChange]);

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: ROW_HEIGHT,
      offset: ROW_HEIGHT * index,
      index,
    }),
    []
  );

  const keyExtractor = useCallback(
    (item: CurrencyDisplayItem): string => item.code,
    []
  );

  const renderItem = useCallback(
    ({ item }: { item: CurrencyDisplayItem }): React.JSX.Element => (
      <CurrencyRow
        flag={item.flag}
        code={item.code}
        name={item.name}
        rate={item.rate}
        changePercent={item.changePercent}
      />
    ),
    []
  );

  const isEmpty = currencies.length === 0 && searchQuery.trim().length > 0;

  return (
    <View className="mt-5 px-5">
      {/* Section header */}
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-lg font-bold text-slate-800 dark:text-white">
          {t("currencies")}
        </Text>

        <View className="flex-row items-center">
          {/* Search icon */}
          <TouchableOpacity
            onPress={toggleSearch}
            className="p-1.5 me-2"
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={
              isSearchVisible ? "Close currency search" : "Open currency search"
            }
          >
            <Ionicons
              name={isSearchVisible ? "close-outline" : "search-outline"}
              size={20}
              color={palette.slate[500]}
            />
          </TouchableOpacity>

          {/* "vs USD" badge */}
          <View
            className="rounded-full px-2.5 py-1"
            style={{ backgroundColor: `${palette.nileGreen[500]}1A` }}
          >
            <Text
              className="text-xs font-semibold"
              style={{ color: palette.nileGreen[500] }}
            >
              {t("vs_currency", { currency: preferredCurrencyLabel })}
            </Text>
          </View>
        </View>
      </View>

      {/* Search input (toggleable) */}
      {isSearchVisible && (
        <View className="mb-3 bg-slate-100 dark:bg-slate-800 rounded-lg px-3 flex-row items-center">
          <Ionicons
            name="search-outline"
            size={16}
            color={palette.slate[400]}
          />
          <TextInput
            ref={inputRef}
            className="flex-1 py-2.5 ms-2 text-sm text-slate-800 dark:text-white"
            placeholder={t("search_currencies")}
            placeholderTextColor={palette.slate[400]}
            value={searchQuery}
            onChangeText={onSearchChange}
            autoCapitalize="characters"
            autoCorrect={false}
          />
        </View>
      )}

      {/* Currency list */}
      {isEmpty ? (
        <View className="py-8 items-center">
          <Ionicons
            name="search-outline"
            size={32}
            color={palette.slate[400]}
          />
          <Text className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {t("no_currencies_found")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={currencies}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          getItemLayout={getItemLayout}
          scrollEnabled={false}
          {...ANDROID_SAFE_LIST_PROPS}
        />
      )}

      {/* "See all currencies →" link */}
      {showSeeAll && (
        <TouchableOpacity
          onPress={onToggleExpand}
          activeOpacity={0.7}
          className="py-3 items-center"
        >
          <Text
            className="text-sm font-semibold"
            style={{ color: palette.nileGreen[500] }}
          >
            {t("see_all_currencies")}
          </Text>
        </TouchableOpacity>
      )}

      {/* Collapse link when expanded */}
      {isExpanded && !searchQuery.trim() && (
        <TouchableOpacity
          onPress={onToggleExpand}
          activeOpacity={0.7}
          className="py-3 items-center"
        >
          <Text
            className="text-sm font-semibold"
            style={{ color: palette.nileGreen[500] }}
          >
            {t("show_less")}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
