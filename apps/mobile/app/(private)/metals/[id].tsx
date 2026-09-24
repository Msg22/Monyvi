import { getHoldingDetailTitleKey } from "@/components/metals/holding-detail-presentation";
import { MetalHoldingDetailScreen } from "@/components/metals/MetalHoldingDetailScreen";
import { createDeleteHoldingActionDescriptor } from "@/components/metals/holding-actions/delete-action";
import {
  getHoldingActionDescriptors,
  type HoldingActionDescriptor,
  type HoldingActionId,
} from "@/components/metals/holding-actions/registry";
import { PageHeader } from "@/components/navigation/PageHeader";
import { useMetalHoldingDetail } from "@/hooks/useMetalHoldingDetail";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useMemo } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

export default function MetalHoldingDetailRoute(): React.JSX.Element {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const holdingId = Array.isArray(params.id) ? params.id[0] : params.id;
  const detail = useMetalHoldingDetail(holdingId);
  const { t } = useTranslation("metals");

  // Only actions with a live implemented route are composed. Sell, Edit,
  // Dispose, and Undo stay hidden until their own lanes land a route.
  const actions = useMemo<readonly HoldingActionDescriptor[]>((): readonly HoldingActionDescriptor[] => {
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
