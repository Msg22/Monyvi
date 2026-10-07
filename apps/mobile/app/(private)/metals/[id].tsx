import { getHoldingDetailTitleKey } from "@/components/metals/holding-detail-presentation";
import { MetalHoldingDetailScreen } from "@/components/metals/MetalHoldingDetailScreen";
import { createDeleteHoldingActionDescriptor } from "@/components/metals/holding-actions/delete-action";
import {
  getHoldingActionDescriptors,
  type HoldingActionDescriptor,
  type HoldingActionId,
} from "@/components/metals/holding-actions/registry";
import { PageHeader } from "@/components/navigation/PageHeader";
import { palette } from "@/constants/colors";
import { useMetalHoldingDetail } from "@/hooks/useMetalHoldingDetail";
import { router, useLocalSearchParams } from "expo-router";
import { getEditMetalHoldingHref } from "@/components/metals/holding-actions/edit-action";
import React, { useCallback, useMemo } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

export default function MetalHoldingDetailRoute(): React.JSX.Element {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const holdingId = Array.isArray(params.id) ? params.id[0] : params.id;
  const detail = useMetalHoldingDetail(holdingId);
  const { t } = useTranslation("metals");
  const handleEdit = useCallback((): void => {
    if (holdingId) router.push(getEditMetalHoldingHref(holdingId));
  }, [holdingId]);

  // Only actions with a live implemented route are composed. Sell,
  // Dispose, and Undo stay hidden until their own lanes land a route.
  // Edit is a header action.
  const actions = useMemo<
    readonly HoldingActionDescriptor[]
  >((): readonly HoldingActionDescriptor[] => {
    if (!holdingId || detail.model === null) return [];
    const available = getHoldingActionDescriptors(detail.model);
    if (!available.some((action) => action.id === "delete")) return [];
    return [createDeleteHoldingActionDescriptor(holdingId)];
  }, [detail.model, holdingId]);

  const handleAction = useCallback(
    (action: HoldingActionId): void => {
      if (action !== "delete" || !holdingId) return;
      router.push(createDeleteHoldingActionDescriptor(holdingId).href);
    },
    [holdingId]
  );

  return (
    <View className="flex-1 bg-background dark:bg-background-dark">
      <PageHeader
        showBackButton
        showDrawer={false}
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
      <MetalHoldingDetailScreen
        actions={actions}
        {...detail}
        onAction={actions.length > 0 ? handleAction : undefined}
        onRetry={detail.retry}
      />
    </View>
  );
}
