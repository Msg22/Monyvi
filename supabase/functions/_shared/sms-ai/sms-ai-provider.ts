import type { SmsProviderCompletionStatusAtEdge } from "../sms-provider-completion.ts";
import type { SmsReviewV2FinancialRow } from "./sms-ai-review-v2.ts";

export interface ParseSmsMessage {
  readonly id: string;
  readonly body: string;
  readonly sender: string;
  readonly date: string;
  readonly smsFingerprint: string;
}

export interface ParseSmsProviderTransaction {
  readonly messageId: string;
  readonly amount: number;
  readonly currency: string;
  readonly type: string;
  readonly counterparty: string;
  readonly date: string;
  readonly categorySystemName: string;
  readonly isAtmWithdrawal?: boolean;
  readonly cardLast4?: string;
  readonly confidenceScore: number;
  readonly isTrusted: boolean;
}

interface SmsProviderExecutionBase {
  readonly completionStatus: SmsProviderCompletionStatusAtEdge;
  readonly isResponseSchemaValid: boolean;
  readonly invalidMessageIds?: readonly string[];
  readonly hasUncorrelatedInvalidEntries?: boolean;
}

/** Legacy v1 financial string-currency ABI is strictly unchanged. */
export interface SmsProviderLegacyResult extends SmsProviderExecutionBase {
  readonly reviewContractVersion?: never;
  readonly transactions: readonly ParseSmsProviderTransaction[];
}

/** Canonical v2 financial currency may be null; proof remains advisory. */
export interface SmsProviderReviewV2Result extends SmsProviderExecutionBase {
  readonly reviewContractVersion: "account-review/v2";
  readonly transactions: readonly SmsReviewV2FinancialRow[];
  readonly rawReviewResponse: unknown;
}

export type SmsProviderExecutionResult =
  | SmsProviderLegacyResult
  | SmsProviderReviewV2Result;

export interface ExecuteSmsProviderInput {
  readonly messages: readonly ParseSmsMessage[];
  readonly categories: string;
  readonly supportedCurrencies: readonly string[];
  /** Already measured pre-admission, sent unchanged in the one provider call. */
  readonly reviewProviderRequest?: SmsAiProviderRequest;
  readonly signal?: AbortSignal;
}

export type SmsAiProviderMessageRole = "system" | "user";

export interface SmsAiProviderMessage {
  readonly role: SmsAiProviderMessageRole;
  readonly content: string;
}

export interface SmsAiProviderRequest {
  readonly messages: readonly SmsAiProviderMessage[];
  readonly responseSchema: Readonly<Record<string, unknown>>;
  readonly signal?: AbortSignal;
}

export class SmsAiProviderCallerAbortError extends Error {
  constructor() {
    super("SMS AI provider request cancelled by caller");
    this.name = "SmsAiProviderCallerAbortError";
  }
}

export function isSmsAiProviderCallerAbortError(
  error: unknown
): error is SmsAiProviderCallerAbortError {
  return error instanceof SmsAiProviderCallerAbortError;
}

export function throwIfSmsAiProviderCallerAborted(
  signal: AbortSignal | undefined
): void {
  if (signal?.aborted) {
    throw new SmsAiProviderCallerAbortError();
  }
}

export interface SmsAiProviderOperationalMetadata {
  readonly serviceTier?: string;
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly cachedTokens?: number;
  readonly estimatedCost?: number;
}

export interface SmsAiProviderRawResult {
  readonly completionStatus: SmsProviderCompletionStatusAtEdge;
  readonly content: string;
  readonly operationalMetadata?: SmsAiProviderOperationalMetadata;
}

export interface SmsAiProvider {
  execute(request: SmsAiProviderRequest): Promise<SmsAiProviderRawResult>;
}
