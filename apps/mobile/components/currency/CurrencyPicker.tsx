/**
 * CurrencyPicker - Modal component for selecting a currency.
 *
 * Features:
 * - Search/filter by name or code
 * - Grouped display (MENA first, then global)
 * - Current selection highlighted with checkmark
 * - Accessible touch targets
 */

import { palette } from "@/constants/colors";
import { ANDROID_SAFE_LIST_PROPS } from "@/constants/virtualized-list-policy";
import { Ionicons } from "@expo/vector-icons";
import type { CurrencyType } from "@monyvi/db";
import { SORTED_SUPPORTED_CURRENCIES, type CurrencyInfo } from "@monyvi/logic";
import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FlatList,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useModalBottomInset } from "@/hooks/useModalBottomInset";

interface CurrencyPickerProps {
  readonly visible: boolean;
  readonly selectedCurrency: CurrencyType;
  readonly onSelect: (currency: CurrencyType) => void;
  readonly onClose: () => void;
}

/**
 * Renders a touchable row representing a currency with its flag, code, name, and symbol.
 *
 * Highlights the row and displays a checkmark after the currency code when selected.
 *
 * @param item - Currency metadata including `flag`, `code`, `name`, and `symbol`
 * @param isSelected - Whether this row is the currently selected currency
 * @param onPress - Called when the row is pressed
 * @returns A React element for a selectable currency row
 */
function CurrencyRow({
  item,
  isSelected,
  onPress,
}: {
  item: CurrencyInfo;
  isSelected: boolean;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="px-5 py-3.5"
      activeOpacity={0.7}
    >
      <View
        testID={isSelected ? `currency-row-highlight-${item.code}` : undefined}
        className={`flex-row items-center justify-between ${
          isSelected ? "bg-nileGreen-50 dark:bg-nileGreen-900/20" : ""
        }`}
      >
        <View className="flex-row items-center gap-3 flex-1">
          <Text className="text-2xl">{item.flag}</Text>
          <View className="flex-1">
            <View
              testID={`currency-code-row-${item.code}`}
              className="flex-row items-center gap-1.5"
            >
              <Text
                testID={`currency-code-${item.code}`}
                className="text-base font-semibold text-slate-800 dark:text-white"
              >
                {item.code}
              </Text>
              {isSelected ? (
                <Ionicons
                  testID={`currency-selected-checkmark-${item.code}`}
                  name="checkmark-circle"
                  size={17}
                  color={palette.nileGreen[500]}
                />
              ) : null}
            </View>
            <Text className="text-xs text-slate-500 dark:text-slate-400">
              {item.name}
            </Text>
          </View>
          <Text className="text-sm text-slate-400 dark:text-slate-500 me-2">
            {item.symbol}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function CurrencyListSeparator(): React.JSX.Element {
  return <View className="h-[0.5px] bg-slate-100 dark:bg-white/5 ms-16" />;
}

/**
 * Render a modal currency picker that lets the user search, browse, and choose a currency.
 *
 * Filters the supported currency list by code or name as the user types. When a currency is picked,
 * `onSelect` is invoked with the chosen currency and the modal is closed; closing the modal (either
 * via background tap or request) calls `onClose`. The internal search query is cleared whenever the
 * picker is closed or a selection is made.
 *
 * @param visible - Whether the modal is visible
 * @param selectedCurrency - Currently selected currency code shown as highlighted
 * @param onSelect - Callback invoked with the selected currency code when a currency is chosen
 * @param onClose - Callback invoked to close the modal
 * @returns The React element for the currency picker modal
 */
export function CurrencyPicker({
  visible,
  selectedCurrency,
  onSelect,
  onClose,
}: CurrencyPickerProps): React.JSX.Element {
  const bottomInset = useModalBottomInset();
  const [searchQuery, setSearchQuery] = useState("");
  const { t } = useTranslation("common");

  const filteredCurrencies = useMemo(() => {
    if (!searchQuery.trim()) return [...SORTED_SUPPORTED_CURRENCIES];
    const query = searchQuery.toLowerCase();
    return SORTED_SUPPORTED_CURRENCIES.filter(
      (c) =>
        c.code.toLowerCase().includes(query) ||
        c.name.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  const handleSelect = useCallback(
    (currency: CurrencyType) => {
      onSelect(currency);
      onClose();
      setSearchQuery("");
    },
    [onSelect, onClose]
  );

  const handleClose = useCallback(() => {
    onClose();
    setSearchQuery("");
  }, [onClose]);

  const renderItem = useCallback(
    ({ item }: { item: CurrencyInfo }) => (
      <CurrencyRow
        item={item}
        isSelected={item.code === selectedCurrency}
        onPress={() => handleSelect(item.code)}
      />
    ),
    [selectedCurrency, handleSelect]
  );

  const keyExtractor = useCallback((item: CurrencyInfo) => item.code, []);

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View className="flex-1 justify-end bg-black/50">
          <TouchableWithoutFeedback>
            <View
              className="rounded-t-[32px] bg-white dark:bg-slate-800 max-h-[80%]"
              style={{ paddingBottom: bottomInset }}
            >
              {/* Handle */}
              <View className="pt-3 pb-2 items-center">
                <View className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/20" />
              </View>

              {/* Title */}
              <Text className="text-xl font-bold text-center text-slate-800 dark:text-white mb-3 px-5">
                {t("select_currency")}
              </Text>

              {/* Search */}
              <View className="mx-5 mb-3 flex-row items-center bg-slate-100 dark:bg-slate-700 rounded-xl px-3">
                <Ionicons name="search" size={18} color={palette.slate[400]} />
                <TextInput
                  placeholder={t("search_currency_name_code")}
                  placeholderTextColor={palette.slate[400]}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  className="flex-1 py-2.5 px-2 text-base text-slate-800 dark:text-white"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery("")}>
                    <Ionicons
                      name="close-circle"
                      size={18}
                      color={palette.slate[400]}
                    />
                  </TouchableOpacity>
                )}
              </View>

              {/* Currency List */}
              <FlatList
                data={filteredCurrencies}
                renderItem={renderItem}
                keyExtractor={keyExtractor}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                ItemSeparatorComponent={CurrencyListSeparator}
                {...ANDROID_SAFE_LIST_PROPS}
                maxToRenderPerBatch={15}
                windowSize={7}
              />
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
