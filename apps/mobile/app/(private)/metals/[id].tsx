import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { MetalHoldingDetailScreen } from "@/components/metals/MetalHoldingDetailScreen";
import { PageHeader } from "@/components/navigation/PageHeader";
import { useMetalHoldingDetail } from "@/hooks/useMetalHoldingDetail";

export default function MetalHoldingDetailRoute(): React.JSX.Element {
  const { t } = useTranslation("metals");
  const { id } = useLocalSearchParams<{ id?: string }>();
  const detail = useMetalHoldingDetail(id);
  return (
    <View className="flex-1 bg-background dark:bg-background-dark">
      <PageHeader title={t("detail.title")} showBackButton showDrawer={false} />
      <MetalHoldingDetailScreen
        actions={[]}
        {...detail}
        onRetry={detail.retry}
      />
    </View>
  );
}
