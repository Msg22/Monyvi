import type { ParsedSmsTransaction } from "@monyvi/logic";
import type { ParseSmsContext } from "./ai-sms-parser-service";
import {
  parseSmsWithOrchestrator,
  type HybridSmsUnresolvedCandidate,
} from "./sms-parser-orchestrator";

interface RetrySmsReviewCandidatesInput {
  readonly transactions: readonly ParsedSmsTransaction[];
  readonly unresolvedCandidates: readonly HybridSmsUnresolvedCandidate[];
  readonly parseContext: ParseSmsContext;
  readonly abortSignal?: AbortSignal;
}

export interface SmsReviewRetryResult {
  readonly transactions: readonly ParsedSmsTransaction[];
  readonly unresolvedCandidates: readonly HybridSmsUnresolvedCandidate[];
}

function mergeTransactions(
  existing: readonly ParsedSmsTransaction[],
  appended: readonly ParsedSmsTransaction[]
): readonly ParsedSmsTransaction[] {
  const byFingerprint = new Map<string, ParsedSmsTransaction>();
  for (const transaction of [...existing, ...appended]) {
    if (!byFingerprint.has(transaction.smsFingerprint)) {
      byFingerprint.set(transaction.smsFingerprint, transaction);
    }
  }
  return [...byFingerprint.values()];
}

export async function retrySmsReviewCandidates(
  input: RetrySmsReviewCandidatesInput
): Promise<SmsReviewRetryResult> {
  const retryable = input.unresolvedCandidates.filter(
    ({ isRetryable }) => isRetryable
  );
  if (retryable.length === 0) {
    return {
      transactions: input.transactions,
      unresolvedCandidates: input.unresolvedCandidates,
    };
  }
  const result = await parseSmsWithOrchestrator(
    retryable.map(({ candidate }) => candidate),
    input.parseContext,
    undefined,
    input.abortSignal
  );
  return {
    transactions: mergeTransactions(input.transactions, result.transactions),
    unresolvedCandidates: [
      ...input.unresolvedCandidates.filter(({ isRetryable }) => !isRetryable),
      ...result.unresolvedCandidates,
    ],
  };
}
