export type SmsProviderCompletionStatusAtEdge =
  | "complete"
  | "truncated"
  | "safety_stopped"
  | "failed";

export interface SmsProviderTransactionIdentityAtEdge {
  readonly messageId: string;
  readonly isTrusted: boolean;
}

export interface SmsProviderCompletionEnvelopeAtEdge {
  readonly requestId: string;
  readonly completionStatus: SmsProviderCompletionStatusAtEdge;
  readonly transactions: readonly SmsProviderTransactionIdentityAtEdge[];
}

interface ReconcileSmsProviderCompletionAtEdgeInput {
  readonly submittedMessageIds: readonly string[];
  readonly envelope: SmsProviderCompletionEnvelopeAtEdge;
}

export type SmsProviderReconciliationAtEdge =
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseSmsProviderCompletionEnvelope(
  value: unknown
): SmsProviderCompletionEnvelopeAtEdge {
  if (!isRecord(value) || !Array.isArray(value.transactions)) {
    throw new Error("Invalid SMS provider completion envelope");
  }
  if (
    typeof value.requestId !== "string" ||
    !["complete", "truncated", "safety_stopped", "failed"].includes(
      String(value.completionStatus)
    ) ||
    value.transactions.some(
      (transaction) =>
        !isRecord(transaction) ||
        typeof transaction.messageId !== "string" ||
        typeof transaction.isTrusted !== "boolean"
    )
  ) {
    throw new Error("Invalid SMS provider completion envelope");
  }
  return value as unknown as SmsProviderCompletionEnvelopeAtEdge;
}

function invalid(
  reason: Extract<SmsProviderReconciliationAtEdge, { isValid: false }>["reason"]
): SmsProviderReconciliationAtEdge {
  return {
    isValid: false,
    reason,
    positiveMessageIds: [],
    negativeMessageIds: [],
  };
}

export function reconcileSmsProviderCompletionAtEdge(
  input: ReconcileSmsProviderCompletionAtEdgeInput
): SmsProviderReconciliationAtEdge {
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
    .filter((transaction) => transaction.isTrusted)
    .map((transaction) => transaction.messageId);
  const negativeMessageIds = [
    ...input.envelope.transactions
      .filter((transaction) => !transaction.isTrusted)
      .map((transaction) => transaction.messageId),
    ...input.submittedMessageIds.filter(
      (messageId) => !returned.has(messageId)
    ),
  ];
  return { isValid: true, positiveMessageIds, negativeMessageIds };
}
