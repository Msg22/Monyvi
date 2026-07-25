/**
 * SmsScanProgress Component
 *
 * Presentational shell for the SMS scanning pipeline. Route containers provide
 * all data and callbacks; state-specific rendering lives in sibling parts.
 *
 * @module SmsScanProgress
 */

import { palette } from "@/constants/colors";
import type { SmsScanProgress as SmsScanProgressData } from "@/services/sms-sync-service";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import {
  EmptyState,
  ErrorState,
  ScanHintText,
  ScanningState,
  SuccessState,
} from "./SmsScanProgressParts";
import { SmsScanScopeNotice } from "./SmsScanScopeNotice";
import { PartialSmsResultsNotice } from "@/components/transaction-review/PartialSmsResultsNotice";
import type { SmsScanSafeguardSummary } from "@/services/sms-parser-orchestrator";
import type { SmsSafeguardQaDiagnosticsViewModel } from "@/services/sms-safeguard-qa-diagnostics-service";
import { SafeguardQaDiagnosticsPanel } from "./SafeguardQaDiagnosticsPanel";

interface SmsScanProgressProps {
  /** Current scan status */
  readonly status: "idle" | "scanning" | "complete" | "error";
  /** Live progress data during scanning */
  readonly progress: SmsScanProgressData | null;
  /** Number of transactions found */
  readonly transactionsFound: number;
  /** Total messages scanned */
  readonly totalScanned: number;
  /** Duration of completed scan in milliseconds */
  readonly durationMs: number;
  /** Top category system names detected (for success state) */
  readonly topCategories: readonly string[];
  /** System category name to display label mapping */
  readonly categoryNameMap: ReadonlyMap<string, string>;
  readonly safeguardSummary: SmsScanSafeguardSummary;
  readonly retryableCount?: number;
  readonly qaDiagnostics?: SmsSafeguardQaDiagnosticsViewModel | null;
  /** Error message if scan failed */
  readonly error: string | null;
  /** Called when user taps "Review Transactions" */
  readonly onReviewPress: () => void;
  /** Called when user taps "Back to Dashboard" (empty/error state) */
  readonly onBackPress: () => void;
  /** Called when user taps "Retry" after error */
  readonly onRetryPress: () => void;
}

export function SmsScanProgress({
  status,
  progress,
  transactionsFound,
  totalScanned,
  durationMs,
  topCategories,
  categoryNameMap,
  safeguardSummary,
  retryableCount = 0,
  qaDiagnostics = null,
  error,
  onReviewPress,
  onBackPress,
  onRetryPress,
}: SmsScanProgressProps): React.JSX.Element {
  const { t } = useTranslation("transactions");
  const translate = (key: string, opts?: Record<string, unknown>): string =>
    t(key, opts);
  const shouldUseScrollableCompleteState =
    status === "complete" &&
    transactionsFound > 0 &&
    (qaDiagnostics !== null || safeguardSummary.completionStatus === "partial");

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-900">
      <View className="flex-row items-center px-4 pt-2 pb-3">
        <TouchableOpacity
          onPress={onBackPress}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          className="w-10 h-10 items-center justify-center"
        >
          <Ionicons name="chevron-back" size={24} color={palette.slate[400]} />
        </TouchableOpacity>
        <Text className="flex-1 text-center text-base font-bold text-slate-800 dark:text-white -ms-10">
          {translate("sms_scan_header")}
        </Text>
      </View>

      <SmsScanScopeNotice label={translate("sms_scan_scope_last_30_days")} />

      {status === "scanning" ? (
        <ScrollView
          className="flex-1 px-4"
          showsVerticalScrollIndicator={false}
        >
          <ScanningState progress={progress} t={translate} />
        </ScrollView>
      ) : shouldUseScrollableCompleteState ? (
        <ScrollView
          testID="sms-scan-complete-scroll"
          className="flex-1"
          showsVerticalScrollIndicator={false}
        >
          <View className="px-4 pb-6">
            <SuccessState
              transactionsFound={transactionsFound}
              totalScanned={totalScanned}
              durationMs={durationMs}
              topCategories={topCategories}
              categoryNameMap={categoryNameMap}
              onReviewPress={onReviewPress}
              onBackPress={onBackPress}
              t={translate}
              isScrollable
            />
            {safeguardSummary.completionStatus === "partial" && (
              <PartialSmsResultsNotice
                safeguardSummary={safeguardSummary}
                retryableCount={retryableCount}
                canRetry={retryableCount > 0}
                isRetrying={false}
                hasRetryError={false}
                onRetry={onReviewPress}
              />
            )}
            <SafeguardQaDiagnosticsPanel diagnostics={qaDiagnostics} />
          </View>
        </ScrollView>
      ) : (
        <View className="flex-1 px-4">
          {status === "complete" && transactionsFound > 0 && (
            <SuccessState
              transactionsFound={transactionsFound}
              totalScanned={totalScanned}
              durationMs={durationMs}
              topCategories={topCategories}
              categoryNameMap={categoryNameMap}
              onReviewPress={onReviewPress}
              onBackPress={onBackPress}
              t={translate}
            />
          )}

          {status === "complete" &&
            transactionsFound === 0 &&
            safeguardSummary.completionStatus === "complete" && (
              <EmptyState
                totalScanned={totalScanned}
                onBackPress={onBackPress}
                t={translate}
              />
            )}

          {status === "complete" &&
            transactionsFound === 0 &&
            safeguardSummary.completionStatus === "partial" && (
              <View className="flex-1 justify-center pb-6">
                <PartialSmsResultsNotice
                  safeguardSummary={safeguardSummary}
                  retryableCount={retryableCount}
                  canRetry={retryableCount > 0}
                  isRetrying={false}
                  hasRetryError={false}
                  onRetry={onReviewPress}
                />
                <TouchableOpacity
                  onPress={onBackPress}
                  activeOpacity={0.85}
                  className="mt-6 w-full items-center rounded-2xl bg-slate-100 py-4 dark:bg-slate-800"
                >
                  <Text className="text-sm font-semibold text-slate-800 dark:text-white">
                    {translate("back_to_dashboard")}
                  </Text>
                </TouchableOpacity>
                <SafeguardQaDiagnosticsPanel diagnostics={qaDiagnostics} />
              </View>
            )}

          {status === "error" && (
            <ErrorState
              error={error}
              onRetryPress={onRetryPress}
              onBackPress={onBackPress}
              t={translate}
            />
          )}
        </View>
      )}

      {status === "scanning" && (
        <View className="px-4 pb-2">
          <ScanHintText progress={progress} t={translate} />
          <TouchableOpacity
            onPress={onBackPress}
            activeOpacity={0.85}
            className="w-full py-4 rounded-2xl bg-slate-100 dark:bg-slate-800 items-center"
          >
            <Text className="text-slate-800 dark:text-white text-sm font-semibold">
              {translate("cancel_scan")}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
