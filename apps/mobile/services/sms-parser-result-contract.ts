import type {
  AiParseResult,
  AiUnresolvedCandidate,
  SmsAiRetryRequest,
  SmsAiRequestContext,
  SmsCandidate,
} from "./ai-sms-parser-service";

export type SmsParserMode =
  | "hybrid"
  | "ai-primary"
  | "local-primary"
  | "fixture";

export type HybridSmsUnresolvedReason =
  | AiUnresolvedCandidate["reason"]
  | "ai_failed";

export interface HybridSmsUnresolvedCandidate {
  readonly candidate: SmsCandidate;
  readonly reason: HybridSmsUnresolvedReason;
  readonly isRetryable: boolean;
  readonly retryRequest?: SmsAiRetryRequest;
}

export interface SmsParserDiagnostics {
  readonly mode: SmsParserMode;
  readonly attemptedAi: boolean;
  readonly attemptedLocal: boolean;
  readonly candidateCount: number;
  readonly resultCount: number;
  readonly matchedPatternIds: readonly string[];
  readonly runtimeScopeCounts: Readonly<Record<string, number>>;
  readonly catalogVersion?: number;
  readonly localMatchedCount?: number;
  readonly localRejectedCount?: number;
  readonly localUnresolvedCount?: number;
  readonly localAmbiguousCount?: number;
  readonly aiAttemptedCount?: number;
  readonly aiMatchedCount?: number;
  readonly aiDeferredCount?: number;
  readonly categoryEnrichmentAttemptedCount?: number;
  readonly categoryEnrichedCount?: number;
  readonly categoryEnrichmentRejectedCount?: number;
  readonly categoryEnrichmentMissingCount?: number;
  readonly categoryEnrichmentFailed?: boolean;
  readonly unresolvedCount?: number;
  readonly duplicateDiscardedCount?: number;
  readonly reasonCounts?: Readonly<Record<string, number>>;
}

export interface SmsScanSafeguardSummary {
  readonly admittedAiCount: number;
  readonly deferredAiCount: number;
  readonly oversizedCount: number;
  readonly unresolvedCount: number;
  readonly completionStatus: "complete" | "partial";
  readonly availability?: AiParseResult["availability"];
}

export interface SmsParserOrchestratorResult extends Omit<
  AiParseResult,
  "unresolvedCandidates"
> {
  readonly diagnostics: SmsParserDiagnostics;
  readonly durableLocalRejectionFingerprints?: readonly string[];
  readonly unresolvedCandidates: readonly HybridSmsUnresolvedCandidate[];
  readonly safeguardSummary: SmsScanSafeguardSummary;
  readonly isConsentRequired?: boolean;
}

export interface SmsParserOrchestratorOptions {
  readonly expectedUserId?: string;
  readonly terminalFingerprints?: ReadonlySet<string>;
  readonly requestContext?: SmsAiRequestContext;
  readonly requestKey?: string;
}

export function createSmsParserDiagnostics(
  input: Omit<
    SmsParserDiagnostics,
    "matchedPatternIds" | "runtimeScopeCounts"
  > &
    Partial<
      Pick<SmsParserDiagnostics, "matchedPatternIds" | "runtimeScopeCounts">
    >
): SmsParserDiagnostics {
  return {
    matchedPatternIds: [],
    runtimeScopeCounts: {},
    ...input,
  };
}

export function createSmsScanSafeguardSummary(input: {
  readonly admittedAiCount?: number;
  readonly deferredAiCount?: number;
  readonly oversizedCount?: number;
  readonly unresolvedCount?: number;
  readonly availability?: AiParseResult["availability"];
}): SmsScanSafeguardSummary {
  const admittedAiCount = input.admittedAiCount ?? 0;
  const deferredAiCount = input.deferredAiCount ?? 0;
  const oversizedCount = input.oversizedCount ?? 0;
  const unresolvedCount = input.unresolvedCount ?? 0;
  return {
    admittedAiCount,
    deferredAiCount,
    oversizedCount,
    unresolvedCount,
    completionStatus:
      deferredAiCount > 0 || oversizedCount > 0 || unresolvedCount > 0
        ? "partial"
        : "complete",
    ...(input.availability === undefined
      ? {}
      : { availability: input.availability }),
  };
}

export function toSmsParserDiagnosticsLogContext(
  diagnostics: SmsParserDiagnostics
): Readonly<Record<string, unknown>> {
  return { ...diagnostics };
}
