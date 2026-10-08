import React from "react";
import { Pressable, Text, View } from "react-native";

export type AddTransactionMode = "manual" | "voice";

interface AddTransactionModeTabsProps {
  readonly mode: AddTransactionMode;
  readonly onModeChange: (mode: AddTransactionMode) => void;
  readonly disabled?: boolean;
  readonly manualLabel: string;
  readonly voiceLabel: string;
}

interface ModeOption {
  readonly value: AddTransactionMode;
  readonly label: string;
}

export function AddTransactionModeTabs({
  mode,
  onModeChange,
  disabled = false,
  manualLabel,
  voiceLabel,
}: AddTransactionModeTabsProps): React.JSX.Element {
  const options: readonly ModeOption[] = [
    {
      value: "manual",
      label: manualLabel,
    },
    {
      value: "voice",
      label: voiceLabel,
    },
  ];

  return (
    <View
      accessibilityRole="tablist"
      className="mx-4 min-h-11 flex-row rounded-2xl bg-slate-100 p-1 dark:bg-slate-800"
    >
      {options.map((option) => {
        const isSelected = mode === option.value;

        return (
          <Pressable
            key={option.value}
            testID={`add-transaction-mode-${option.value}`}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{
              selected: isSelected,
              disabled,
            }}
            disabled={disabled}
            onPress={() => {
              if (!isSelected) {
                onModeChange(option.value);
              }
            }}
            className={`min-h-12 flex-1 items-center justify-center rounded-xl px-4 ${
              isSelected
                ? "bg-nileGreen-50 dark:bg-nileGreen-900"
                : "bg-transparent"
            }`}
            style={({ pressed }) => ({
              opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
            })}
          >
            <Text
              className={`text-base font-semibold ${
                isSelected
                  ? "text-nileGreen-700 dark:text-nileGreen-400"
                  : "text-text-secondary dark:text-text-secondary-dark"
              }`}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
