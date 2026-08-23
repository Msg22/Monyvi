import { palette } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";

interface BudgetDetailDangerZoneProps {
  readonly onDelete: () => void;
  readonly isDisabled?: boolean;
}

export function BudgetDetailDangerZone({
  onDelete,
  isDisabled = false,
}: BudgetDetailDangerZoneProps): React.JSX.Element {
  const { t } = useTranslation("budgets");
  const actionLabel = t("detail.actions.delete", {
    defaultValue: "Delete budget",
  });
  return (
    <View
      testID="budget-detail-danger-zone"
      className="mx-5 mb-6 rounded-2xl border border-red-500 p-4"
    >
      <Text className="text-base font-semibold text-red-600 dark:text-red-500">
        {t("detail.danger.title", { defaultValue: "Danger zone" })}
      </Text>
      <Text className="mt-1 text-sm leading-5 text-text-secondary dark:text-text-secondary-dark">
        {t("detail.danger.description", {
          defaultValue:
            "Deleting this budget keeps your transactions, but removes this budget from your dashboard.",
        })}
      </Text>
      <TouchableOpacity
        testID="budget-detail-delete"
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        accessibilityState={{ disabled: isDisabled }}
        disabled={isDisabled}
        onPress={onDelete}
        activeOpacity={0.75}
        className="mt-3 min-h-12 w-full flex-row items-center justify-center gap-2 rounded-xl border border-red-500"
        style={isDisabled ? { opacity: 0.5 } : undefined}
      >
        <Ionicons name="trash-outline" size={19} color={palette.red[500]} />
        <Text className="text-sm font-semibold text-red-600 dark:text-red-500">
          {actionLabel}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
