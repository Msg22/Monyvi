import { FlatList, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/ui/Skeleton";
import { MetalHoldingRender } from "@/components/metals/MetalHoldingRender";
import type {
  HoldingActionDescriptor,
  HoldingActionId,
} from "@/components/metals/holding-actions/registry";
import type { MetalDetailReadModel } from "@/services/metal-detail-read-model-service";

interface MetalHoldingDetailScreenProps {
  readonly actions: readonly HoldingActionDescriptor[];
  readonly error: Error | null;
  readonly isLoading: boolean;
  readonly isOffline: boolean;
  readonly model: MetalDetailReadModel | null;
  readonly onAction?: (action: HoldingActionId) => void;
  readonly onRetry: () => void;
  readonly onViewHistory: () => void;
}

export function MetalHoldingDetailScreen(
  props: MetalHoldingDetailScreenProps
): React.JSX.Element {
  const { t } = useTranslation("metals");
  if (props.isLoading) {
    return (
      <View testID="metal-holding-detail-loading" className="flex-1 gap-4 p-5">
        <Skeleton width="100%" height={160} borderRadius={24} />
        <Skeleton width="100%" height={280} borderRadius={16} />
      </View>
    );
  }
  if (props.model === null) {
    return <EmptyDetail error={props.error} onRetry={props.onRetry} />;
  }
  const model = props.model;
  const titleKey =
    model.status === "sold"
      ? "detail.sold_title"
      : model.status === "disposed"
        ? "detail.disposed_title"
        : "detail.title";
  const identity = `${t(model.metalType === "GOLD" ? "metal.gold" : "metal.silver")} · ${purityLabel(model.purityCode)} · ${t(model.itemForm === null ? "form.unknown" : `form.${model.itemForm}`)}`;
  const hasRestored =
    model.isActiveOwnership &&
    model.timeline.some((item) => item.kind === "undo");
  return (
    <FlatList
      testID="metal-holding-detail-root"
      data={model.timeline}
      keyExtractor={(item) => item.id}
      contentContainerClassName="gap-4 px-5 pt-4 pb-10"
      ListHeaderComponent={
        <>
          <Text
            accessibilityRole="header"
            className="text-2xl font-bold text-text-primary"
          >
            {t(titleKey)}
          </Text>
          {props.isOffline ? (
            <Text className="text-sm text-text-muted">
              {t("detail.offline")}
            </Text>
          ) : null}
          <View className="flex-row items-center gap-4 rounded-2xl border border-border p-4 dark:border-border-dark">
            <MetalHoldingRender
              itemForm={model.itemForm}
              metalType={model.metalType}
              size="detail"
            />
            <View className="flex-1 gap-2">
              <Text className="text-xl font-bold text-text-primary">
                {model.name}
              </Text>
              <Text className="text-base text-text-secondary">{identity}</Text>
              <Text className="self-start rounded-full border border-border px-3 py-1 text-sm text-text-primary dark:border-border-dark">
                {t(`status.${model.status}`)}
              </Text>
            </View>
          </View>
          {hasRestored ? (
            <Text className="font-medium text-nileGreen-600">
              {t("detail.restored")}
            </Text>
          ) : null}
          {model.isActiveOwnership ? <ValueSummary model={model} /> : null}
          {props.error !== null ? <Retry onRetry={props.onRetry} /> : null}
          <Text
            accessibilityRole="header"
            className="mt-2 text-xl font-bold text-text-primary"
          >
            {t("detail.physical_facts")}
          </Text>
          <Text className="text-base text-text-secondary">
            {model.weightGramsDecimal === null
              ? t("detail.value_unavailable")
              : `${model.weightGramsDecimal} g`}
          </Text>
          <Text className="text-base text-text-secondary">
            {purityLabel(model.purityCode)}
          </Text>
          <Text
            accessibilityRole="header"
            className="mt-2 text-xl font-bold text-text-primary"
          >
            {t("detail.holding_story")}
          </Text>
          <Text className="text-base text-text-secondary">
            {t("detail.acquired")}
          </Text>
        </>
      }
      renderItem={({ item }) => (
        <Text className="text-sm text-text-secondary">
          {t(`timeline.${item.kind}`)} · {item.occurredAt.toLocaleDateString()}
        </Text>
      )}
      ListFooterComponent={
        <View className="gap-3 pt-3">
          <Pressable
            accessibilityRole="button"
            className="min-h-11 items-center justify-center rounded-xl border border-border dark:border-border-dark"
            onPress={props.onViewHistory}
          >
            <Text className="font-semibold text-text-primary">
              {t("detail.view_all")}
            </Text>
          </Pressable>
          {props.actions.map((action) => (
            <ActionButton
              key={action.id}
              action={action}
              onAction={props.onAction}
            />
          ))}
        </View>
      }
    />
  );
}

function ValueSummary({
  model,
}: {
  readonly model: MetalDetailReadModel;
}): React.JSX.Element {
  const { t } = useTranslation("metals");
  if (model.currentValueDecimal === null)
    return (
      <Text className="text-base text-text-secondary">
        {t("detail.current_value_unavailable")}
      </Text>
    );
  const currency = model.purchaseCurrency ?? "EGP";
  const amount = displayAmount(model.currentValueDecimal, currency);
  return (
    <View className="gap-1">
      <Text className="text-base text-text-secondary">
        {t("detail.current_value")}
      </Text>
      <Text className="text-3xl font-bold text-nileGreen-600">{amount}</Text>
      {model.totalGainDecimal !== null ? (
        <Text className="text-base text-nileGreen-600">
          {t("detail.since_purchase", {
            amount: signedAmount(model.totalGainDecimal, currency),
          })}
        </Text>
      ) : null}
    </View>
  );
}

function EmptyDetail({
  error,
  onRetry,
}: {
  readonly error: Error | null;
  readonly onRetry: () => void;
}): React.JSX.Element {
  const { t } = useTranslation("metals");
  return (
    <View className="flex-1 items-center justify-center gap-4 px-6">
      <Text className="text-center text-lg font-semibold text-text-primary">
        {error === null ? t("detail.not_found") : t("detail.load_error")}
      </Text>
      {error !== null ? <Retry onRetry={onRetry} /> : null}
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
      className="min-h-11 items-center justify-center rounded-xl border border-nileGreen-500 px-4"
      onPress={onRetry}
    >
      <Text className="font-semibold text-nileGreen-600">
        {t("detail.retry")}
      </Text>
    </Pressable>
  );
}

function ActionButton({
  action,
  onAction,
}: {
  readonly action: HoldingActionDescriptor;
  readonly onAction?: (action: HoldingActionId) => void;
}): React.JSX.Element {
  const { t } = useTranslation("metals");
  const tone =
    action.tone === "primary"
      ? "bg-nileGreen-600"
      : action.tone === "danger"
        ? "border-red-500"
        : "border-nileGreen-500";
  const textTone =
    action.tone === "primary"
      ? "text-white"
      : action.tone === "danger"
        ? "text-red-600"
        : "text-nileGreen-600";
  return (
    <Pressable
      testID={`metal-holding-action-${action.id}`}
      accessibilityRole="button"
      className={`min-h-11 items-center justify-center rounded-xl border px-4 ${tone}`}
      disabled={onAction === undefined}
      onPress={() => onAction?.(action.id)}
    >
      <Text className={`font-semibold ${textTone}`}>{t(action.labelKey)}</Text>
    </Pressable>
  );
}

function purityLabel(code: string | null): string {
  if (code === null) return "—";
  if (code === "gold-999") return "24K · 999";
  if (code === "gold-875") return "21K · 875";
  return code.replace(/^(gold|silver)-/, "").toUpperCase();
}
function displayAmount(value: string, currency: string): string {
  return `${currency} ${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function signedAmount(value: string, currency: string): string {
  return `${Number(value) >= 0 ? "+" : "-"}${displayAmount(String(Math.abs(Number(value))), currency)}`;
}
