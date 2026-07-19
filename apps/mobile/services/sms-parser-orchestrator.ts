import {
  buildCategoryMap,
  clampConfidence,
  getParsedSmsTransactionKey,
  matchTrustedSmsTemplate,
  normalizeCurrency,
  normalizeType,
  createBundledTrustedSmsCatalogProvider,
  parseCategory,
  parseSmsWithLocalParser,
  parseSmsWithTrustedCatalog,
  QNB_EGYPT_TRUSTED_SMS_CATALOG,
  type ParsedSmsTransaction,
  type TrustedSmsCatalogActivation,
  type TrustedSmsParsedTransaction,
  type TrustedSmsParserOutcome,
} from "@monyvi/logic";
import {
  shouldUseHybridSmsParser,
  shouldUseFixtureSmsParser,
  shouldUseLocalSmsParser,
} from "@/config/e2e-test-config";
import { logger } from "@/utils/logger";
import {
  createAiConsentRequiredError,
  isAiConsentRequiredError,
  parseSmsWithAi,
  type AiUnresolvedCandidate,
  type AiParseProgress,
  type AiParseResult,
  type ParseSmsContext,
  type SmsCandidate,
} from "./ai-sms-parser-service";
import { getAiProcessingConsentStatus } from "./profile-service";

export type SmsParserMode =
  | "hybrid"
  | "ai-primary"
  | "local-primary"
  | "fixture";

export interface HybridSmsUnresolvedCandidate {
  readonly candidate: SmsCandidate;
  readonly reason: HybridSmsUnresolvedReason;
  readonly isRetryable: boolean;
}

export type HybridSmsUnresolvedReason =
  | AiUnresolvedCandidate["reason"]
  | "ai_failed";

export type TrustedPrefilterDisposition =
  | "not_trusted_candidate"
  | "route_to_parser"
  | "filter_before_ai";

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
  readonly unresolvedCount?: number;
  readonly duplicateDiscardedCount?: number;
  readonly reasonCounts?: Readonly<Record<string, number>>;
}

export function toSmsParserDiagnosticsLogContext(
  diagnostics: SmsParserDiagnostics
): Readonly<Record<string, unknown>> {
  return {
    mode: diagnostics.mode,
    attemptedAi: diagnostics.attemptedAi,
    attemptedLocal: diagnostics.attemptedLocal,
    candidateCount: diagnostics.candidateCount,
    resultCount: diagnostics.resultCount,
    matchedPatternIds: diagnostics.matchedPatternIds,
    runtimeScopeCounts: diagnostics.runtimeScopeCounts,
    catalogVersion: diagnostics.catalogVersion,
    localMatchedCount: diagnostics.localMatchedCount,
    localRejectedCount: diagnostics.localRejectedCount,
    localUnresolvedCount: diagnostics.localUnresolvedCount,
    localAmbiguousCount: diagnostics.localAmbiguousCount,
    aiAttemptedCount: diagnostics.aiAttemptedCount,
    aiMatchedCount: diagnostics.aiMatchedCount,
    unresolvedCount: diagnostics.unresolvedCount,
    duplicateDiscardedCount: diagnostics.duplicateDiscardedCount,
    reasonCounts: diagnostics.reasonCounts,
  };
}

export interface SmsParserOrchestratorResult extends Omit<
  AiParseResult,
  "unresolvedCandidates"
> {
  readonly diagnostics: SmsParserDiagnostics;
  readonly unresolvedCandidates: readonly HybridSmsUnresolvedCandidate[];
}

function createDiagnostics(input: {
  readonly mode: SmsParserMode;
  readonly attemptedAi: boolean;
  readonly attemptedLocal: boolean;
  readonly candidateCount: number;
  readonly resultCount: number;
  readonly matchedPatternIds?: readonly string[];
  readonly runtimeScopeCounts?: Readonly<Record<string, number>>;
  readonly catalogVersion?: number;
  readonly localMatchedCount?: number;
  readonly localRejectedCount?: number;
  readonly localUnresolvedCount?: number;
  readonly localAmbiguousCount?: number;
  readonly aiAttemptedCount?: number;
  readonly aiMatchedCount?: number;
  readonly unresolvedCount?: number;
  readonly duplicateDiscardedCount?: number;
  readonly reasonCounts?: Readonly<Record<string, number>>;
}): SmsParserDiagnostics {
  return {
    matchedPatternIds: [],
    runtimeScopeCounts: {},
    ...input,
  };
}

