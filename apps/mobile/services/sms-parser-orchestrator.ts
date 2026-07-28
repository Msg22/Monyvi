import {
  buildCategoryMap,
  clampConfidence,
  getParsedSmsTransactionKey,
  isExcludedBeforeSmsParsing,
  matchTrustedSmsTemplate,
  normalizeCurrency,
  normalizeType,
  createBundledTrustedSmsCatalogProvider,
  parseCategory,
  parseSmsWithTrustedCatalog,
  QNB_EGYPT_TRUSTED_SMS_CATALOG,
  selectSmsAiWork,
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
import { USER_DATA_ACCESS_ERROR_CODES } from "./user-data-access-error-codes";
import {
  createAiConsentRequiredError,
  isAiConsentRequiredError,
  parseSmsWithAi,
  type AiParseProgress,
  type AiParseResult,
  type ParseSmsContext,
  type SmsAiRequestContext,
  type SmsCandidate,
} from "./ai-sms-parser-service";
import {
  enrichTrustedSmsCategories,
  MIN_TRUSTED_CATEGORY_CONFIDENCE,
  TRUSTED_ENRICHED_PURCHASE_CONFIDENCE,
  type TrustedSmsCategoryCandidate,
  type TrustedSmsCategoryEnrichmentResult,
  type TrustedSmsCategoryOutcome,
  type SmsCategoryEnrichmentRequestContext,
} from "./ai-sms-category-enrichment-service";
import {
  getAiProcessingConsentStatus,
  revokeAiProcessingConsent,
} from "./profile-service";
import { createLocalParserResult } from "./sms-local-parser-adapter";
import { publishCompletedSmsParserTransactions } from "./sms-parser-progress-service";
import { hasTrustedPatternEvidence } from "./sms-trusted-pattern-evidence";

import {
  createSmsParserDiagnostics as createDiagnostics,
  createSmsScanSafeguardSummary as createSafeguardSummary,
  type HybridSmsUnresolvedCandidate,
  type SmsParserMode,
  type SmsParserOrchestratorOptions,
  type SmsParserOrchestratorResult,
} from "./sms-parser-result-contract";
import { getEffectiveSmsScanPolicy } from "./sms-scan-policy-service";

export {
  toSmsParserDiagnosticsLogContext,
  type HybridSmsUnresolvedCandidate,
  type HybridSmsUnresolvedReason,
  type SmsParserDiagnostics,
  type SmsParserMode,
  type SmsParserOrchestratorOptions,
  type SmsParserOrchestratorResult,
  type SmsScanSafeguardSummary,
} from "./sms-parser-result-contract";
export { initializeSmsParserScanSession } from "./sms-parser-scan-session-service";

export type TrustedPrefilterDisposition =
  | "not_trusted_candidate"
  | "route_to_parser"
  | "filter_before_ai";

const trustedCatalogProvider = createBundledTrustedSmsCatalogProvider(
  QNB_EGYPT_TRUSTED_SMS_CATALOG
);

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
  context: ParseSmsContext,
  categoryOutcome?: TrustedSmsCategoryOutcome
): ParsedSmsTransaction {
  const acceptedCategory =
    transaction.messageFamily === "card_purchase" &&
    categoryOutcome !== undefined &&
    Number.isFinite(categoryOutcome.confidence) &&
    categoryOutcome.confidence >= MIN_TRUSTED_CATEGORY_CONFIDENCE
      ? context.categories.find(
          (category) =>
            category.isSystem === true &&
            category.type === "EXPENSE" &&
            category.isHidden !== true &&
            category.isInternal !== true &&
            category.deleted !== true &&
            category.systemName === categoryOutcome.categorySystemName
        )
      : undefined;
  const acceptedCategoryOutcome =
    acceptedCategory !== undefined && categoryOutcome !== undefined
      ? categoryOutcome
      : undefined;
  const isAcceptedCategoryOutcome = acceptedCategoryOutcome !== undefined;
  const category = acceptedCategory
    ? {
        id: acceptedCategory.id,
        displayName: acceptedCategory.displayName,
      }
    : parseCategory(
        transaction.categorySystemName,
        buildCategoryMap(context.categories)
      );
  const reviewReasons = isAcceptedCategoryOutcome
    ? transaction.reviewReasons.filter(
        (reason) => reason !== "low_confidence" && reason !== "category_needed"
      )
    : transaction.reviewReasons;
  return {
    amount: transaction.amount,
    currency: normalizeCurrency(transaction.currency),
    type: normalizeType(transaction.type),
    counterparty: transaction.counterparty,
    date: transaction.date,
    categoryId: category.id,
    categoryDisplayName: category.displayName,
    confidence: isAcceptedCategoryOutcome
      ? Math.min(
          TRUSTED_ENRICHED_PURCHASE_CONFIDENCE,
          clampConfidence(acceptedCategoryOutcome.confidence)
        )
      : clampConfidence(transaction.confidence),
    originLabel: candidate.message.address,
    source: "SMS",
    deduplicationHash: candidate.smsFingerprint,
    smsFingerprint: candidate.smsFingerprint,
    senderDisplayName: candidate.message.address,
    rawSmsBody: candidate.message.body,
    reviewStatus:
      isAcceptedCategoryOutcome && reviewReasons.length === 0
        ? "auto_selectable"
        : "needs_review",
    reviewReasons,
    isAtmWithdrawal: transaction.isAtmWithdrawal,
    cardLast4: transaction.cardLast4,
  };
}

