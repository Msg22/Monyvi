import {
  getParsedSmsTransactionKey,
  type ParsedSmsTransaction,
} from "@monyvi/logic";
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
  readonly hasRetryError: boolean;
}

interface RetryGroup {
  readonly candidates: ReadonlyArray<HybridSmsUnresolvedCandidate["candidate"]>;
  readonly options?: {
    readonly requestContext: NonNullable<
      HybridSmsUnresolvedCandidate["retryRequest"]
    >["requestContext"];
    readonly requestKey: string;
  };
}

function mergeTransactions(
  existing: readonly ParsedSmsTransaction[],
  appended: readonly ParsedSmsTransaction[]
): readonly ParsedSmsTransaction[] {
  const byTransactionKey = new Map<string, ParsedSmsTransaction>();
  for (const transaction of [...existing, ...appended]) {
    const transactionKey = getParsedSmsTransactionKey(transaction);
    if (!byTransactionKey.has(transactionKey)) {
      byTransactionKey.set(transactionKey, transaction);
    }
  }
  return [...byTransactionKey.values()];
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
      hasRetryError: false,
    };
  }
  const retryGroups = new Map<string, RetryGroup>();
  const legacyCandidates = retryable
    .filter(({ retryRequest }) => retryRequest === undefined)
    .map(({ candidate }) => candidate);
  for (const { retryRequest } of retryable) {
    if (
      retryRequest === undefined ||
      retryGroups.has(retryRequest.requestKey)
    ) {
      continue;
    }
    retryGroups.set(retryRequest.requestKey, {
      candidates: retryRequest.candidates,
      options: {
        requestContext: retryRequest.requestContext,
        requestKey: retryRequest.requestKey,
      },
    });
  }
  if (legacyCandidates.length > 0) {
    retryGroups.set("legacy", { candidates: legacyCandidates });
  }

  let retriedTransactions: readonly ParsedSmsTransaction[] = [];
  let retriedUnresolvedCandidates: readonly HybridSmsUnresolvedCandidate[] = [];
  let hasRetryError = false;
  for (const retryGroup of retryGroups.values()) {
    const result =
      retryGroup.options === undefined
        ? await parseSmsWithOrchestrator(
            retryGroup.candidates,
            input.parseContext,
            undefined,
            input.abortSignal
          )
        : await parseSmsWithOrchestrator(
            retryGroup.candidates,
            input.parseContext,
            undefined,
            input.abortSignal,
            retryGroup.options
          );
    retriedTransactions = mergeTransactions(
      retriedTransactions,
      result.transactions
    );
    retriedUnresolvedCandidates = [
      ...retriedUnresolvedCandidates,
      ...result.unresolvedCandidates,
    ];
    hasRetryError ||= result.hasError === true;
  }
  const unresolvedCandidates = [
    ...input.unresolvedCandidates.filter(({ isRetryable }) => !isRetryable),
    ...retriedUnresolvedCandidates,
  ];
  return {
    transactions: mergeTransactions(input.transactions, retriedTransactions),
    unresolvedCandidates,
    hasRetryError:
      hasRetryError &&
      unresolvedCandidates.some(({ isRetryable }) => isRetryable),
  };
}
