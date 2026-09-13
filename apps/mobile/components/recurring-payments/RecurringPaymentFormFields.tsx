import { Ionicons } from "@expo/vector-icons";
import type { CurrencyType, TransactionType } from "@monyvi/db";
import {
  formatAmountInput,
  MAX_TRANSACTION_AMOUNT,
  resolveAmountInputChange,
} from "@monyvi/logic";
import { useState, type ReactElement, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Text, TextInput, TouchableOpacity, View } from "react-native";

import { palette } from "@/constants/colors";
import { getRecurringPaymentAmountError } from "@/validation/recurring-payment-validation";
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
  const { t } = useTranslation("transactions");
  const { t: tCommon } = useTranslation("common");
  const [hasBlurred, setHasBlurred] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const liveError = hasBlurred
    ? getRecurringPaymentAmountError(value, {
        currency,
        allowSafeIntermediate: isFocused,
        messages: {
          amountRequired: t("amount_required"),
          invalidAmount: t("invalid_amount"),
          positiveAmount: t("amount_must_be_positive"),
          amountMaximum: t("amount_maximum_error", {
            maximum: MAX_TRANSACTION_AMOUNT.toLocaleString("en-US"),
          }),
          amountPrecision: (precision) =>
            t("amount_precision_error", { precision }),
          amountDecimalSeparator: tCommon("amount_decimal_separator_error"),
        },
      })
    : undefined;
  const visibleError = liveError ?? error;

  return (
    <View
      ref={fieldRef}
      testID="recurring-payment-amount-field"
      className="mb-4 w-full"
    >
      <Text className="input-label">{label}</Text>
      <View
        className={`flex-row items-center rounded-2xl border bg-white dark:bg-slate-800 ${
          visibleError
            ? "border-red-500"
            : "border-slate-200 dark:border-slate-700"
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
          onChangeText={(text) => {
            const resolution = resolveAmountInputChange(text, value);
            onChangeText(resolution.accepted ? resolution.value : text);
          }}
          onFocus={() => {
            setIsFocused(true);
            onFocus();
          }}
          onBlur={() => {
            setIsFocused(false);
            setHasBlurred(true);
          }}
          placeholder="0.00"
          placeholderTextColor={
            isDark ? palette.slate[600] : palette.slate[400]
          }
          keyboardType="decimal-pad"
          className="flex-1 p-4 ps-2 text-base font-semibold text-slate-900 dark:text-white"
        />
      </View>
      {visibleError ? <ErrorText>{visibleError}</ErrorText> : null}
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
