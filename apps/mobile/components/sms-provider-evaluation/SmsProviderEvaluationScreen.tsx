import React, { useMemo, useState } from "react";
import {
  FlatList,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PageHeader } from "@/components/navigation/PageHeader";
import { shouldUseDenseRowCompactLayout } from "@/constants/ui";
import { SmsProviderEvaluationCaseCard } from "./SmsProviderEvaluationCaseCard";
import type {
  SmsEvaluationCaseViewModel,
  SmsEvaluationSummaryViewModel,
} from "./presentation";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;
type EvaluationStatus = "idle" | "running" | "finished" | "cancelled" | "fatal";
type ResultsTab = "all" | "issues";

export interface SmsProviderEvaluationDatasetSummary {
  readonly caseCount: number;
  readonly providerCount: number;
  readonly requestCount: number;
}

interface SmsProviderEvaluationScreenProps {
  readonly t: TranslateFn;
  readonly status: EvaluationStatus;
  readonly datasetSummary: SmsProviderEvaluationDatasetSummary;
  readonly summary: SmsEvaluationSummaryViewModel | null;
  readonly cases: readonly SmsEvaluationCaseViewModel[];
  readonly activeBatchNumber: number | null;
  readonly completedBatchCount: number;
  readonly processedCaseCount: number;
  readonly attemptedRequestCount: number;
  readonly totalBatchCount: number;
  readonly totalCaseCount: number;
  readonly fatalReason: string | null;
  readonly isStartReady: boolean;
  readonly onStart: () => void;
  readonly onCancel: () => void;
  readonly onBack: () => void;
}

function StatusCard({
  status,
  datasetSummary,
  activeBatchNumber,
  processedCaseCount,
  totalCaseCount,
  totalBatchCount,
  attemptedRequestCount,
  fatalReason,
  t,
}: Omit<
  SmsProviderEvaluationScreenProps,
  "summary" | "cases" | "completedBatchCount" | "isStartReady" | "onStart" | "onCancel" | "onBack"
>): React.JSX.Element {
  if (status === "running") {
    const progress =
      totalCaseCount > 0 ? Math.min(100, (processedCaseCount / totalCaseCount) * 100) : 0;
    return (
      <View className="rounded-2xl bg-white p-4 dark:bg-slate-800">
        <Text className="text-xs font-semibold text-nileGreen-600 dark:text-nileGreen-400">
          {t("sms_provider_evaluation.status.running")}
        </Text>
        <Text className="mt-4 text-xl font-bold text-slate-900 dark:text-slate-25">
          {t("sms_provider_evaluation.batch_progress", {
            current: activeBatchNumber ?? Math.min(totalBatchCount, attemptedRequestCount),
            total: totalBatchCount,
          })}
        </Text>
        <Text className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          {t("sms_provider_evaluation.message_progress", {
            current: processedCaseCount,
            total: totalCaseCount,
          })}
        </Text>
        <View className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <View
            className="h-2 rounded-full bg-nileGreen-600 dark:bg-nileGreen-400"
            style={{ width: `${progress}%` }}
          />
        </View>
        <Text className="mt-4 text-xs text-slate-500 dark:text-slate-400">
          {t("sms_provider_evaluation.sequential_note")}
        </Text>
      </View>
    );
  }

  const statusKey =
    status === "idle"
      ? "idle"
      : status === "finished"
        ? "finished"
        : status === "cancelled"
          ? "cancelled"
          : "fatal";

  return (
    <View className="rounded-2xl bg-white p-4 dark:bg-slate-800">
      <Text
        className={
          status === "fatal"
            ? "text-xs font-semibold text-red-600 dark:text-red-400"
            : status === "cancelled"
              ? "text-xs font-semibold text-gold-700 dark:text-gold-400"
              : "text-xs font-semibold text-nileGreen-600 dark:text-nileGreen-400"
        }
        accessibilityLiveRegion="polite"
      >
        {t(`sms_provider_evaluation.status.${statusKey}`)}
      </Text>
      <Text className="mt-3 text-sm text-slate-600 dark:text-slate-300">
        {t("sms_provider_evaluation.dataset_counts", {
          cases: datasetSummary.caseCount,
          providers: datasetSummary.providerCount,
          requests: datasetSummary.requestCount,
        })}
      </Text>
      {status === "fatal" && fatalReason ? (
        <Text className="mt-3 text-xs text-red-600 dark:text-red-400">
          {t("sms_provider_evaluation.test_stopped")}:{" "}
          {t(`sms_provider_evaluation.reasons.${fatalReason}`, {
            defaultValue: t("sms_provider_evaluation.reasons.unknown"),
          })}
        </Text>
      ) : null}
    </View>
  );
}

