import { Ionicons } from "@expo/vector-icons";
import {
  FlatList,
  I18nManager,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MetalHoldingRender } from "@/components/metals/MetalHoldingRender";
import type {
  HoldingActionDescriptor,
  HoldingActionId,
} from "@/components/metals/holding-actions/registry";
import { Skeleton } from "@/components/ui/Skeleton";
import { palette } from "@/constants/colors";
import { shouldUseCompactLayout } from "@/constants/ui";
import type {
  MetalDetailReadModel,
  MetalDetailTimelineItem,
} from "@/services/metal-detail-read-model-service";

interface MetalHoldingDetailScreenProps {
  readonly actions: readonly HoldingActionDescriptor[];
  readonly error: Error | null;
  readonly isLoading: boolean;
  readonly isOffline: boolean;
  readonly model: MetalDetailReadModel | null;
  readonly onAction?: (action: HoldingActionId) => void;
  readonly onRetry: () => void;
  readonly onViewCalculation?: () => void;
  readonly onViewHistory: () => void;
}

export function MetalHoldingDetailScreen(
  props: MetalHoldingDetailScreenProps
): React.JSX.Element {
  const insets = useSafeAreaInsets();

  if (props.isLoading) return <DetailSkeleton />;
  if (props.model === null) {
    return <EmptyDetail error={props.error} onRetry={props.onRetry} />;
  }

  const model = props.model;
  const visibleHistory = model.timeline.slice(0, 2);

  return (
    <FlatList
      testID="metal-holding-detail-root"
      className="flex-1 bg-background dark:bg-background-dark"
      data={visibleHistory}
      keyExtractor={(item): string => item.id}
      showsVerticalScrollIndicator={false}
      contentContainerClassName="pt-1"
      ListHeaderComponent={
        <DetailHeader
          error={props.error}
          hasMoreHistory={model.timeline.length > visibleHistory.length}
          isOffline={props.isOffline}
          model={model}
          onRetry={props.onRetry}
          onViewCalculation={props.onViewCalculation}
          onViewHistory={props.onViewHistory}
        />
      }
      renderItem={({ item, index }): React.JSX.Element => (
        <HistoryEvent
          item={item}
          isFirst={index === 0}
          isLast={index === visibleHistory.length - 1}
        />
      )}
      ListFooterComponent={
        <ActionRegion
          actions={props.actions}
          bottomInset={insets.bottom}
          onAction={props.onAction}
        />
      }
    />
  );
}

function DetailSkeleton(): React.JSX.Element {
  return (
    <View
      testID="metal-holding-detail-loading"
      className="flex-1 gap-5 bg-background px-5 pt-3 dark:bg-background-dark"
    >
      <View className="flex-row items-center gap-5">
        <Skeleton width={176} height={176} borderRadius={24} />
        <View className="flex-1 gap-3">
          <Skeleton width="90%" height={32} borderRadius={8} />
          <Skeleton width="100%" height={22} borderRadius={8} />
          <Skeleton width="42%" height={36} borderRadius={18} />
        </View>
      </View>
      <Skeleton width="100%" height={136} borderRadius={16} />
      <Skeleton width="100%" height={260} borderRadius={16} />
    </View>
  );
}

