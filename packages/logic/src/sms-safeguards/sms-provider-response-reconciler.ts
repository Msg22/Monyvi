export type SmsProviderCompletionStatus =
  | "complete"
  | "truncated"
  | "safety_stopped"
  | "failed";

export interface SmsProviderTransactionIdentity {
  readonly messageId: string;
  readonly isTrusted: boolean;
}

export interface SmsProviderCompletionEnvelope {
  readonly requestId: string;
  readonly completionStatus: SmsProviderCompletionStatus;
  readonly transactions: readonly SmsProviderTransactionIdentity[];
}

interface ReconcileProviderCompletionInput {
  readonly submittedMessageIds: readonly string[];
  readonly envelope: SmsProviderCompletionEnvelope;
}

export type SmsProviderReconciliationResult =
  | {
      readonly isValid: true;
      readonly positiveMessageIds: readonly string[];
      readonly negativeMessageIds: readonly string[];
    }
  | {
      readonly isValid: false;
      readonly reason:
        | "incomplete_response"
        | "duplicate_submitted_identity"
        | "duplicate_response_identity"
        | "unknown_response_identity";
      readonly positiveMessageIds: readonly [];
      readonly negativeMessageIds: readonly [];
    };

function invalid(
  reason: Extract<SmsProviderReconciliationResult, { isValid: false }>["reason"]
): SmsProviderReconciliationResult {
  return {
    isValid: false,
    reason,
    positiveMessageIds: [],
    negativeMessageIds: [],
  };
}

export function reconcileProviderCompletion(
  input: ReconcileProviderCompletionInput
): SmsProviderReconciliationResult {
  if (input.envelope.completionStatus !== "complete") {
    return invalid("incomplete_response");
  }

  const submitted = new Set(input.submittedMessageIds);
  if (submitted.size !== input.submittedMessageIds.length) {
    return invalid("duplicate_submitted_identity");
  }

  const returned = new Set<string>();
  for (const transaction of input.envelope.transactions) {
    if (!submitted.has(transaction.messageId)) {
      return invalid("unknown_response_identity");
    }
    if (returned.has(transaction.messageId)) {
      return invalid("duplicate_response_identity");
    }
    returned.add(transaction.messageId);
  }

  const positiveMessageIds = input.envelope.transactions
    .filter(({ isTrusted }) => isTrusted)
    .map(({ messageId }) => messageId);
  const explicitlyNegative = input.envelope.transactions
    .filter(({ isTrusted }) => !isTrusted)
    .map(({ messageId }) => messageId);
  const omitted = input.submittedMessageIds.filter(
    (messageId) => !returned.has(messageId)
  );

  return {
    isValid: true,
    positiveMessageIds,
    negativeMessageIds: [...explicitlyNegative, ...omitted],
  };
}
