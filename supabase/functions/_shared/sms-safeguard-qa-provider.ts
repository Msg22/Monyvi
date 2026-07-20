import type {
  ExecuteSmsProviderInput,
  ParseSmsProviderTransaction,
  SmsProviderExecutionResult,
} from "./parse-sms-handler.ts";

export const SAFEGUARD_QA_PROVIDER_OUTCOMES = [
  "trusted-success",
  "low-confidence-success",
  "explicit-negative",
  "omission",
  "retryable-failure",
  "permanent-failure",
  "malformed",
  "incomplete",
  "invalid-identity",
  "duplicate-identity",
  "delay",
  "cancelled",
] as const;

export type SafeguardQaProviderOutcome =
  (typeof SAFEGUARD_QA_PROVIDER_OUTCOMES)[number];

interface SafeguardQaProviderOptions {
  readonly sleep?: (delayMs: number) => Promise<void>;
}

export class SafeguardQaProviderError extends Error {
  public constructor(public readonly outcome: SafeguardQaProviderOutcome) {
    super(`Safeguard QA provider outcome: ${outcome}`);
    this.name = "SafeguardQaProviderError";
  }
}

function createTransaction(
  input: ExecuteSmsProviderInput,
  messageId: string,
  isTrusted: boolean,
  confidenceScore: number
): ParseSmsProviderTransaction {
  const source = input.messages[0];
  return {
    messageId,
    amount: 1,
    currency: input.supportedCurrencies[0] ?? "EGP",
    type: "EXPENSE",
    counterparty: "Safeguard QA merchant",
    date: source?.date ?? "2026-07-20T12:00:00.000Z",
    categorySystemName: "other",
    confidenceScore,
    isTrusted,
  };
}

function buildTransactions(
  outcome: SafeguardQaProviderOutcome,
  input: ExecuteSmsProviderInput
): readonly ParseSmsProviderTransaction[] {
  if (outcome === "omission" || input.messages.length === 0) return [];
  if (outcome === "invalid-identity") {
    return [createTransaction(input, "unknown-simulated-message", true, 0.95)];
  }
  const transactions = input.messages.map((message) =>
    createTransaction(
      input,
      message.id,
      outcome !== "explicit-negative",
      outcome === "low-confidence-success" ? 0.3 : 0.95
    )
  );
  return outcome === "duplicate-identity" && transactions[0]
    ? [transactions[0], transactions[0]]
    : transactions;
}

export async function executeSafeguardQaProvider(
  outcome: SafeguardQaProviderOutcome,
  input: ExecuteSmsProviderInput,
  options: SafeguardQaProviderOptions = {}
): Promise<SmsProviderExecutionResult> {
  if (
    outcome === "retryable-failure" ||
    outcome === "permanent-failure" ||
    outcome === "cancelled"
  ) {
    throw new SafeguardQaProviderError(outcome);
  }
  if (outcome === "delay") {
    await (
      options.sleep ??
      ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)))
    )(25);
  }
  return {
    completionStatus: outcome === "incomplete" ? "truncated" : "complete",
    isResponseSchemaValid: outcome !== "malformed",
    transactions: buildTransactions(outcome, input),
  };
}

export function parseSafeguardQaProviderOutcome(
  value: unknown
): SafeguardQaProviderOutcome {
  if (
    typeof value !== "string" ||
    !(SAFEGUARD_QA_PROVIDER_OUTCOMES as readonly string[]).includes(value)
  ) {
    throw new Error("SMS safeguard QA provider outcome is not recognized.");
  }
  return value as SafeguardQaProviderOutcome;
}
