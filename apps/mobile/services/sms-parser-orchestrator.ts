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
import { USER_DATA_ACCESS_ERROR_CODES } from "./user-data-access-error-codes";
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
import {
  enrichTrustedSmsCategories,
  MIN_TRUSTED_CATEGORY_CONFIDENCE,
  TRUSTED_ENRICHED_PURCHASE_CONFIDENCE,
  type TrustedSmsCategoryCandidate,
  type TrustedSmsCategoryEnrichmentResult,
  type TrustedSmsCategoryOutcome,
} from "./ai-sms-category-enrichment-service";
import {
  getAiProcessingConsentStatus,
  revokeAiProcessingConsent,
} from "./profile-service";

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
  readonly categoryEnrichmentAttemptedCount?: number;
  readonly categoryEnrichedCount?: number;
  readonly categoryEnrichmentRejectedCount?: number;
  readonly categoryEnrichmentMissingCount?: number;
  readonly categoryEnrichmentFailed?: boolean;
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
    categoryEnrichmentAttemptedCount:
      diagnostics.categoryEnrichmentAttemptedCount,
    categoryEnrichedCount: diagnostics.categoryEnrichedCount,
    categoryEnrichmentRejectedCount:
      diagnostics.categoryEnrichmentRejectedCount,
    categoryEnrichmentMissingCount: diagnostics.categoryEnrichmentMissingCount,
    categoryEnrichmentFailed: diagnostics.categoryEnrichmentFailed,
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
  readonly isConsentRequired?: boolean;
}

export interface SmsParserOrchestratorOptions {
  readonly expectedUserId?: string;
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
  readonly categoryEnrichmentAttemptedCount?: number;
  readonly categoryEnrichedCount?: number;
  readonly categoryEnrichmentRejectedCount?: number;
  readonly categoryEnrichmentMissingCount?: number;
  readonly categoryEnrichmentFailed?: boolean;
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
  candidatesById: ReadonlyMap<string, SmsCandidate>
): readonly SmsCandidate[] {
  return outcomes.flatMap((outcome) => {
    if (outcome.status === "matched" || outcome.status === "rejected")
      return [];
    const candidate = candidatesById.get(outcome.candidateId);
    return candidate ? [candidate] : [];
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
  expectedUserId: string
): Promise<TrustedSmsCategoryEnrichmentResult> {
  if (candidates.length === 0) return createEmptyCategoryEnrichmentResult();
  try {
    return await enrichTrustedSmsCategories(
      candidates,
      context.categories,
      abortSignal,
      expectedUserId
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

async function runFullAiFallback(
  candidates: readonly SmsCandidate[],
  context: ParseSmsContext,
  localTransactionCount: number,
  onProgress?: (progress: AiParseProgress) => void,
  abortSignal?: AbortSignal,
  expectedUserId?: string
): Promise<HybridAiFallbackResult> {
  if (candidates.length === 0) return { transactions: [], hasError: false };
  try {
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
      expectedUserId
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
  onProgress?: (progress: AiParseProgress) => void,
  abortSignal?: AbortSignal,
  expectedUserId?: string
): Promise<AiParseResult> {
  if (expectedUserId === undefined) {
    return parseSmsWithAi(candidates, context, onProgress, abortSignal);
  }
  return parseSmsWithAi(
    candidates,
    context,
    onProgress,
    abortSignal,
    expectedUserId
  );
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
  onProgress?: (progress: AiParseProgress) => void,
  abortSignal?: AbortSignal,
  expectedUserId?: string
): Promise<SmsParserOrchestratorResult> {
  throwIfAborted(abortSignal);
  const consentStatus = await getAiProcessingConsentStatus();
  assertExpectedUserId(consentStatus.userId, expectedUserId);
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
  const categoryCandidates = trustedMatches.flatMap(({ transaction }) => {
    const categoryCandidate = toCategoryCandidate(transaction);
    return categoryCandidate ? [categoryCandidate] : [];
  });
  const aiCandidates = collectAiCandidates(
    localResult.outcomes,
    candidatesById
  );
  if (categoryCandidates.length > 0 || aiCandidates.length > 0) {
    const refreshedConsentStatus = await getAiProcessingConsentStatus();
    assertExpectedUserId(refreshedConsentStatus.userId, expectedUserId);
    if (
      !refreshedConsentStatus.isConsented ||
      refreshedConsentStatus.userId !== consentStatus.userId
    ) {
      throwIfAborted(abortSignal);
      throw createAiConsentRequiredError();
    }
  }
  throwIfAborted(abortSignal);

  const [categoryResult, aiResult] = await Promise.all([
    runCategoryEnrichment(
      categoryCandidates,
      context,
      abortSignal,
      consentStatus.userId
    ),
    runFullAiFallback(
      aiCandidates,
      context,
      trustedMatches.length,
      onProgress,
      abortSignal,
      expectedUserId
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
  return {
    transactions,
    hasError: aiResult.hasError,
    isRetryable: aiResult.isRetryable,
    isConsentRequired: isCategoryConsentRequired || undefined,
    unresolvedCandidates,
    diagnostics: createDiagnostics({
      mode: "hybrid",
      attemptedAi: aiCandidates.length > 0,
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
      aiAttemptedCount: aiCandidates.length,
      aiMatchedCount: aiResult.transactions.length,
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
  onProgress?: (progress: AiParseProgress) => void,
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
    const result = createLocalResult(parserCandidates, context);
    throwIfAborted(abortSignal);

    onProgress?.({
      chunksCompleted: 1,
      totalChunks: 1,
      transactionsSoFar: result.transactions.length,
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
      options.expectedUserId
    );
  }

  try {
    const aiResult = await parseSmsWithPinnedUser(
      parserCandidates,
      context,
      onProgress,
      abortSignal,
      options.expectedUserId
    );

    return {
      ...aiResult,
      unresolvedCandidates: aiResult.unresolvedCandidates ?? [],
      diagnostics: createDiagnostics({
        mode: getAiDiagnosticsMode(),
        attemptedAi: !shouldUseFixtureSmsParser(),
        attemptedLocal: false,
        candidateCount: parserCandidates.length,
        resultCount: aiResult.transactions.length,
        unresolvedCount: aiResult.unresolvedCandidates?.length ?? 0,
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

    return {
      transactions: [],
      hasError: true,
      isRetryable: true,
      unresolvedCandidates: parserCandidates.map((candidate) => ({
        candidate,
        reason: "ai_failed",
        isRetryable: true,
      })),
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
