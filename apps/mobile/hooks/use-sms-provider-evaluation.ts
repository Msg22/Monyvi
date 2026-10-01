import type { CategoryTreeSource, EvaluationReport } from "@monyvi/logic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  isSmsProviderEvaluationOwnerChanged,
  runSmsProviderEvaluationForCurrentUser,
  SMS_PROVIDER_EVALUATION_AUTH_REQUIRED,
  SMS_PROVIDER_EVALUATION_UNAVAILABLE,
  type SmsProviderEvaluationBatchDetail,
  type SmsProviderEvaluationProgress,
} from "@/services/dev/sms-provider-evaluation-service";

export type SmsProviderEvaluationScreenStatus =
  | "idle"
  | "running"
  | "finished"
  | "cancelled"
  | "fatal";

interface UseSmsProviderEvaluationInput {
  readonly userId: string | null;
  readonly isAiConsentLoading: boolean;
  readonly isAiConsented: boolean;
  readonly categories: readonly CategoryTreeSource[];
  readonly supportedCurrencies: readonly string[];
}

export interface UseSmsProviderEvaluationResult {
  readonly status: SmsProviderEvaluationScreenStatus;
  readonly report: EvaluationReport | null;
  readonly batches: readonly SmsProviderEvaluationBatchDetail[];
  readonly activeBatchNumber: number | null;
  readonly completedBatchCount: number;
  readonly processedCaseCount: number;
  readonly attemptedRequestCount: number;
  readonly totalBatchCount: number;
  readonly totalCaseCount: number;
  readonly fatalReason: string | null;
  readonly start: () => Promise<void>;
  readonly cancel: () => void;
  readonly clear: () => void;
}

interface EvaluationState {
  readonly status: SmsProviderEvaluationScreenStatus;
  readonly report: EvaluationReport | null;
  readonly batches: readonly SmsProviderEvaluationBatchDetail[];
  readonly activeBatchNumber: number | null;
  readonly completedBatchCount: number;
  readonly processedCaseCount: number;
  readonly attemptedRequestCount: number;
  readonly totalBatchCount: number;
  readonly totalCaseCount: number;
  readonly fatalReason: string | null;
}

const EMPTY_STATE: EvaluationState = {
  status: "idle",
  report: null,
  batches: [],
  activeBatchNumber: null,
  completedBatchCount: 0,
  processedCaseCount: 0,
  attemptedRequestCount: 0,
  totalBatchCount: 0,
  totalCaseCount: 0,
  fatalReason: null,
};

function runningState(progress: SmsProviderEvaluationProgress): EvaluationState {
  return {
    status: "running",
    report: progress.report,
    batches: progress.batches,
    activeBatchNumber: progress.activeBatchNumber,
    completedBatchCount: progress.completedBatchCount,
    processedCaseCount: progress.processedCaseCount,
    attemptedRequestCount: progress.attemptedRequestCount,
    totalBatchCount: progress.totalBatchCount,
    totalCaseCount: progress.totalCaseCount,
    fatalReason: null,
  };
}

export function useSmsProviderEvaluation({
  userId,
  isAiConsentLoading,
  isAiConsented,
  categories,
  supportedCurrencies,
}: UseSmsProviderEvaluationInput): UseSmsProviderEvaluationResult {
  const [state, setState] = useState<EvaluationState>(EMPTY_STATE);
  const abortControllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const ownerRef = useRef<string | null>(userId);

  const cancel = useCallback((): void => {
    generationRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setState((current) =>
      current.status === "running"
        ? { ...current, status: "cancelled", activeBatchNumber: null }
        : current
    );
  }, []);

  const clear = useCallback((): void => {
    generationRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setState(EMPTY_STATE);
  }, []);

  useEffect(() => {
    if (ownerRef.current === userId) return;
    ownerRef.current = userId;
    generationRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setState(EMPTY_STATE);
  }, [userId]);

  useEffect(
    () => (): void => {
      generationRef.current += 1;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    },
    []
  );

  const start = useCallback(async (): Promise<void> => {
    if (state.status === "running") return;

    if (userId === null) {
      setState({
        ...EMPTY_STATE,
        status: "fatal",
        fatalReason: SMS_PROVIDER_EVALUATION_AUTH_REQUIRED,
      });
      return;
    }
    if (isAiConsentLoading) return;
    if (!isAiConsented) {
      setState({
        ...EMPTY_STATE,
        status: "fatal",
        fatalReason: "consent_required",
      });
      return;
    }

    generationRef.current += 1;
    const generation = generationRef.current;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setState({ ...EMPTY_STATE, status: "running" });

    try {
      const result = await runSmsProviderEvaluationForCurrentUser({
        initiatingUserId: userId,
        categories,
        supportedCurrencies,
        isAiConsented,
        signal: controller.signal,
        onProgress: (progress): void => {
          if (
            generationRef.current !== generation ||
            ownerRef.current !== userId
          ) {
            return;
          }
          setState(runningState(progress));
        },
      });

      if (
        generationRef.current !== generation ||
        ownerRef.current !== userId
      ) {
        return;
      }

      setState({
        status: result.status,
        report: result.report,
        batches: result.batches,
        activeBatchNumber: null,
        completedBatchCount: result.completedBatchCount,
        processedCaseCount: result.processedCaseCount,
        attemptedRequestCount: result.attemptedRequestCount,
        totalBatchCount: result.totalBatchCount,
        totalCaseCount: result.totalCaseCount,
        fatalReason: result.fatalReason ?? null,
      });
    } catch (error: unknown) {
      if (
        generationRef.current !== generation ||
        ownerRef.current !== userId
      ) {
        return;
      }

      if (isSmsProviderEvaluationOwnerChanged(error)) {
        setState(EMPTY_STATE);
        return;
      }

      const fatalReason =
        error instanceof Error && error.message
          ? error.message
          : SMS_PROVIDER_EVALUATION_UNAVAILABLE;
      setState((current) => ({
        ...current,
        status: controller.signal.aborted ? "cancelled" : "fatal",
        activeBatchNumber: null,
        fatalReason: controller.signal.aborted ? null : fatalReason,
      }));
    } finally {
      if (
        generationRef.current === generation &&
        abortControllerRef.current === controller
      ) {
        abortControllerRef.current = null;
      }
    }
  }, [
    categories,
    isAiConsentLoading,
    isAiConsented,
    state.status,
    supportedCurrencies,
    userId,
  ]);

  return useMemo(
    () => ({
      ...state,
      start,
      cancel,
      clear,
    }),
    [cancel, clear, start, state]
  );
}
