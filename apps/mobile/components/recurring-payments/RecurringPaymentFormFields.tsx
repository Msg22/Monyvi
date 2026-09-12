import { Ionicons } from "@expo/vector-icons";
import type { CurrencyType, TransactionType } from "@monyvi/db";
import { formatAmountInput, parseAmountInput } from "@monyvi/logic";
import type { ReactElement, RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Text, TextInput, TouchableOpacity, View } from "react-native";

import { palette } from "@/constants/colors";
import { ErrorText } from "./RecurringPaymentFormRows";

const TYPE_OPTIONS: ReadonlyArray<{
  readonly value: TransactionType;
  readonly labelKey: "expense" | "income";
  readonly icon: keyof typeof Ionicons.glyphMap;
}> = [
  { value: "EXPENSE", labelKey: "expense", icon: "receipt-outline" },
  { value: "INCOME", labelKey: "income", icon: "cash-outline" },
];

interface AmountFieldProps {
  readonly fieldRef: RefObject<View | null>;
  readonly label: string;
  readonly value: string;
  readonly currency: CurrencyType;
  readonly error?: string;
  readonly isDark: boolean;
  readonly onFocus: () => void;
  readonly onChangeText: (value: string) => void;
}

export function AmountField({
  fieldRef,
  label,
  value,
  currency,
  error,
  isDark,
  onFocus,
  onChangeText,
}: AmountFieldProps): ReactElement {
  return (
    <View
      ref={fieldRef}
      testID="recurring-payment-amount-field"
      className="mb-4 w-full"
    >
      <Text className="input-label">{label}</Text>
      <View
        className={`flex-row items-center rounded-2xl border bg-white dark:bg-slate-800 ${
          error ? "border-red-500" : "border-slate-200 dark:border-slate-700"
        }`}
      >
        <Text
          testID="recurring-payment-amount-currency-prefix"
          className="ps-4 text-base font-bold text-nileGreen-500"
        >
          {currency}
        </Text>
        <TextInput
          testID="recurring-payment-amount-input"
          value={formatAmountInput(value)}
          onChangeText={(text) =>
            onChangeText(parseAmountInput(text, value))
          }
          onFocus={onFocus}
          placeholder="0.00"
          placeholderTextColor={
            isDark ? palette.slate[600] : palette.slate[400]
          }
          keyboardType="decimal-pad"
          className="flex-1 p-4 ps-2 text-base font-semibold text-slate-900 dark:text-white"
        />
      </View>
      {error ? <ErrorText>{error}</ErrorText> : null}
    </View>
  );
}

interface TypeTabsProps {
  readonly value: TransactionType;
  readonly onChange: (type: TransactionType) => void;
}

export function TypeTabs({ value, onChange }: TypeTabsProps): ReactElement {
  const { t } = useTranslation("transactions");

  return (
    <View testID="recurring-payment-type-tabs" className="flex-row gap-3 mb-5">
      {TYPE_OPTIONS.map((option) => {
        const isSelected = value === option.value;

        return (
          <TouchableOpacity
            key={option.value}
            className={`flex-1 h-12 rounded-full flex-row items-center justify-center border ${
              isSelected
                ? "bg-nileGreen-500 border-nileGreen-500"
                : "bg-slate-25 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
            }`}
            onPress={() => onChange(option.value)}
          >
            <Ionicons
              name={option.icon}
              size={17}
              color={isSelected ? "white" : palette.slate[500]}
            />
            <Text
              className={`ms-2 text-sm font-bold ${
                isSelected
                  ? "text-white"
                  : "text-text-secondary dark:text-text-secondary-dark"
              }`}
            >
              {t(option.labelKey)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
