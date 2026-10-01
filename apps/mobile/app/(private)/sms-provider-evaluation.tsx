import {
  DEFAULT_EVALUATION_BATCH_SIZE,
  getSyntheticEvaluationDatasetSummary,
  SUPPORTED_CURRENCIES,
} from "@monyvi/logic";
import { Redirect, router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { AccessibilityInfo } from "react-native";
import { useTranslation } from "react-i18next";

import { SmsProviderEvaluationScreen } from "@/components/sms-provider-evaluation/SmsProviderEvaluationScreen";
import {
  createSmsEvaluationCaseViewModel,
  createSmsEvaluationSummaryViewModel,
} from "@/components/sms-provider-evaluation/presentation";
import { useAllCategories } from "@/context/CategoriesContext";
import { useAuth } from "@/context/AuthContext";
import { useAiProcessingConsent } from "@/hooks/useAiProcessingConsent";
import { useSmsProviderEvaluation } from "@/hooks/use-sms-provider-evaluation";
import { isSmsProviderEvaluationRuntimeAvailable } from "@/services/dev/sms-provider-evaluation-service";
import { toCategoryTreeSources } from "@/utils/category-tree-source";

export default function SmsProviderEvaluationRoute(): React.JSX.Element {
  const { t } = useTranslation("settings");
  const { user } = useAuth();
  const aiConsent = useAiProcessingConsent();
  const { categories, isLoading: isCategoriesLoading, error: categoriesError } =
    useAllCategories();
  const runtimeAvailable = isSmsProviderEvaluationRuntimeAvailable();
  const userId = user?.id ?? null;
  const categorySources = useMemo(
    () => toCategoryTreeSources(categories),
    [categories]
  );
  const supportedCurrencies = useMemo(
    () => SUPPORTED_CURRENCIES.map(({ code }) => code),
    []
  );
  const datasetSummary = useMemo(
    () => getSyntheticEvaluationDatasetSummary(),
    []
  );

  const evaluation = useSmsProviderEvaluation({
    userId,
    isAiConsentLoading: aiConsent.isLoading,
    isAiConsented: aiConsent.isConsented,
    categories: categorySources,
    supportedCurrencies,
  });

  const cases = useMemo(
    () =>
      evaluation.report?.cases.map((item) =>
        createSmsEvaluationCaseViewModel(item, evaluation.batches)
      ) ?? [],
    [evaluation.batches, evaluation.report]
  );
  const summary = useMemo(
    () =>
      evaluation.report === null
        ? null
        : createSmsEvaluationSummaryViewModel(evaluation.report),
    [evaluation.report]
  );

  useFocusEffect(
    useCallback(
      () => (): void => {
        evaluation.cancel();
      },
      [evaluation.cancel]
    )
  );

  const previousStatusRef = useRef(evaluation.status);
  useEffect(() => {
    if (
      previousStatusRef.current !== evaluation.status &&
      evaluation.status !== "idle"
    ) {
      AccessibilityInfo.announceForAccessibility(
        t(`sms_provider_evaluation.status.${evaluation.status}`)
      );
    }
    previousStatusRef.current = evaluation.status;
  }, [evaluation.status, t]);

  if (!runtimeAvailable || userId === null) {
    return <Redirect href="/settings" />;
  }

  const isStartReady =
    !isCategoriesLoading &&
    categoriesError === null &&
    !aiConsent.isLoading &&
    aiConsent.isConsented;
  const startHelper = isCategoriesLoading || aiConsent.isLoading
    ? t("sms_provider_evaluation.preparing_context")
    : categoriesError !== null
      ? t("sms_provider_evaluation.context_unavailable")
      : !aiConsent.isConsented
        ? t("sms_provider_evaluation.consent_required_helper")
        : null;

  return (
    <SmsProviderEvaluationScreen
      t={t}
      status={evaluation.status}
      datasetSummary={datasetSummary}
      summary={summary}
      cases={cases}
      activeBatchNumber={evaluation.activeBatchNumber}
      completedBatchCount={evaluation.completedBatchCount}
      processedCaseCount={evaluation.processedCaseCount}
      attemptedRequestCount={evaluation.attemptedRequestCount}
      totalBatchCount={evaluation.totalBatchCount}
      totalCaseCount={evaluation.totalCaseCount}
      fatalReason={evaluation.fatalReason}
      batchSize={DEFAULT_EVALUATION_BATCH_SIZE}
      startHelper={startHelper}
      isStartReady={isStartReady}
      onStart={() => {
        void evaluation.start();
      }}
      onCancel={evaluation.cancel}
      onBack={() => {
        evaluation.cancel();
        router.back();
      }}
    />
  );
}
