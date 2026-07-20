import {
  buildCategoryMap,
  normalizeCurrency,
  parseCategory,
  reconcileProviderCompletion,
  type ParsedSmsTransaction,
  type SafeguardQaProfileId,
} from "@monyvi/logic";

import type {
  AiParseProgress,
  AiParseResult,
  AiUnresolvedCandidate,
  ParseSmsContext,
  SmsCandidate,
} from "../ai-sms-parser-service";
import { assertNotAborted } from "../abort-utils";
import { getSafeguardQaProviderSteps } from "./sms-safeguard-qa-runner";
import { SmsSafeguardProviderSimulator } from "./sms-safeguard-provider-simulator";

const simulators = new Map<
  SafeguardQaProfileId,
  SmsSafeguardProviderSimulator
>();
const negativeStrikes = new Map<string, number>();

function getSimulator(
  profileId: SafeguardQaProfileId
): SmsSafeguardProviderSimulator {
  const existing = simulators.get(profileId);
  if (existing !== undefined) return existing;
  const simulator = new SmsSafeguardProviderSimulator(
    getSafeguardQaProviderSteps(profileId)
  );
  simulators.set(profileId, simulator);
  return simulator;
}

function parseAmount(body: string): number {
  const match = body.match(/\b(?:EGP|USD)\s*([\d,.]+)/i);
  const amount = Number(match?.[1]?.replaceAll(",", "") ?? "1");
  return Number.isFinite(amount) && amount > 0 ? amount : 1;
}

function parseCurrency(body: string): ReturnType<typeof normalizeCurrency> {
  return normalizeCurrency(body.match(/\b(EGP|USD)\b/i)?.[1] ?? "EGP");
}

function mapTransaction(
  candidate: SmsCandidate,
  context: ParseSmsContext,
  isLowConfidence: boolean
): ParsedSmsTransaction {
  const category = parseCategory("other", buildCategoryMap(context.categories));
  return {
    amount: parseAmount(candidate.message.body),
    currency: parseCurrency(candidate.message.body),
    type: "EXPENSE",
    counterparty: "Safeguard QA merchant",
    date: new Date(candidate.message.date),
    source: "SMS",
    originLabel: candidate.message.address,
    deduplicationHash: candidate.smsFingerprint,
    smsFingerprint: candidate.smsFingerprint,
    senderDisplayName: candidate.message.address,
    categoryId: category.id,
    categoryDisplayName: category.displayName,
    rawSmsBody: candidate.message.body,
    confidence: isLowConfidence ? 0.3 : 0.9,
    isAtmWithdrawal: false,
  };
}

function unresolved(
  candidates: readonly SmsCandidate[],
  reason: AiUnresolvedCandidate["reason"],
  isRetryable: boolean
): readonly AiUnresolvedCandidate[] {
  return candidates.map((candidate) => ({ candidate, reason, isRetryable }));
}

export async function parseSmsWithSafeguardQa(
  profileId: SafeguardQaProfileId,
  candidates: readonly SmsCandidate[],
  context: ParseSmsContext,
  onProgress?: (progress: AiParseProgress) => void,
  abortSignal?: AbortSignal
): Promise<AiParseResult> {
  assertNotAborted(abortSignal, "SMS parse aborted");
  const simulator = getSimulator(profileId);
  const result = await simulator.complete({
    requestId: `sms-safeguard-qa:${profileId}:${simulator.simulatedCallCount + 1}`,
    messageIds: candidates.map((candidate) => candidate.smsFingerprint),
    startedAtMs: Date.now(),
    signal: abortSignal,
  });
  assertNotAborted(abortSignal, "SMS parse aborted");

  onProgress?.({
    chunksCompleted: 1,
    totalChunks: 1,
    transactionsSoFar:
      "envelope" in result ? result.envelope.transactions.length : 0,
    chunkDurationMs: result.delayMs,
  });

  if (!("envelope" in result)) {
    const isRetryable = result.kind === "retryable";
    return {
      transactions: [],
      hasError: true,
      isRetryable,
      unresolvedCandidates: unresolved(
        candidates,
        isRetryable ? "chunk_failed" : "response_invalid",
        isRetryable
      ),
    };
  }

  const reconciliation = reconcileProviderCompletion({
    submittedMessageIds: candidates.map(
      (candidate) => candidate.smsFingerprint
    ),
    envelope: result.envelope,
  });
  if (!reconciliation.isValid) {
    return {
      transactions: [],
      hasError: true,
      isRetryable: true,
      unresolvedCandidates: unresolved(candidates, "response_invalid", true),
    };
  }

  const candidatesByFingerprint = new Map(
    candidates.map((candidate) => [candidate.smsFingerprint, candidate])
  );
  const transactions = reconciliation.positiveMessageIds.flatMap(
    (fingerprint) => {
      const candidate = candidatesByFingerprint.get(fingerprint);
      return candidate === undefined
        ? []
        : [mapTransaction(candidate, context, result.isLowConfidence)];
    }
  );
  const terminalFingerprints: string[] = [];
  for (const fingerprint of reconciliation.negativeMessageIds) {
    const strikeKey = `${profileId}:${fingerprint}`;
    const strikes = (negativeStrikes.get(strikeKey) ?? 0) + 1;
    negativeStrikes.set(strikeKey, strikes);
    if (strikes >= 3) terminalFingerprints.push(fingerprint);
  }

  return {
    transactions,
    hasError: false,
    durableNegativeFingerprints: reconciliation.negativeMessageIds,
    terminalFingerprints,
  };
}

export function resetSmsSafeguardQaParserState(): void {
  simulators.clear();
  negativeStrikes.clear();
}
