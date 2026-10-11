import { getHoldingDetailTitleKey } from "@/components/metals/holding-detail-presentation";
import { MetalHoldingDetailScreen } from "@/components/metals/MetalHoldingDetailScreen";
import { createDeleteHoldingActionDescriptor } from "@/components/metals/holding-actions/delete-action";
import { createDisposeHoldingActionDescriptor } from "@/components/metals/holding-actions/dispose-action";
import { createSellHoldingActionDescriptor } from "@/components/metals/holding-actions/sell-action";
import {
  getHoldingActionDescriptors,
  type HoldingActionDescriptor,
  type HoldingActionId,
} from "@/components/metals/holding-actions/registry";
import { PageHeader } from "@/components/navigation/PageHeader";
import { palette } from "@/constants/colors";
import { useMetalHoldingDetail } from "@/hooks/useMetalHoldingDetail";
import { useUndoMetalHoldingContext } from "@/hooks/useUndoMetalHoldingContext";
import { useRestoreMetalHolding } from "@/hooks/useRestoreMetalHolding";
import type { UndoMetalHoldingContext } from "@/services/undo-metal-holding-command-service";
import type { MetalDetailReadModel } from "@/services/metal-detail-read-model-service";
import {
  RestoreMetalHoldingSheet,
  type RestoreMetalHoldingCopy,
  type RestoreMetalHoldingSummary,
} from "@/components/metals/RestoreMetalHoldingSheet";
import { MetalHoldingRender } from "@/components/metals/MetalHoldingRender";
import {
  getDeleteHoldingSheetHolding,
  type DeleteSheetTranslator,
} from "@/components/metals/delete-holding-presentation";
import { useToast } from "@/components/ui/Toast";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { getEditMetalHoldingHref } from "@/components/metals/holding-actions/edit-action";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  BackHandler,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface RestoreSelection {
  readonly context: UndoMetalHoldingContext;
  readonly model: MetalDetailReadModel;
}

