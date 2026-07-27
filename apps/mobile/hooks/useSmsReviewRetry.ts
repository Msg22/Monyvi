import { useCallback, useEffect, useRef, useState } from "react";
import { useSmsScanContext } from "@/context/SmsScanContext";
import { retrySmsReviewCandidates } from "@/services/sms-review-retry-service";
import { mergeSmsReviewDrafts } from "@/services/sms-review-draft-repository";
import { isAiConsentRequiredError } from "@/services/ai-sms-parser-service";
import { logger } from "@/utils/logger";

export interface UseSmsReviewRetryResult {
  readonly unresolvedCount: number;
  readonly retryableCount: number;
  readonly isRetrying: boolean;
  readonly hasRetryError: boolean;
  readonly isConsentRequired: boolean;
  readonly dismissConsentRequired: () => void;
  readonly retry: () => Promise<void>;
}

export function useSmsReviewRetry(): UseSmsReviewRetryResult {
  const {
    unresolvedCandidates,
    parseContext,
    initiatingUserId,
    reviewSessionId,
    updateReviewSession,
  } = useSmsScanContext();
  const [isRetrying, setIsRetrying] = useState(false);
  const [hasRetryError, setHasRetryError] = useState(false);
  const [isConsentRequired, setIsConsentRequired] = useState(false);
  const activeRequestRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  useEffect(() => {
    setHasRetryError(false);
    setIsConsentRequired(false);
    return () => {
      generationRef.current += 1;
      activeRequestRef.current?.abort();
      activeRequestRef.current = null;
    };
  }, [reviewSessionId]);

  const retry = useCallback(async (): Promise<void> => {
    if (
      activeRequestRef.current !== null ||
      parseContext === null ||
      initiatingUserId === null
    ) {
      return;
    }
    if (!unresolvedCandidates.some(({ isRetryable }) => isRetryable)) return;

    const abortController = new AbortController();
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    activeRequestRef.current = abortController;
    setIsRetrying(true);
    setHasRetryError(false);
    setIsConsentRequired(false);

    try {
      const result = await retrySmsReviewCandidates({
        transactions: [],
        unresolvedCandidates,
        parseContext,
        abortSignal: abortController.signal,
        expectedUserId: initiatingUserId,
      });
      if (generationRef.current !== generation) return;
      await mergeSmsReviewDrafts({
        transactions: result.transactions,
        expectedUserId: initiatingUserId,
      });
      if (generationRef.current !== generation) return;
      updateReviewSession(
        {
          unresolvedCandidates: result.unresolvedCandidates,
        },
        reviewSessionId
      );
      setHasRetryError(result.hasRetryError);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") return;
      if (generationRef.current !== generation) return;
      if (isAiConsentRequiredError(error)) {
        setIsConsentRequired(true);
        return;
      }
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
    initiatingUserId,
    reviewSessionId,
    unresolvedCandidates,
    updateReviewSession,
  ]);

  const dismissConsentRequired = useCallback((): void => {
    setIsConsentRequired(false);
  }, []);

  return {
    unresolvedCount: unresolvedCandidates.length,
    retryableCount: unresolvedCandidates.filter(
      ({ isRetryable }) => isRetryable
    ).length,
    isRetrying,
    hasRetryError,
    isConsentRequired,
    dismissConsentRequired,
    retry,
  };
}