function toCategoryCandidate(
  transaction: TrustedSmsParsedTransaction
): TrustedSmsCategoryCandidate | null {
  if (
    transaction.messageFamily !== "card_purchase" ||
    transaction.type !== "EXPENSE" ||
    transaction.counterparty.trim().length === 0
  ) {
    return null;
  }
  return {
    candidateId: transaction.messageId,
    merchant: transaction.counterparty,
    transactionType: transaction.type,
    messageFamily: transaction.messageFamily,
  };
}

function createEmptyCategoryEnrichmentResult(): TrustedSmsCategoryEnrichmentResult {
  return {
    outcomesByCandidateId: new Map(),
    attemptedMerchantCount: 0,
    acceptedCandidateCount: 0,
    rejectedResultCount: 0,
    missingResultCount: 0,
    hasError: false,
  };
}

interface HybridAiFallbackResult extends AiParseResult {
  readonly isConsentRequired?: boolean;
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

interface TrustedMatchedCandidate {
  readonly transaction: TrustedSmsParsedTransaction;
  readonly candidate: SmsCandidate;
}

function collectTrustedMatches(
  outcomes: readonly TrustedSmsParserOutcome[],
  candidatesById: ReadonlyMap<string, SmsCandidate>
): readonly TrustedMatchedCandidate[] {
  return outcomes.flatMap((outcome) => {
    if (outcome.status !== "matched") return [];
    const candidate = candidatesById.get(outcome.candidateId);
    return candidate ? [{ transaction: outcome.transaction, candidate }] : [];
  });
}

function collectAiCandidates(
  outcomes: readonly TrustedSmsParserOutcome[],
  candidatesById: ReadonlyMap<string, SmsCandidate>,
  terminalFingerprints: ReadonlySet<string>
): readonly SmsCandidate[] {
  return outcomes.flatMap((outcome) => {
    if (outcome.status === "matched" || outcome.status === "rejected")
      return [];
    const candidate = candidatesById.get(outcome.candidateId);
    return candidate !== undefined &&
      !terminalFingerprints.has(candidate.smsFingerprint)
      ? [candidate]
      : [];
  });
}

function isParserControlFlowError(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === "AbortError") ||
    isAiConsentRequiredError(error) ||
    (error instanceof Error &&
      error.message === USER_DATA_ACCESS_ERROR_CODES.AUTH_SCOPE_CHANGED)
  );
}

