import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  FlatList,
  Pressable,
  Text,
  useColorScheme,
  useWindowDimensions,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  formatCanonicalDecimalForDisplay,
  resolvePuritySelection,
} from "@monyvi/logic";

import { MetalHoldingRender } from "@/components/metals/MetalHoldingRender";
import {
  getCurrencyDisplaySign,
  type CurrencyDisplaySign,
} from "@/components/metals/portfolio-presentation";
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
}

export function MetalHoldingDetailScreen(
  props: MetalHoldingDetailScreenProps
): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [showCalculation, setShowCalculation] = useState(false);

  if (props.isLoading) return <DetailSkeleton />;
  if (props.model === null) {
    return <EmptyDetail error={props.error} onRetry={props.onRetry} />;
  }

  const model = props.model;
  const visibleHistory = showAllHistory
    ? model.timeline
    : model.timeline.slice(0, 2);

  return (
    <FlatList
      testID="metal-holding-detail-root"
      className="flex-1 bg-background dark:bg-background-dark"
      data={visibleHistory}
      keyExtractor={(item): string => item.id}
      showsVerticalScrollIndicator={false}
      contentContainerClassName="pt-1"
      contentContainerStyle={
        props.actions.length === 0
          ? { paddingBottom: insets.bottom + 16 }
          : undefined
      }
      ListHeaderComponent={
        <DetailHeader
          error={props.error}
          hasMoreHistory={model.timeline.length > 2}
          isOffline={props.isOffline}
          model={model}
          onRetry={props.onRetry}
          onToggleCalculation={() => setShowCalculation((value) => !value)}
          onViewAllHistory={() => setShowAllHistory(true)}
          showAllHistory={showAllHistory}
          showCalculation={showCalculation}
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
  onToggleCalculation,
  onViewAllHistory,
  showAllHistory,
  showCalculation,
}: {
  readonly error: Error | null;
  readonly hasMoreHistory: boolean;
  readonly isOffline: boolean;
  readonly model: MetalDetailReadModel;
  readonly onRetry: () => void;
  readonly onToggleCalculation: () => void;
  readonly onViewAllHistory: () => void;
  readonly showAllHistory: boolean;
  readonly showCalculation: boolean;
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
      <ReconciliationStatus model={model} onRetry={onRetry} />
      {model.isActiveOwnership ? <ValueSummary model={model} /> : null}
      {isOffline ? (
        <Text className="mt-3 text-sm text-text-muted dark:text-text-muted-dark">
          {t("detail.offline")}
        </Text>
      ) : null}
      {error === null ? null : <Retry onRetry={onRetry} />}
      {model.isActiveOwnership ? <ValueJourney model={model} /> : null}
      {model.attribution === null ? null : (
        <>
          <CalculationDisclosure
            expanded={showCalculation}
            onPress={onToggleCalculation}
          />
          {showCalculation ? <CalculationBreakdown model={model} /> : null}
        </>
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
        {hasMoreHistory && !showAllHistory ? (
          <Pressable
            accessibilityRole="button"
            className="min-h-11 min-w-11 items-end justify-center"
            onPress={onViewAllHistory}
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

function ReconciliationStatus({
  model,
  onRetry,
}: {
  readonly model: MetalDetailReadModel;
  readonly onRetry: () => void;
}): React.JSX.Element | null {
  const { t } = useTranslation("metals");
  const state = model.reconciliationState;
  if (state === "accepted" || state === "reconciled") return null;

  const key =
    state === "sync_pending"
      ? "reconciliation.sync_pending"
      : state === "sync_failed"
        ? "reconciliation.sync_failed"
        : state === "reconciliation_incomplete"
          ? "reconciliation.incomplete"
          : state === "local_complete"
            ? "reconciliation.local_complete"
            : null;
  if (key === null) return null;

  return (
    <View className="mb-4 rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-800">
      <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">
        {t(key)}
      </Text>
      {state === "sync_failed" ? (
        <Pressable
          accessibilityRole="button"
          className="mt-1 min-h-11 justify-center"
          onPress={onRetry}
        >
          <Text className="font-semibold text-nileGreen-700 dark:text-nileGreen-400">
            {t("detail.retry")}
          </Text>
        </Pressable>
      ) : null}
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
  const purity = resolveDetailPurityLabel(model, t);
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
          {` · ${purity} · ${formLabel}`}
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
  const { t, i18n } = useTranslation("metals");
  const locale = resolveLocale(i18n.resolvedLanguage);
  if (model.currentValueDecimal === null) {
    const isRateUnavailable =
      model.currentValueRateStatus?.state === "missing" ||
      model.currentValueRateStatus?.state === "invalid";
    return (
      <View className="gap-2 border-t border-slate-200 pt-6 dark:border-slate-800">
        <Text className="text-base font-medium text-text-primary dark:text-text-primary-dark">
          {t("detail.current_value_unavailable")}
        </Text>
        {isRateUnavailable ? (
          <Text className="text-sm leading-5 text-text-secondary dark:text-text-secondary-dark">
            {t("detail.current_value_rate_unavailable")}
          </Text>
        ) : null}
      </View>
    );
  }

  const currency =
    model.currentValueCurrency ?? model.purchaseCurrency ?? "EGP";
  const gainSign =
    model.totalGainDecimal === null
      ? null
      : getCurrencyDisplaySign(model.totalGainDecimal);
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
        {displayAmount(model.currentValueDecimal, currency, locale)}
      </Text>
      {model.totalGainDecimal === null ? null : (
        <Text className={`mt-1 text-base ${getGainTextClass(gainSign)}`}>
          {t("detail.since_purchase", {
            amount: signedAmount(model.totalGainDecimal, currency, locale),
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
                      model.purchaseCurrency ?? currency,
                      locale
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
              {model.currentValueRateStatus?.state === "fresh" ? null : (
                <Text className="mt-1 text-sm font-medium text-amber-700 dark:text-amber-400">
                  {t(
                    `rate.${model.currentValueRateStatus?.state ?? "unknown"}`
                  )}
                </Text>
              )}
              {model.currentValueRateStatus?.source === null ||
              model.currentValueRateStatus?.source === undefined ? null : (
                <Text className="mt-1 text-sm text-text-muted dark:text-text-muted-dark">
                  {t("detail.rate_source", {
                    source: model.currentValueRateStatus.source,
                  })}
                </Text>
              )}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function CalculationDisclosure({
  expanded,
  onPress,
}: {
  readonly expanded: boolean;
  readonly onPress: () => void;
}): React.JSX.Element {
  const { t } = useTranslation("metals");
  const colorScheme = useColorScheme();
  const iconColor =
    colorScheme === "dark" ? palette.slate[300] : palette.slate[500];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      className="mt-5 min-h-14 flex-row items-center gap-3 rounded-xl border border-slate-300 px-4 dark:border-slate-700"
      onPress={onPress}
    >
      <Ionicons name="information-circle-outline" size={24} color={iconColor} />
      <Text className="min-w-0 flex-1 text-base text-text-primary dark:text-text-primary-dark">
        {t("detail.calculation_disclosure")}
      </Text>
      <Ionicons
        name={expanded ? "chevron-up" : "chevron-down"}
        size={22}
        color={iconColor}
      />
    </Pressable>
  );
}

function CalculationBreakdown({
  model,
}: {
  readonly model: MetalDetailReadModel;
}): React.JSX.Element {
  const { t, i18n } = useTranslation("metals");
  const locale = resolveLocale(i18n.resolvedLanguage);
  const currency =
    model.currentValueCurrency ?? model.purchaseCurrency ?? "EGP";
  const attribution = model.attribution;
  if (attribution === null) return <View />;

  if (!attribution.breakdown.available) {
    return (
      <Text className="mt-3 text-sm text-text-secondary dark:text-text-secondary-dark">
        {t("detail.calculation_breakdown_unavailable")}
      </Text>
    );
  }

  return (
    <View className="mt-3 gap-2 rounded-xl bg-slate-100 p-4 dark:bg-slate-800">
      <CalculationRow
        label={t("detail.metal_movement")}
        value={attribution.metalGainDecimal}
        currency={currency}
        locale={locale}
      />
      {attribution.roundingDifferenceDecimal === null ? null : (
        <Text className="mt-1 text-xs text-text-muted dark:text-text-muted-dark">
          {t("detail.display_rounding")}
        </Text>
      )}
      <CalculationRow
        label={t("detail.currency_movement")}
        value={attribution.currencyGainDecimal}
        currency={currency}
        locale={locale}
      />
      <CalculationRow
        label={t("detail.purchase_premium_costs")}
        value={attribution.premiumAndCostsDecimal}
        currency={currency}
        locale={locale}
      />
    </View>
  );
}

function CalculationRow({
  currency,
  label,
  locale,
  value,
}: {
  readonly currency: string;
  readonly label: string;
  readonly locale: string;
  readonly value: string | null;
}): React.JSX.Element {
  return (
    <View className="flex-row justify-between gap-3">
      <Text className="min-w-0 flex-1 text-sm text-text-secondary dark:text-text-secondary-dark">
        {label}
      </Text>
      <Text className="text-sm font-medium text-text-primary dark:text-text-primary-dark">
        {value === null ? "—" : displayAmount(value, currency, locale)}
      </Text>
    </View>
  );
}

function PhysicalFacts({
  model,
}: {
  readonly model: MetalDetailReadModel;
}): React.JSX.Element {
  const { t, i18n } = useTranslation("metals");
  const locale = resolveLocale(i18n.resolvedLanguage);
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
              : formatWeight(model.weightGramsDecimal, locale, t("weight_unit"))
          }
        />
        <FactRow
          icon="shield-checkmark-outline"
          label={t("purity")}
          value={resolveDetailPurityLabel(model, t)}
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
  const colorScheme = useColorScheme();
  const iconColor =
    colorScheme === "dark" ? palette.nileGreen[400] : palette.nileGreen[700];
  return (
    <View
      accessible
      accessibilityLabel={t("detail.fact_accessibility", { label, value })}
      className="flex-row items-center gap-3"
    >
      <View className="h-9 w-9 items-center justify-center rounded-full bg-nileGreen-50 dark:bg-slate-800">
        <Ionicons name={icon} size={20} color={iconColor} />
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
}): React.JSX.Element | null {
  if (actions.length === 0) return null;
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

function resolveDetailPurityLabel(
  model: MetalDetailReadModel,
  t: (key: string) => string
): string {
  if (model.purityCatalogVersion !== "1" || model.purityCode === null)
    return "—";
  const purity = resolvePuritySelection(model.metalType, model.purityCode);
  if (
    !purity.available ||
    purity.entry.factorDecimal !== model.purityFactorDecimal
  ) {
    return "—";
  }
  return t(purity.entry.labelKey);
}

function physicalFormIcon(
  form: MetalDetailReadModel["itemForm"]
): keyof typeof Ionicons.glyphMap {
  if (form === "bar") return "cube-outline";
  if (form === "jewelry") return "diamond-outline";
  return "ellipse-outline";
}

function displayAmount(
  value: string,
  currency: string,
  locale: string
): string {
  try {
    return `${currency} ${formatCanonicalDecimalForDisplay(value, {
      locale,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  } catch {
    return "—";
  }
}

function signedAmount(value: string, currency: string, locale: string): string {
  const sign = getCurrencyDisplaySign(value);
  if (sign === null) return "—";
  const prefix = sign === "positive" ? "+ " : sign === "negative" ? "- " : "";
  const unsignedValue = value.startsWith("-") ? value.slice(1) : value;
  return `${prefix}${displayAmount(unsignedValue, currency, locale)}`;
}

function getGainTextClass(value: CurrencyDisplaySign | null): string {
  if (value === null || value === "zero") {
    return "text-text-secondary dark:text-text-secondary-dark";
  }
  return value === "positive"
    ? "text-nileGreen-700 dark:text-nileGreen-400"
    : "text-red-600 dark:text-red-500";
}

function resolveLocale(language: string | undefined): string {
  return language?.startsWith("ar") ? "ar-EG-u-nu-latn" : "en-GB";
}

function formatWeight(value: string, locale: string, unit: string): string {
  try {
    return `${formatCanonicalDecimalForDisplay(value, {
      locale,
      maximumFractionDigits: 3,
    })} ${unit}`;
  } catch {
    return "—";
  }
}

function formatShortDate(date: Date, locale: string): string {
  return date.toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTimestamp(date: Date, locale: string): string {
  const time = date.toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${formatShortDate(date, locale)}, ${time}`;
}
