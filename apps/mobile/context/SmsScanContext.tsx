/**
 * SMS Scan Context
 *
 * React Context for sharing parsed SMS transactions between the
 * scan page and the review page. Data flows:
 *   sms-scan.tsx → setTransactions() → sms-review.tsx reads transactions
 *
 * Architecture & Design Rationale:
 * - Pattern: Provider Pattern (React Context)
 * - Why: Lightweight cross-route state sharing without adding Zustand.
 *   Scoped to the SMS scan flow — no global store pollution.
 * - SOLID: SRP — only holds parsed transactions for inter-screen transfer.
 *
 * @module SmsScanContext
 */

import type { ParsedSmsTransaction } from "@monyvi/logic";
import type { ParseSmsContext } from "@/services/ai-sms-parser-service";
import type {
  HybridSmsUnresolvedCandidate,
  SmsParserDiagnostics,
  SmsScanSafeguardSummary,
} from "@/services/sms-parser-orchestrator";
import type { SmsScanResult } from "@/services/sms-sync-service";
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

export type SmsScanMode = "incremental" | "history";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SmsScanContextValue {
  /** Parsed transactions from the scan pipeline */
  readonly transactions: readonly ParsedSmsTransaction[];
  /** Set parsed transactions (called by scan page on completion) */
  readonly setTransactions: (txns: readonly ParsedSmsTransaction[]) => void;
  readonly unresolvedCandidates: readonly HybridSmsUnresolvedCandidate[];
  readonly parseContext: ParseSmsContext | null;
  readonly safeguardSummary: SmsScanSafeguardSummary | null;
  readonly parserDiagnostics: SmsParserDiagnostics | null;
  readonly initiatingUserId: string | null;
  readonly reviewSessionId: number;
  readonly setReviewSession: (result: SmsScanResult) => void;
  readonly updateReviewSession: (
    input: {
      readonly transactions: readonly ParsedSmsTransaction[];
      readonly unresolvedCandidates: readonly HybridSmsUnresolvedCandidate[];
    },
    expectedSessionId: number
  ) => void;
  /** Clear transactions (called after save or discard) */
  readonly clearTransactions: () => void;
  /** Whether the next scan should be incremental or a deliberate history scan. */
  readonly scanMode: SmsScanMode;
  /** Set the scan mode before navigating to scan page */
  readonly setScanMode: (mode: SmsScanMode) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const SmsScanContext = createContext<SmsScanContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface SmsScanProviderProps {
  readonly children: React.ReactNode;
}

export function SmsScanProvider({
  children,
}: SmsScanProviderProps): React.JSX.Element {
  const [transactions, setTransactionsState] = useState<
    readonly ParsedSmsTransaction[]
  >([]);
  const [scanMode, setScanModeState] = useState<SmsScanMode>("incremental");
  const [unresolvedCandidates, setUnresolvedCandidates] = useState<
    readonly HybridSmsUnresolvedCandidate[]
  >([]);
  const [parseContext, setParseContext] = useState<ParseSmsContext | null>(
    null
  );
  const [safeguardSummary, setSafeguardSummary] =
    useState<SmsScanSafeguardSummary | null>(null);
  const [parserDiagnostics, setParserDiagnostics] =
    useState<SmsParserDiagnostics | null>(null);
  const [initiatingUserId, setInitiatingUserId] = useState<string | null>(null);
  const reviewSessionIdRef = useRef(0);
  const [reviewSessionId, setReviewSessionId] = useState(0);

  const advanceReviewSession = useCallback((): void => {
    reviewSessionIdRef.current += 1;
    setReviewSessionId(reviewSessionIdRef.current);
  }, []);

  const setTransactions = useCallback(
    (txns: readonly ParsedSmsTransaction[]) => {
      advanceReviewSession();
      setTransactionsState(txns);
      setUnresolvedCandidates([]);
      setParseContext(null);
      setSafeguardSummary(null);
      setParserDiagnostics(null);
      setInitiatingUserId(null);
    },
    [advanceReviewSession]
  );

  const clearTransactions = useCallback(() => {
    advanceReviewSession();
    setTransactionsState([]);
    setUnresolvedCandidates([]);
    setParseContext(null);
    setSafeguardSummary(null);
    setParserDiagnostics(null);
    setInitiatingUserId(null);
  }, [advanceReviewSession]);

  const setReviewSession = useCallback(
    (result: SmsScanResult): void => {
      advanceReviewSession();
      setTransactionsState(result.transactions);
      setUnresolvedCandidates(result.unresolvedCandidates);
      setParseContext(result.parseContext);
      setSafeguardSummary(result.safeguardSummary);
      setParserDiagnostics(result.parserDiagnostics);
      setInitiatingUserId(result.initiatingUserId);
    },
    [advanceReviewSession]
  );

  const updateReviewSession = useCallback(
    (
      input: {
        readonly transactions: readonly ParsedSmsTransaction[];
        readonly unresolvedCandidates: readonly HybridSmsUnresolvedCandidate[];
      },
      expectedSessionId: number
    ): void => {
      if (reviewSessionIdRef.current !== expectedSessionId) return;
      setTransactionsState(input.transactions);
      setUnresolvedCandidates(input.unresolvedCandidates);
      setSafeguardSummary((current) =>
        current === null
          ? null
          : {
              ...current,
              unresolvedCount: input.unresolvedCandidates.length,
              completionStatus:
                input.unresolvedCandidates.length > 0 ||
                current.deferredAiCount > 0 ||
                current.oversizedCount > 0
                  ? "partial"
                  : "complete",
            }
      );
    },
    []
  );

  const setScanMode = useCallback((mode: SmsScanMode) => {
    setScanModeState(mode);
  }, []);

  const value = useMemo<SmsScanContextValue>(
    () => ({
      transactions,
      setTransactions,
      unresolvedCandidates,
      parseContext,
      safeguardSummary,
      parserDiagnostics,
      initiatingUserId,
      reviewSessionId,
      setReviewSession,
      updateReviewSession,
      clearTransactions,
      scanMode,
      setScanMode,
    }),
    [
      transactions,
      setTransactions,
      unresolvedCandidates,
      parseContext,
      safeguardSummary,
      parserDiagnostics,
      initiatingUserId,
      reviewSessionId,
      setReviewSession,
      updateReviewSession,
      clearTransactions,
      scanMode,
      setScanMode,
    ]
  );

  return (
    <SmsScanContext.Provider value={value}>{children}</SmsScanContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Access the SMS scan context. Must be used inside SmsScanProvider.
 */
export function useSmsScanContext(): SmsScanContextValue {
  const ctx = useContext(SmsScanContext);
  if (!ctx) {
    throw new Error("useSmsScanContext must be used within a SmsScanProvider");
  }
  return ctx;
}
