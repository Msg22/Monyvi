import {
  buildCategoryMap,
  clampConfidence,
  normalizeCurrency,
  normalizeType,
  parseCategory,
  type ParsedSmsTransaction,
} from "@monyvi/logic";

import { SMS_FIXTURES, type SmsFixture } from "@/services/dev/sms-fixtures";
import { assertNotAborted } from "@/services/abort-utils";

import type {
  AiParseProgress,
  AiParseResult,
  AiUnresolvedCandidate,
  ParseSmsContext,
  SmsCandidate,
} from "@/services/ai-sms-parser-service";

const retryableOnceAttempts = new Set<string>();

export function resetFixtureAiParserStateForTests(): void {
  retryableOnceAttempts.clear();
}

function findFixture(candidate: SmsCandidate): SmsFixture | null {
  return (
    SMS_FIXTURES.find(
      (fixture) =>
        fixture.sender === candidate.message.address &&
        fixture.body === candidate.message.body
    ) ?? null
  );
}

function parseDate(dateStr: string, fallbackMs: number): Date {
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? new Date(fallbackMs) : parsed;
}

function mapFixtureTransactions(
  candidate: SmsCandidate,
  fixture: SmsFixture,
  context: ParseSmsContext
): ParsedSmsTransaction[] {
  const categoryMap = buildCategoryMap(context.categories);

  return (fixture.expectedTransactions ?? [])
    .filter((transaction) => transaction.isTrusted)
    .map((transaction) => {
      const category = parseCategory(
        transaction.categorySystemName,
        categoryMap
      );

      return {
        amount: Math.abs(transaction.amount),
        currency: normalizeCurrency(transaction.currency),
        type: normalizeType(transaction.type),
        counterparty: transaction.counterparty,
        date: parseDate(transaction.date, candidate.message.date),
        source: "SMS",
        originLabel: candidate.message.address,
        deduplicationHash: candidate.smsFingerprint,
        smsFingerprint: candidate.smsFingerprint,
        senderDisplayName: candidate.message.address,
        categoryId: category.id,
        categoryDisplayName: category.displayName,
        rawSmsBody: candidate.message.body,
        confidence: clampConfidence(transaction.confidenceScore),
        isAtmWithdrawal: transaction.isAtmWithdrawal ?? false,
        cardLast4: transaction.cardLast4,
      };
    });
}

function getFixtureTransactionKey(transaction: ParsedSmsTransaction): string {
  return JSON.stringify({
    smsFingerprint: transaction.smsFingerprint,
    amount: transaction.amount,
    currency: transaction.currency,
    type: transaction.type,
    counterparty: transaction.counterparty ?? null,
    date: transaction.date.getTime(),
    categoryId: transaction.categoryId,
  });
}

function pushUniqueTransactions(
  target: ParsedSmsTransaction[],
  seenTransactions: Set<string>,
  transactions: readonly ParsedSmsTransaction[]
): void {
  for (const transaction of transactions) {
    const key = getFixtureTransactionKey(transaction);
    if (seenTransactions.has(key)) {
      continue;
    }

    seenTransactions.add(key);
    target.push(transaction);
  }
}

export async function parseSmsWithFixtureAi(
  candidates: readonly SmsCandidate[],
  context: ParseSmsContext,
  onProgress?: (progress: AiParseProgress) => void | Promise<void>,
  abortSignal?: AbortSignal
): Promise<AiParseResult> {
  const transactions: ParsedSmsTransaction[] = [];
  const seenTransactions = new Set<string>();
  const unresolvedCandidates: AiUnresolvedCandidate[] = [];
  let areAllFailuresRetryable = true;

  for (const candidate of candidates) {
    assertNotAborted(abortSignal, "SMS parse aborted");
    const fixture = findFixture(candidate);
    if (!fixture) continue;

    const shouldFailOnce =
      fixture.parserFailure === "retryable_once" &&
      !retryableOnceAttempts.has(candidate.smsFingerprint);
    if (shouldFailOnce) {
      retryableOnceAttempts.add(candidate.smsFingerprint);
    }

    if (
      fixture.parserFailure === "retryable" ||
      fixture.parserFailure === "permanent" ||
      shouldFailOnce
    ) {
      const isRetryable = fixture.parserFailure !== "permanent";
      areAllFailuresRetryable = areAllFailuresRetryable && isRetryable;
      unresolvedCandidates.push({
        candidate,
        reason: isRetryable ? "chunk_failed" : "unexpected_failure",
        isRetryable,
      });
      continue;
    }

    pushUniqueTransactions(
      transactions,
      seenTransactions,
      mapFixtureTransactions(candidate, fixture, context)
    );
  }

  assertNotAborted(abortSignal, "SMS parse aborted");
  await onProgress?.({
    chunksCompleted: candidates.length > 0 ? 1 : 0,
    totalChunks: candidates.length > 0 ? 1 : 0,
    transactionsSoFar: transactions.length,
    completedTransactions: transactions,
    chunkDurationMs: 0,
  });

  if (unresolvedCandidates.length > 0) {
    return Promise.resolve({
      transactions,
      hasError: true,
      isRetryable: areAllFailuresRetryable,
      unresolvedCandidates,
    });
  }

  return Promise.resolve({ transactions, hasError: false });
}
