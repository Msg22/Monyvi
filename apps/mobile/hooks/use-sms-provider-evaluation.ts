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
  readonly runElapsedMs: number;
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
  readonly runElapsedMs: number;
}

interface ActiveEvaluationRun {
  readonly generation: number;
  readonly userId: string;
  readonly controller: AbortController;
  readonly startedAtMs: number;
}

type ActiveBatchTimings = ReadonlyMap<number, number>;

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
    runElapsedMs: 0,
  };
}

function runningState(
  ownerUserId: string,
  progress: SmsProviderEvaluationProgress,
  runElapsedMs: number
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
    runElapsedMs,
  };
}

function terminalState(
  userId: string,
  result: Awaited<ReturnType<typeof runSmsProviderEvaluationForCurrentUser>>,
  runElapsedMs: number
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
    runElapsedMs,
  };
}

export function useSmsProviderEvaluation(
  input: UseSmsProviderEvaluationInput
): UseSmsProviderEvaluationResult {
  const { userId } = input;
  const [state, setState] = useState<EvaluationState>(() => emptyState(userId));
  const activeRunRef = useRef<ActiveEvaluationRun | null>(null);
  const activeBatchTimingsRef = useRef<ActiveBatchTimings>(new Map());
  const generationRef = useRef(0);
  const abortActiveRun = useCallback((): void => {
    generationRef.current += 1;
    activeRunRef.current?.controller.abort();
    activeRunRef.current = null;
    activeBatchTimingsRef.current = new Map();
  }, []);
  const cancel = useCallback((): void => {
    const activeRun = activeRunRef.current;
    const activeBatchTimings = activeBatchTimingsRef.current;
    abortActiveRun();
    setState((current) =>
      current.ownerUserId === userId && current.status === "running"
        ? cancelRunningState(current, activeRun, activeBatchTimings)
        : current
    );
  }, [abortActiveRun, userId]);
  const clear = useCallback((): void => {
    abortActiveRun();
    setState(emptyState(userId));
  }, [abortActiveRun, userId]);

  useEvaluationCleanup(userId, abortActiveRun, setState);
  useRunElapsedTimer(
    state.status,
    userId,
    activeRunRef,
    activeBatchTimingsRef,
    setState
  );
  const start = useEvaluationStarter(
    input,
    activeRunRef,
    activeBatchTimingsRef,
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

function elapsedSince(startedAtMs: number): number {
  return Math.max(0, Date.now() - startedAtMs);
}

function cancelRunningState(
  current: EvaluationState,
  activeRun: ActiveEvaluationRun | null,
  activeBatchTimings: ActiveBatchTimings
): EvaluationState {
  return {
    ...current,
    status: "cancelled",
    activeBatchNumber: null,
    batches: markRunningBatchesCancelled(current.batches, activeBatchTimings),
    runElapsedMs:
      activeRun === null
        ? current.runElapsedMs
        : elapsedSince(activeRun.startedAtMs),
  };
}

function markRunningBatchesCancelled(
  batches: readonly SmsProviderEvaluationBatchDetail[],
  timings: ActiveBatchTimings
): readonly SmsProviderEvaluationBatchDetail[] {
  return batches.map((batch) => {
    if (batch.status !== "running") return batch;
    const startedAtMs = timings.get(batch.batchNumber);
    return {
      ...batch,
      status: "cancelled",
      ...(startedAtMs === undefined
        ? {}
        : { elapsedMs: elapsedSince(startedAtMs) }),
    };
  });
}

function updateActiveBatchTimings(
  progress: SmsProviderEvaluationProgress,
  timingsRef: React.MutableRefObject<ActiveBatchTimings>
): void {
  const running = new Set(
    progress.batches
      .filter((batch) => batch.status === "running")
      .map((batch) => batch.batchNumber)
  );
  if (running.size === 0 && timingsRef.current.size === 0) return;
  const next = new Map<number, number>();
  for (const [batchNumber, startedAtMs] of timingsRef.current) {
    if (running.has(batchNumber)) next.set(batchNumber, startedAtMs);
  }
  const now = Date.now();
  for (const batchNumber of running) {
    if (!next.has(batchNumber)) next.set(batchNumber, now);
  }
  timingsRef.current = next;
}

function useRunElapsedTimer(
  status: SmsProviderEvaluationScreenStatus,
  userId: string | null,
  activeRunRef: React.MutableRefObject<ActiveEvaluationRun | null>,
  activeBatchTimingsRef: React.MutableRefObject<ActiveBatchTimings>,
  setState: React.Dispatch<React.SetStateAction<EvaluationState>>
): void {
  useEffect(() => {
    if (status !== "running") return;
    const timer = setInterval(() => {
      const run = activeRunRef.current;
      if (run === null || run.userId !== userId) return;
      setState((current) =>
        updateRunningElapsed(
          current,
          userId,
          run,
          activeBatchTimingsRef.current
        )
      );
    }, 1_000);
    return (): void => clearInterval(timer);
  }, [activeBatchTimingsRef, activeRunRef, setState, status, userId]);
}

function updateRunningElapsed(
  current: EvaluationState,
  userId: string | null,
  run: ActiveEvaluationRun,
  activeBatchTimings: ActiveBatchTimings
): EvaluationState {
  if (current.ownerUserId !== userId || current.status !== "running") {
    return current;
  }
  return {
    ...current,
    runElapsedMs: elapsedSince(run.startedAtMs),
    batches: updateActiveBatchesElapsed(current.batches, activeBatchTimings),
  };
}

function updateActiveBatchesElapsed(
  batches: readonly SmsProviderEvaluationBatchDetail[],
  timings: ActiveBatchTimings
): readonly SmsProviderEvaluationBatchDetail[] {
  let changed = false;
  const next = batches.map((batch) => {
    if (batch.status !== "running") return batch;
    const startedAtMs = timings.get(batch.batchNumber);
    if (startedAtMs === undefined) return batch;
    changed = true;
    return { ...batch, elapsedMs: elapsedSince(startedAtMs) };
  });
  return changed ? next : batches;
}

function useEvaluationStarter(
  input: UseSmsProviderEvaluationInput,
  activeRunRef: React.MutableRefObject<ActiveEvaluationRun | null>,
  activeBatchTimingsRef: React.MutableRefObject<ActiveBatchTimings>,
  generationRef: React.MutableRefObject<number>,
  setState: React.Dispatch<React.SetStateAction<EvaluationState>>
): () => Promise<void> {
  return useCallback(async (): Promise<void> => {
    if (activeRunRef.current !== null || !prepareStart(input, setState)) return;
    const generation = ++generationRef.current;
    const controller = new AbortController();
    const run = {
      generation,
      userId: input.userId,
      controller,
      startedAtMs: Date.now(),
    };
    activeRunRef.current = run;
    setState({ ...emptyState(run.userId), status: "running" });
    try {
      await executeHookRun(
        input,
        run,
        generationRef,
        activeRunRef,
        activeBatchTimingsRef,
        setState
      );
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
  activeBatchTimingsRef: React.MutableRefObject<ActiveBatchTimings>,
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
        if (!isCurrentRun(run, generationRef, activeRunRef)) return;
        updateActiveBatchTimings(progress, activeBatchTimingsRef);
        setState((current) =>
          runningState(input.userId, progress, current.runElapsedMs)
        );
      },
    });
    if (isCurrentRun(run, generationRef, activeRunRef)) {
      activeBatchTimingsRef.current = new Map();
      setState(
        terminalState(input.userId, result, elapsedSince(run.startedAtMs))
      );
    }
  } catch (error: unknown) {
    handleHookRunError(
      input.userId,
      run,
      error,
      generationRef,
      activeRunRef,
      activeBatchTimingsRef,
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
    generationRef.current === run.generation && activeRunRef.current === run
  );
}

function handleHookRunError(
  userId: string,
  run: ActiveEvaluationRun,
  error: unknown,
  generationRef: React.MutableRefObject<number>,
  activeRunRef: React.MutableRefObject<ActiveEvaluationRun | null>,
  activeBatchTimingsRef: React.MutableRefObject<ActiveBatchTimings>,
  setState: React.Dispatch<React.SetStateAction<EvaluationState>>
): void {
  if (!isCurrentRun(run, generationRef, activeRunRef)) return;
  const activeBatchTimings = activeBatchTimingsRef.current;
  activeBatchTimingsRef.current = new Map();
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
    batches: markRunningBatchesCancelled(current.batches, activeBatchTimings),
    fatalReason: run.controller.signal.aborted ? null : fatalReason,
    runElapsedMs: elapsedSince(run.startedAtMs),
  }));
}
