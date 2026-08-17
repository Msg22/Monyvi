/**
 * Create/Edit Budget Screen
 *
 * Route page for creating a new budget or editing an existing one.
 * `id` loads edit mode. `renewFrom` loads a source while preserving create mode.
 *
 * @module create-budget
 */

import { BudgetForm } from "@/components/budget/BudgetForm";
import { PageHeader } from "@/components/navigation/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useEditableBudget } from "@/hooks/useEditableBudget";
import { useLocalSearchParams } from "expo-router";
import React from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";

// =============================================================================
// Screen
// =============================================================================

export default function CreateBudgetScreen(): React.JSX.Element {
  const { t } = useTranslation("budgets");

  const { id, renewFrom } = useLocalSearchParams<{
    id?: string;
    renewFrom?: string;
  }>();
  const isEdit = !!id;
  const isRenewal = !id && !!renewFrom;
  const { budget, isLoading, loadErrorKey } = useEditableBudget(
    id ?? renewFrom,
    isRenewal ? "RENEWAL" : "EDIT"
  );

  return (
    <View
      testID="create-budget-screen"
      className="flex-1 bg-background dark:bg-background-dark"
    >
      <PageHeader
        title={isEdit ? t("edit_budget") : t("new_budget")}
        showBackButton={true}
        showDrawer={false}
      />

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <View className="w-full px-6">
            <Skeleton width="100%" height={48} borderRadius={8} />
            <View className="mt-6">
              <Skeleton width="72%" height={18} borderRadius={6} />
            </View>
            <View className="mt-3">
              <Skeleton width="100%" height={52} borderRadius={8} />
            </View>
            <View className="mt-6">
              <Skeleton width="72%" height={18} borderRadius={6} />
            </View>
            <View className="mt-3">
              <Skeleton width="100%" height={52} borderRadius={8} />
            </View>
          </View>
        </View>
      ) : loadErrorKey ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-base text-red-500 text-center">
            {t(loadErrorKey)}
          </Text>
        </View>
      ) : (
        <BudgetForm
          existingBudget={isEdit ? budget : undefined}
          renewalSource={isRenewal ? budget : undefined}
        />
      )}
    </View>
  );
}
