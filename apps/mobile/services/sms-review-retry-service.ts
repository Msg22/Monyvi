import {
  DEFAULT_SMS_SCAN_POLICY,
  getParsedSmsTransactionKey,
  type ParsedSmsTransaction,
} from "@monyvi/logic";
import { createFilteredSmsAiRetryRequestKey } from "./sms-parse-transport";
import { getDurablyHandledSmsReviewFingerprints } from "./sms-review-handled-fingerprint-service";
import type { ParseSmsContext } from "./ai-sms-parser-service";
import {
  parseSmsWithOrchestrator,
  type HybridSmsUnresolvedCandidate,
} from "./sms-parser-orchestrator";
import { recordOversizedSmsOutcome } from "./sms-oversized-outcome-service";
import { assertExpectedCurrentUser } from "./user-data-access";

interface RetrySmsReviewCandidatesInput {
  readonly transactions: readonly ParsedSmsTransaction[];
  readonly unresolvedCandidates: readonly HybridSmsUnresolvedCandidate[];
  readonly parseContext: ParseSmsContext;
  readonly abortSignal?: AbortSignal;
  readonly expectedUserId: string;
  readonly onTransactionsCompleted?: (
    transactions: readonly ParsedSmsTransaction[]
  ) => Promise<void>;
  readonly onCandidatesHandled?: (
    fingerprints: readonly string[]
  ) => Promise<void>;
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

interface PreparedRetryGroup extends RetryGroup {
  readonly handledFingerprints: readonly string[];
}

async function prepareRetryGroup(
  retryGroup: RetryGroup,
  expectedUserId: string
): Promise<PreparedRetryGroup> {
  await assertExpectedCurrentUser(expectedUserId);
  const handled = await getDurablyHandledSmsReviewFingerprints(expectedUserId);
  const handledFingerprints = retryGroup.candidates
    .map((candidate) => candidate.smsFingerprint)
    .filter((fingerprint) => handled.has(fingerprint));
  const candidates = retryGroup.candidates.filter(
    (candidate) => !handled.has(candidate.smsFingerprint)
  );
  if (
    retryGroup.options === undefined ||
    candidates.length === retryGroup.candidates.length
  ) {
    return { candidates, options: retryGroup.options, handledFingerprints };
  }
  const requestKey = await createFilteredSmsAiRetryRequestKey(
    retryGroup.options.requestKey,
    candidates.map((candidate) => candidate.smsFingerprint)
  );
  return {
    candidates,
    handledFingerprints,
    options: { ...retryGroup.options, requestKey },
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
  const persistedTransactionKeys = new Set<string>();
  const handledDuringRetry = new Set<string>();
  const persistCompletedTransactions = async (
    transactions: readonly ParsedSmsTransaction[]
  ): Promise<void> => {
    if (input.onTransactionsCompleted === undefined) return;
    const unpersisted = transactions.filter(
      (transaction) =>
        !persistedTransactionKeys.has(getParsedSmsTransactionKey(transaction))
    );
    if (unpersisted.length === 0) return;
    await assertExpectedCurrentUser(input.expectedUserId);
    await input.onTransactionsCompleted(unpersisted);
    unpersisted.forEach((transaction) =>
      persistedTransactionKeys.add(getParsedSmsTransactionKey(transaction))
    );
  };
  for (const retryGroup of retryGroups.values()) {
    const preparedGroup = await prepareRetryGroup(
      retryGroup,
      input.expectedUserId
    );
    preparedGroup.handledFingerprints.forEach((fingerprint) =>
      handledDuringRetry.add(fingerprint)
    );
    if (
      preparedGroup.handledFingerprints.length > 0 &&
      input.onCandidatesHandled !== undefined
    ) {
      await input.onCandidatesHandled(preparedGroup.handledFingerprints);
      await assertExpectedCurrentUser(input.expectedUserId);
    }
    const { candidates, options } = preparedGroup;
    if (candidates.length === 0) continue;
    const result =
      options === undefined
        ? await parseSmsWithOrchestrator(
            candidates,
            input.parseContext,
            (progress) =>
              persistCompletedTransactions(progress.completedTransactions),
            input.abortSignal,
            { expectedUserId: input.expectedUserId }
          )
        : await parseSmsWithOrchestrator(
            candidates,
            input.parseContext,
            (progress) =>
              persistCompletedTransactions(progress.completedTransactions),
            input.abortSignal,
            { ...options, expectedUserId: input.expectedUserId }
          );
    await assertExpectedCurrentUser(input.expectedUserId);
    for (const candidate of result.oversizedCandidates ?? []) {
      await recordOversizedSmsOutcome({
        userId: input.expectedUserId,
        smsFingerprint: candidate.smsFingerprint,
        originalReceivedAtMs: candidate.message.date,
        nowMs: Math.max(Date.now(), candidate.message.date),
        lookbackDays: DEFAULT_SMS_SCAN_POLICY.lookbackDays,
      });
      await assertExpectedCurrentUser(input.expectedUserId);
    }
    await persistCompletedTransactions(result.transactions);
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
    ...input.unresolvedCandidates.filter(
      ({ candidate, isRetryable }) =>
        !isRetryable && !handledDuringRetry.has(candidate.smsFingerprint)
    ),
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
