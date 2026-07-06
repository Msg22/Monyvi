/**
 * FrequencyPickerModal — Bottom-sheet modal for selecting recurring payment frequency.
 *
 * Follows the same pattern as AccountSelectorModal and CategorySelectorModal.
 */

import { palette } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import type { RecurringFrequency } from "@monyvi/db";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import React from "react";
import {
  Modal,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useModalBottomInset } from "@/hooks/useModalBottomInset";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FREQUENCY_OPTIONS: ReadonlyArray<{
  value: RecurringFrequency;
  labelKey: string;
}> = [
  { value: "DAILY", labelKey: "freq_daily" },
  { value: "WEEKLY", labelKey: "freq_weekly" },
  { value: "MONTHLY", labelKey: "freq_monthly" },
  { value: "QUARTERLY", labelKey: "freq_quarterly" },
  { value: "YEARLY", labelKey: "freq_yearly" },
];

/** Returns a human-readable label for a frequency value (requires t function) */
export function getFrequencyLabel(
  freq: RecurringFrequency,
  t: (key: string) => string
): string {
  const option = FREQUENCY_OPTIONS.find((o) => o.value === freq);
  return option ? t(option.labelKey) : t("frequency");
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FrequencyPickerModalProps {
  readonly visible: boolean;
  readonly selectedFrequency: RecurringFrequency;
  readonly onSelect: (freq: RecurringFrequency) => void;
  readonly onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FrequencyPickerModal({
  visible,
  selectedFrequency,
  onSelect,
  onClose,
}: FrequencyPickerModalProps): React.JSX.Element {
  const { isDark } = useTheme();
  const { t } = useTranslation("transactions");
  const bottomInset = useModalBottomInset();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View className="flex-1 bg-black/60 justify-end">
          <View className="rounded-t-3xl overflow-hidden max-h-[70%] bg-white dark:bg-slate-900">
            <BlurView
              intensity={40}
              tint={isDark ? "dark" : "light"}
              className="absolute inset-0"
            />
            <View className="absolute inset-0 bg-white/95 dark:bg-slate-900/95" />

            <View
              testID="frequency-picker-sheet-content"
              style={{ paddingBottom: bottomInset }}
            >
              {/* Header */}
              <View className="flex-row justify-between items-center px-6 py-5 border-b border-slate-200 dark:border-slate-800">
                <Text className="text-xl font-bold text-slate-800 dark:text-slate-100">
                  {t("select_frequency")}
                </Text>
                <TouchableOpacity onPress={onClose} className="p-1">
                  <Ionicons
                    name="close"
                    size={24}
                    color={isDark ? palette.slate[300] : palette.slate[500]}
                  />
                </TouchableOpacity>
              </View>

              {/* Options */}
              <View className="p-4">
                <View className="flex-row flex-wrap gap-3">
                  {FREQUENCY_OPTIONS.map((option) => {
                    const isSelected = selectedFrequency === option.value;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        className={`flex-row w-[48%] items-center justify-center px-4 py-3 rounded-xl border ${
                          isSelected
                            ? "bg-nileGreen-100 dark:bg-nileGreen-900/40 border-nileGreen-500 dark:border-nileGreen-600"
                            : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                        }`}
                        onPress={() => {
                          onSelect(option.value);
                          onClose();
                        }}
                      >
                        {isSelected && (
                          <Ionicons
                            name="checkmark-circle"
                            size={16}
                            color={
                              isDark
                                ? palette.nileGreen[400]
                                : palette.nileGreen[600]
                            }
                            style={{ marginEnd: 6 }}
                          />
                        )}
                        <Text
                          className={`text-sm font-medium ${
                            isSelected
                              ? "text-nileGreen-700 dark:text-nileGreen-400 font-semibold"
                              : "text-slate-700 dark:text-slate-300"
                          }`}
                        >
                          {t(option.labelKey)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
