import { router, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DeleteMetalHoldingSheet } from "@/components/metals/DeleteMetalHoldingSheet";
import {
  getDeleteHoldingSheetCopy,
  getDeleteHoldingSheetHolding,
  type DeleteSheetTranslator,
} from "@/components/metals/delete-holding-presentation";
import { getHoldingDetailTitleKey } from "@/components/metals/holding-detail-presentation";
import { MetalHoldingDetailScreen } from "@/components/metals/MetalHoldingDetailScreen";
import { PageHeader } from "@/components/navigation/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useDeleteHoldingCommand } from "@/hooks/useDeleteHoldingCommand";
import { useDeleteMetalHolding } from "@/hooks/useDeleteMetalHolding";
import { useMetalHoldingDetail } from "@/hooks/useMetalHoldingDetail";

export default function DeleteMetalHoldingRoute(): React.JSX.Element | null {
  const params = useLocalSearchParams<{ holdingId?: string | string[] }>();
  const holdingId = Array.isArray(params.holdingId)
    ? params.holdingId[0]
    : params.holdingId;
  const detail = useMetalHoldingDetail(holdingId);
  const command = useDeleteHoldingCommand(holdingId);
  const submission = useDeleteMetalHolding(command.input);
  const { t, i18n } = useTranslation("metals");
  const { t: tCommon } = useTranslation("common");
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const canReturnToPreviousRoute =
    typeof router.canGoBack === "function" && router.canGoBack();

  const finishDelete = useCallback((): void => {
    showToast({ type: "success", title: t("delete.success") });
    router.dismissTo("/metals");
  }, [showToast, t]);

  const handleConfirm = useCallback(async (): Promise<void> => {
    await command.ensureToken();
    const succeeded = await submission.submit();
    if (succeeded) finishDelete();
  }, [command, finishDelete, submission]);

  const handleRetry = useCallback(async (): Promise<void> => {
    await command.ensureToken();
    const succeeded = await submission.retry();
    if (succeeded) finishDelete();
  }, [command, finishDelete, submission]);

  const handleCancel = useCallback((): void => {
    if (canReturnToPreviousRoute) {
      router.back();
      return;
    }
    if (holdingId) {
      router.replace({ pathname: "/metals/[id]", params: { id: holdingId } });
    }
  }, [canReturnToPreviousRoute, holdingId]);

  const tMetals = useCallback<DeleteSheetTranslator>(
    (key, options): string => t(key, options),
    [t]
  );
  const tCommonCallback = useCallback<DeleteSheetTranslator>(
    (key, options): string => tCommon(key, options),
    [tCommon]
  );

  if (!holdingId) return null;

  if (detail.isLoading && detail.model === null) {
    return (
      <View
        testID="metal-delete-loading"
        className="flex-1 bg-background px-5 dark:bg-background-dark"
        style={{ paddingTop: insets.top + 12 }}
      >
        <Skeleton width="100%" height={260} borderRadius={16} />
      </View>
    );
  }

  if (detail.model?.isFinancialActionLocked) {
    return (
      <View className="flex-1 bg-background dark:bg-background-dark">
        <PageHeader
          showBackButton
          showDrawer={false}
          title={t("actions.delete")}
        />
        <View className="flex-1 items-center justify-center gap-4 px-6">
          <Text
            accessibilityRole="header"
            className="text-center text-lg font-semibold text-text-primary dark:text-text-primary-dark"
          >
            {t("delete.checking_changes")}
          </Text>
          <Text className="text-center text-sm text-text-secondary dark:text-text-secondary-dark">
            {t("delete.checking_changes_body")}
          </Text>
          <Pressable
            testID="metal-holding-delete-sync-retry"
            accessibilityRole="button"
            className="min-h-11 items-center justify-center rounded-xl border border-nileGreen-600 px-4 dark:border-nileGreen-400"
            onPress={detail.retry}
          >
            <Text className="font-semibold text-nileGreen-700 dark:text-nileGreen-400">
              {t("detail.retry_sync")}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const holding = getDeleteHoldingSheetHolding(detail.model, tMetals);

  if (detail.model !== null && !detail.model.isActiveOwnership) {
    return (
      <View className="flex-1 bg-background dark:bg-background-dark">
        <PageHeader
          showBackButton
          showDrawer={false}
          title={t("actions.delete")}
        />
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-lg font-semibold text-text-primary dark:text-text-primary-dark">
            {t("delete.terminal_unavailable")}
          </Text>
        </View>
      </View>
    );
  }

  if (holding === null) {
    return (
      <View className="flex-1 bg-background dark:bg-background-dark">
        <PageHeader
          showBackButton
          showDrawer={false}
          title={t("actions.delete")}
        />
        <View className="flex-1 items-center justify-center gap-4 px-6">
          <Text className="text-center text-lg font-semibold text-text-primary dark:text-text-primary-dark">
            {detail.error === null
              ? t("detail.not_found")
              : t("detail.load_error")}
          </Text>
          {detail.error === null ? null : (
            <Pressable
              testID="metal-holding-delete-load-retry"
              accessibilityRole="button"
              className="min-h-11 items-center justify-center rounded-xl border border-nileGreen-600 px-4 dark:border-nileGreen-400"
              onPress={detail.retry}
            >
              <Text className="font-semibold text-nileGreen-700 dark:text-nileGreen-400">
                {t("detail.retry")}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  const isRtl =
    typeof i18n.dir === "function"
      ? i18n.dir(i18n.resolvedLanguage) === "rtl"
      : i18n.resolvedLanguage === "ar";

  return (
    <View className="flex-1">
      <View
        testID="metal-holding-delete-direct-detail"
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="flex-1 bg-background dark:bg-background-dark"
      >
        <PageHeader
          showBackButton
          showDrawer={false}
          title={t(getHoldingDetailTitleKey(detail.model?.status))}
        />
        <MetalHoldingDetailScreen
          actions={[]}
          {...detail}
          onRetry={detail.retry}
        />
      </View>

      <DeleteMetalHoldingSheet
        visible
        holding={holding}
        copy={getDeleteHoldingSheetCopy(
          tMetals,
          tCommonCallback,
          detail.model?.name ?? holding.name
        )}
        bottomInset={insets.bottom}
        leftInset={insets.left}
        rightInset={insets.right}
        isRtl={isRtl}
        isOffline={detail.isOffline}
        isSubmitting={submission.isSubmitting}
        submitError={submission.submitError}
        onConfirm={() => void handleConfirm()}
        onCancel={handleCancel}
        onRetry={() => void handleRetry()}
      />
    </View>
  );
}
