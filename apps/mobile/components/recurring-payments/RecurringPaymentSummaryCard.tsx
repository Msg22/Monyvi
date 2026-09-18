import { CategoryIcon } from "@/components/common/CategoryIcon";
import { palette } from "@/constants/colors";
import { getCategoryIconConfig } from "@/utils/category-icon-config";
import type { Category, CurrencyType, RecurringStatus } from "@monyvi/db";
import {
  formatCurrency,
  getCurrencyPrecision,
  MAX_TRANSACTION_AMOUNT,
  parseStrictAmountInput,
} from "@monyvi/logic";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

interface PaymentSummaryCardProps {
  readonly name: string;
  readonly amount: string;
  readonly currency: CurrencyType;
  readonly frequency: string;
  readonly dueDate: string;
  readonly status: string;
  readonly statusKind: RecurringStatus;
  readonly isIncome: boolean;
  readonly category: Category | null;
}

export function RecurringPaymentSummaryCard({
  name,
  amount,
  currency,
  frequency,
  dueDate,
  status,
  statusKind,
  isIncome,
  category,
}: PaymentSummaryCardProps): React.JSX.Element {
  const { t } = useTranslation("transactions");
  const parsedAmount = parseStrictAmountInput(amount, {
    maxAmount: MAX_TRANSACTION_AMOUNT,
    maxFractionDigits: getCurrencyPrecision(currency),
  });
  const displayAmount = parsedAmount.success ? parsedAmount.amount : 0;
  const formattedAmount = formatCurrency({
    amount: displayAmount,
    currency,
  });
  const amountSign = displayAmount === 0 ? "" : isIncome ? "+" : "-";
  const iconConfig = category ? getCategoryIconConfig(category) : null;
  const statusClasses = getStatusPillClasses(statusKind);

  return (
    <View
      testID="recurring-payment-summary-card"
      className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-slate-25 dark:bg-slate-800 p-5 mb-5"
    >
      <View className="flex-row items-center">
        <View className="w-14 h-14 rounded-2xl items-center justify-center bg-slate-100 dark:bg-slate-700 me-4">
          {iconConfig ? (
            <CategoryIcon
              iconName={iconConfig.iconName}
              iconLibrary={iconConfig.iconLibrary}
              color={iconConfig.iconColor}
              size={24}
            />
          ) : (
            <Ionicons
              name="receipt-outline"
              size={24}
              color={isIncome ? palette.nileGreen[500] : palette.red[500]}
            />
          )}
        </View>
        <View className="flex-1">
          <Text
            className="text-lg font-bold text-text-primary dark:text-text-primary-dark"
            numberOfLines={1}
          >
            {name.trim() || t("new_payment")}
          </Text>
          <Text className="mt-1 text-xs font-semibold text-text-muted dark:text-text-muted-dark">
            {frequency}
          </Text>
        </View>
        <View
          testID="recurring-payment-summary-status"
          className={`ms-3 rounded-full px-4 py-1.5 ${statusClasses.container}`}
        >
          <Text className={`text-sm font-bold ${statusClasses.text}`}>
            {status}
          </Text>
        </View>
      </View>
      <View
        testID="recurring-payment-summary-details"
        className="mt-5 flex-row items-center"
      >
        <View testID="recurring-payment-summary-amount" className="flex-1 pe-8">
          <Text
            testID="recurring-payment-summary-amount-label"
            className="text-[11px] font-normal text-text-muted dark:text-text-muted-dark leading-4"
          >
            {t("amount")}
          </Text>
          <Text
            testID="recurring-payment-summary-amount-value"
            className={`mt-1 text-lg font-bold ${
              isIncome ? "text-nileGreen-500" : "text-red-500"
            }`}
          >
            {amountSign}
            {formattedAmount}
          </Text>
        </View>
        <View
          testID="recurring-payment-summary-divider"
          className="h-11 w-px ms-1 me-3 bg-slate-200 dark:bg-slate-700"
        />
        <View
          className="flex-1 ps-12"
          testID="recurring-payment-summary-next-due"
        >
          <Text
            testID="recurring-payment-summary-next-due-label"
            className="text-[11px] font-normal text-text-muted dark:text-text-muted-dark leading-4"
          >
            {t("next_due")}
          </Text>
          <View
            testID="recurring-payment-summary-due-row"
            className="mt-1 flex-row items-center"
          >
            <View testID="recurring-payment-summary-due-icon" className="me-2">
              <Ionicons
                name="calendar-outline"
                size={15}
                color={palette.nileGreen[500]}
              />
            </View>
            <Text
              testID="recurring-payment-summary-due-value"
              className="text-lg font-bold text-text-primary dark:text-text-primary-dark"
            >
              {dueDate}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function getStatusPillClasses(status: RecurringStatus): {
  readonly container: string;
  readonly text: string;
} {
  if (status === "PAUSED") {
    return {
      container: "bg-slate-25 dark:bg-slate-700",
      text: "text-gold-600 dark:text-gold-400",
    };
  }

  if (status === "COMPLETED") {
    return {
      container: "bg-blue-100 dark:bg-blue-600",
      text: "text-blue-600 dark:text-white",
    };
  }

  return {
    container: "bg-nileGreen-100 dark:bg-slate-700",
    text: "text-nileGreen-700 dark:text-nileGreen-400",
  };
}