export default function MetalHoldingDetailRoute(): React.JSX.Element {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawHoldingId = Array.isArray(params.id) ? params.id[0] : params.id;
  // Normalize once: a whitespace-only param must behave like a missing one
  // so action descriptors are never constructed with an empty ID during render.
  const holdingId = rawHoldingId?.trim() ? rawHoldingId.trim() : undefined;
  const detail = useMetalHoldingDetail(holdingId);
  const { t } = useTranslation("metals");
  const terminalIdentity =
    detail.model !== null &&
    !detail.model.isActiveOwnership &&
    !detail.model.isFinancialActionLocked
      ? JSON.stringify([
          detail.model.id,
          detail.model.status,
          detail.model.reconciliationState,
          detail.model.timeline.map(({ id }): string => id),
        ])
      : null;
  const restoreContext = useUndoMetalHoldingContext(
    holdingId,
    terminalIdentity
  );
  const [selection, setSelection] = useState<RestoreSelection | null>(null);
  const [hasRestored, setHasRestored] = useState(false);
  const [isAwaitingRestore, setIsAwaitingRestore] = useState(false);
  useEffect((): void => {
    setSelection(null);
    setHasRestored(false);
    setIsAwaitingRestore(false);
  }, [holdingId, restoreContext.userId]);
  useEffect((): void => {
    if (detail.model?.isActiveOwnership) setIsAwaitingRestore(false);
  }, [detail.model]);
  const returnToMetals = useCallback(
    (): void => router.dismissTo("/metals"),
    []
  );
  useFocusEffect(
    useCallback((): (() => void) | undefined => {
      if (!hasRestored) return undefined;
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        (): boolean => {
          returnToMetals();
          return true;
        }
      );
      return (): void => subscription.remove();
    }, [hasRestored, returnToMetals])
  );
  const handleEdit = useCallback((): void => {
    if (holdingId) router.push(getEditMetalHoldingHref(holdingId));
  }, [holdingId]);

  // Edit is a header action; Restore uses the existing Details route.
  const actions = useMemo<
    readonly HoldingActionDescriptor[]
  >((): readonly HoldingActionDescriptor[] => {
    if (!holdingId || detail.model === null) return [];
    const available = getHoldingActionDescriptors(detail.model);
    const undo = available.find((action): boolean => action.id === "undo");
    if (undo !== undefined) {
      return restoreContext.context !== null &&
        restoreContext.context.holdingId === holdingId &&
        restoreContext.context.userId === restoreContext.userId &&
        !restoreContext.isResolvingUser
        ? [undo]
        : [];
    }
    const hasSell = available.some((action) => action.id === "sell");
    const hasDispose = available.some((action) => action.id === "dispose");
    const hasDelete = available.some((action) => action.id === "delete");
    if (!hasSell || !hasDispose || !hasDelete) return [];
    return [
      createSellHoldingActionDescriptor(holdingId),
      createDisposeHoldingActionDescriptor(holdingId),
      createDeleteHoldingActionDescriptor(holdingId),
    ];
  }, [
    detail.model,
    holdingId,
    restoreContext.context,
    restoreContext.isResolvingUser,
    restoreContext.userId,
  ]);

  const handleAction = useCallback(
    (action: HoldingActionId): void => {
      if (!holdingId) return;
      if (action === "undo") {
        if (
          detail.model !== null &&
          restoreContext.context !== null &&
          actions.some((candidate): boolean => candidate.id === "undo")
        ) {
          setSelection({
            model: detail.model,
            context: restoreContext.context,
          });
        }
        return;
      }
      if (action === "sell") {
        router.push(createSellHoldingActionDescriptor(holdingId).href);
        return;
      }
      if (action === "dispose") {
        router.push(createDisposeHoldingActionDescriptor(holdingId).href);
        return;
      }
      if (action === "delete") {
        router.push(createDeleteHoldingActionDescriptor(holdingId).href);
      }
    },
    [actions, detail.model, holdingId, restoreContext.context]
  );

  const completeRestore = useCallback((): void => {
    setSelection(null);
    setHasRestored(true);
    setIsAwaitingRestore(true);
  }, []);
  const isSelectionCurrent =
    selection !== null &&
    selection.context.holdingId === holdingId &&
    selection.context.userId === restoreContext.userId &&
    !restoreContext.isResolvingUser;
  const showRestoreRecovery =
    restoreContext.error !== null &&
    restoreContext.error.message !== "metal_undo_credited_sale_blocked";

  return (
    <View className="flex-1 bg-background dark:bg-background-dark">
      <PageHeader
        showBackButton
        showDrawer={false}
        onBack={hasRestored ? returnToMetals : undefined}
        title={t(getHoldingDetailTitleKey(detail.model?.status))}
        rightAction={
          detail.model
            ? {
                icon: "create-outline",
                label: t("actions.edit"),
                accessibilityLabel: t("actions.edit"),
                iconColor: palette.nileGreen[700],
                darkIconColor: palette.nileGreen[400],
                transparent: true,
                testID: "metal-holding-detail-edit",
                onPress: handleEdit,
              }
            : undefined
        }
      />
      {showRestoreRecovery ? (
        <View className="gap-2 px-4 pb-4">
          <Text
            accessibilityRole="alert"
            className="text-base text-red-700 dark:text-red-300"
          >
            {t("restore.load_failure")}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={restoreContext.retry}
            className="min-h-12 justify-center"
          >
            <Text className="text-base font-semibold text-nileGreen-700 dark:text-nileGreen-400">
              {t("detail.retry")}
            </Text>
          </Pressable>
        </View>
      ) : null}
      <MetalHoldingDetailScreen
        actions={actions}
        {...detail}
        isLoading={
          detail.isLoading ||
          (isAwaitingRestore &&
            detail.error === null &&
            detail.model?.isActiveOwnership !== true)
        }
        onAction={actions.length > 0 ? handleAction : undefined}
        onRetry={detail.retry}
      />
      {isSelectionCurrent && selection !== null ? (
        <RestoreConfirmation
          selection={selection}
          onCancel={(): void => setSelection(null)}
          onRefresh={(): void => {
            setSelection(null);
            restoreContext.retry();
          }}
          onComplete={completeRestore}
        />
      ) : null}
    </View>
  );
}

