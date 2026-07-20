import {
  buildCategoryMap,
  clampConfidence,
  normalizeCurrency,
  normalizeType,
  parseCategory,
  parseSmsWithLocalParser,
  type ParsedSmsTransaction,
} from "@monyvi/logic";

import { logger } from "@/utils/logger";
import type { ParseSmsContext, SmsCandidate } from "./ai-sms-parser-service";
import {
  createSmsParserDiagnostics,
  createSmsScanSafeguardSummary,
  type SmsParserOrchestratorResult,
} from "./sms-parser-result-contract";

interface LocalTransactionMappingResult {
  readonly transactions: readonly ParsedSmsTransaction[];
  readonly runtimeScopeCounts: Readonly<Record<string, number>>;
  readonly hasError: boolean;
}

function mapLocalTransactions(
  candidates: readonly SmsCandidate[],
  context: ParseSmsContext
): LocalTransactionMappingResult {
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
    return { transactions: [], runtimeScopeCounts: {}, hasError: true };
  }

  const validCategoryMap = buildCategoryMap(context.categories);
  const candidatesById = new Map(
    candidates.map((candidate) => [candidate.message.id, candidate])
  );
  const runtimeScopeCounts = localResult.transactions.reduce<
    Record<string, number>
  >(
    (counts, transaction) => ({
      ...counts,
      [transaction.patternRuntimeScope]:
        (counts[transaction.patternRuntimeScope] ?? 0) + 1,
    }),
    {}
  );

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
    runtimeScopeCounts,
    hasError: false,
  };
}

export function createLocalParserResult(
  candidates: readonly SmsCandidate[],
  context: ParseSmsContext
): SmsParserOrchestratorResult {
  const local = mapLocalTransactions(candidates, context);
  return {
    transactions: local.transactions,
    hasError: local.hasError,
    isRetryable: local.hasError ? false : undefined,
    unresolvedCandidates: [],
    safeguardSummary: createSmsScanSafeguardSummary({}),
    diagnostics: createSmsParserDiagnostics({
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
