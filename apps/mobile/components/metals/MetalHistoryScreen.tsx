import { FlatList, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { MetalHoldingRender } from "@/components/metals/MetalHoldingRender";
import { Skeleton } from "@/components/ui/Skeleton";
import type {
  MetalHistoryFilter,
  MetalHistoryReadModel,
} from "@/services/metal-history-read-model-service";

interface MetalHistoryScreenProps {
  readonly error: Error | null;
  readonly history: MetalHistoryReadModel;
  readonly isLoading: boolean;
  readonly isOffline: boolean;
  readonly onFilterChange: (filter: MetalHistoryFilter) => void;
  readonly onOpenHolding: (holdingId: string) => void;
  readonly onRetry: () => void;
}

export function MetalHistoryScreen(
  props: MetalHistoryScreenProps
): React.JSX.Element {
  const { t } = useTranslation("metals");
  if (props.isLoading)
    return (
      <View testID="metal-history-loading" className="flex-1 gap-3 p-5">
        <Skeleton width="100%" height={44} borderRadius={12} />
        <Skeleton width="100%" height={120} borderRadius={16} />
      </View>
    );
  return (
    <FlatList
      testID="metal-history-root"
      data={props.history.items}
      keyExtractor={(item) => item.holdingId}
      contentContainerClassName="gap-3 px-5 pt-4 pb-10"
      ListHeaderComponent={
        <View className="gap-4">
          <Text
            accessibilityRole="header"
            className="text-2xl font-bold text-text-primary"
          >
            {t("history.title")}
          </Text>
          <Text className="text-base text-text-secondary">
            {t("history.subtitle")}
          </Text>
          {props.isOffline ? (
            <Text className="text-sm text-text-muted">
              {t("history.offline")}
            </Text>
          ) : null}
          <FilterBar
            filter={props.history.filter}
            onFilterChange={props.onFilterChange}
          />
          {props.error !== null ? <Retry onRetry={props.onRetry} /> : null}
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          testID={`metal-history-item-${item.status}`}
          accessibilityRole="button"
          className="flex-row items-center gap-3 rounded-2xl border border-border p-4 dark:border-border-dark"
          onPress={() => props.onOpenHolding(item.holdingId)}
        >
          <MetalHoldingRender
            itemForm={item.itemForm}
            metalType={item.metalType}
          />
          <View className="flex-1">
            <Text className="text-sm text-text-secondary">
              {t(`status.${item.status}`)}
            </Text>
            <Text className="text-lg font-semibold text-text-primary">
              {item.name}
            </Text>
            <Text className="text-sm text-text-secondary">
              {t(item.metalType === "GOLD" ? "metal.gold" : "metal.silver")} ·{" "}
              {purityLabel(item.purityCode)} ·{" "}
              {t(
                item.itemForm === null
                  ? "form.unknown"
                  : `form.${item.itemForm}`
              )}
            </Text>
            <Text className="mt-1 text-sm text-text-muted">
              {item.occurredAt.toLocaleDateString()}
            </Text>
          </View>
        </Pressable>
      )}
      ListEmptyComponent={
        <Text className="py-12 text-center text-base text-text-secondary">
          {t("history.empty")}
        </Text>
      }
    />
  );
}

function FilterBar({
  filter,
  onFilterChange,
}: {
  readonly filter: MetalHistoryFilter;
  readonly onFilterChange: (filter: MetalHistoryFilter) => void;
}): React.JSX.Element {
  const { t } = useTranslation("metals");
  const filters: readonly MetalHistoryFilter[] = ["all", "sold", "disposed"];
  return (
    <View className="flex-row rounded-xl border border-border dark:border-border-dark">
      {filters.map((item) => (
        <Pressable
          key={item}
          testID={`metal-history-filter-${item}`}
          accessibilityLabel={`${t(`history.${item}`)} filter`}
          accessibilityRole="button"
          className={`min-h-11 flex-1 items-center justify-center ${filter === item ? "bg-nileGreen-50 dark:bg-slate-800" : ""}`}
          onPress={() => onFilterChange(item)}
        >
          <Text
            className={
              filter === item
                ? "font-semibold text-nileGreen-600"
                : "text-text-secondary"
            }
          >
            {t(`history.${item}`)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
function Retry({
  onRetry,
}: {
  readonly onRetry: () => void;
}): React.JSX.Element {
  const { t } = useTranslation("metals");
  return (
    <Pressable
      accessibilityRole="button"
      className="min-h-11 items-center justify-center rounded-xl border border-nileGreen-500"
      onPress={onRetry}
    >
      <Text className="font-semibold text-nileGreen-600">
        {t("history.retry")}
      </Text>
    </Pressable>
  );
}
function purityLabel(code: string | null): string {
  if (code === "gold-875") return "21K · 875";
  if (code === "gold-999") return "24K · 999";
  return code?.replace(/^(gold|silver)-/, "").toUpperCase() ?? "—";
}
