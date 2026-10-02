import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

import type { SmsEvaluationSummaryViewModel } from "./presentation";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;
export type SmsProviderEvaluationStatus =
  | "idle"
  | "running"
  | "finished"
  | "cancelled"
  | "fatal";

export interface SmsProviderEvaluationDatasetSummary {
  readonly caseCount: number;
  readonly providerCount: number;
  readonly requestCount: number;
}

interface StatusPanelProps {
  readonly status: SmsProviderEvaluationStatus;
  readonly datasetSummary: SmsProviderEvaluationDatasetSummary;
  readonly activeBatchNumber: number | null;
  readonly processedCaseCount: number;
  readonly attemptedRequestCount: number;
  readonly totalBatchCount: number;
  readonly totalCaseCount: number;
  readonly fatalReason: string | null;
  readonly batchSize: number;
  readonly t: TranslateFn;
}

function statusTextClass(status: SmsProviderEvaluationStatus): string {
  if (status === "fatal") {
    return "text-xs font-semibold text-red-600 dark:text-red-500";
  }
  if (status === "cancelled") {
    return "text-xs font-semibold text-gold-600 dark:text-gold-400";
  }
  return "text-xs font-semibold text-nileGreen-600 dark:text-nileGreen-400";
}

function RunningStatusPanel(props: StatusPanelProps): React.JSX.Element {
  const progress =
    props.totalCaseCount > 0
      ? Math.min(100, (props.processedCaseCount / props.totalCaseCount) * 100)
      : 0;
  const currentBatch =
    props.activeBatchNumber ??
    Math.min(props.totalBatchCount, props.attemptedRequestCount);
  return (
    <View className="rounded-2xl bg-white p-4 dark:bg-slate-800">
      <Text className={statusTextClass("running")}>
        {props.t("sms_provider_evaluation.status.running")}
      </Text>
      <Text className="mt-4 text-xl font-bold text-slate-900 dark:text-slate-25">
        {props.t("sms_provider_evaluation.batch_progress", {
          current: currentBatch,
          total: props.totalBatchCount,
        })}
      </Text>
      <Text className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        {props.t("sms_provider_evaluation.message_progress", {
          current: props.processedCaseCount,
          total: props.totalCaseCount,
        })}
      </Text>
      <View className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <View
          className="h-2 rounded-full bg-nileGreen-600 dark:bg-nileGreen-400"
          style={{ width: `${progress}%` }}
        />
      </View>
      <Text className="mt-4 text-xs text-slate-500 dark:text-slate-400">
        {props.t("sms_provider_evaluation.sequential_note", {
          batchSize: props.batchSize,
        })}
      </Text>
    </View>
  );
}

function RestingStatusPanel(props: StatusPanelProps): React.JSX.Element {
  const statusKey = props.status === "fatal" ? "fatal" : props.status;
  const counts =
    props.status === "idle"
      ? props.t("sms_provider_evaluation.dataset_counts", {
          cases: props.datasetSummary.caseCount,
          providers: props.datasetSummary.providerCount,
          requests: props.datasetSummary.requestCount,
        })
      : props.t("sms_provider_evaluation.run_counts", {
          current: props.processedCaseCount,
          total: props.totalCaseCount,
          requests: props.attemptedRequestCount,
        });
  return (
    <View className="rounded-2xl bg-white p-4 dark:bg-slate-800">
      <Text className={statusTextClass(props.status)}>
        {props.t(`sms_provider_evaluation.status.${statusKey}`)}
      </Text>
      <Text className="mt-3 text-sm text-slate-600 dark:text-slate-300">
        {counts}
      </Text>
      {props.status === "fatal" && props.fatalReason ? (
        <Text className="mt-3 text-xs text-red-600 dark:text-red-500">
          {props.t("sms_provider_evaluation.test_stopped")}:{" "}
          {props.t(`sms_provider_evaluation.reasons.${props.fatalReason}`, {
            defaultValue: props.t("sms_provider_evaluation.reasons.unknown"),
          })}
        </Text>
      ) : null}
    </View>
  );
}

export function SmsProviderEvaluationStatusPanel(
  props: StatusPanelProps
): React.JSX.Element {
  return props.status === "running" ? (
    <RunningStatusPanel {...props} />
  ) : (
    <RestingStatusPanel {...props} />
  );
}

export function SmsProviderEvaluationSummary({
  summary,
  isCompact,
  t,
}: {
  readonly summary: SmsEvaluationSummaryViewModel;
  readonly isCompact: boolean;
  readonly t: TranslateFn;
}): React.JSX.Element {
  const layout = isCompact ? "gap-2" : "flex-row gap-2";
  const tile = isCompact ? "rounded-2xl p-4" : "flex-1 rounded-2xl p-4";
  return (
    <View className="gap-3">
      <View className={layout}>
        <SummaryTile
          className={`${tile} bg-nileGreen-50 dark:bg-nileGreen-900`}
          valueClassName="text-nileGreen-600 dark:text-nileGreen-400"
          value={summary.matched}
          label={t("sms_provider_evaluation.outcome.matched")}
        />
        <SummaryTile
          className={`${tile} bg-red-100 dark:bg-slate-800`}
          valueClassName="text-red-600 dark:text-red-500"
          value={summary.mismatched}
          label={t("sms_provider_evaluation.outcome.mismatched")}
        />
        <SummaryTile
          className={`${tile} bg-gold-100 dark:bg-gold-800/30`}
          valueClassName="text-gold-600 dark:text-gold-400"
          value={summary.notEvaluated}
          label={t("sms_provider_evaluation.outcome.not_evaluated")}
        />
      </View>
      <Text className="text-xs text-slate-600 dark:text-slate-300">
        {t("sms_provider_evaluation.result_counts", {
          transactions: summary.returnedTransactionCount,
          negatives: summary.correctNonTransactions,
        })}
      </Text>
      <Text className="text-xs text-slate-500 dark:text-slate-400">
        {t("sms_provider_evaluation.not_evaluated_accuracy_note")}
      </Text>
    </View>
  );
}

function SummaryTile({
  className,
  valueClassName,
  value,
  label,
}: {
  readonly className: string;
  readonly valueClassName: string;
  readonly value: number;
  readonly label: string;
}): React.JSX.Element {
  return (
    <View className={className}>
      <Text className={`text-2xl font-bold ${valueClassName}`}>{value}</Text>
      <Text className="mt-1 text-xs text-slate-600 dark:text-slate-300">
        {label}
      </Text>
    </View>
  );
}

export function SmsProviderEvaluationTab({
  label,
  isActive,
  onPress,
}: {
  readonly label: string;
  readonly isActive: boolean;
  readonly onPress: () => void;
}): React.JSX.Element {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      onPress={onPress}
      className={
        isActive
          ? "min-h-11 justify-center rounded-xl bg-nileGreen-50 px-3 dark:bg-nileGreen-900"
          : "min-h-11 justify-center rounded-xl bg-slate-100 px-3 dark:bg-slate-800"
      }
    >
      <Text
        className={
          isActive
            ? "text-xs font-semibold text-nileGreen-600 dark:text-nileGreen-400"
            : "text-xs font-semibold text-slate-600 dark:text-slate-300"
        }
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}
