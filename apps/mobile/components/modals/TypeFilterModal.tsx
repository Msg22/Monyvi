import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import React from "react";
import {
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useColorScheme,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";

import { palette } from "@/constants/colors";
import { TransactionTypeFilter } from "@/hooks/useTransactionsGrouping";
import { useModalBottomInset } from "@/hooks/useModalBottomInset";

interface TypeFilterModalProps {
  visible: boolean;
  selectedTypes: TransactionTypeFilter[];
  onToggle: (type: TransactionTypeFilter) => void;
  onClose: () => void;
}

const TYPE_OPTIONS: Array<{
  value: TransactionTypeFilter;
  labelKey: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { value: "Income", labelKey: "income", icon: "trending-up" },
  { value: "Expense", labelKey: "expense", icon: "trending-down" },
  { value: "Transfer", labelKey: "transfer", icon: "swap-horizontal" },
];

export function TypeFilterModal({
  visible,
  selectedTypes,
  onToggle,
  onClose,
}: TypeFilterModalProps): React.JSX.Element {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const { t } = useTranslation("common");
  const bottomInset = useModalBottomInset();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View className="flex-1 bg-black/80 justify-end">
          <View className="rounded-t-3xl overflow-hidden bg-white dark:bg-slate-900">
            <BlurView
              intensity={40}
              tint={isDark ? "dark" : "light"}
              className="absolute inset-0"
            />
            <View className="absolute inset-0 bg-white/95 dark:bg-slate-900/95" />

            <View style={{ paddingBottom: bottomInset }}>
              {/* Header */}
              <View className="flex-row justify-between items-center px-5 pt-5 pb-2">
                <Text className="text-xl font-bold text-slate-800 dark:text-slate-100">
                  {t("transaction_types")}
                </Text>
                <TouchableOpacity onPress={onClose} className="p-1">
                  <Ionicons
                    name="close"
                    size={24}
                    color={isDark ? palette.slate[300] : palette.slate[500]}
                  />
                </TouchableOpacity>
              </View>

              <Text className="text-sm text-slate-500 dark:text-slate-400 px-5 pb-3">
                {t("select_one_or_more_types")}
              </Text>

              {/* Options */}
              <ScrollView className="py-2 max-h-[300px]">
                {TYPE_OPTIONS.map((option) => {
                  const isSelected = selectedTypes.includes(option.value);
                  return (
                    <TouchableOpacity
                      key={option.value}
                      className={`flex-row justify-between items-center px-5 py-4 border-b border-slate-100 dark:border-slate-800/25 ${
                        isSelected
                          ? "bg-nileGreen-50 dark:bg-nileGreen-900/20"
                          : ""
                      }`}
                      onPress={() => onToggle(option.value)}
                    >
                      <View className="flex-row items-center gap-3">
                        <Ionicons
                          name={option.icon}
                          size={20}
                          color={
                            isSelected
                              ? isDark
                                ? palette.nileGreen[400]
                                : palette.nileGreen[600]
                              : isDark
                                ? palette.slate[400]
                                : palette.slate[500]
                          }
                        />
                        <Text
                          className={`text-base font-medium ${
                            isSelected
                              ? "text-nileGreen-600 dark:text-nileGreen-400 font-semibold"
                              : "text-slate-700 dark:text-slate-300"
                          }`}
                        >
                          {t(option.labelKey)}
                        </Text>
                      </View>
                      <View
                        className={`w-6 h-6 rounded-md border-2 items-center justify-center ${
                          isSelected
                            ? "bg-nileGreen-500 border-nileGreen-500"
                            : "border-slate-300 dark:border-slate-600"
                        }`}
                      >
                        {isSelected && (
                          <Ionicons name="checkmark" size={16} color="white" />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Done Button */}
              <TouchableOpacity
                className="bg-nileGreen-600 mx-5 my-5 py-4 rounded-xl items-center"
                onPress={onClose}
              >
                <Text className="text-base font-bold text-white">
                  {t("done")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
