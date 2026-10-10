import { useLocale } from "@/context/LocaleContext";
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

/**
 * Two equal-width, flat underline tabs. The visible/accessible order is
 * mirrored with the locale, without relying on translated labels for identity.
 */
export function AddTransactionModeTabs({
  mode,
  onModeChange,
  disabled = false,
  manualLabel,
  voiceLabel,
}: AddTransactionModeTabsProps): React.JSX.Element {
  const { isRTL, fontFamily } = useLocale();
  const manual: ModeOption = { value: "manual", label: manualLabel };
  const voice: ModeOption = { value: "voice", label: voiceLabel };
  const options: readonly ModeOption[] = isRTL
    ? [voice, manual]
    : [manual, voice];

  return (
    <View
      testID="add-transaction-modes-frame"
      className="w-full px-4"
    >
      <View
        testID="add-transaction-modes-tablist"
        accessibilityRole="tablist"
        className="min-h-12 w-full max-w-[560px] self-center flex-row border-b border-slate-200 dark:border-slate-700"
        style={{ direction: "ltr" }}
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
              if (!isSelected) onModeChange(option.value);
            }}
            className={`min-h-12 flex-1 items-center justify-center border-b-2 px-4 ${
              isSelected
                ? "border-nileGreen-600 dark:border-nileGreen-400"
                : "border-transparent"
            }`}
            style={({ pressed }) => ({
              opacity: disabled ? 0.5 : pressed ? 0.72 : 1,
            })}
          >
            <Text
              style={{ fontFamily: fontFamily.semiBold }}
              className={`text-base font-semibold leading-[26px] ${
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
    </View>
  );
}