function mapLocalTransactions(
  candidates: readonly SmsCandidate[],
  context: ParseSmsContext
): {
  readonly transactions: readonly ParsedSmsTransaction[];
  readonly matchedPatternIds: readonly string[];
  readonly runtimeScopeCounts: Readonly<Record<string, number>>;
  readonly hasError: boolean;
} {
  const localResult = parseSmsWithLocalParser({
    candidates: candidates.map((candidate) => ({
      messageId: candidate.message.id,
      sender: candidate.message.address,
      body: candidate.message.body,
      receivedAtMs: candidate.message.date,
      smsFingerprint: candidate.smsFingerprint,
    })),
    categories: context.categories,
    supportedCurrencies: context.supportedCurrencies,
  });

  if (localResult.error) {
    logger.warn("smsParser.local.failed", {
      errorKind: localResult.error.kind,
      candidateCount: candidates.length,
    });
    return {
      transactions: [],
      matchedPatternIds: localResult.matchedPatternIds,
      runtimeScopeCounts: {},
      hasError: true,
    };
  }

  const validCategoryMap = buildCategoryMap(context.categories);
  const candidatesById = new Map(
    candidates.map((candidate) => [candidate.message.id, candidate])
  );
  const runtimeScopeCounts = localResult.transactions.reduce<
    Record<string, number>
  >((counts, transaction) => {
    const currentCount = counts[transaction.patternRuntimeScope] ?? 0;
    return {
      ...counts,
      [transaction.patternRuntimeScope]: currentCount + 1,
    };
  }, {});

  return {
    transactions: localResult.transactions.map((transaction) => {
      const candidate = candidatesById.get(transaction.messageId);
      const category = parseCategory(
        transaction.categorySystemName,
        validCategoryMap
      );
      return {
        amount: transaction.amount,
        currency: normalizeCurrency(transaction.currency),
        type: normalizeType(transaction.type),
        counterparty: transaction.counterparty,
        date: transaction.date,
        source: "SMS",
        originLabel: candidate?.message.address ?? "",
        deduplicationHash: transaction.smsFingerprint,
        smsFingerprint: transaction.smsFingerprint,
        senderDisplayName: candidate?.message.address ?? "",
        categoryId: category.id,
        categoryDisplayName: category.displayName,
        rawSmsBody: candidate?.message.body ?? "",
        confidence: clampConfidence(transaction.confidence),
        reviewStatus: transaction.reviewStatus,
        reviewReasons: transaction.reviewReasons,
        isAtmWithdrawal: transaction.isAtmWithdrawal,
        cardLast4: transaction.cardLast4,
      };
    }),
    matchedPatternIds: [],
    runtimeScopeCounts,
    hasError: false,
  };
}

function createLocalResult(
  candidates: readonly SmsCandidate[],
  context: ParseSmsContext
): SmsParserOrchestratorResult {
  const local = mapLocalTransactions(candidates, context);
  return {
    transactions: local.transactions,
    hasError: local.hasError,
    isRetryable: local.hasError ? false : undefined,
    unresolvedCandidates: [],
    diagnostics: createDiagnostics({
      mode: "local-primary",
      attemptedAi: false,
      attemptedLocal: true,
      candidateCount: candidates.length,
      resultCount: local.transactions.length,
      matchedPatternIds: [],
      runtimeScopeCounts: local.runtimeScopeCounts,
    }),
  };
}

const trustedCatalogProvider = createBundledTrustedSmsCatalogProvider(
  QNB_EGYPT_TRUSTED_SMS_CATALOG
);

function hasTrustedPatternEvidence(
  result: TrustedSmsParserOutcome | ReturnType<typeof matchTrustedSmsTemplate>
): boolean {
  return (
    result.status === "matched" ||
    result.status === "rejected" ||
    result.status === "ambiguous" ||
    (result.status === "unresolved" && result.patternIds.length > 0)
  );
}

