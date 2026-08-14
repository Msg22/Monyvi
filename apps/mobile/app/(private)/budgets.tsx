import React, { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { BudgetDashboard } from "@/components/budget/BudgetDashboard";
import { ConfirmationModal } from "@/components/modals/ConfirmationModal";
import { PageHeader } from "@/components/navigation/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { useBudgetDashboardActions } from "@/hooks/useBudgetDashboardActions";
import { useBudgets } from "@/hooks/useBudgets";
import { usePreferredCurrency } from "@/hooks/usePreferredCurrency";
import { pauseExpiredCustomBudgets } from "@/services/budget-service";
import { logger } from "@/utils/logger";

export default function BudgetsScreen(): React.JSX.Element {
  const { t } = useTranslation("budgets");
  const { t: tCommon } = useTranslation("common");
  const router = useRouter();
  const { showToast } = useToast();
  const { preferredCurrency } = usePreferredCurrency();
  const budgets = useBudgets();
  const actions = useBudgetDashboardActions();
  const [isFocused, setIsFocused] = useState(false);
  const [resumeBudgetId, setResumeBudgetId] = useState<string | null>(null);

  useFocusEffect(
    useCallback((): (() => void) => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, [])
  );

  useEffect(() => {
    if (!isFocused || !budgets.hasValidData) return;

    let isCurrent = true;

    async function pauseExpiredBudgets(): Promise<void> {
      try {
        const updatedCount = await pauseExpiredCustomBudgets();
        if (isCurrent && updatedCount > 0) budgets.refresh();
      } catch (error: unknown) {
        logger.error("budgetDashboard.autoPause.failed", error);
      }
    }

    void pauseExpiredBudgets();
    return () => {
      isCurrent = false;
    };
  }, [
    budgets.autoPauseCheckKey,
    budgets.hasValidData,
    budgets.refresh,
    isFocused,
  ]);

  const handleCreateBudget = useCallback((): void => {
    router.push("/create-budget");
  }, [router]);

  const handleBudgetPress = useCallback(
    (budgetId: string): void => {
      router.push({ pathname: "/budget-detail", params: { id: budgetId } });
    },
    [router]
  );

  const handleRenew = useCallback(
    (budgetId: string): void => {
      try {
        router.push({
          pathname: "/create-budget",
          params: { renewFrom: budgetId },
        });
      } catch (error: unknown) {
        logger.error("budgetDashboard.renewNavigation.failed", error, {
          budgetId,
        });
        showToast({ type: "error", title: t("dashboard_action_error") });
      }
    },
    [router, showToast, t]
  );

  const handleCancelResume = useCallback((): void => {
    if (!actions.isSubmitting) setResumeBudgetId(null);
  }, [actions.isSubmitting]);

  const handleConfirmResume = useCallback(async (): Promise<void> => {
    if (!resumeBudgetId || actions.isSubmitting) return;

    const result = await actions.confirmResume(resumeBudgetId);
    if (result === "resumed") {
      setResumeBudgetId(null);
      return;
    }
    if (result === "ignored") return;

    showToast({ type: "error", title: t("dashboard_action_error") });
    actions.resetError();
  }, [actions, resumeBudgetId, showToast, t]);

  return (
    <View
      testID="budgets-screen"
      className="flex-1 bg-background dark:bg-background-dark"
    >
      <PageHeader
        title={t("budgets")}
        showBackButton={false}
        showDrawer={true}
        rightAction={{
          icon: "add",
          onPress: handleCreateBudget,
          accessibilityLabel: t("accessibility_create_budget"),
          testID: "budgets-add-button",
        }}
      />

      <BudgetDashboard
        readModel={budgets.readModel}
        periodFilter={budgets.periodFilter}
        isInitialLoading={budgets.isInitialLoading}
        isRefreshing={budgets.isRefreshing}
        hasValidData={budgets.hasValidData}
        errorKey={budgets.errorKey}
        preferredCurrency={preferredCurrency}
        onSelectPeriod={budgets.setPeriodFilter}
        onRetry={budgets.retry}
        onCreateBudget={handleCreateBudget}
        onBudgetPress={handleBudgetPress}
        onResume={setResumeBudgetId}
        onRenew={handleRenew}
      />

      <ConfirmationModal
        visible={resumeBudgetId !== null}
        title={t("resume_confirmation_title")}
        message={t("resume_confirmation_message")}
        confirmLabel={t("resume_confirmation_confirm")}
        cancelLabel={tCommon("cancel")}
        variant="info"
        icon="play-circle-outline"
        isConfirming={actions.isSubmitting}
        dismissOnConfirm={false}
        onCancel={handleCancelResume}
        onConfirm={() => {
          void handleConfirmResume();
        }}
      />
    </View>
  );
}
