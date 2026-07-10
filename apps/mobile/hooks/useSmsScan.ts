/**
 * useSmsScan Hook
 *
 * Manages the state machine for SMS inbox scanning.
 * Wraps the sms-sync-service pipeline with React state for UI consumption.
 *
 * Architecture & Design Rationale:
 * - Pattern: Facade — provides a simple API over the scan pipeline
 * - SOLID: Single Responsibility — only manages scan state, not UI
 *
 * @module useSmsScan
 */

import {
  isAiConsentRequiredError,
  type ParseSmsContext,
} from "@/services/ai-sms-parser-service";
import {
  scanAndParseSms,
  type SmsScanProgress,
  type SmsScanResult,
} from "@/services/sms-sync-service";
import type { ParsedSmsTransaction } from "@monyvi/logic";
import { useCallback, useRef, useState } from "react";
import { logger } from "@/utils/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ScanStatus =
  | "idle"
  | "scanning"
  | "complete"
  | "error"
  | "consent_required";

export interface UseSmsScanResult {
  /** Current scan status */
  readonly status: ScanStatus;
  /** Live progress during scanning */
  readonly progress: SmsScanProgress | null;
  /** Final scan result when status is 'complete' */
  readonly result: SmsScanResult | null;
  /** Parsed transactions from the scan (shortcut to result.transactions) */
  readonly transactions: readonly ParsedSmsTransaction[];
  /** Error message if scan failed */
  readonly error: string | null;
  /** Start scanning the SMS inbox */
  readonly startScan: (options: StartScanOptions) => Promise<void>;
  /** Reset the scan state to idle */
  readonly reset: () => void;
}

interface StartScanOptions {
  /** Only scan messages after this timestamp (incremental sync). */
  readonly minDate?: number;
  /** Set of existing fingerprints for dedup. Omit to let the scan service load them. */
  readonly existingFingerprints?: ReadonlySet<string>;
  /** Context to pass to AI for better account suggestions. */
  readonly aiContext: ParseSmsContext;
  /** Cancels the scan before more SMS candidates are sent to AI. */
  readonly abortSignal?: AbortSignal;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSmsScan(): UseSmsScanResult {
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [progress, setProgress] = useState<SmsScanProgress | null>(null);
  const [result, setResult] = useState<SmsScanResult | null>(null);
  const [transactions, setTransactions] = useState<
    readonly ParsedSmsTransaction[]
  >([]);
  const [error, setError] = useState<string | null>(null);

  // Guard against concurrent scans
  const isScanningRef = useRef(false);

  const startScan = useCallback(
    async (options: StartScanOptions): Promise<void> => {
      if (isScanningRef.current) {
        return;
      }

      isScanningRef.current = true;
      setStatus("scanning");
      setProgress(null);
      setResult(null);
      setTransactions([]);
      setError(null);

      try {
        const scanResult = await scanAndParseSms(
          {
            minDate: options.minDate,
            existingFingerprints: options.existingFingerprints,
            aiContext: options.aiContext,
            abortSignal: options.abortSignal,
          },
          (p) => {
            setProgress(p);
          }
        );

        setResult(scanResult);
        setTransactions(scanResult.transactions);
        setStatus("complete");
      } catch (err) {
        if (isAbortError(err)) {
          setStatus("idle");
          return;
        }

        if (isAiConsentRequiredError(err)) {
          setError(null);
          setStatus("consent_required");
          return;
        }

        // Log raw error for debugging but don't expose English service
        // messages to the UI — the component falls back to t("scan_error_default")
        logger.error("smsScan.failed", err);
        setError(null);
        setStatus("error");
      } finally {
        isScanningRef.current = false;
      }
    },
    []
  );

  const reset = useCallback((): void => {
    setStatus("idle");
    setProgress(null);
    setResult(null);
    setTransactions([]);
    setError(null);
    isScanningRef.current = false;
  }, []);

  return {
    status,
    progress,
    result,
    transactions,
    error,
    startScan,
    reset,
  };
}