function RestoreConfirmation({
  selection,
  onCancel,
  onRefresh,
  onComplete,
}: {
  readonly selection: RestoreSelection;
  readonly onCancel: () => void;
  readonly onRefresh: () => void;
  readonly onComplete: () => void;
}): React.JSX.Element {
  const submission = useRestoreMetalHolding(selection.context);
  const { t, i18n } = useTranslation("metals");
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const translate = useCallback<DeleteSheetTranslator>(
    (key, options): string => t(key, options),
    [t]
  );
  const copy = getRestoreCopy(translate);
  const summary = getRestoreSummary(selection, translate);
  const requiresFreshReview =
    submission.error !== null &&
    [
      "holding_revision_conflict",
      "metal_undo_terminal_not_current",
      "metal_undo_terminal_holding_required",
      "metal_undo_replay_requires_recovery",
    ].includes(submission.error.message);
  const finish = useCallback(
    async (isRetry: boolean): Promise<void> => {
      const succeeded = await (isRetry
        ? submission.retry()
        : submission.submit());
      if (succeeded) {
        showToast({ type: "success", title: t("restore.success") });
        onComplete();
      }
    },
    [onComplete, showToast, submission, t]
  );
  const context = selection.context;
  return (
    <RestoreMetalHoldingSheet
      visible
      copy={copy}
      summary={summary}
      bottomInset={insets.bottom}
      width={width}
      fontScale={fontScale}
      isRtl={i18n.dir(i18n.resolvedLanguage) === "rtl"}
      isPending={submission.isSubmitting}
      errorMessage={
        submission.error === null
          ? null
          : t(
              requiresFreshReview
                ? "restore.changed_failure"
                : "restore.failure"
            )
      }
      attemptIdentity={JSON.stringify([
        context.holdingId,
        context.userId,
        context.terminalEventId,
        context.expectedFinancialRevision,
      ])}
      holdingVisual={
        <MetalHoldingRender
          metalType={selection.model.metalType}
          itemForm={selection.model.itemForm}
          size="card"
        />
      }
      onConfirm={(): void => {
        void finish(false);
      }}
      onRetry={(): void => {
        if (requiresFreshReview) onRefresh();
        else void finish(true);
      }}
      onCancel={onCancel}
    />
  );
}

function getRestoreCopy(t: DeleteSheetTranslator): RestoreMetalHoldingCopy {
  return {
    title: t("restore.title"),
    back: t("restore.back"),
    consequencesHeading: t("restore.consequences_heading"),
    reviewLabel: t("restore.review"),
    confirmLabel: t("restore.confirm"),
    pendingLabel: t("restore.pending"),
    cancelLabel: t("restore.cancel"),
    retryLabel: t("detail.retry"),
  };
}

function getRestoreSummary(
  selection: RestoreSelection,
  t: DeleteSheetTranslator
): RestoreMetalHoldingSummary {
  const identity = getDeleteHoldingSheetHolding(selection.model, t);
  if (identity === null) throw new Error("metal_restore_identity_missing");
  const isSale = selection.context.terminalKind === "sell";
  return {
    terminalKind: selection.context.terminalKind,
    holdingName: selection.model.name,
    metalLabel: identity.metalLabel,
    metadataLabel: identity.metaLabel,
    statusLabel: t(isSale ? "status.sold" : "actions.dispose"),
    body: t(isSale ? "restore.sale_body" : "restore.disposal_body"),
    consequences: [
      {
        id: "active",
        text: t("restore.active_consequence", {
          holdingName: selection.model.name,
        }),
      },
      {
        id: isSale ? "sale-result" : "disposal-treatment",
        text: t(isSale ? "restore.sale_result" : "restore.disposal_treatment"),
      },
      {
        id: "history",
        text: t(isSale ? "restore.sale_history" : "restore.disposal_history"),
      },
    ],
  };
}
