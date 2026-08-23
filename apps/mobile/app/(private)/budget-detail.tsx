import React, { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { BudgetDetailDangerZone } from "@/components/budget/BudgetDetailDangerZone";
import { BudgetDetailIdentity } from "@/components/budget/BudgetDetailIdentity";
import { BudgetDetailOverview } from "@/components/budget/BudgetDetailOverview";
import { BudgetDetailSkeleton } from "@/components/budget/BudgetDetailSkeleton";
import { BudgetRecentTransactions } from "@/components/budget/BudgetRecentTransactions";
import { BudgetSpendingTrendChart } from "@/components/budget/BudgetSpendingTrendChart";
import { SubcategoryBreakdown } from "@/components/budget/SubcategoryBreakdown";
import { ConfirmationModal } from "@/components/modals/ConfirmationModal";
import { PageHeader } from "@/components/navigation/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { palette } from "@/constants/colors";
import type { BudgetDetailLifecycleAction } from "@/contracts/budget-detail-presentation";
import { useBudgetDetail } from "@/hooks/useBudgetDetail";
import {
  type BudgetDetailAction,
  useBudgetDetailActions,
} from "@/hooks/useBudgetDetailActions";
import { usePreferredCurrency } from "@/hooks/usePreferredCurrency";

const DETAIL_BOTTOM_GAP = 24;

interface ConfirmationCopy {
  readonly titleKey: string;
  readonly messageKey: string;
  readonly confirmKey: string;
  readonly successKey: string;
  readonly variant: "info" | "danger";
  readonly icon:
    | "pause-circle-outline"
    | "play-circle-outline"
    | "trash-outline";
}

interface ConfirmationRequest {
  readonly action: BudgetDetailAction;
  readonly budgetId: string;
}

const CONFIRMATION_COPY: Readonly<
  Record<BudgetDetailAction, ConfirmationCopy>
> = {
  pause: {
    titleKey: "detail.actions.pause_confirmation_title",
    messageKey: "detail.actions.pause_confirmation_message",
    confirmKey: "detail.actions.pause_confirmation_confirm",
    successKey: "detail.actions.pause_success",
    variant: "info",
    icon: "pause-circle-outline",
  },
  resume: {
    titleKey: "detail.actions.resume_confirmation_title",
    messageKey: "detail.actions.resume_confirmation_message",
    confirmKey: "detail.actions.resume_confirmation_confirm",
    successKey: "detail.actions.resume_success",
    variant: "info",
    icon: "play-circle-outline",
  },
  delete: {
    titleKey: "detail.actions.delete_confirmation_title",
    messageKey: "detail.actions.delete_confirmation_message",
    confirmKey: "detail.actions.delete_confirmation_confirm",
    successKey: "detail.actions.delete_success",
    variant: "danger",
    icon: "trash-outline",
  },
};

function toLifecycleAction(
  action: BudgetDetailAction
): BudgetDetailLifecycleAction {
  if (action === "pause") return "PAUSE";
  if (action === "resume") return "RESUME";
  return null;
}

export default function BudgetDetailScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const insets = useSafeAreaInsets();
  const { preferredCurrency } = usePreferredCurrency();
  const { showToast } = useToast();
  const { t } = useTranslation("budgets");
  const { t: tCommon } = useTranslation("common");
  const detail = useBudgetDetail(id, preferredCurrency);
  const actions = useBudgetDetailActions();
  const [confirmationRequest, setConfirmationRequest] =
    useState<ConfirmationRequest | null>(null);
  const isMountedRef = useRef(true);
  const currentBudgetIdRef = useRef<string | undefined>(undefined);
  const currentLifecycleActionRef = useRef<BudgetDetailLifecycleAction>(null);
  const currentRouteBudgetIdRef = useRef<string | undefined>(undefined);
  currentBudgetIdRef.current = detail.readModel?.identity.budgetId;
  currentLifecycleActionRef.current =
    detail.readModel?.identity.availableLifecycleAction ?? null;
  currentRouteBudgetIdRef.current = id;

  useEffect(() => {
    return (): void => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!confirmationRequest) return;
    const identity = detail.readModel?.identity;
    const lifecycleAction = toLifecycleAction(confirmationRequest.action);
    const isEligible =
      identity?.budgetId === confirmationRequest.budgetId &&
      identity.budgetId === id &&
      (confirmationRequest.action === "delete" ||
        identity.availableLifecycleAction === lifecycleAction);
    if (!isEligible) setConfirmationRequest(null);
  }, [confirmationRequest, detail.readModel?.identity, id]);

  const handleEdit = useCallback((): void => {
    if (!detail.readModel) return;
    router.push({
      pathname: "/create-budget",
      params: { id: detail.readModel.identity.budgetId },
    });
  }, [detail.readModel]);

  const handleLifecycleAction = useCallback(
    (action: BudgetDetailLifecycleAction): void => {
      const budgetId = detail.readModel?.identity.budgetId;
      if (actions.pendingAction !== null || action === null || !budgetId)
        return;
      setConfirmationRequest({
        action: action === "PAUSE" ? "pause" : "resume",
        budgetId,
      });
    },
    [actions.pendingAction, detail.readModel?.identity.budgetId]
  );

  const handleDelete = useCallback((): void => {
    const budgetId = detail.readModel?.identity.budgetId;
    if (actions.pendingAction === null && budgetId) {
      setConfirmationRequest({ action: "delete", budgetId });
    }
  }, [actions.pendingAction, detail.readModel?.identity.budgetId]);

  const handleDismissConfirmation = useCallback((): void => {
    if (actions.pendingAction === null) {
      setConfirmationRequest(null);
    }
  }, [actions.pendingAction]);

  const handleConfirm = useCallback(async (): Promise<void> => {
    const request = confirmationRequest;
    if (
      !request ||
      currentBudgetIdRef.current !== request.budgetId ||
      currentRouteBudgetIdRef.current !== request.budgetId
    ) {
      setConfirmationRequest(null);
      return;
    }
    const lifecycleAction = toLifecycleAction(request.action);
    if (
      request.action !== "delete" &&
      currentLifecycleActionRef.current !== lifecycleAction
    ) {
      setConfirmationRequest(null);
      return;
    }

    const result = await actions.execute(request.action, request.budgetId);
    if (!isMountedRef.current || result.status === "ignored") return;

    if (result.status === "error") {
      showToast({
        type: "error",
        title: tCommon("error"),
        message: t(result.errorKey),
      });
      return;
    }

    setConfirmationRequest(null);

    showToast({
      type: "success",
      title: t(CONFIRMATION_COPY[request.action].successKey),
    });
    if (request.action === "delete") {
      if (typeof router.canGoBack === "function" && router.canGoBack()) {
        router.back();
      } else if (typeof router.replace === "function") {
        router.replace("/budgets");
      } else {
        router.back();
      }
    }
  }, [actions, confirmationRequest, showToast, t, tCommon]);

  const handlePressTransaction = useCallback((transactionId: string): void => {
    router.push({
      pathname: "/edit-transaction",
      params: { id: transactionId },
    });
  }, []);

  if (detail.isInitialLoading) {
    return (
      <ScreenFrame title={t("budget_detail")}>
        <View
          testID="budget-detail-loading"
          accessible
          accessibilityRole="progressbar"
          accessibilityLiveRegion="polite"
          accessibilityLabel={t("detail.loading")}
        >
          <BudgetDetailSkeleton />
        </View>
      </ScreenFrame>
    );
  }

  if (!detail.readModel) {
    const hasInitialError = detail.errorKey === "budget_detail_load_failed";
    return (
      <ScreenFrame title={t("budget_detail")}>
        <View className="flex-1 items-center justify-center px-6">
          <Text
            accessibilityRole="header"
            className="text-center text-lg font-semibold text-text-primary dark:text-text-primary-dark"
          >
            {t(hasInitialError ? "detail.initial_error" : "detail.not_found")}
          </Text>
          {hasInitialError ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t("detail.retry")}
              className="mt-4 min-h-11 justify-center rounded-xl border border-nileGreen-500 px-5"
              onPress={detail.retry}
            >
              <Text className="font-semibold text-nileGreen-500">
                {t("detail.retry")}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScreenFrame>
    );
  }

  const readModel = detail.readModel;
  const effectiveCurrency = readModel.currency ?? preferredCurrency;
  const modalCopy = confirmationRequest
    ? CONFIRMATION_COPY[confirmationRequest.action]
    : null;

  return (
    <View
      testID="budget-detail-screen"
      className="flex-1 bg-background dark:bg-background-dark"
    >
      <PageHeader
        title={t("budget_detail")}
        showBackButton
        showDrawer={false}
        backAccessibilityLabel={tCommon("back")}
        rightAction={{
          icon: "create-outline",
          label: t("detail.actions.edit"),
          accessibilityLabel: t("detail.actions.edit"),
          iconColor: palette.nileGreen[700],
          darkIconColor: palette.nileGreen[400],
          transparent: true,
          testID: "budget-detail-edit",
          onPress: handleEdit,
        }}
      />

      <ScrollView
        testID="budget-detail-scroll"
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: 12,
          paddingBottom: insets.bottom + DETAIL_BOTTOM_GAP,
        }}
      >
        {detail.errorKey === "budget_detail_refresh_failed" ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`${t("detail.refresh_error")} ${t("detail.retry")}`}
            className="mx-5 mb-4 min-h-11 justify-center rounded-xl border border-gold-500 px-4 py-2"
            onPress={detail.retry}
          >
            <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">
              {t("detail.refresh_error")}
            </Text>
          </TouchableOpacity>
        ) : null}

        <BudgetDetailIdentity
          identity={readModel.identity}
          onLifecycleAction={handleLifecycleAction}
          isActionDisabled={actions.pendingAction !== null}
        />

        <BudgetDetailOverview
          metrics={readModel.metrics}
          currency={effectiveCurrency}
          daysLeft={readModel.daysLeft}
        />

        <BudgetSpendingTrendChart
          data={readModel.weeklySpending}
          currency={effectiveCurrency}
          paceState={readModel.paceState}
        />

        {readModel.hasCompletedPauseExclusion ? (
          <View className="mx-5 mb-4 rounded-xl border border-border px-4 py-3 dark:border-border-dark">
            <Text className="text-sm text-text-secondary">
              {t("detail.pause_exclusion")}
            </Text>
          </View>
        ) : null}

        {readModel.categoryBreakdown !== null ? (
          <SubcategoryBreakdown
            data={readModel.categoryBreakdown}
            currency={effectiveCurrency}
          />
        ) : null}

        <BudgetRecentTransactions
          transactions={readModel.recentTransactions}
          fallbackCurrency={effectiveCurrency}
          onPressTransaction={handlePressTransaction}
        />

        <BudgetDetailDangerZone
          onDelete={handleDelete}
          isDisabled={actions.pendingAction !== null}
        />
      </ScrollView>

      <ConfirmationModal
        visible={modalCopy !== null}
        title={modalCopy ? t(modalCopy.titleKey) : ""}
        message={modalCopy ? t(modalCopy.messageKey) : ""}
        confirmLabel={modalCopy ? t(modalCopy.confirmKey) : ""}
        cancelLabel={tCommon("cancel")}
        variant={modalCopy?.variant ?? "info"}
        icon={modalCopy?.icon}
        isConfirming={actions.pendingAction !== null}
        confirmingStatusLabel={t("detail.actions.in_progress")}
        dismissOnConfirm={false}
        onConfirm={(): void => {
          void handleConfirm();
        }}
        onCancel={handleDismissConfirmation}
      />
    </View>
  );
}

interface ScreenFrameProps {
  readonly title: string;
  readonly children: React.ReactNode;
}

function ScreenFrame({ title, children }: ScreenFrameProps): React.JSX.Element {
  const { t } = useTranslation("common");
  return (
    <View
      testID="budget-detail-screen"
      className="flex-1 bg-background dark:bg-background-dark"
    >
      <PageHeader
        title={title}
        showBackButton
        showDrawer={false}
        backAccessibilityLabel={t("back")}
      />
      {children}
    </View>
  );
}