function SummaryTiles({
  summary,
  isCompact,
  t,
}: {
  readonly summary: SmsEvaluationSummaryViewModel;
  readonly isCompact: boolean;
  readonly t: TranslateFn;
}): React.JSX.Element {
  const tileLayout = isCompact ? "gap-2" : "flex-row gap-2";
  const tileClass = isCompact ? "rounded-2xl p-4" : "flex-1 rounded-2xl p-4";
  return (
    <View className={tileLayout}>
      <View className={`${tileClass} bg-nileGreen-50 dark:bg-nileGreen-900/30`}>
        <Text className="text-2xl font-bold text-nileGreen-600 dark:text-nileGreen-400">
          {summary.matched}
        </Text>
        <Text className="mt-1 text-xs text-slate-600 dark:text-slate-300">
          {t("sms_provider_evaluation.outcome.matched")}
        </Text>
      </View>
      <View className={`${tileClass} bg-red-100 dark:bg-red-900/30`}>
        <Text className="text-2xl font-bold text-red-600 dark:text-red-400">
          {summary.mismatched}
        </Text>
        <Text className="mt-1 text-xs text-slate-600 dark:text-slate-300">
          {t("sms_provider_evaluation.outcome.mismatched")}
        </Text>
      </View>
      <View className={`${tileClass} bg-gold-100 dark:bg-gold-900/30`}>
        <Text className="text-2xl font-bold text-gold-700 dark:text-gold-400">
          {summary.notEvaluated}
        </Text>
        <Text className="mt-1 text-xs text-slate-600 dark:text-slate-300">
          {t("sms_provider_evaluation.outcome.not_evaluated")}
        </Text>
      </View>
    </View>
  );
}

