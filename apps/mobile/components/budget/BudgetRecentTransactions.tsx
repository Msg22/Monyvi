import { palette } from "@/constants/colors";
import type { BudgetDetailTransactionItem } from "@/contracts/budget-detail-presentation";
import { useLocale } from "@/context/LocaleContext";
import { Ionicons } from "@expo/vector-icons";
import type { CurrencyType } from "@monyvi/db";
import { formatCurrency } from "@monyvi/logic";
import React from "react";
import { I18nManager, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { BudgetDetailIconView } from "./BudgetDetailIdentity";

interface BudgetRecentTransactionsProps {
  readonly transactions: readonly BudgetDetailTransactionItem[];
  readonly fallbackCurrency: CurrencyType;
  readonly onPressTransaction: (transactionId: string) => void;
}

export function BudgetRecentTransactions({
  transactions,
  fallbackCurrency,
  onPressTransaction,
}: BudgetRecentTransactionsProps): React.JSX.Element {
  const { t } = useTranslation("budgets");
  const { language } = useLocale();
  const locale = language === "ar" ? "ar-EG" : "en-US";

  return (
    <View
      testID="budget-recent-transactions"
      className="mx-5 mb-4 rounded-2xl border border-slate-200 bg-white px-4 dark:border-slate-700 dark:bg-slate-800"
    >
      <Text className="py-3 text-base font-semibold text-text-primary dark:text-text-primary-dark">
        {t("detail.recent.title", { defaultValue: "Recent transactions" })}
      </Text>
      {transactions.length === 0 ? (
        <Text
          testID="recent-transactions-empty"
          className="border-t border-slate-200 py-5 text-sm text-text-secondary dark:border-slate-700 dark:text-text-secondary-dark"
        >
          {t("detail.recent.empty", {
            defaultValue: "No matching transactions yet",
          })}
        </Text>
      ) : (
        transactions.map((transaction) => {
          const currency = transaction.currency ?? fallbackCurrency;
          const amount = formatCurrency({
            amount: transaction.amount,
            currency,
          });
          const transactionLabel =
            transaction.label ??
            t("detail.recent.fallback_label", { defaultValue: "Transaction" });
          return (
            <TouchableOpacity
              key={transaction.transactionId}
              testID={`recent-transaction-${transaction.transactionId}`}
              accessibilityRole="button"
              accessibilityLabel={t("detail.accessibility.edit_transaction", {
                defaultValue: `Edit transaction: ${transactionLabel}. ${amount}.`,
                name: transactionLabel,
                date: new Intl.DateTimeFormat(locale, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                }).format(transaction.date),
                amount,
              })}
              onPress={() => onPressTransaction(transaction.transactionId)}
              activeOpacity={0.75}
              className="min-h-14 flex-row items-center border-t border-slate-200 py-2 dark:border-slate-700"
            >
              <BudgetDetailIconView icon={transaction.icon} size={18} />
              <View className="ms-3 min-w-0 flex-1">
                <Text
                  className="text-sm font-medium text-text-primary dark:text-text-primary-dark"
                  numberOfLines={2}
                >
                  {transactionLabel}
                </Text>
                <Text className="mt-0.5 text-xs text-text-secondary dark:text-text-secondary-dark">
                  {new Intl.DateTimeFormat(locale, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  }).format(transaction.date)}
                </Text>
              </View>
              <Text className="ps-3 text-sm font-medium text-text-primary dark:text-text-primary-dark">
                {amount}
              </Text>
              <View
                testID={`recent-transaction-chevron-${transaction.transactionId}`}
                accessible={false}
                accessibilityLabel={
                  I18nManager.isRTL ? "chevron-back" : "chevron-forward"
                }
              >
                <Ionicons
                  name={I18nManager.isRTL ? "chevron-back" : "chevron-forward"}
                  size={20}
                  color={palette.slate[400]}
                />
              </View>
            </TouchableOpacity>
          );
        })
      )}
    </View>
  );
}
