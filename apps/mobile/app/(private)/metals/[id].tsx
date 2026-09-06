import { MetalHoldingDetailScreen } from "@/components/metals/MetalHoldingDetailScreen";
import { PageHeader } from "@/components/navigation/PageHeader";
import { useMetalHoldingDetail } from "@/hooks/useMetalHoldingDetail";
import { useLocalSearchParams } from "expo-router";
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
        title={detail.model?.name ?? t("detail.title")}
      />
      <MetalHoldingDetailScreen
        actions={[]}
        {...detail}
        onRetry={detail.retry}
      />
    </View>
  );
}
