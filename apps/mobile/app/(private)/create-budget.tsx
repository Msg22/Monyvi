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

function getBudgetFormTitle(
  isEdit: boolean,
  isRenewal: boolean,
  t: (key: string) => string
): string {
  if (isEdit) return t("edit_budget");
  if (isRenewal) return t("renew_budget");
  return t("accessibility_create_budget");
}

function BudgetFormLoadingState(): React.JSX.Element {
  return (
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
  );
}

type EditableBudgetResult = ReturnType<typeof useEditableBudget>;

function BudgetFormRouteBody({
  budget,
  isEdit,
  isRenewal,
  isLoading,
  loadErrorKey,
}: {
  readonly budget: EditableBudgetResult["budget"];
  readonly isEdit: boolean;
  readonly isRenewal: boolean;
  readonly isLoading: boolean;
  readonly loadErrorKey: EditableBudgetResult["loadErrorKey"];
}): React.JSX.Element {
  const { t } = useTranslation("budgets");
  if (isLoading) return <BudgetFormLoadingState />;
  if (loadErrorKey) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-center text-base text-red-500">
          {t(loadErrorKey)}
        </Text>
      </View>
    );
  }
  return (
    <BudgetForm
      existingBudget={isEdit ? budget : undefined}
      renewalSource={isRenewal ? budget : undefined}
    />
  );
}

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
      className="flex-1 bg-background dark:bg-slate-950"
    >
      <PageHeader
        title={getBudgetFormTitle(isEdit, isRenewal, t)}
        variant="review"
        includeTopSafeAreaInset={true}
        showBackButton={true}
        showDrawer={false}
      />
      <BudgetFormRouteBody
        budget={budget}
        isEdit={isEdit}
        isRenewal={isRenewal}
        isLoading={isLoading}
        loadErrorKey={loadErrorKey}
      />
    </View>
  );
}
