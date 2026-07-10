import {
  buildCategoryMap,
  clampConfidence,
  normalizeCurrency,
  normalizeType,
  parseCategory,
  parseSmsWithLocalParser,
  type ParsedSmsTransaction,
} from "@monyvi/logic";
import {
  shouldUseFixtureSmsParser,
  shouldUseLocalSmsParser,
} from "@/config/e2e-test-config";
import { logger } from "@/utils/logger";
import {
  createAiConsentRequiredError,
  isAiConsentRequiredError,
  parseSmsWithAi,
  type AiParseProgress,
  type AiParseResult,
  type ParseSmsContext,
  type SmsCandidate,
} from "./ai-sms-parser-service";
import { getAiProcessingConsentStatus } from "./profile-service";

export type SmsParserMode = "ai-primary" | "local-primary" | "fixture";

export interface SmsParserDiagnostics {
  readonly mode: SmsParserMode;
  readonly attemptedAi: boolean;
  readonly attemptedLocal: boolean;
  readonly candidateCount: number;
  readonly resultCount: number;
  readonly matchedPatternIds: readonly string[];
  readonly runtimeScopeCounts: Readonly<Record<string, number>>;
}

export interface SmsParserOrchestratorResult extends AiParseResult {
  readonly diagnostics: SmsParserDiagnostics;
}

function createDiagnostics(input: {
  readonly mode: SmsParserMode;
  readonly attemptedAi: boolean;
  readonly attemptedLocal: boolean;
  readonly candidateCount: number;
  readonly resultCount: number;
  readonly matchedPatternIds?: readonly string[];
  readonly runtimeScopeCounts?: Readonly<Record<string, number>>;
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

async function canUseLocalParser(): Promise<boolean> {
  const consentStatus = await getAiProcessingConsentStatus();
  return consentStatus.isConsented;
}

function getAiDiagnosticsMode(): SmsParserMode {
  return shouldUseFixtureSmsParser() ? "fixture" : "ai-primary";
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
  if (shouldUseLocalSmsParser()) {
    throwIfAborted(abortSignal);

    if (!(await canUseLocalParser())) {
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

  try {
    const aiResult = await parseSmsWithAi(
      candidates,
      context,
      onProgress,
      abortSignal
    );

    return {
      ...aiResult,
      diagnostics: createDiagnostics({
        mode: getAiDiagnosticsMode(),
        attemptedAi: !shouldUseFixtureSmsParser(),
        attemptedLocal: false,
        candidateCount: candidates.length,
        resultCount: aiResult.transactions.length,
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
