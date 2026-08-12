import { palette } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import type { SmsScanProgress as SmsScanProgressData } from "@/services/sms-sync-service";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn, FadeInDown, ZoomIn } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

const RING_SIZE = 120;
const RING_STROKE_WIDTH = 10;
const RING_RADIUS = (RING_SIZE - RING_STROKE_WIDTH) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

type TranslationFn = (key: string, opts?: Record<string, unknown>) => string;

export function ScanningState({
  progress,
  t,
}: {
  readonly progress: SmsScanProgressData | null;
  readonly t: TranslationFn;
}): React.JSX.Element {
  const scanned = progress?.messagesScanned ?? 0;
  const total = progress?.totalMessages ?? 0;
  const found = progress?.transactionsFound ?? 0;
  const phase = progress?.currentPhase ?? "filtering";
  const scanStartedAt = progress?.scanStartedAt;
  const aiChunksCompleted = progress?.aiChunksCompleted ?? 0;
  const aiChunksTotal = progress?.aiChunksTotal;
  const estimatedRemainingMs = progress?.estimatedRemainingMs;
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (scanStartedAt === undefined) return;

    setElapsedMs(Date.now() - scanStartedAt);
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - scanStartedAt);
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [scanStartedAt]);

  let percentage = 0;
  if (phase === "filtering" && total > 0) {
    percentage = Math.round((scanned / total) * 50);
  } else if (phase === "ai-parsing") {
    const aiTotal = aiChunksTotal !== undefined && aiChunksTotal > 0 ? aiChunksTotal : 1;
    percentage = 50 + Math.round((aiChunksCompleted / aiTotal) * 50);
  } else if (phase === "complete") {
    percentage = 100;
  }

  const statusText =
    phase === "ai-parsing" ? t("scanning_analyzing") : t("scanning_messages");
  const senderName = progress?.currentSender ?? "";
  const batchCounterText =
    phase === "ai-parsing" && aiChunksTotal !== undefined && aiChunksTotal > 0
      ? t("analyzing_batch", {
          current:
            aiChunksCompleted + (aiChunksCompleted < aiChunksTotal ? 1 : 0),
          total: aiChunksTotal,
        })
      : undefined;

  return (
    <Animated.View entering={FadeIn.duration(400)} className="flex-1">
      <View className="bg-white dark:bg-slate-800 rounded-3xl p-6 items-center mt-2">
        <CircularProgressRing percentage={percentage} />

        <Text className="text-lg font-semibold text-slate-800 dark:text-white mt-4">
          {statusText}
        </Text>

        {batchCounterText !== undefined && (
          <Text className="text-sm text-slate-400 mt-1">
            {batchCounterText}
          </Text>
        )}

        {senderName.length > 0 && (
          <View className="flex-row items-center mt-1">
            <Ionicons
              name="business-outline"
              size={14}
              color={palette.slate[400]}
            />
            <Text className="text-sm text-slate-400 ms-1">
              {t("reading_from", { sender: senderName })}
            </Text>
          </View>
        )}

        <View className="flex-row items-center mt-3 gap-4">
          <View className="flex-row items-center">
            <Ionicons
              name="time-outline"
              size={14}
              color={palette.slate[500]}
            />
            <Text className="text-xs text-slate-500 ms-1">
              {t("elapsed", { duration: formatDuration(elapsedMs, t) })}
            </Text>
          </View>

          {estimatedRemainingMs !== undefined && estimatedRemainingMs > 0 && (
            <View className="flex-row items-center">
              <Ionicons
                name="hourglass-outline"
                size={14}
                color={palette.nileGreen[400]}
              />
              <Text
                className="text-xs ms-1"
                // eslint-disable-next-line react-native/no-inline-styles
                style={{ color: palette.nileGreen[400] }}
              >
                {t("estimated_remaining", {
                  duration: formatDuration(estimatedRemainingMs, t),
                })}
              </Text>
            </View>
          )}
        </View>
      </View>

      <View className="flex-row gap-3 mt-3">
        <StatCard
          icon="mail-outline"
          label={t("scanned_label")}
          value={scanned}
          total={total}
          sublabel={t("messages_label")}
        />
        <StatCard
          icon="receipt-outline"
          label={t("found_label")}
          value={found}
          sublabel={t("transactions_label")}
          valueColor={palette.nileGreen[400]}
        />
      </View>

      <View className="bg-white dark:bg-slate-800 rounded-3xl p-5 mt-3">
        <Text className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
          {t("pipeline_status")}
        </Text>

        <PipelineStep
          label={t("pipeline_step_permissions")}
          status="completed"
          statusLabel={t("pipeline_completed")}
          isLast={false}
        />
        <PipelineStep
          label={t("pipeline_step_filtering")}
          status={
            phase === "filtering"
              ? "active"
              : phase === "ai-parsing" || phase === "complete"
                ? "completed"
                : "pending"
          }
          statusLabel={
            phase === "filtering"
              ? t("pipeline_processing")
              : phase === "ai-parsing" || phase === "complete"
                ? t("pipeline_completed")
                : t("pipeline_waiting")
          }
          isLast={false}
        />
        <PipelineStep
          label={t("pipeline_step_ai")}
          status={
            phase === "ai-parsing"
              ? "active"
              : phase === "complete"
                ? "completed"
                : "pending"
          }
          statusLabel={
            phase === "ai-parsing"
              ? t("pipeline_processing")
              : phase === "complete"
                ? t("pipeline_completed")
                : t("pipeline_waiting")
          }
          isLast
        />
      </View>
    </Animated.View>
  );
}