async function runCategoryEnrichment(
  candidates: readonly TrustedSmsCategoryCandidate[],
  context: ParseSmsContext,
  abortSignal: AbortSignal | undefined,
  expectedUserId: string,
  requestContext?: SmsAiRequestContext
): Promise<TrustedSmsCategoryEnrichmentResult> {
  if (candidates.length === 0) return createEmptyCategoryEnrichmentResult();
  try {
    return await enrichTrustedSmsCategories(
      candidates,
      context.categories,
      abortSignal,
      expectedUserId,
      toCategoryEnrichmentRequestContext(requestContext)
    );
  } catch (error: unknown) {
    if (isParserControlFlowError(error)) throw error;
    logger.warn("smsParser.hybrid.categoryEnrichmentFailed", {
      candidateCount: candidates.length,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return {
      ...createEmptyCategoryEnrichmentResult(),
      attemptedMerchantCount: candidates.length,
      missingResultCount: candidates.length,
      hasError: true,
    };
  }
}

function toCategoryEnrichmentRequestContext(
  requestContext?: SmsAiRequestContext
): SmsCategoryEnrichmentRequestContext | undefined {
  if (requestContext?.scanSessionId === null || requestContext === undefined) {
    return undefined;
  }

  return {
    scanSessionId: requestContext.scanSessionId,
    scanKind: requestContext.scanKind,
  };
}

async function runFullAiFallback(
  candidates: readonly SmsCandidate[],
  context: ParseSmsContext,
  localTransactionCount: number,
  onProgress?: (progress: AiParseProgress) => void | Promise<void>,
  abortSignal?: AbortSignal,
  expectedUserId?: string,
  requestContext?: SmsAiRequestContext,
  requestKey?: string,
  remoteScanSessionReady?: Promise<void>
): Promise<HybridAiFallbackResult> {
  if (candidates.length === 0) return { transactions: [], hasError: false };
  try {
    await remoteScanSessionReady;
    return await parseSmsWithPinnedUser(
      candidates,
      context,
      onProgress
        ? (progress) =>
            onProgress({
              ...progress,
              transactionsSoFar:
                localTransactionCount + progress.transactionsSoFar,
            })
        : undefined,
      abortSignal,
      expectedUserId,
      requestContext,
      requestKey
    );
  } catch (error: unknown) {
    if (
      (error instanceof Error && error.name === "AbortError") ||
      (error instanceof Error &&
        error.message === USER_DATA_ACCESS_ERROR_CODES.AUTH_SCOPE_CHANGED)
    ) {
      throw error;
    }
    if (isAiConsentRequiredError(error)) {
      return {
        transactions: [],
        hasError: true,
        isRetryable: false,
        isConsentRequired: true,
        unresolvedCandidates: candidates.map((candidate) => ({
          candidate,
          reason: "chunk_failed",
          isRetryable: false,
        })),
      };
    }
    logger.warn("smsParser.hybrid.aiFailed", {
      candidateCount: candidates.length,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return { transactions: [], hasError: true, isRetryable: true };
  }
}

function parseSmsWithPinnedUser(
  candidates: readonly SmsCandidate[],
  context: ParseSmsContext,
  onProgress?: (progress: AiParseProgress) => void | Promise<void>,
  abortSignal?: AbortSignal,
  expectedUserId?: string,
  requestContext?: SmsAiRequestContext,
  requestKey?: string
): Promise<AiParseResult> {
  if (
    expectedUserId === undefined &&
    requestContext === undefined &&
    requestKey === undefined
  ) {
    return parseSmsWithAi(candidates, context, onProgress, abortSignal);
  }
  return parseSmsWithAi(
    candidates,
    context,
    onProgress,
    abortSignal,
    expectedUserId,
    requestContext,
    requestKey
  );
}

function selectFullAiWork(candidates: readonly SmsCandidate[]): {
  readonly admitted: readonly SmsCandidate[];
  readonly deferred: readonly SmsCandidate[];
} {
  const selection = selectSmsAiWork(
    candidates.map((candidate) => ({
      candidate,
      fingerprint: candidate.smsFingerprint,
      receivedAtMs: candidate.message.date,
    })),
    getEffectiveSmsScanPolicy().fullParser.maxUnitsPerScan
  );
  return {
    admitted: selection.admitted.map(({ candidate }) => candidate),
    deferred: selection.deferred.map(({ candidate }) => candidate),
  };
}

function createScanLimitedCandidates(
  candidates: readonly SmsCandidate[]
): readonly HybridSmsUnresolvedCandidate[] {
  return candidates.map((candidate) => ({
    candidate,
    reason: "capacity_limited",
    isRetryable: false,
  }));
}

function countCapacityLimitedCandidates(
  candidates: readonly HybridSmsUnresolvedCandidate[]
): number {
  return candidates.filter(({ reason }) => reason === "capacity_limited")
    .length;
}

function countOtherUnresolvedCandidates(
  candidates: readonly HybridSmsUnresolvedCandidate[]
): number {
  return candidates.length - countCapacityLimitedCandidates(candidates);
}

async function reconcileLateRemoteConsentRejection(
  isConsentRequired: boolean,
  expectedUserId: string
): Promise<void> {
  if (!isConsentRequired) return;

  await revokeAiProcessingConsent({ expectedUserId }).catch(
    (error: unknown) => {
      if (isParserControlFlowError(error)) throw error;
      logger.warn("smsParser.hybrid.consentReconciliationFailed", {
        errorName: error instanceof Error ? error.name : "unknown",
      });
    }
  );
}

async function parseHybrid(
  candidates: readonly SmsCandidate[],
  context: ParseSmsContext,
  onProgress?: (progress: AiParseProgress) => void | Promise<void>,
  abortSignal?: AbortSignal,
  options: SmsParserOrchestratorOptions = {}
): Promise<SmsParserOrchestratorResult> {
  throwIfAborted(abortSignal);
  const consentStatus = await getAiProcessingConsentStatus();
  assertExpectedUserId(consentStatus.userId, options.expectedUserId);
  if (!consentStatus.isConsented) throw createAiConsentRequiredError();
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

  const trustedMatches = collectTrustedMatches(
    localResult.outcomes,
    candidatesById
  );
  const durableLocalRejectionFingerprints = localResult.outcomes.flatMap(
    (outcome) => (outcome.status === "rejected" ? [outcome.smsFingerprint] : [])
  );
  const categoryCandidates = trustedMatches.flatMap(({ transaction }) => {
    const categoryCandidate = toCategoryCandidate(transaction);
    return categoryCandidate ? [categoryCandidate] : [];
  });
  const aiCandidates = collectAiCandidates(
    localResult.outcomes,
    candidatesById,
    options.terminalFingerprints ?? new Set()
  );
  const aiSelection = selectFullAiWork(aiCandidates);
  if (categoryCandidates.length > 0 || aiCandidates.length > 0) {
    const refreshedConsentStatus = await getAiProcessingConsentStatus();
    assertExpectedUserId(refreshedConsentStatus.userId, options.expectedUserId);
    if (
      !refreshedConsentStatus.isConsented ||
      refreshedConsentStatus.userId !== consentStatus.userId
    ) {
      throwIfAborted(abortSignal);
      throw createAiConsentRequiredError();
    }
  }
  throwIfAborted(abortSignal);

  const localBaselineTransactions = trustedMatches.map(
    ({ transaction, candidate }) =>
      mapTrustedTransaction(transaction, candidate, context)
  );
  await publishCompletedSmsParserTransactions(
    onProgress,
    localBaselineTransactions,
    aiSelection.admitted.length > 0
  );
  throwIfAborted(abortSignal);

  const remoteScanSessionReady =
    aiSelection.admitted.length > 0 &&
    options.ensureRemoteScanSession !== undefined
      ? Promise.resolve().then(options.ensureRemoteScanSession)
      : undefined;
  const [categoryResult, aiResult] = await Promise.all([
    runCategoryEnrichment(
      categoryCandidates,
      context,
      abortSignal,
      consentStatus.userId,
      options.requestContext
    ),
    runFullAiFallback(
      aiSelection.admitted,
      context,
      trustedMatches.length,
      onProgress,
      abortSignal,
      options.expectedUserId,
      options.requestContext,
      options.requestKey,
      remoteScanSessionReady
    ),
  ]);
  throwIfAborted(abortSignal);
  const isCategoryConsentRequired = categoryResult.isConsentRequired === true;
  const isAiConsentRequired = aiResult.isConsentRequired === true;
  const isConsentRequired = isCategoryConsentRequired || isAiConsentRequired;
  await reconcileLateRemoteConsentRejection(
    isConsentRequired,
    consentStatus.userId
  );
  if (isAiConsentRequired) throw createAiConsentRequiredError();
  throwIfAborted(abortSignal);

  const localTransactions = trustedMatches.map(({ transaction, candidate }) =>
    mapTrustedTransaction(
      transaction,
      candidate,
      context,
      categoryResult.outcomesByCandidateId.get(transaction.messageId)
    )
  );
  const aiUnresolvedCandidates: readonly HybridSmsUnresolvedCandidate[] =
    aiResult.hasError
      ? (aiResult.unresolvedCandidates ??
        aiSelection.admitted.map((candidate) => ({
          candidate,
          reason: "ai_failed",
          isRetryable: aiResult.isRetryable !== false,
        })))
      : [];
  const deferredCandidates = createScanLimitedCandidates(aiSelection.deferred);
  const unresolvedCandidates = [
    ...aiUnresolvedCandidates,
    ...deferredCandidates,
  ];
  const mergedResult = mergeDistinctTransactions(
    localTransactions,
    aiResult.transactions
  );
  const transactions = mergedResult.transactions;
  const availability =
    aiResult.availability ??
    (deferredCandidates.length > 0
      ? { reason: "scan_limit" as const, availableAt: null }
      : undefined);
  const capacityLimitedCount = countCapacityLimitedCandidates(
    aiUnresolvedCandidates
  );
  return {
    transactions,
    hasError: aiResult.hasError || deferredCandidates.length > 0,
    isRetryable:
      aiResult.isRetryable ??
      (deferredCandidates.length > 0 ? false : undefined),
    isConsentRequired: isCategoryConsentRequired || undefined,
    unresolvedCandidates,
    durableLocalRejectionFingerprints,
    durableNegativeFingerprints: aiResult.durableNegativeFingerprints,
    oversizedCandidates: aiResult.oversizedCandidates,
    availability,
    safeguardSummary: createSafeguardSummary({
      admittedAiCount: aiSelection.admitted.length,
      deferredAiCount: aiSelection.deferred.length + capacityLimitedCount,
      oversizedCount: aiResult.oversizedCandidates?.length ?? 0,
      unresolvedCount: countOtherUnresolvedCandidates(unresolvedCandidates),
      availability,
    }),
    terminalFingerprints: [
      ...new Set([
        ...(options.terminalFingerprints ?? []),
        ...(aiResult.terminalFingerprints ?? []),
      ]),
    ],
    diagnostics: createDiagnostics({
      mode: "hybrid",
      attemptedAi: aiSelection.admitted.length > 0,
      attemptedLocal: true,
      candidateCount: candidates.length,
      resultCount: transactions.length,
      matchedPatternIds: trustedMatches.map(
        ({ transaction }) => transaction.patternId
      ),
      runtimeScopeCounts: { trusted_production: localTransactions.length },
      catalogVersion: trustedCatalogActivation.catalogVersion ?? undefined,
      localMatchedCount: countOutcomes(localResult.outcomes, "matched"),
      localRejectedCount: countOutcomes(localResult.outcomes, "rejected"),
      localUnresolvedCount: countOutcomes(localResult.outcomes, "unresolved"),
      localAmbiguousCount: countOutcomes(localResult.outcomes, "ambiguous"),
      aiAttemptedCount: aiSelection.admitted.length,
      aiMatchedCount: aiResult.transactions.length,
      aiDeferredCount: aiSelection.deferred.length,
      categoryEnrichmentAttemptedCount: categoryResult.attemptedMerchantCount,
      categoryEnrichedCount: categoryResult.acceptedCandidateCount,
      categoryEnrichmentRejectedCount: categoryResult.rejectedResultCount,
      categoryEnrichmentMissingCount: categoryResult.missingResultCount,
      categoryEnrichmentFailed: categoryResult.hasError,
      unresolvedCount: unresolvedCandidates.length,
      duplicateDiscardedCount: mergedResult.duplicateDiscardedCount,
      reasonCounts: createHybridReasonCounts(
        localResult.outcomes,
        unresolvedCandidates
      ),
    }),
  };
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

function assertExpectedUserId(
  actualUserId: string,
  expectedUserId?: string
): void {
  if (expectedUserId !== undefined && actualUserId !== expectedUserId) {
    throw new Error(USER_DATA_ACCESS_ERROR_CODES.AUTH_SCOPE_CHANGED);
  }
}

export async function parseSmsWithOrchestrator(
  candidates: readonly SmsCandidate[],
  context: ParseSmsContext,
  onProgress?: (progress: AiParseProgress) => void | Promise<void>,
  abortSignal?: AbortSignal,
  options: SmsParserOrchestratorOptions = {}
): Promise<SmsParserOrchestratorResult> {
  const parserCandidates = candidates.filter(
    (candidate) => !isExcludedBeforeSmsParsing(candidate.message.body)
  );

  if (parserCandidates.length === 0) {
    return {
      transactions: [],
      hasError: false,
      unresolvedCandidates: [],
      safeguardSummary: createSafeguardSummary({}),
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

    const consentStatus = await getAiProcessingConsentStatus();
    assertExpectedUserId(consentStatus.userId, options.expectedUserId);
    if (!consentStatus.isConsented) {
      throwIfAborted(abortSignal);
      throw createAiConsentRequiredError();
    }

    throwIfAborted(abortSignal);
    const result = createLocalParserResult(parserCandidates, context);
    throwIfAborted(abortSignal);

    await onProgress?.({
      chunksCompleted: 1,
      totalChunks: 1,
      transactionsSoFar: result.transactions.length,
      completedTransactions: result.transactions,
      chunkDurationMs: 0,
    });
    throwIfAborted(abortSignal);

    return result;
  }

  if (shouldUseHybridSmsParser()) {
    return parseHybrid(
      parserCandidates,
      context,
      onProgress,
      abortSignal,
      options
    );
  }

  try {
    const terminalFingerprints = options.terminalFingerprints ?? new Set();
    const aiCandidates = parserCandidates.filter(
      (candidate) => !terminalFingerprints.has(candidate.smsFingerprint)
    );
    const aiSelection = selectFullAiWork(aiCandidates);
    if (aiSelection.admitted.length === 0) {
      const deferredCandidates = createScanLimitedCandidates(
        aiSelection.deferred
      );
      const availability =
        deferredCandidates.length > 0
          ? { reason: "scan_limit" as const, availableAt: null }
          : undefined;
      return {
        transactions: [],
        hasError: deferredCandidates.length > 0,
        isRetryable: deferredCandidates.length > 0 ? false : undefined,
        unresolvedCandidates: deferredCandidates,
        availability,
        safeguardSummary: createSafeguardSummary({
          deferredAiCount: aiSelection.deferred.length,
          unresolvedCount: 0,
          availability,
        }),
        terminalFingerprints: [...terminalFingerprints],
        diagnostics: createDiagnostics({
          mode: getAiDiagnosticsMode(),
          attemptedAi: false,
          attemptedLocal: false,
          candidateCount: parserCandidates.length,
          resultCount: 0,
          aiDeferredCount: deferredCandidates.length,
        }),
      };
    }
    await options.ensureRemoteScanSession?.();
    const aiResult = await parseSmsWithPinnedUser(
      aiSelection.admitted,
      context,
      onProgress,
      abortSignal,
      options.expectedUserId,
      options.requestContext,
      options.requestKey
    );

    const deferredCandidates = createScanLimitedCandidates(
      aiSelection.deferred
    );
    const unresolvedCandidates = [
      ...(aiResult.unresolvedCandidates ?? []),
      ...deferredCandidates,
    ];
    const availability =
      aiResult.availability ??
      (deferredCandidates.length > 0
        ? { reason: "scan_limit" as const, availableAt: null }
        : undefined);
    const capacityLimitedCount = countCapacityLimitedCandidates(
      aiResult.unresolvedCandidates ?? []
    );
    return {
      ...aiResult,
      hasError: aiResult.hasError || deferredCandidates.length > 0,
      isRetryable:
        aiResult.isRetryable ??
        (deferredCandidates.length > 0 ? false : undefined),
      unresolvedCandidates,
      availability,
      terminalFingerprints: [
        ...new Set([
          ...(terminalFingerprints ?? []),
          ...(aiResult.terminalFingerprints ?? []),
        ]),
      ],
      safeguardSummary: createSafeguardSummary({
        admittedAiCount: aiSelection.admitted.length,
        deferredAiCount: aiSelection.deferred.length + capacityLimitedCount,
        oversizedCount: aiResult.oversizedCandidates?.length ?? 0,
        unresolvedCount: countOtherUnresolvedCandidates(unresolvedCandidates),
        availability,
      }),
      diagnostics: createDiagnostics({
        mode: getAiDiagnosticsMode(),
        attemptedAi: !shouldUseFixtureSmsParser(),
        attemptedLocal: false,
        candidateCount: parserCandidates.length,
        resultCount: aiResult.transactions.length,
        aiAttemptedCount: aiSelection.admitted.length,
        aiDeferredCount: aiSelection.deferred.length,
        unresolvedCount: unresolvedCandidates.length,
      }),
    };
  } catch (error: unknown) {
    if (isParserControlFlowError(error)) {
      throw error;
    }

    logger.warn("smsParser.ai.failed", {
      candidateCount: parserCandidates.length,
      errorName: error instanceof Error ? error.name : "unknown",
    });

    const fallbackSelection = selectFullAiWork(
      parserCandidates.filter(
        (candidate) =>
          !(options.terminalFingerprints ?? new Set()).has(
            candidate.smsFingerprint
          )
      )
    );
    const unresolvedCandidates = [
      ...fallbackSelection.admitted.map((candidate) => ({
        candidate,
        reason: "ai_failed" as const,
        isRetryable: true,
      })),
      ...createScanLimitedCandidates(fallbackSelection.deferred),
    ];
    return {
      transactions: [],
      hasError: true,
      isRetryable: true,
      unresolvedCandidates,
      safeguardSummary: createSafeguardSummary({
        admittedAiCount: fallbackSelection.admitted.length,
        deferredAiCount: fallbackSelection.deferred.length,
        unresolvedCount: fallbackSelection.admitted.length,
      }),
      diagnostics: createDiagnostics({
        mode: "ai-primary",
        attemptedAi: true,
        attemptedLocal: false,
        candidateCount: parserCandidates.length,
        resultCount: 0,
      }),
    };
  }
}