export function getTrustedPrefilterDisposition(
  candidate: SmsCandidate,
  supportedCurrencies: readonly string[],
  activation: TrustedSmsCatalogActivation = trustedCatalogProvider.getActivation()
): TrustedPrefilterDisposition {
  const parserCandidate = {
    candidateId: candidate.message.id,
    smsFingerprint: candidate.smsFingerprint,
    sender: candidate.message.address,
    body: candidate.message.body,
    receivedAtMs: candidate.message.date,
  };
  const result = parseSmsWithTrustedCatalog({
    candidates: [parserCandidate],
    activation,
    supportedCurrencies,
  });
  const outcome = result.outcomes[0];
  if (outcome?.status === "rejected") {
    return shouldUseHybridSmsParser() ? "route_to_parser" : "filter_before_ai";
  }
  if (outcome !== undefined && hasTrustedPatternEvidence(outcome)) {
    return "route_to_parser";
  }

  if (activation.status !== "active") {
    const bundledMatch = matchTrustedSmsTemplate({
      candidate: parserCandidate,
      patterns: QNB_EGYPT_TRUSTED_SMS_CATALOG.patterns,
      supportedCurrencies,
      includeDisabledPatterns: true,
    });
    return hasTrustedPatternEvidence(bundledMatch)
      ? "route_to_parser"
      : "not_trusted_candidate";
  }
  const disabledMatch = matchTrustedSmsTemplate({
    candidate: parserCandidate,
    patterns: QNB_EGYPT_TRUSTED_SMS_CATALOG.patterns.filter(
      (pattern) => !pattern.enabled
    ),
    supportedCurrencies,
    includeDisabledPatterns: true,
  });
  return hasTrustedPatternEvidence(disabledMatch)
    ? "route_to_parser"
    : "not_trusted_candidate";
}

function mapTrustedTransaction(
  transaction: TrustedSmsParsedTransaction,
  candidate: SmsCandidate,
  context: ParseSmsContext
): ParsedSmsTransaction {
  const category = parseCategory(
    transaction.categorySystemName,
    buildCategoryMap(context.categories)
  );
  return {
    amount: transaction.amount,
    currency: normalizeCurrency(transaction.currency),
    type: normalizeType(transaction.type),
    counterparty: transaction.counterparty,
    date: transaction.date,
    categoryId: category.id,
    categoryDisplayName: category.displayName,
    confidence: clampConfidence(transaction.confidence),
    originLabel: candidate.message.address,
    source: "SMS",
    deduplicationHash: candidate.smsFingerprint,
    smsFingerprint: candidate.smsFingerprint,
    senderDisplayName: candidate.message.address,
    rawSmsBody: candidate.message.body,
    reviewStatus: "needs_review",
    reviewReasons: transaction.reviewReasons,
    isAtmWithdrawal: transaction.isAtmWithdrawal,
    cardLast4: transaction.cardLast4,
  };
}

function countOutcomes(
  outcomes: readonly TrustedSmsParserOutcome[],
  status: TrustedSmsParserOutcome["status"]
): number {
  return outcomes.filter((outcome) => outcome.status === status).length;
}

function createReasonCounts(
  outcomes: readonly TrustedSmsParserOutcome[]
): Readonly<Record<string, number>> {
  return outcomes.reduce<Record<string, number>>((counts, outcome) => {
    if (outcome.status === "matched") return counts;
    const reason =
      outcome.status === "ambiguous" ? "ambiguous" : outcome.reason;
    return { ...counts, [reason]: (counts[reason] ?? 0) + 1 };
  }, {});
}

function createHybridReasonCounts(
  outcomes: readonly TrustedSmsParserOutcome[],
  unresolvedCandidates: readonly HybridSmsUnresolvedCandidate[]
): Readonly<Record<string, number>> {
  return unresolvedCandidates.reduce<Record<string, number>>(
    (counts, unresolvedCandidate) => ({
      ...counts,
      [unresolvedCandidate.reason]:
        (counts[unresolvedCandidate.reason] ?? 0) + 1,
    }),
    { ...createReasonCounts(outcomes) }
  );
}

function mergeDistinctTransactions(
  local: readonly ParsedSmsTransaction[],
  ai: readonly ParsedSmsTransaction[]
): {
  readonly transactions: readonly ParsedSmsTransaction[];
  readonly duplicateDiscardedCount: number;
} {
  const merged = new Map<string, ParsedSmsTransaction>();
  let duplicateDiscardedCount = 0;
  for (const transaction of [...local, ...ai]) {
    const transactionKey = getParsedSmsTransactionKey(transaction);
    if (merged.has(transactionKey)) {
      duplicateDiscardedCount += 1;
      continue;
    }
    merged.set(transactionKey, transaction);
  }
  return {
    transactions: [...merged.values()],
    duplicateDiscardedCount,
  };
}