export function ScanHintText({
  progress,
  t,
}: {
  readonly progress: SmsScanProgressData | null;
  readonly t: TranslationFn;
}): React.JSX.Element {
  const phase = progress?.currentPhase ?? "filtering";
  const aiChunksCompleted = progress?.aiChunksCompleted ?? 0;
  const aiChunksTotal = progress?.aiChunksTotal;

  let hint: string;

  if (phase === "filtering") {
    hint = t("scan_hint_filtering");
  } else if (phase === "ai-parsing") {
    if (aiChunksCompleted === 0) {
      hint = t("scan_hint_ai_start");
    } else if (aiChunksTotal !== undefined && aiChunksTotal > 0) {
      const pctComplete = Math.round((aiChunksCompleted / aiChunksTotal) * 100);
      hint = t("scan_hint_ai_progress", { percent: pctComplete });
    } else {
      hint = t("scan_hint_ai_analyzing");
    }
  } else {
    hint = t("scan_hint_wrapping");
  }

  return (
    <Text className="text-xs text-slate-500 text-center mt-4 mb-[10px]">
      {hint}
    </Text>
  );
}

export function SuccessState({
  transactionsFound,
  totalScanned,
  durationMs,
  topCategories,
  categoryNameMap,
  onReviewPress,
  onBackPress,
  t,
  isScrollable = false,
}: {
  readonly transactionsFound: number;
  readonly totalScanned: number;
  readonly durationMs: number;
  readonly topCategories: readonly string[];
  readonly categoryNameMap: ReadonlyMap<string, string>;
  readonly onReviewPress: () => void;
  readonly onBackPress: () => void;
  readonly t: TranslationFn;
  readonly isScrollable?: boolean;
}): React.JSX.Element {
  const durationLabel = formatDuration(durationMs, t);

  return (
    <Animated.View
      entering={ZoomIn.springify()}
      className={isScrollable ? undefined : "flex-1"}
    >
      <View className="items-center mt-6">
        <View
          className="w-24 h-24 rounded-full items-center justify-center"
          // eslint-disable-next-line react-native/no-inline-styles
          style={{ backgroundColor: `${palette.nileGreen[500]}15` }}
        >
          <View
            className="w-16 h-16 rounded-full items-center justify-center"
            // eslint-disable-next-line react-native/no-inline-styles
            style={{ backgroundColor: palette.nileGreen[900] }}
          >
            <Ionicons
              name="checkmark-circle"
              size={40}
              color={palette.nileGreen[500]}
            />
          </View>
        </View>

        <Text className="text-2xl font-bold text-slate-800 dark:text-white mt-5">
          {t("scan_complete")}
        </Text>
        <Text className="text-sm text-slate-400 mt-1">
          {t("messages_analyzed")}
        </Text>
      </View>

      <View className="bg-white dark:bg-slate-800 rounded-3xl mt-6">
        <SummaryRow
          label={t("messages_scanned")}
          value={totalScanned.toLocaleString()}
        />
        <SummaryRow
          label={t("transactions_found")}
          value={transactionsFound.toString()}
          valueColor={palette.nileGreen[400]}
        />
        <SummaryRow label={t("time_taken")} value={durationLabel} isLast />
      </View>

      {topCategories.length > 0 && (
        <Animated.View entering={FadeInDown.delay(300)} className="mt-5 ms-2">
          <Text className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            {t("identified_categories")}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {topCategories.map((cat) => (
              <CategoryChip
                key={cat}
                name={cat}
                categoryNameMap={categoryNameMap}
              />
            ))}
          </View>
        </Animated.View>
      )}

      <View className={isScrollable ? "mt-6 pb-2" : "flex-1 justify-end pb-6"}>
        <TouchableOpacity
          onPress={onReviewPress}
          activeOpacity={0.85}
          className="w-full py-4 rounded-2xl items-center mb-3"
          // eslint-disable-next-line react-native/no-inline-styles
          style={{
            backgroundColor: palette.nileGreen[500],
            shadowColor: palette.nileGreen[500],
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 12,
            elevation: 8,
          }}
        >
          <Text className="text-white text-base font-bold">
            {t("review_transactions", { count: transactionsFound })}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onBackPress}
          activeOpacity={0.7}
          className="w-full py-3 items-center"
        >
          <Text className="text-slate-400 text-sm">
            {t("back_to_dashboard")}
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

export function EmptyState({
  totalScanned,
  onBackPress,
  t,
}: {
  readonly totalScanned: number;
  readonly onBackPress: () => void;
  readonly t: TranslationFn;
}): React.JSX.Element {
  return (
    <Animated.View
      entering={FadeInDown.springify()}
      className="flex-1 items-center justify-center"
    >
      <View className="w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center mb-6">
        <Ionicons name="search-outline" size={40} color={palette.slate[400]} />
      </View>

      <Text className="text-xl font-bold text-slate-800 dark:text-white mb-2">
        {t("no_transactions_found")}
      </Text>
      <Text className="text-sm text-slate-400 text-center mb-4">
        {t("scanned_count", { count: totalScanned })}
      </Text>

      <View className="bg-white dark:bg-slate-800 rounded-2xl p-4 w-full mb-8">
        <Text className="text-sm font-semibold text-slate-300 mb-3">
          {t("possible_reasons")}
        </Text>
        <ReasonBullet text={t("reason_no_bank_sms")} />
        <ReasonBullet text={t("reason_old_or_synced")} />
        <ReasonBullet text={t("reason_unrecognized_format")} />
      </View>

      <View className="w-full">
        <TouchableOpacity
          onPress={onBackPress}
          activeOpacity={0.85}
          className="w-full py-4 rounded-2xl bg-slate-100 dark:bg-slate-800 items-center"
        >
          <Text className="text-slate-300 text-sm font-semibold">
            {t("back_to_dashboard")}
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

export function ErrorState({
  error,
  onRetryPress,
  onBackPress,
  t,
}: {
  readonly error: string | null;
  readonly onRetryPress: () => void;
  readonly onBackPress: () => void;
  readonly t: TranslationFn;
}): React.JSX.Element {
  return (
    <Animated.View
      entering={FadeInDown.springify()}
      className="flex-1 items-center justify-center"
    >
      <View
        className="w-20 h-20 rounded-full items-center justify-center mb-6"
        // eslint-disable-next-line react-native/no-inline-styles
        style={{ backgroundColor: `${palette.red[500]}20` }}
      >
        <Ionicons name="warning-outline" size={36} color={palette.red[500]} />
      </View>

      <Text className="text-xl font-bold text-slate-800 dark:text-white mb-2">
        {t("scan_failed")}
      </Text>

      <View className="bg-white dark:bg-slate-800 rounded-2xl p-4 w-full mb-4">
        <View className="flex-row items-start">
          <View className="w-2 h-2 rounded-full mt-1.5 me-2 bg-red-500" />
          <Text className="text-sm text-slate-300 flex-1 leading-5">
            {error ?? t("scan_error_default")}
          </Text>
        </View>
      </View>

      <Text className="text-sm text-slate-400 text-center mb-8 px-4">
        {t("check_permissions")}
      </Text>

      <View className="w-full">
        <TouchableOpacity
          onPress={onRetryPress}
          activeOpacity={0.85}
          className="w-full py-4 rounded-2xl items-center mb-3"
          // eslint-disable-next-line react-native/no-inline-styles
          style={{ backgroundColor: palette.nileGreen[500] }}
        >
          <Text className="text-white text-sm font-bold">{t("try_again")}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onBackPress}
          activeOpacity={0.85}
          className="w-full py-4 rounded-2xl bg-slate-100 dark:bg-slate-800 items-center"
        >
          <Text className="text-slate-300 text-sm font-semibold">
            {t("back_to_dashboard")}
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

function CircularProgressRing({
  percentage,
}: {
  readonly percentage: number;
}): React.JSX.Element {
  const clampedPercentage = Math.min(100, Math.max(0, percentage));
  const strokeDashoffset =
    RING_CIRCUMFERENCE - (clampedPercentage / 100) * RING_CIRCUMFERENCE;

  return (
    <View
      className="items-center justify-center"
      style={{ width: RING_SIZE, height: RING_SIZE }}
    >
      <Svg width={RING_SIZE} height={RING_SIZE}>
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={palette.slate[700]}
          strokeWidth={RING_STROKE_WIDTH}
          fill="transparent"
        />
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={palette.nileGreen[500]}
          strokeWidth={RING_STROKE_WIDTH}
          fill="transparent"
          strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation={-90}
          origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
        />
      </Svg>
      <View className="absolute items-center justify-center">
        <Text className="text-3xl font-extrabold text-slate-800 dark:text-white">
          {clampedPercentage}%
        </Text>
      </View>
    </View>
  );
}

function StatCard({
  icon,
  label,
  value,
  total,
  sublabel,
  valueColor,
}: {
  readonly icon: "mail-outline" | "receipt-outline";
  readonly label: string;
  readonly value: number;
  readonly total?: number;
  readonly sublabel: string;
  readonly valueColor?: string;
}): React.JSX.Element {
  const { isDark } = useTheme();
  const defaultValueColor = isDark ? palette.slate[25] : palette.slate[800];

  return (
    <View className="flex-1 bg-white dark:bg-slate-800 rounded-3xl p-4 border border-slate-200 dark:border-transparent">
      <View
        className="w-10 h-10 rounded-xl items-center justify-center mb-3"
        // eslint-disable-next-line react-native/no-inline-styles
        style={{ backgroundColor: `${palette.nileGreen[500]}15` }}
      >
        <Ionicons name={icon} size={20} color={palette.nileGreen[400]} />
      </View>
      <Text className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
        {label}
      </Text>
      <Text
        className="text-2xl font-bold"
        // eslint-disable-next-line react-native/no-inline-styles
        style={{ color: valueColor ?? defaultValueColor }}
      >
        {value.toLocaleString()}
        {total !== undefined && (
          <Text className="text-sm text-slate-500">
            {" / "}
            {total.toLocaleString()}
          </Text>
        )}
      </Text>
      <Text className="text-xs text-slate-400">{sublabel}</Text>
    </View>
  );
}

function PipelineStep({
  label,
  status,
  statusLabel,
  isLast,
}: {
  readonly label: string;
  readonly status: "completed" | "active" | "pending";
  readonly statusLabel: string;
  readonly isLast: boolean;
}): React.JSX.Element {
  const statusColor =
    status === "completed" || status === "active"
      ? palette.nileGreen[400]
      : palette.slate[500];
  const textColor =
    status === "pending" ? "text-slate-500" : "text-slate-800 dark:text-white";

  return (
    <View className="flex-row">
      <View className="items-center me-3" style={{ width: 24 }}>
        {status === "completed" ? (
          <View
            className="w-6 h-6 rounded-full items-center justify-center"
            // eslint-disable-next-line react-native/no-inline-styles
            style={{ backgroundColor: palette.nileGreen[500] }}
          >
            <Ionicons name="checkmark" size={14} color={palette.slate[25]} />
          </View>
        ) : status === "active" ? (
          <View
            className="w-6 h-6 rounded-full items-center justify-center"
            // eslint-disable-next-line react-native/no-inline-styles
            style={{
              backgroundColor: palette.nileGreen[900],
              borderWidth: 2,
              borderColor: palette.nileGreen[500],
            }}
          >
            <View
              className="w-2 h-2 rounded-full"
              // eslint-disable-next-line react-native/no-inline-styles
              style={{ backgroundColor: palette.nileGreen[500] }}
            />
          </View>
        ) : (
          <View
            className="w-6 h-6 rounded-full"
            // eslint-disable-next-line react-native/no-inline-styles
            style={{
              borderWidth: 2,
              borderColor: palette.slate[600],
              backgroundColor: "transparent",
            }}
          />
        )}

        {!isLast && (
          <View
            className="flex-1"
            // eslint-disable-next-line react-native/no-inline-styles
            style={{
              width: 2,
              backgroundColor:
                status === "completed"
                  ? palette.nileGreen[500]
                  : palette.slate[700],
              minHeight: 24,
            }}
          />
        )}
      </View>

      <View className="flex-1 pb-5">
        <Text className={`text-sm font-medium ${textColor}`}>{label}</Text>
        <Text className="text-xs mt-0.5" style={{ color: statusColor }}>
          {statusLabel}
        </Text>
      </View>
    </View>
  );
}

function SummaryRow({
  label,
  value,
  valueColor,
  isLast,
}: {
  readonly label: string;
  readonly value: string;
  readonly valueColor?: string;
  readonly isLast?: boolean;
}): React.JSX.Element {
  const { isDark } = useTheme();
  const defaultValueColor = isDark ? palette.slate[25] : palette.slate[800];

  return (
    <View
      className={`flex-row items-center justify-between px-5 py-4 ${
        !isLast ? "border-b border-slate-200 dark:border-slate-700" : ""
      }`}
    >
      <Text className="text-sm text-slate-400">{label}</Text>
      <Text
        className="text-base font-bold"
        // eslint-disable-next-line react-native/no-inline-styles
        style={{ color: valueColor ?? defaultValueColor }}
      >
        {value}
      </Text>
    </View>
  );
}

function CategoryChip({
  name,
  categoryNameMap,
}: {
  readonly name: string;
  readonly categoryNameMap: ReadonlyMap<string, string>;
}): React.JSX.Element {
  const displayName = formatCategoryName(name, categoryNameMap);
  const icon = getCategoryIcon(name);

  return (
    <View className="flex-row items-center bg-slate-100 dark:bg-slate-800 rounded-xl px-3 py-2">
      <Ionicons name={icon} size={14} color={palette.nileGreen[400]} />
      <Text className="text-xs text-slate-800 dark:text-white ms-1.5">
        {displayName}
      </Text>
    </View>
  );
}

function ReasonBullet({ text }: { readonly text: string }): React.JSX.Element {
  return (
    <View className="flex-row items-start mb-2">
      <View
        className="w-1.5 h-1.5 rounded-full mt-1.5 me-2"
        // eslint-disable-next-line react-native/no-inline-styles
        style={{ backgroundColor: palette.nileGreen[400] }}
      />
      <Text className="text-sm text-slate-400 flex-1">{text}</Text>
    </View>
  );
}

function formatDuration(ms: number, t: TranslationFn): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) return t("duration_seconds", { count: totalSeconds });
  const minutes = Math.floor(totalSeconds / 60);
  const remainderSec = totalSeconds % 60;
  return remainderSec > 0
    ? t("duration_minutes_seconds", { minutes, seconds: remainderSec })
    : t("duration_minutes", { count: minutes });
}

function formatCategoryName(
  systemName: string,
  categoryNameMap: ReadonlyMap<string, string>
): string {
  const dbName = categoryNameMap.get(systemName);
  if (dbName) return dbName;

  return systemName
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getCategoryIcon(
  systemName: string
): React.ComponentProps<typeof Ionicons>["name"] {
  if (systemName.startsWith("food")) return "restaurant-outline";
  if (systemName.startsWith("shopping")) return "bag-outline";
  if (systemName.startsWith("transport")) return "car-outline";
  if (systemName.startsWith("bills")) return "receipt-outline";
  if (systemName.startsWith("entertainment")) return "game-controller-outline";
  if (systemName.startsWith("health")) return "medkit-outline";
  if (systemName.startsWith("education")) return "school-outline";
  if (systemName.startsWith("income")) return "wallet-outline";
  if (systemName.startsWith("transfer")) return "swap-horizontal-outline";
  if (systemName.startsWith("personal")) return "sparkles-outline";
  if (systemName.startsWith("gift")) return "gift-outline";
  return "pricetag-outline";
}
