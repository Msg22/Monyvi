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
  readonly ownerUserId: string | null;
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

interface ActiveEvaluationRun {
  readonly generation: number;
  readonly userId: string;
  readonly controller: AbortController;
}

function emptyState(ownerUserId: string | null): EvaluationState {
  return {
    ownerUserId,
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
}

function runningState(
  ownerUserId: string,
  progress: SmsProviderEvaluationProgress
): EvaluationState {
  return {
    ownerUserId,
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

function terminalState(
  userId: string,
  result: Awaited<ReturnType<typeof runSmsProviderEvaluationForCurrentUser>>
): EvaluationState {
  return {
    ownerUserId: userId,
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
  };
}

export function useSmsProviderEvaluation(
  input: UseSmsProviderEvaluationInput
): UseSmsProviderEvaluationResult {
  const { userId } = input;
  const [state, setState] = useState<EvaluationState>(() => emptyState(userId));
  const activeRunRef = useRef<ActiveEvaluationRun | null>(null);
  const generationRef = useRef(0);
  const abortActiveRun = useCallback((): void => {
    generationRef.current += 1;
    activeRunRef.current?.controller.abort();
    activeRunRef.current = null;
  }, []);
  const cancel = useCallback((): void => {
    abortActiveRun();
    setState((current) =>
      current.ownerUserId === userId && current.status === "running"
        ? { ...current, status: "cancelled", activeBatchNumber: null }
        : current
    );
  }, [abortActiveRun, userId]);
  const clear = useCallback((): void => {
    abortActiveRun();
    setState(emptyState(userId));
  }, [abortActiveRun, userId]);

  useEvaluationCleanup(userId, abortActiveRun, setState);
  const start = useEvaluationStarter(
    input,
    activeRunRef,
    generationRef,
    setState
  );
  const visibleState =
    state.ownerUserId === userId ? state : emptyState(userId);
  return useMemo(
    () => ({ ...visibleState, start, cancel, clear }),
    [cancel, clear, start, visibleState]
  );
}

function useEvaluationCleanup(
  userId: string | null,
  abortActiveRun: () => void,
  setState: React.Dispatch<React.SetStateAction<EvaluationState>>
): void {
  useEffect(() => {
    abortActiveRun();
    setState(emptyState(userId));
  }, [abortActiveRun, setState, userId]);
  useEffect(() => (): void => abortActiveRun(), [abortActiveRun]);
}

function useEvaluationStarter(
  input: UseSmsProviderEvaluationInput,
  activeRunRef: React.MutableRefObject<ActiveEvaluationRun | null>,
  generationRef: React.MutableRefObject<number>,
  setState: React.Dispatch<React.SetStateAction<EvaluationState>>
): () => Promise<void> {
  return useCallback(async (): Promise<void> => {
    if (activeRunRef.current !== null || !prepareStart(input, setState)) return;
    const generation = ++generationRef.current;
    const controller = new AbortController();
    const run = { generation, userId: input.userId, controller };
    activeRunRef.current = run;
    setState({ ...emptyState(run.userId), status: "running" });
    try {
      await executeHookRun(input, run, generationRef, activeRunRef, setState);
    } finally {
      if (activeRunRef.current === run) activeRunRef.current = null;
    }
  }, [activeRunRef, generationRef, input, setState]);
}

function prepareStart(
  input: UseSmsProviderEvaluationInput,
  setState: React.Dispatch<React.SetStateAction<EvaluationState>>
): input is UseSmsProviderEvaluationInput & { readonly userId: string } {
  if (input.userId === null) {
    setState({
      ...emptyState(null),
      status: "fatal",
      fatalReason: SMS_PROVIDER_EVALUATION_AUTH_REQUIRED,
    });
    return false;
  }
  if (input.isAiConsentLoading) return false;
  if (!input.isAiConsented) {
    setState({
      ...emptyState(input.userId),
      status: "fatal",
      fatalReason: "consent_required",
    });
    return false;
  }
  return true;
}

async function executeHookRun(
  input: UseSmsProviderEvaluationInput & { readonly userId: string },
  run: ActiveEvaluationRun,
  generationRef: React.MutableRefObject<number>,
  activeRunRef: React.MutableRefObject<ActiveEvaluationRun | null>,
  setState: React.Dispatch<React.SetStateAction<EvaluationState>>
): Promise<void> {
  try {
    const result = await runSmsProviderEvaluationForCurrentUser({
      initiatingUserId: input.userId,
      categories: input.categories,
      supportedCurrencies: input.supportedCurrencies,
      isAiConsented: input.isAiConsented,
      signal: run.controller.signal,
      onProgress: (progress): void => {
        if (isCurrentRun(run, generationRef, activeRunRef)) {
          setState(runningState(input.userId, progress));
        }
      },
    });
    if (isCurrentRun(run, generationRef, activeRunRef)) {
      setState(terminalState(input.userId, result));
    }
  } catch (error: unknown) {
    handleHookRunError(
      input.userId,
      run,
      error,
      generationRef,
      activeRunRef,
      setState
    );
  }
}

function isCurrentRun(
  run: ActiveEvaluationRun,
  generationRef: React.MutableRefObject<number>,
  activeRunRef: React.MutableRefObject<ActiveEvaluationRun | null>
): boolean {
  return (
    generationRef.current === run.generation &&
    activeRunRef.current === run
  );
}

function handleHookRunError(
  userId: string,
  run: ActiveEvaluationRun,
  error: unknown,
  generationRef: React.MutableRefObject<number>,
  activeRunRef: React.MutableRefObject<ActiveEvaluationRun | null>,
  setState: React.Dispatch<React.SetStateAction<EvaluationState>>
): void {
  if (!isCurrentRun(run, generationRef, activeRunRef)) return;
  if (isSmsProviderEvaluationOwnerChanged(error)) {
    setState(emptyState(null));
    return;
  }
  const fatalReason =
    error instanceof Error && error.message
      ? error.message
      : SMS_PROVIDER_EVALUATION_UNAVAILABLE;
  setState((current) => ({
    ...current,
    ownerUserId: userId,
    status: run.controller.signal.aborted ? "cancelled" : "fatal",
    activeBatchNumber: null,
    fatalReason: run.controller.signal.aborted ? null : fatalReason,
  }));
}
