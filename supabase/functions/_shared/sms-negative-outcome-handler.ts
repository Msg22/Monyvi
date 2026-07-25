import type { SmsSafeguardRpcClient } from "./sms-ai-safeguard-contract.ts";
import { reconcileSmsAiOutcomes } from "./sms-ai-safeguard-service.ts";
import {
  reconcileSmsProviderCompletionAtEdge,
  type SmsProviderCompletionEnvelopeAtEdge,
  type SmsProviderReconciliationAtEdge,
} from "./sms-provider-completion.ts";

export interface SmsNegativeOutcomeCandidate {
  readonly messageId: string;
  readonly smsFingerprint: string;
  readonly originalReceivedAt: string;
}

interface ReconcileSmsNegativeOutcomesInput {
  readonly client: SmsSafeguardRpcClient;
  readonly userId: string;
  readonly submittedCandidates: readonly SmsNegativeOutcomeCandidate[];
  readonly envelope: SmsProviderCompletionEnvelopeAtEdge;
}

export type SmsNegativeOutcomeReconciliation =
  | {
      readonly status: "reconciled";
      readonly positiveFingerprints: readonly string[];
      readonly negativeFingerprints: readonly string[];
    }
  | {
      readonly status: "ignored";
      readonly reason: Extract<
        SmsProviderReconciliationAtEdge,
        { readonly isValid: false }
      >["reason"];
      readonly positiveFingerprints: readonly [];
      readonly negativeFingerprints: readonly [];
    };

function indexCandidates(
  candidates: readonly SmsNegativeOutcomeCandidate[]
): ReadonlyMap<string, SmsNegativeOutcomeCandidate> {
  return new Map(
    candidates.map((candidate) => [candidate.messageId, candidate])
  );
}

export async function reconcileSmsNegativeOutcomes(
  input: ReconcileSmsNegativeOutcomesInput
): Promise<SmsNegativeOutcomeReconciliation> {
  const reconciliation = reconcileSmsProviderCompletionAtEdge({
    submittedMessageIds: input.submittedCandidates.map(
      (candidate) => candidate.messageId
    ),
    envelope: input.envelope,
  });

  if (!reconciliation.isValid) {
    return {
      status: "ignored",
      reason: reconciliation.reason,
      positiveFingerprints: [],
      negativeFingerprints: [],
    };
  }

  const candidatesById = indexCandidates(input.submittedCandidates);
  const positiveFingerprints = reconciliation.positiveMessageIds.map(
    (messageId) => candidatesById.get(messageId)!.smsFingerprint
  );
  const negativeCandidates = reconciliation.negativeMessageIds.map(
    (messageId) => candidatesById.get(messageId)!
  );
  const negativeFingerprints = negativeCandidates.map(
    (candidate) => candidate.smsFingerprint
  );

  await reconcileSmsAiOutcomes(input.client, {
    userId: input.userId,
    positiveFingerprints,
    negativeOutcomes: negativeCandidates.map((candidate) => ({
      smsFingerprint: candidate.smsFingerprint,
      originalReceivedAt: candidate.originalReceivedAt,
    })),
  });

  return {
    status: "reconciled",
    positiveFingerprints,
    negativeFingerprints,
  };
}
