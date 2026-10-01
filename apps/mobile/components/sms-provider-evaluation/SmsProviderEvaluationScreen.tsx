import React, { useEffect, useMemo, useState } from "react";
import { FlatList, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PageHeader } from "@/components/navigation/PageHeader";
import { shouldUseDenseRowCompactLayout } from "@/constants/ui";
import { SmsProviderEvaluationCaseCard } from "./SmsProviderEvaluationCaseCard";
import { SmsProviderEvaluationFooter } from "./SmsProviderEvaluationFooter";
import {
  SmsProviderEvaluationStatusPanel,
  SmsProviderEvaluationSummary,
  SmsProviderEvaluationTab,
  type SmsProviderEvaluationDatasetSummary,
  type SmsProviderEvaluationStatus,
} from "./SmsProviderEvaluationOverview";
import type {
  SmsEvaluationCaseViewModel,
  SmsEvaluationSummaryViewModel,
} from "./presentation";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;
type ResultsTab = "all" | "issues";

interface ScreenProps {
  readonly t: TranslateFn;
  readonly status: SmsProviderEvaluationStatus;
  readonly datasetSummary: SmsProviderEvaluationDatasetSummary;
  readonly summary: SmsEvaluationSummaryViewModel | null;
  readonly cases: readonly SmsEvaluationCaseViewModel[];
  readonly activeBatchNumber: number | null;
  readonly processedCaseCount: number;
  readonly attemptedRequestCount: number;
  readonly totalBatchCount: number;
  readonly totalCaseCount: number;
  readonly fatalReason: string | null;
  readonly batchSize: number;
  readonly startHelper: string | null;
  readonly isStartReady: boolean;
  readonly onStart: () => void;
  readonly onCancel: () => void;
  readonly onBack: () => void;
}

function visibleCasesFor(
  status: SmsProviderEvaluationStatus,
  tab: ResultsTab,
  cases: readonly SmsEvaluationCaseViewModel[]
): readonly SmsEvaluationCaseViewModel[] {
  const progressed =
    status === "running"
      ? cases.filter(({ finalClassification }) => finalClassification !== "unattempted")
      : cases;
  return tab === "all"
    ? progressed
    : progressed.filter(({ outcome }) => outcome !== "matched");
}

function ResultsTabs({
  summary,
  tab,
  setTab,
  t,
}: {
  readonly summary: SmsEvaluationSummaryViewModel;
  readonly tab: ResultsTab;
  readonly setTab: (tab: ResultsTab) => void;
  readonly t: TranslateFn;
}): React.JSX.Element {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text className="flex-1 text-base font-semibold text-slate-900 dark:text-slate-25">
        {t("sms_provider_evaluation.messages")}
      </Text>
      <View className="flex-row gap-2">
        <SmsProviderEvaluationTab
          label={t("sms_provider_evaluation.all_tab", { count: summary.caseCount })}
          isActive={tab === "all"}
          onPress={() => setTab("all")}
        />
        <SmsProviderEvaluationTab
          label={t("sms_provider_evaluation.issues_tab", { count: summary.issueCount })}
          isActive={tab === "issues"}
          onPress={() => setTab("issues")}
        />
      </View>
    </View>
  );
}

function IdleHelper({
  startHelper,
  t,
}: {
  readonly startHelper: string | null;
  readonly t: TranslateFn;
}): React.JSX.Element {
  return (
    <View className="rounded-2xl bg-white p-4 dark:bg-slate-800">
      <Text className="text-sm font-semibold text-slate-900 dark:text-slate-25">
        {t("sms_provider_evaluation.synthetic_only")}
      </Text>
      <Text className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        {t("sms_provider_evaluation.nothing_saved")}
      </Text>
      {startHelper ? (
        <Text className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          {startHelper}
        </Text>
      ) : null}
    </View>
  );
}

function RunningHelper({
  hasCases,
  t,
}: {
  readonly hasCases: boolean;
  readonly t: TranslateFn;
}): React.JSX.Element {
  return (
    <>
      <Text className="text-xs text-slate-500 dark:text-slate-400">
        {t("sms_provider_evaluation.running_helper")}
      </Text>
      {hasCases ? (
        <Text className="text-base font-semibold text-slate-900 dark:text-slate-25">
          {t("sms_provider_evaluation.messages")}
        </Text>
      ) : null}
    </>
  );
}