async function parseHybrid(
  candidates: readonly SmsCandidate[],
  context: ParseSmsContext,
  onProgress?: (progress: AiParseProgress) => void,
  abortSignal?: AbortSignal
): Promise<SmsParserOrchestratorResult> {
  throwIfAborted(abortSignal);
  if (!(await hasAiTransactionConsent())) {
    throw createAiConsentRequiredError();
  }
  throwIfAborted(abortSignal);
  const trustedCatalogActivation = trustedCatalogProvider.getActivation();
  const candidatesById = new Map(
    candidates.map((candidate) => [candidate.message.id, candidate])
  );
  const localResult = parseSmsWithTrustedCatalog({
    candidates: candidates.map((candidate) => ({
      candidateId: candidate.message.id,
      smsFingerprint: candidate.smsFingerprint,
      sender: candidate.message.address,
      body: candidate.message.body,
      receivedAtMs: candidate.message.date,
    })),
    activation: trustedCatalogActivation,
    supportedCurrencies: context.supportedCurrencies,
  });
  throwIfAborted(abortSignal);
  const localTransactions = localResult.outcomes.flatMap((outcome) => {
    if (outcome.status !== "matched") return [];
    const candidate = candidatesById.get(outcome.candidateId);
    return candidate
      ? [mapTrustedTransaction(outcome.transaction, candidate, context)]
      : [];
  });
  const aiCandidates = localResult.outcomes.flatMap((outcome) => {
    if (outcome.status === "matched" || outcome.status === "rejected")
      return [];
    const candidate = candidatesById.get(outcome.candidateId);
    return candidate ? [candidate] : [];
  });
  let aiResult: AiParseResult = { transactions: [], hasError: false };
  if (aiCandidates.length > 0) {
    throwIfAborted(abortSignal);
    if (!(await hasAiTransactionConsent())) {
      throwIfAborted(abortSignal);
      throw createAiConsentRequiredError();
    }
    throwIfAborted(abortSignal);
    try {
      aiResult = await parseSmsWithAi(
        aiCandidates,
        context,
        onProgress
          ? (progress) =>
              onProgress({
                ...progress,
                transactionsSoFar:
                  localTransactions.length + progress.transactionsSoFar,
              })
          : undefined,
        abortSignal
      );
    } catch (error: unknown) {
      if (
        (error instanceof Error && error.name === "AbortError") ||
        isAiConsentRequiredError(error)
      ) {
        throw error;
      }
      logger.warn("smsParser.hybrid.aiFailed", {
        candidateCount: aiCandidates.length,
        errorName: error instanceof Error ? error.name : "unknown",
      });
      aiResult = { transactions: [], hasError: true, isRetryable: true };
    }
  }
  throwIfAborted(abortSignal);
  const unresolvedCandidates: readonly HybridSmsUnresolvedCandidate[] =
    aiResult.hasError
      ? (aiResult.unresolvedCandidates ??
        aiCandidates.map((candidate) => ({
          candidate,
          reason: "ai_failed",
          isRetryable: aiResult.isRetryable !== false,
        })))
      : [];
  const mergedResult = mergeDistinctTransactions(
    localTransactions,
    aiResult.transactions
  );
  const transactions = mergedResult.transactions;
  const matchedPatternIds = localResult.outcomes.flatMap((outcome) =>
    outcome.status === "matched" ? [outcome.transaction.patternId] : []
  );
  return {
    transactions,
    hasError: aiResult.hasError,
    isRetryable: aiResult.isRetryable,
    unresolvedCandidates,
    diagnostics: createDiagnostics({
      mode: "hybrid",
      attemptedAi: aiCandidates.length > 0,
      attemptedLocal: true,
      candidateCount: candidates.length,
      resultCount: transactions.length,
      matchedPatternIds,
      runtimeScopeCounts: { trusted_production: localTransactions.length },
      catalogVersion: trustedCatalogActivation.catalogVersion ?? undefined,
      localMatchedCount: countOutcomes(localResult.outcomes, "matched"),
      localRejectedCount: countOutcomes(localResult.outcomes, "rejected"),
      localUnresolvedCount: countOutcomes(localResult.outcomes, "unresolved"),
      localAmbiguousCount: countOutcomes(localResult.outcomes, "ambiguous"),
      aiAttemptedCount: aiCandidates.length,
      aiMatchedCount: aiResult.transactions.length,
      unresolvedCount: unresolvedCandidates.length,
      duplicateDiscardedCount: mergedResult.duplicateDiscardedCount,
      reasonCounts: createHybridReasonCounts(
        localResult.outcomes,
        unresolvedCandidates
      ),
    }),
  };
}

