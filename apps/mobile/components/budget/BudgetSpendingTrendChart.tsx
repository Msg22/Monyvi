import type {
  BudgetDetailPaceState,
  BudgetDetailWeek,
} from "@/contracts/budget-detail-presentation";
import { useLocale } from "@/context/LocaleContext";
import type { CurrencyType } from "@monyvi/db";
import { formatCurrency } from "@monyvi/logic";
import React, { useEffect } from "react";
import { FlatList, I18nManager, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useTranslation } from "react-i18next";

interface BudgetSpendingTrendChartProps {
  readonly data: readonly BudgetDetailWeek[];
  readonly currency: CurrencyType;
  readonly paceState: BudgetDetailPaceState | null;
}

const CHART_HEIGHT = 132;
const BAR_MAX_HEIGHT = 104;
const WEEK_WIDTH = 88;
const BAR_WIDTH = 28;

export function BudgetSpendingTrendChart({
  data,
  currency,
  paceState,
}: BudgetSpendingTrendChartProps): React.JSX.Element {
  const { t } = useTranslation("budgets");
  const { language } = useLocale();
  const maxAmount = Math.max(
    ...data.flatMap((week) => [week.actualAmount, week.paceAmount]),
    1
  );
  const contentWidth = Math.max(data.length * WEEK_WIDTH, 264);
  const insight = getPaceInsight(paceState, t);

  return (
    <View
      testID="budget-spending-trend-chart"
      className="mx-5 mb-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
    >
      <View className="mb-3 flex-row flex-wrap items-center justify-between gap-2">
        <Text
          accessible
          accessibilityLabel={t("detail.accessibility.chart_summary", {
            defaultValue: `Weekly spending trend. ${data.length} weeks.`,
          })}
          className="text-base font-semibold text-text-primary dark:text-text-primary-dark"
        >
          {t("detail.trend.title", { defaultValue: "Weekly spending trend" })}
        </Text>
        <View className="flex-row items-center gap-4">
          <Legend
            label={t("detail.trend.you_spent", { defaultValue: "You spent" })}
            kind="actual"
          />
          <Legend
            label={t("detail.trend.budget_pace", {
              defaultValue: "Budget pace",
            })}
            kind="pace"
          />
        </View>
      </View>

      <View className="flex-row">
        <View
          testID="budget-trend-y-axis"
          className="w-[70px] justify-between pb-12 pe-2"
          style={{ height: CHART_HEIGHT + 48 }}
        >
          <AxisLabel amount={maxAmount} currency={currency} />
          <AxisLabel amount={maxAmount / 2} currency={currency} />
          <AxisLabel amount={0} currency={currency} />
        </View>
        <View
          testID="budget-trend-scroll-content"
          className={`flex-1 border-b border-slate-200 dark:border-slate-700 ${I18nManager.isRTL ? "flex-row-reverse" : "flex-row"}`}
        >
          <FlatList
            testID="budget-trend-scroll"
            data={data}
            horizontal
            showsHorizontalScrollIndicator={false}
            inverted={I18nManager.isRTL}
            className="flex-1"
            contentContainerStyle={{
              width: contentWidth,
              height: CHART_HEIGHT + 48,
            }}
            getItemLayout={(_, index) => ({
              length: WEEK_WIDTH,
              offset: WEEK_WIDTH * index,
              index,
            })}
            keyExtractor={(week) => week.id}
            renderItem={({ item: week, index }) => (
              <WeekColumn
                week={week}
                index={index}
                maxAmount={maxAmount}
                currency={currency}
                language={language}
              />
            )}
          />
        </View>
      </View>

      {insight ? (
        <View className="mt-3 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
          <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">
            {insight}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function WeekColumn({
  week,
  index,
  maxAmount,
  currency,
  language,
}: {
  readonly week: BudgetDetailWeek;
  readonly index: number;
  readonly maxAmount: number;
  readonly currency: CurrencyType;
  readonly language: string;
}): React.JSX.Element {
  const { t } = useTranslation("budgets");
  const actualHeight =
    week.actualAmount > 0
      ? Math.max((week.actualAmount / maxAmount) * BAR_MAX_HEIGHT, 2)
      : 0;
  const paceHeight =
    week.paceAmount > 0
      ? Math.max((week.paceAmount / maxAmount) * BAR_MAX_HEIGHT, 2)
      : 0;
  const locale = language === "ar" ? "ar-EG" : "en-US";
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  });
  const amount = (value: number): string =>
    formatCurrency({ amount: value, currency });
  const weekLabel = t("detail.trend.week_label", {
    defaultValue: `Week ${index + 1}`,
    index: index + 1,
  });
  const dateRange = `${dateFormatter.format(week.start)}–${dateFormatter.format(week.end)}`;

  return (
    <View
      testID={`budget-trend-week-${week.id}`}
      accessible
      accessibilityLabel={t("detail.accessibility.week_summary", {
        defaultValue: `${weekLabel}. You spent ${amount(week.actualAmount)}. Budget pace ${amount(week.paceAmount)}.`,
        week: weekLabel,
        dateRange,
        spent: amount(week.actualAmount),
        pace: amount(week.paceAmount),
      })}
      className="items-center justify-end"
      style={{ width: WEEK_WIDTH, height: CHART_HEIGHT + 48 }}
    >
      <View
        className="flex-row items-end gap-2"
        style={{ height: CHART_HEIGHT }}
      >
        <View
          className="items-center justify-end"
          style={{ height: CHART_HEIGHT, width: BAR_WIDTH }}
        >
          <Text
            className="absolute text-center text-[9px] font-medium text-text-secondary dark:text-text-secondary-dark"
            style={{ bottom: actualHeight + 3 }}
          >
            {amount(week.actualAmount)}
          </Text>
          <AnimatedActualBar height={actualHeight} />
        </View>
        <View
          className="justify-end"
          style={{ height: CHART_HEIGHT, width: BAR_WIDTH }}
        >
          {paceHeight > 0 ? (
            <View
              className="rounded-t border-2 border-dashed border-slate-500 dark:border-slate-400"
              style={{ height: paceHeight, width: BAR_WIDTH }}
            />
          ) : null}
        </View>
      </View>
      <Text className="mt-2 text-xs font-medium text-text-secondary dark:text-text-secondary-dark">
        {weekLabel.replace("Week ", "W")}
      </Text>
      <Text className="mt-0.5 text-[10px] text-text-muted dark:text-text-muted-dark">
        {dateRange}
      </Text>
    </View>
  );
}

function AnimatedActualBar({
  height,
}: {
  readonly height: number;
}): React.JSX.Element | null {
  const prefersReducedMotion = useReducedMotion();
  const animatedHeight = useSharedValue(prefersReducedMotion ? height : 0);

  useEffect(() => {
    animatedHeight.value = prefersReducedMotion
      ? height
      : withTiming(height, { duration: 220, easing: Easing.out(Easing.cubic) });
    return () => cancelAnimation(animatedHeight);
  }, [animatedHeight, height, prefersReducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: animatedHeight.value,
  }));
  if (height <= 0) return null;
  return (
    <Animated.View
      className="rounded-t bg-nileGreen-700 dark:bg-nileGreen-400"
      style={[{ width: BAR_WIDTH }, animatedStyle]}
    />
  );
}

function AxisLabel({
  amount,
  currency,
}: {
  readonly amount: number;
  readonly currency: CurrencyType;
}): React.JSX.Element {
  return (
    <Text className="text-[10px] text-text-muted dark:text-text-muted-dark">
      {formatCurrency({ amount, currency })}
    </Text>
  );
}

function Legend({
  label,
  kind,
}: {
  readonly label: string;
  readonly kind: "actual" | "pace";
}): React.JSX.Element {
  return (
    <View className="flex-row items-center gap-1.5">
      <Text className="text-[10px] text-text-secondary dark:text-text-secondary-dark">
        {label}
      </Text>
      <View
        className={
          kind === "actual"
            ? "h-1.5 w-7 rounded-full bg-nileGreen-700 dark:bg-nileGreen-400"
            : "h-1.5 w-7 rounded border border-dashed border-slate-500 dark:border-slate-400"
        }
      />
    </View>
  );
}

function getPaceInsight(
  paceState: BudgetDetailPaceState | null,
  translate: ReturnType<typeof useTranslation>["t"]
): string | null {
  if (paceState === null) return null;
  const defaults = {
    BELOW: "Below budget pace",
    ON: "On budget pace",
    ABOVE: "Above budget pace",
  } as const;
  return translate(`detail.trend.${paceState.toLowerCase()}`, {
    defaultValue: defaults[paceState],
  });
}
