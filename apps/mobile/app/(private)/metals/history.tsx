import { router } from "expo-router";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { MetalHistoryScreen } from "@/components/metals/MetalHistoryScreen";
import { PageHeader } from "@/components/navigation/PageHeader";
import { useMetalHistory } from "@/hooks/useMetalHistory";

export default function MetalHistoryRoute(): React.JSX.Element {
  const { t } = useTranslation("metals");
  const history = useMetalHistory();
  return (
    <View className="flex-1 bg-background dark:bg-background-dark">
      <PageHeader
        title={t("history.title")}
        showBackButton
        showDrawer={false}
      />
      <MetalHistoryScreen
        {...history}
        onRetry={history.retry}
        onOpenHolding={(holdingId) =>
          router.push({ pathname: "/metals/[id]", params: { id: holdingId } })
        }
        onFilterChange={history.setFilter}
      />
    </View>
  );
}
