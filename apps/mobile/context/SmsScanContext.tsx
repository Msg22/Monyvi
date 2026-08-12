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

interface SmsScanContextValue {
  readonly unresolvedCandidates: readonly HybridSmsUnresolvedCandidate[];
  readonly parseContext: ParseSmsContext | null;
  readonly safeguardSummary: SmsScanSafeguardSummary | null;
  readonly parserDiagnostics: SmsParserDiagnostics | null;
  readonly initiatingUserId: string | null;
  readonly reviewSessionId: number;
  readonly setReviewSession: (result: SmsScanResult) => void;
  readonly updateReviewSession: (
    input: {
      readonly unresolvedCandidates: readonly HybridSmsUnresolvedCandidate[];
    },
    expectedSessionId: number
  ) => void;
  readonly clearTransactions: () => void;
  readonly scanMode: SmsScanMode;
  readonly setScanMode: (mode: SmsScanMode) => void;
}

const SmsScanContext = createContext<SmsScanContextValue | null>(null);

interface SmsScanProviderProps {
  readonly children: React.ReactNode;
}

export function SmsScanProvider({
  children,
}: SmsScanProviderProps): React.JSX.Element {
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

  const clearTransactions = useCallback((): void => {
    advanceReviewSession();
    setUnresolvedCandidates([]);
    setParseContext(null);
    setSafeguardSummary(null);
    setParserDiagnostics(null);
    setInitiatingUserId(null);
  }, [advanceReviewSession]);

  const setReviewSession = useCallback(
    (result: SmsScanResult): void => {
      advanceReviewSession();
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
        readonly unresolvedCandidates: readonly HybridSmsUnresolvedCandidate[];
      },
      expectedSessionId: number
    ): void => {
      if (reviewSessionIdRef.current !== expectedSessionId) return;
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

  const setScanMode = useCallback((mode: SmsScanMode): void => {
    setScanModeState(mode);
  }, []);

  const value = useMemo<SmsScanContextValue>(
    () => ({
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

export function useSmsScanContext(): SmsScanContextValue {
  const context = useContext(SmsScanContext);
  if (!context) {
    throw new Error("useSmsScanContext must be used within a SmsScanProvider");
  }
  return context;
}