async function hasAiTransactionConsent(): Promise<boolean> {
  const consentStatus = await getAiProcessingConsentStatus();
  return consentStatus.isConsented;
}

function getAiDiagnosticsMode(): SmsParserMode {
  return shouldUseFixtureSmsParser() ? "fixture" : "ai-primary";
}

function getConfiguredDiagnosticsMode(): SmsParserMode {
  if (shouldUseLocalSmsParser()) return "local-primary";
  if (shouldUseHybridSmsParser()) return "hybrid";
  return getAiDiagnosticsMode();
}

function throwIfAborted(abortSignal?: AbortSignal): void {
  if (!abortSignal?.aborted) return;

  const error = new Error("SMS parse aborted");
  error.name = "AbortError";
  throw error;
}

export async function parseSmsWithOrchestrator(
  candidates: readonly SmsCandidate[],
  context: ParseSmsContext,
  onProgress?: (progress: AiParseProgress) => void,
  abortSignal?: AbortSignal
): Promise<SmsParserOrchestratorResult> {
  if (candidates.length === 0) {
    return {
      transactions: [],
      hasError: false,
      unresolvedCandidates: [],
      diagnostics: createDiagnostics({
        mode: getConfiguredDiagnosticsMode(),
        attemptedAi: false,
        attemptedLocal: false,
        candidateCount: 0,
        resultCount: 0,
      }),
    };
  }

  if (shouldUseLocalSmsParser()) {
    throwIfAborted(abortSignal);

    if (!(await hasAiTransactionConsent())) {
      throwIfAborted(abortSignal);
      throw createAiConsentRequiredError();
    }

    throwIfAborted(abortSignal);
    const result = createLocalResult(candidates, context);
    throwIfAborted(abortSignal);

    onProgress?.({
      chunksCompleted: candidates.length > 0 ? 1 : 0,
      totalChunks: candidates.length > 0 ? 1 : 0,
      transactionsSoFar: result.transactions.length,
      chunkDurationMs: 0,
    });
    throwIfAborted(abortSignal);

    return result;
  }

  if (shouldUseHybridSmsParser()) {
    return parseHybrid(candidates, context, onProgress, abortSignal);
  }

  try {
    const aiResult = await parseSmsWithAi(
      candidates,
      context,
      onProgress,
      abortSignal
    );

    return {
      ...aiResult,
      unresolvedCandidates: aiResult.unresolvedCandidates ?? [],
      diagnostics: createDiagnostics({
        mode: getAiDiagnosticsMode(),
        attemptedAi: !shouldUseFixtureSmsParser(),
        attemptedLocal: false,
        candidateCount: candidates.length,
        resultCount: aiResult.transactions.length,
        unresolvedCount: aiResult.unresolvedCandidates?.length ?? 0,
      }),
    };
  } catch (error: unknown) {
    if (
      (error instanceof Error && error.name === "AbortError") ||
      isAiConsentRequiredError(error)
    ) {
      throw error;
    }

    logger.warn("smsParser.ai.failed", {
      candidateCount: candidates.length,
      errorName: error instanceof Error ? error.name : "unknown",
    });

    return {
      transactions: [],
      hasError: true,
      isRetryable: true,
      unresolvedCandidates: candidates.map((candidate) => ({
        candidate,
        reason: "ai_failed",
        isRetryable: true,
      })),
      diagnostics: createDiagnostics({
        mode: "ai-primary",
        attemptedAi: true,
        attemptedLocal: false,
        candidateCount: candidates.length,
        resultCount: 0,
      }),
    };
  }
}