function DetailHeader({
  error,
  hasMoreHistory,
  isOffline,
  model,
  onRetry,
  onViewCalculation,
  onViewHistory,
}: {
  readonly error: Error | null;
  readonly hasMoreHistory: boolean;
  readonly isOffline: boolean;
  readonly model: MetalDetailReadModel;
  readonly onRetry: () => void;
  readonly onViewCalculation?: () => void;
  readonly onViewHistory: () => void;
}): React.JSX.Element {
  const { t } = useTranslation("metals");
  const hasRestored =
    model.isActiveOwnership &&
    model.timeline.some((item) => item.kind === "undo");

  return (
    <View className="px-5">
      {model.status === "active" ? null : (
        <Text
          accessibilityRole="header"
          className="mb-4 text-xl font-bold text-text-primary dark:text-text-primary-dark"
        >
          {t(
            model.status === "sold"
              ? "detail.sold_title"
              : "detail.disposed_title"
          )}
        </Text>
      )}
      <IdentityHero model={model} />
      {hasRestored ? (
        <Text className="mb-4 font-medium text-nileGreen-700 dark:text-nileGreen-400">
          {t("detail.restored")}
        </Text>
      ) : null}
      {model.isActiveOwnership ? <ValueSummary model={model} /> : null}
      {isOffline ? (
        <Text className="mt-3 text-sm text-text-muted dark:text-text-muted-dark">
          {t("detail.offline")}
        </Text>
      ) : null}
      {error === null ? null : <Retry onRetry={onRetry} />}
      {model.isActiveOwnership ? <ValueJourney model={model} /> : null}
      {onViewCalculation === undefined ? null : (
        <CalculationDisclosure onPress={onViewCalculation} />
      )}
      <PhysicalFacts model={model} />
      <View className="mt-6 h-px bg-slate-200 dark:bg-slate-800" />
      <View className="mt-4 flex-row items-center justify-between">
        <Text
          accessibilityRole="header"
          className="text-xl font-semibold text-text-primary dark:text-text-primary-dark"
        >
          {t("detail.history")}
        </Text>
        {hasMoreHistory ? (
          <Pressable
            accessibilityRole="button"
            className="min-h-11 min-w-11 items-end justify-center"
            onPress={onViewHistory}
          >
            <Text className="font-semibold text-nileGreen-700 dark:text-nileGreen-400">
              {t("detail.view_all")}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function IdentityHero({
  model,
}: {
  readonly model: MetalDetailReadModel;
}): React.JSX.Element {
  const { t } = useTranslation("metals");
  const { width, fontScale } = useWindowDimensions();
  const isCompact = shouldUseCompactLayout(width, fontScale);
  const metalLabel = t(
    model.metalType === "GOLD" ? "metal.gold" : "metal.silver"
  );
  const formLabel = t(
    model.itemForm === null ? "form.unknown" : `form.${model.itemForm}`
  );
  const materialClassName =
    model.metalType === "GOLD"
      ? "text-gold-600 dark:text-gold-400"
      : "text-silver-500 dark:text-slate-200";

  return (
    <View
      testID="metal-holding-detail-hero"
      className={`items-center gap-5 pb-7 ${isCompact ? "flex-col" : "flex-row"}`}
    >
      <MetalHoldingRender
        itemForm={model.itemForm}
        metalType={model.metalType}
        size="detail"
      />
      <View
        className={`min-w-0 flex-1 gap-2 ${isCompact ? "items-center" : "items-start"}`}
      >
        <Text
          numberOfLines={2}
          className={`text-[28px] font-semibold leading-[36px] text-text-primary dark:text-text-primary-dark ${
            isCompact ? "text-center" : ""
          }`}
        >
          {model.name}
        </Text>
        <Text className="text-base text-text-secondary dark:text-text-secondary-dark">
          <Text className={materialClassName}>{metalLabel}</Text>
          {` · ${purityLabel(model.purityCode)} · ${formLabel}`}
        </Text>
        <Text className="self-start rounded-full border border-nileGreen-700/25 bg-nileGreen-50 px-3 py-1.5 text-sm font-medium text-nileGreen-800 dark:border-nileGreen-400/40 dark:bg-nileGreen-900 dark:text-nileGreen-400">
          {t(`status.${model.status}`)}
        </Text>
      </View>
    </View>
  );
}

function ValueSummary({
  model,
}: {
  readonly model: MetalDetailReadModel;
}): React.JSX.Element {
  const { t } = useTranslation("metals");
  if (model.currentValueDecimal === null) {
    return (
      <Text className="border-t border-slate-200 pt-6 text-base text-text-secondary dark:border-slate-800 dark:text-text-secondary-dark">
        {t("detail.current_value_unavailable")}
      </Text>
    );
  }

  const currency =
    model.currentValueCurrency ?? model.purchaseCurrency ?? "EGP";
  const gainValue = parseAmount(model.totalGainDecimal);
  return (
    <View className="border-t border-slate-200 pt-6 dark:border-slate-800">
      <Text className="text-base text-text-secondary dark:text-text-secondary-dark">
        {t("detail.current_value")}
      </Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        className="mt-1 text-[40px] font-semibold leading-[48px] text-nileGreen-800 dark:text-nileGreen-400"
      >
        {displayAmount(model.currentValueDecimal, currency)}
      </Text>
      {model.totalGainDecimal === null ? null : (
        <Text className={`mt-1 text-base ${getGainTextClass(gainValue)}`}>
          {t("detail.since_purchase", {
            amount: signedAmount(model.totalGainDecimal, currency),
          })}
        </Text>
      )}
    </View>
  );
}

function ValueJourney({
  model,
}: {
  readonly model: MetalDetailReadModel;
}): React.JSX.Element | null {
  const { t, i18n } = useTranslation("metals");
  const locale = resolveLocale(i18n.resolvedLanguage);
  const currency =
    model.currentValueCurrency ?? model.purchaseCurrency ?? "EGP";
  const currentValueObservedAt = model.currentValueObservedAt ?? null;
  const hasAcquisition =
    model.purchaseDate !== null || model.purchasePriceDecimal !== null;
  const hasCurrentValue = model.currentValueDecimal !== null;
  if (!hasAcquisition && !hasCurrentValue) return null;

  return (
    <View className="mt-7">
      <Text
        accessibilityRole="header"
        className="text-xl font-semibold text-text-primary dark:text-text-primary-dark"
      >
        {t("detail.follow_value")}
      </Text>
      <View className="mt-4 flex-row gap-4">
        <View className="relative w-6 items-center">
          {hasAcquisition && hasCurrentValue ? (
            <View className="absolute bottom-3 top-3 w-px bg-nileGreen-600 dark:bg-nileGreen-400" />
          ) : null}
          {hasAcquisition ? (
            <View className="z-10 h-4 w-4 rounded-full bg-nileGreen-700 dark:bg-nileGreen-400" />
          ) : null}
          {hasAcquisition && hasCurrentValue ? (
            <View className="flex-1" />
          ) : null}
          {hasCurrentValue ? (
            <View className="z-10 h-4 w-4 rounded-full border-4 border-nileGreen-50 bg-nileGreen-700 dark:border-slate-800 dark:bg-nileGreen-400" />
          ) : null}
        </View>
        <View className="min-w-0 flex-1 gap-5">
          {hasAcquisition ? (
            <View>
              <Text className="text-base font-medium text-nileGreen-800 dark:text-nileGreen-400">
                {t("detail.acquired")}
              </Text>
              {model.purchaseDate === null ? null : (
                <Text className="mt-1 text-sm text-text-secondary dark:text-text-secondary-dark">
                  {formatShortDate(model.purchaseDate, locale)}
                </Text>
              )}
              {model.purchasePriceDecimal === null ? null : (
                <Text className="mt-1 text-base text-text-primary dark:text-text-primary-dark">
                  {t("detail.paid", {
                    amount: displayAmount(
                      model.purchasePriceDecimal,
                      model.purchaseCurrency ?? currency
                    ),
                  })}
                </Text>
              )}
            </View>
          ) : null}
          {hasCurrentValue ? (
            <View>
              <Text className="text-base font-medium text-nileGreen-800 dark:text-nileGreen-400">
                {t("detail.timeline_current_value")}
              </Text>
              {currentValueObservedAt === null ? null : (
                <>
                  <Text className="mt-1 text-sm text-text-secondary dark:text-text-secondary-dark">
                    {formatShortDate(currentValueObservedAt, locale)}
                  </Text>
                  <Text className="mt-1 text-sm text-text-secondary dark:text-text-secondary-dark">
                    {t("portfolio.rates_updated", {
                      when: formatTimestamp(currentValueObservedAt, locale),
                    })}
                  </Text>
                </>
              )}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function CalculationDisclosure({
  onPress,
}: {
  readonly onPress: () => void;
}): React.JSX.Element {
  const { t } = useTranslation("metals");
  return (
    <Pressable
      accessibilityRole="button"
      className="mt-5 min-h-14 flex-row items-center gap-3 rounded-xl border border-slate-300 px-4 dark:border-slate-700"
      onPress={onPress}
    >
      <Ionicons
        name="information-circle-outline"
        size={24}
        color={palette.slate[500]}
      />
      <Text className="min-w-0 flex-1 text-base text-text-primary dark:text-text-primary-dark">
        {t("detail.calculation_disclosure")}
      </Text>
      <Ionicons
        name={I18nManager.isRTL ? "chevron-back" : "chevron-forward"}
        size={22}
        color={palette.slate[500]}
      />
    </Pressable>
  );
}

function PhysicalFacts({
  model,
}: {
  readonly model: MetalDetailReadModel;
}): React.JSX.Element {
  const { t } = useTranslation("metals");
  const formLabel = t(
    model.itemForm === null ? "form.unknown" : `form.${model.itemForm}`
  );
  return (
    <View className="mt-6">
      <Text
        accessibilityRole="header"
        className="text-xl font-semibold text-text-primary dark:text-text-primary-dark"
      >
        {t("detail.physical_facts")}
      </Text>
      <View className="mt-3 gap-3">
        <FactRow
          icon="bag-handle-outline"
          label={t("weight")}
          value={
            model.weightGramsDecimal === null
              ? t("detail.value_unavailable")
              : `${model.weightGramsDecimal} g`
          }
        />
        <FactRow
          icon="shield-checkmark-outline"
          label={t("purity")}
          value={purityLabel(model.purityCode)}
        />
        <FactRow
          icon={physicalFormIcon(model.itemForm)}
          label={t("form_optional")}
          value={formLabel}
        />
      </View>
    </View>
  );
}

function FactRow({
  icon,
  label,
  value,
}: {
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
  readonly value: string;
}): React.JSX.Element {
  const { t } = useTranslation("metals");
  return (
    <View
      accessible
      accessibilityLabel={t("detail.fact_accessibility", { label, value })}
      className="flex-row items-center gap-3"
    >
      <View className="h-9 w-9 items-center justify-center rounded-full bg-nileGreen-50 dark:bg-slate-800">
        <Ionicons name={icon} size={20} color={palette.nileGreen[700]} />
      </View>
      <Text className="text-base text-text-primary dark:text-text-primary-dark">
        {value}
      </Text>
    </View>
  );
}

function HistoryEvent({
  isFirst,
  isLast,
  item,
}: {
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly item: MetalDetailTimelineItem;
}): React.JSX.Element {
  const { t, i18n } = useTranslation("metals");
  const locale = resolveLocale(i18n.resolvedLanguage);
  return (
    <View className="flex-row px-5">
      <View className="relative w-8 items-center">
        {isFirst ? null : (
          <View className="absolute -top-1 h-4 w-px bg-nileGreen-600 dark:bg-nileGreen-400" />
        )}
        {isLast ? null : (
          <View className="absolute top-4 h-8 w-px bg-nileGreen-600 dark:bg-nileGreen-400" />
        )}
        <View className="mt-2 h-3 w-3 rounded-full bg-nileGreen-700 dark:bg-nileGreen-400" />
      </View>
      <Text className="min-w-0 flex-1 py-1 text-sm text-text-primary dark:text-text-primary-dark">
        {t(`timeline.${item.kind}`)}
        <Text className="text-text-secondary dark:text-text-secondary-dark">
          {` · ${formatShortDate(item.occurredAt, locale)}`}
        </Text>
      </Text>
    </View>
  );
}

function ActionRegion({
  actions,
  bottomInset,
  onAction,
}: {
  readonly actions: readonly HoldingActionDescriptor[];
  readonly bottomInset: number;
  readonly onAction?: (action: HoldingActionId) => void;
}): React.JSX.Element {
  return (
    <View
      testID="metal-holding-detail-actions"
      className="mt-5 gap-3 border-t border-slate-200 bg-background px-5 pt-4 dark:border-slate-800 dark:bg-background-dark"
      style={{ paddingBottom: bottomInset + 16 }}
    >
      {actions.map((action) => (
        <ActionButton key={action.id} action={action} onAction={onAction} />
      ))}
    </View>
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
  const isPrimary = action.tone === "primary";
  const isDanger = action.tone === "danger";
  const isDisposition = action.id === "dispose";
  const containerClassName = isPrimary
    ? "min-h-14 rounded-xl bg-nileGreen-700 dark:bg-nileGreen-600"
    : isDanger
      ? "min-h-12"
      : isDisposition
        ? "min-h-14 rounded-xl border border-slate-300 dark:border-slate-700"
        : "min-h-14 rounded-xl border border-nileGreen-700 dark:border-nileGreen-400";
  const textClassName = isPrimary
    ? "text-white"
    : isDanger
      ? "text-red-600 dark:text-red-500"
      : isDisposition
        ? "text-text-secondary dark:text-text-secondary-dark"
        : "text-nileGreen-700 dark:text-nileGreen-400";
  const iconColor = isDanger ? palette.red[500] : palette.slate[500];

  return (
    <Pressable
      testID={`metal-holding-action-${action.id}`}
      accessibilityRole="button"
      className={`flex-row items-center justify-center gap-2 px-4 ${containerClassName}`}
      disabled={onAction === undefined}
      onPress={(): void => onAction?.(action.id)}
      style={onAction === undefined ? { opacity: 0.5 } : undefined}
    >
      {isDisposition ? (
        <Ionicons name="exit-outline" size={22} color={iconColor} />
      ) : null}
      {isDanger ? (
        <Ionicons name="trash-outline" size={22} color={iconColor} />
      ) : null}
      <Text className={`text-base font-semibold ${textClassName}`}>
        {t(action.labelKey)}
      </Text>
    </Pressable>
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
    <View className="flex-1 items-center justify-center gap-4 bg-background px-6 dark:bg-background-dark">
      <Text className="text-center text-lg font-semibold text-text-primary dark:text-text-primary-dark">
        {error === null ? t("detail.not_found") : t("detail.load_error")}
      </Text>
      {error === null ? null : <Retry onRetry={onRetry} />}
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
      className="mt-4 min-h-11 items-center justify-center rounded-xl border border-nileGreen-600 px-4 dark:border-nileGreen-400"
      onPress={onRetry}
    >
      <Text className="font-semibold text-nileGreen-700 dark:text-nileGreen-400">
        {t("detail.retry")}
      </Text>
    </Pressable>
  );
}

function physicalFormIcon(
  form: MetalDetailReadModel["itemForm"]
): keyof typeof Ionicons.glyphMap {
  if (form === "bar") return "cube-outline";
  if (form === "jewelry") return "diamond-outline";
  return "ellipse-outline";
}

function purityLabel(code: string | null): string {
  if (code === null) return "—";
  if (code === "gold-999") return "24K · 999";
  if (code === "gold-875") return "21K · 875";
  return code.replace(/^(gold|silver)-/, "").toUpperCase();
}

function displayAmount(value: string, currency: string): string {
  return `${currency} ${Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function signedAmount(value: string, currency: string): string {
  const amount = Number(value);
  return `${amount >= 0 ? "+" : "-"} ${displayAmount(String(Math.abs(amount)), currency)}`;
}

function parseAmount(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getGainTextClass(value: number | null): string {
  if (value === null || value === 0) {
    return "text-text-secondary dark:text-text-secondary-dark";
  }
  return value > 0
    ? "text-nileGreen-700 dark:text-nileGreen-400"
    : "text-red-600 dark:text-red-500";
}

function resolveLocale(language: string | undefined): string {
  return language?.startsWith("ar") ? "ar-EG" : "en-GB";
}

function formatShortDate(date: Date, locale: string): string {
  return date.toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTimestamp(date: Date, locale: string): string {
  const time = date
    .toLocaleTimeString(locale, {
      hour: "numeric",
      hour12: true,
      minute: "2-digit",
    })
    .replace(" am", " AM")
    .replace(" pm", " PM");
  return `${formatShortDate(date, locale)}, ${time}`;
}