function TabButton({
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
          ? "min-h-11 justify-center rounded-xl bg-nileGreen-50 px-3 dark:bg-nileGreen-900/30"
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

export function SmsProviderEvaluationScreen({
  t,
  status,
  datasetSummary,
  summary,
  cases,
  activeBatchNumber,
  completedBatchCount,
  processedCaseCount,
  attemptedRequestCount,
  totalBatchCount,
  totalCaseCount,
  fatalReason,
  isStartReady,
  onStart,
  onCancel,
  onBack,
}: SmsProviderEvaluationScreenProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const isCompact = shouldUseDenseRowCompactLayout(width, fontScale);
  const [tab, setTab] = useState<ResultsTab>("all");
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );

  const visibleCases = useMemo(() => {
    const progressed =
      status === "running"
        ? cases.filter(({ finalClassification }) => finalClassification !== "unattempted")
        : cases;
    return tab === "all"
      ? progressed
      : progressed.filter(({ outcome }) => outcome !== "matched");
  }, [cases, status, tab]);

  const actionLabel =
    status === "running"
      ? t("sms_provider_evaluation.cancel_test")
      : status === "idle"
        ? t("sms_provider_evaluation.start_test")
        : t("sms_provider_evaluation.run_again");
  const actionDisabled = status !== "running" && !isStartReady;

  const listBottomClearance = 52 + 40 + insets.bottom + 24;

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-900">
      <PageHeader
        title={t("sms_provider_evaluation.title")}
        subtitle={t("sms_provider_evaluation.development_only")}
        variant="review"
        includeTopSafeAreaInset
        showBackButton
        onBack={onBack}
        backAccessibilityLabel={t("sms_provider_evaluation.back")}
      />

      <FlatList
        data={visibleCases}
        keyExtractor={(item) => item.caseId}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: listBottomClearance,
        }}
        ItemSeparatorComponent={() => <View className="h-3" />}
        ListHeaderComponent={
          <View className="mb-3 gap-4">
            <StatusCard
              status={status}
              datasetSummary={datasetSummary}
              activeBatchNumber={activeBatchNumber}
              completedBatchCount={completedBatchCount}
              processedCaseCount={processedCaseCount}
              attemptedRequestCount={attemptedRequestCount}
              totalBatchCount={totalBatchCount}
              totalCaseCount={totalCaseCount}
              fatalReason={fatalReason}
              t={t}
            />

            {summary ? (
              <>
                <SummaryTiles summary={summary} isCompact={isCompact} t={t} />
                <Text className="text-xs text-slate-600 dark:text-slate-300">
                  {t("sms_provider_evaluation.result_counts", {
                    transactions: summary.returnedTransactionCount,
                    negatives: summary.correctNonTransactions,
                  })}
                </Text>
                <Text className="text-xs text-slate-500 dark:text-slate-400">
                  {t("sms_provider_evaluation.not_evaluated_accuracy_note")}
                </Text>
              </>
            ) : (
              <View className="rounded-2xl bg-white p-4 dark:bg-slate-800">
                <Text className="text-sm font-semibold text-slate-900 dark:text-slate-25">
                  {t("sms_provider_evaluation.synthetic_only")}
                </Text>
                <Text className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {t("sms_provider_evaluation.nothing_saved")}
                </Text>
              </View>
            )}

            {summary ? (
              <View className="flex-row items-center justify-between gap-3">
                <Text className="flex-1 text-base font-semibold text-slate-900 dark:text-slate-25">
                  {t("sms_provider_evaluation.messages")}
                </Text>
                <View className="flex-row gap-2">
                  <TabButton
                    label={t("sms_provider_evaluation.all_tab", {
                      count: summary.caseCount,
                    })}
                    isActive={tab === "all"}
                    onPress={() => setTab("all")}
                  />
                  <TabButton
                    label={t("sms_provider_evaluation.issues_tab", {
                      count: summary.issueCount,
                    })}
                    isActive={tab === "issues"}
                    onPress={() => setTab("issues")}
                  />
                </View>
              </View>
            ) : null}

            {status === "running" ? (
              <Text className="text-xs text-slate-500 dark:text-slate-400">
                {t("sms_provider_evaluation.running_helper")}
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          summary && tab === "issues" ? (
            <View className="rounded-2xl bg-white p-4 dark:bg-slate-800">
              <Text className="text-sm text-slate-600 dark:text-slate-300">
                {t("sms_provider_evaluation.no_issues")}
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <SmsProviderEvaluationCaseCard
            item={item}
            isExpanded={expandedIds.has(item.caseId)}
            isCompact={isCompact}
            onToggle={() => {
              setExpandedIds((current) => {
                const next = new Set(current);
                if (next.has(item.caseId)) next.delete(item.caseId);
                else next.add(item.caseId);
                return next;
              });
            }}
            t={t}
          />
        )}
      />

      <View
        className="absolute bottom-0 start-0 end-0 border-t border-slate-200 bg-slate-50 px-5 pt-3 dark:border-slate-700 dark:bg-slate-900"
        style={{ paddingBottom: 20 + insets.bottom }}
      >
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          disabled={actionDisabled}
          onPress={status === "running" ? onCancel : onStart}
          className={
            status === "running"
              ? "min-h-[52px] items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800"
              : "min-h-[52px] items-center justify-center rounded-xl bg-nileGreen-600"
          }
          style={actionDisabled ? { opacity: 0.5 } : undefined}
        >
          <Text
            className={
              status === "running"
                ? "text-base font-semibold text-slate-900 dark:text-slate-25"
                : "text-base font-semibold text-slate-25"
            }
          >
            {actionLabel}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
