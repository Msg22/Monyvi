import type { BudgetDetailBreakdownItem } from "@/contracts/budget-detail-presentation";
import type { CurrencyType } from "@monyvi/db";
import { formatCurrency } from "@monyvi/logic";
import React from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { BudgetDetailIconView } from "./BudgetDetailIdentity";

interface SubcategoryBreakdownProps {
  readonly data: readonly BudgetDetailBreakdownItem[];
  readonly currency: CurrencyType;
}

export function SubcategoryBreakdown({ data, currency }: SubcategoryBreakdownProps): React.JSX.Element {
  const { t } = useTranslation("budgets");
  return (
    <View
      testID="subcategory-breakdown"
      className="mx-5 mb-4 rounded-2xl border border-slate-200 bg-white px-4 dark:border-slate-700 dark:bg-slate-800"
    >
      <Text className="py-3 text-base font-semibold text-text-primary">
        {t("detail.breakdown.title", { defaultValue: "Category breakdown" })}
      </Text>
      {data.length === 0 ? (
        <Text testID="subcategory-breakdown-empty" className="border-t border-slate-200 py-5 text-sm text-text-secondary dark:border-slate-700">
          {t("detail.breakdown.empty", { defaultValue: "No category spending yet" })}
        </Text>
      ) : (
        data.map((item) => (
          <View
            key={item.categoryId}
            accessible
            accessibilityLabel={t("detail.accessibility.breakdown_item", {
              defaultValue: `${item.name}. ${item.transactionCount} transactions. ${formatCurrency({ amount: item.amount, currency })}. ${Math.round(item.percentage)} percent.`,
              name: item.name,
              count: item.transactionCount,
              amount: formatCurrency({ amount: item.amount, currency }),
              percentage: Math.round(item.percentage),
            })}
            className="min-h-16 flex-row items-center border-t border-slate-200 py-2 dark:border-slate-700"
          >
            <BudgetDetailIconView icon={item.icon} size={18} />
            <View className="ms-3 min-w-0 flex-1">
              <Text className="text-sm font-medium text-text-primary" numberOfLines={2}>{item.name}</Text>
              <Text className="mt-0.5 text-xs text-text-secondary">
                {t("detail.breakdown.transaction_count", {
                  defaultValue: `${item.transactionCount} transactions`,
                  count: item.transactionCount,
                })}
              </Text>
            </View>
            <View className="items-end ps-3">
              <Text className="text-sm font-medium text-text-primary">
                {formatCurrency({ amount: item.amount, currency })}
              </Text>
              <Text className="mt-0.5 text-sm font-semibold text-nileGreen-500">{Math.round(item.percentage)}%</Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}
