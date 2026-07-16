import { useCallback, useEffect, useRef, useState } from "react";
import { useSmsScanContext } from "@/context/SmsScanContext";
import { retrySmsReviewCandidates } from "@/services/sms-review-retry-service";
import { logger } from "@/utils/logger";

export interface UseSmsReviewRetryResult {
  readonly retryableCount: number;
  readonly isRetrying: boolean;
  readonly hasRetryError: boolean;
  readonly retry: () => Promise<void>;
}

export function useSmsReviewRetry(): UseSmsReviewRetryResult {
  const {
    transactions,
    unresolvedCandidates,
    parseContext,
    reviewSessionId,
    updateReviewSession,
  } = useSmsScanContext();
  const [isRetrying, setIsRetrying] = useState(false);
  const [hasRetryError, setHasRetryError] = useState(false);
  const activeRequestRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  useEffect(() => {
    return () => {
      generationRef.current += 1;
      activeRequestRef.current?.abort();
      activeRequestRef.current = null;
    };
  }, [reviewSessionId]);

  const retry = useCallback(async (): Promise<void> => {
    if (activeRequestRef.current !== null || parseContext === null) return;
    if (!unresolvedCandidates.some(({ isRetryable }) => isRetryable)) return;

    const abortController = new AbortController();
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    activeRequestRef.current = abortController;
    setIsRetrying(true);
    setHasRetryError(false);

    try {
      const result = await retrySmsReviewCandidates({
        transactions,
        unresolvedCandidates,
        parseContext,
        abortSignal: abortController.signal,
      });
      if (generationRef.current !== generation) return;
      updateReviewSession(result, reviewSessionId);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") return;
      if (generationRef.current !== generation) return;
      setHasRetryError(true);
      logger.warn("smsReview.retry.failed", {
        unresolvedCount: unresolvedCandidates.length,
        errorName: error instanceof Error ? error.name : "unknown",
      });
    } finally {
      if (generationRef.current === generation) {
        activeRequestRef.current = null;
        setIsRetrying(false);
      }
    }
  }, [
    parseContext,
    reviewSessionId,
    transactions,
    unresolvedCandidates,
    updateReviewSession,
  ]);

  return {
    retryableCount: unresolvedCandidates.filter(
      ({ isRetryable }) => isRetryable
    ).length,
    isRetrying,
    hasRetryError,
    retry,
  };
}
