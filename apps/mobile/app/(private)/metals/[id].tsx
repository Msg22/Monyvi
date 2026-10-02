import { getHoldingDetailTitleKey } from "@/components/metals/holding-detail-presentation";
import { MetalHoldingDetailScreen } from "@/components/metals/MetalHoldingDetailScreen";
import { PageHeader } from "@/components/navigation/PageHeader";
import { palette } from "@/constants/colors";
import { useMetalHoldingDetail } from "@/hooks/useMetalHoldingDetail";
import { router, useLocalSearchParams } from "expo-router";
import { getEditMetalHoldingHref } from "@/components/metals/holding-actions/edit-action";
import React, { useCallback } from "react";
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
        actions={[]}
        onAction={undefined}
        {...detail}
        onRetry={detail.retry}
      />
    </View>
  );
}
