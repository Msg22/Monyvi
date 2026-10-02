import React from "react";
import { Text, View } from "react-native";

import type {
  SmsEvaluationBatchTimingStatus,
  SmsEvaluationBatchTimingViewModel,
} from "./presentation";
import type { SmsProviderEvaluationStatus } from "./SmsProviderEvaluationOverview";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

function formatElapsedMs(elapsedMs: number): string {
  return (elapsedMs / 1_000).toFixed(1);
}

function statusClass(status: SmsEvaluationBatchTimingStatus): string {
  if (status === "completed") {
    return "text-nileGreen-600 dark:text-nileGreen-400";
  }
  if (status === "failed") return "text-red-600 dark:text-red-500";
  if (status === "cancelled") return "text-gold-600 dark:text-gold-400";
  return "text-slate-500 dark:text-slate-400";
}

function TimingRow({
  batch,
  t,
}: {
  readonly batch: SmsEvaluationBatchTimingViewModel;
  readonly t: TranslateFn;
}): React.JSX.Element {
  return (
    <View className="border-t border-slate-200 py-3 dark:border-slate-700">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-sm font-medium text-slate-900 dark:text-slate-25">
            {t("sms_provider_evaluation.timing.batch_label", {
              batch: batch.batchNumber,
              count: batch.messageCount,
            })}
          </Text>
          <Text className={`mt-1 text-xs ${statusClass(batch.status)}`}>
            {t(`sms_provider_evaluation.timing.status.${batch.status}`)}
          </Text>
        </View>
        <Text className="text-sm font-semibold text-slate-900 dark:text-slate-25">
          {batch.elapsedMs === undefined
            ? t("sms_provider_evaluation.timing.no_duration")
            : t("sms_provider_evaluation.timing.elapsed_seconds", {
                seconds: formatElapsedMs(batch.elapsedMs),
              })}
        </Text>
      </View>
    </View>
  );
}

export function SmsProviderEvaluationTiming({
  status,
  batches,
  runElapsedMs,
  t,
}: {
  readonly status: SmsProviderEvaluationStatus;
  readonly batches: readonly SmsEvaluationBatchTimingViewModel[];
  readonly runElapsedMs: number;
  readonly t: TranslateFn;
}): React.JSX.Element | null {
  if (status === "idle") return null;
  return (
    <View className="rounded-2xl bg-white p-4 dark:bg-slate-800">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-base font-semibold text-slate-900 dark:text-slate-25">
          {t("sms_provider_evaluation.timing.title")}
        </Text>
        <Text className="text-sm font-semibold text-slate-900 dark:text-slate-25">
          {t("sms_provider_evaluation.timing.total_elapsed", {
            seconds: formatElapsedMs(runElapsedMs),
          })}
        </Text>
      </View>
      <Text className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        {t("sms_provider_evaluation.timing.note")}
      </Text>
      <View className="mt-3">
        {batches.map((batch) => (
          <TimingRow key={batch.batchId} batch={batch} t={t} />
        ))}
      </View>
    </View>
  );
}