function ListHeader({
  props,
  summary,
  tab,
  setTab,
  hasRunningCases,
  isCompact,
}: {
  readonly props: ScreenProps;
  readonly summary: SmsEvaluationSummaryViewModel | null;
  readonly tab: ResultsTab;
  readonly setTab: (tab: ResultsTab) => void;
  readonly hasRunningCases: boolean;
  readonly isCompact: boolean;
}): React.JSX.Element {
  const finalSummary = summary !== null && props.status !== "running";
  return (
    <View className="mb-3 gap-4">
      <SmsProviderEvaluationStatusPanel {...props} />
      {finalSummary ? (
        <SmsProviderEvaluationSummary summary={summary} isCompact={isCompact} t={props.t} />
      ) : (
        <IdleHelper startHelper={props.status === "idle" ? props.startHelper : null} t={props.t} />
      )}
      {finalSummary ? (
        <ResultsTabs summary={summary} tab={tab} setTab={setTab} t={props.t} />
      ) : null}
      {props.status === "running" ? (
        <RunningHelper hasCases={hasRunningCases} t={props.t} />
      ) : null}
    </View>
  );
}

export function SmsProviderEvaluationScreen(
  props: ScreenProps
): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const isCompact = shouldUseDenseRowCompactLayout(width, fontScale);
  const [tab, setTab] = useState<ResultsTab>("all");
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const visibleCases = useMemo(
    () => visibleCasesFor(props.status, tab, props.cases),
    [props.cases, props.status, tab]
  );
  useEffect(() => {
    if (props.status === "running") {
      setTab("all");
      setExpandedIds(new Set());
    }
  }, [props.status]);
  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-900">
      <EvaluationList
        props={props}
        tab={tab}
        setTab={setTab}
        visibleCases={visibleCases}
        expandedIds={expandedIds}
        setExpandedIds={setExpandedIds}
        isCompact={isCompact}
        bottomInset={insets.bottom}
      />
      <SmsProviderEvaluationFooter
        status={props.status}
        isStartReady={props.isStartReady}
        insets={insets}
        onStart={props.onStart}
        onCancel={props.onCancel}
        t={props.t}
      />
    </View>
  );
}

function EvaluationList(input: {
  readonly props: ScreenProps;
  readonly tab: ResultsTab;
  readonly setTab: (tab: ResultsTab) => void;
  readonly visibleCases: readonly SmsEvaluationCaseViewModel[];
  readonly expandedIds: ReadonlySet<string>;
  readonly setExpandedIds: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>;
  readonly isCompact: boolean;
  readonly bottomInset: number;
}): React.JSX.Element {
  const summary = input.props.summary;
  return (
    <>
      <PageHeader
        title={input.props.t("sms_provider_evaluation.title")}
        subtitle={input.props.t("sms_provider_evaluation.development_only")}
        variant="review"
        includeTopSafeAreaInset
        showBackButton
        onBack={input.props.onBack}
        backAccessibilityLabel={input.props.t("sms_provider_evaluation.back")}
      />
      <FlatList
        data={input.visibleCases}
        keyExtractor={(item) => item.caseId}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 116 + input.bottomInset,
        }}
        ItemSeparatorComponent={() => <View className="h-3" />}
        ListHeaderComponent={
          <ListHeader
            props={input.props}
            summary={summary}
            tab={input.tab}
            setTab={input.setTab}
            hasRunningCases={input.visibleCases.length > 0}
            isCompact={input.isCompact}
          />
        }
        ListEmptyComponent={
          summary !== null &&
          input.props.status !== "running" &&
          input.tab === "issues" ? (
            <Text className="rounded-2xl bg-white p-4 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {input.props.t("sms_provider_evaluation.no_issues")}
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <SmsProviderEvaluationCaseCard
            item={item}
            isExpanded={input.expandedIds.has(item.caseId)}
            isCompact={input.isCompact}
            onToggle={() => toggleExpanded(item.caseId, input.setExpandedIds)}
            t={input.props.t}
          />
        )}
      />
    </>
  );
}

function toggleExpanded(
  caseId: string,
  setExpandedIds: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>
): void {
  setExpandedIds((current) => {
    const next = new Set(current);
    if (next.has(caseId)) next.delete(caseId);
    else next.add(caseId);
    return next;
  });
}
