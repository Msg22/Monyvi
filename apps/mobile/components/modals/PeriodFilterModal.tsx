import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import React, { useMemo } from "react";
import {
  Modal,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useColorScheme,
  View,
} from "react-native";
import { palette } from "@/constants/colors";
import { GroupingPeriod } from "@/hooks/useTransactionsGrouping";
import { useTranslation } from "react-i18next";
import { useModalBottomInset } from "@/hooks/useModalBottomInset";

interface PeriodFilterModalProps {
  visible: boolean;
  selectedPeriod: GroupingPeriod;
  onSelect: (period: GroupingPeriod) => void;
  onClose: () => void;
}

const PERIOD_VALUES: GroupingPeriod[] = [
  "today",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "six_months",
  "this_year",
  "all_time",
];

export function PeriodFilterModal({
  visible,
  selectedPeriod,
  onSelect,
  onClose,
}: PeriodFilterModalProps): React.JSX.Element {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const { t } = useTranslation("common");
  const bottomInset = useModalBottomInset();

  const periodOptions = useMemo(
    () =>
      PERIOD_VALUES.map((value) => ({
        value,
        label: t(`period_${value}`),
      })),
    [t]
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View className="flex-1 bg-black/80 justify-end">
          <View className="rounded-t-3xl overflow-hidden max-h-[70%] bg-white dark:bg-slate-900">
            <BlurView
              intensity={40}
              tint={isDark ? "dark" : "light"}
              className="absolute inset-0"
            />
            <View className="absolute inset-0 bg-white/95 dark:bg-slate-900/95" />

            <View style={{ paddingBottom: bottomInset }}>
              {/* Header */}
              <View className="flex-row justify-between items-center px-5 py-5 border-b border-slate-200 dark:border-slate-800">
                <Text className="text-xl font-bold text-slate-800 dark:text-slate-100">
                  {t("select_period")}
                </Text>
                <TouchableOpacity onPress={onClose} className="p-1">
                  <Ionicons
                    name="close"
                    size={24}
                    color={isDark ? palette.slate[300] : palette.slate[500]}
                  />
                </TouchableOpacity>
              </View>

              {/* Options - 2 columns grid */}
              <View className="p-4">
                <View className="flex-row flex-wrap gap-3">
                  {periodOptions.map((option) => {
                    const isSelected = selectedPeriod === option.value;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        className={`flex-row items-center justify-center px-4 py-3 rounded-xl border ${
                          isSelected
                            ? "bg-nileGreen-100 dark:bg-nileGreen-900/40 border-nileGreen-500 dark:border-nileGreen-600"
                            : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                        }`}
                        style={{ width: "48%" }}
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
                          {option.label}
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
