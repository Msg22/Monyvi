import { getHoldingDetailTitleKey } from "@/components/metals/holding-detail-presentation";
import { MetalHoldingDetailScreen } from "@/components/metals/MetalHoldingDetailScreen";
import { PageHeader } from "@/components/navigation/PageHeader";
import { useMetalHoldingDetail } from "@/hooks/useMetalHoldingDetail";
import { router, useLocalSearchParams } from "expo-router";
import { getHoldingActionDescriptors } from "@/components/metals/holding-actions/registry";
import { getEditMetalHoldingHref } from "@/components/metals/holding-actions/edit-action";
import React from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

export default function MetalHoldingDetailRoute(): React.JSX.Element {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const holdingId = Array.isArray(params.id) ? params.id[0] : params.id;
  const detail = useMetalHoldingDetail(holdingId);
  const { t } = useTranslation("metals");

  return (
    <View className="flex-1 bg-background dark:bg-background-dark">
      <PageHeader
        showBackButton
        showDrawer={false}
        title={t(getHoldingDetailTitleKey(detail.model?.status))}
      />
      <MetalHoldingDetailScreen
        actions={
          detail.model
            ? getHoldingActionDescriptors(detail.model).filter(
                (action) => action.id === "edit"
              )
            : []
        }
        onAction={(action): void => {
          if (action === "edit" && holdingId)
            router.push(getEditMetalHoldingHref(holdingId));
        }}
        {...detail}
        onRetry={detail.retry}
      />
    </View>
  );
}
