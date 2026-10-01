import type { SmsProviderCompletionStatusAtEdge } from "../sms-provider-completion.ts";

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

export interface SmsProviderExecutionResult {
  readonly completionStatus: SmsProviderCompletionStatusAtEdge;
  readonly isResponseSchemaValid: boolean;
  readonly transactions: readonly ParseSmsProviderTransaction[];
  readonly invalidMessageIds?: readonly string[];
  readonly hasUncorrelatedInvalidEntries?: boolean;
}

export interface ExecuteSmsProviderInput {
  readonly messages: readonly ParseSmsMessage[];
  readonly categories: string;
  readonly supportedCurrencies: readonly string[];
}

export type SmsAiProviderMessageRole = "system" | "user";

export interface SmsAiProviderMessage {
  readonly role: SmsAiProviderMessageRole;
  readonly content: string;
}

export interface SmsAiProviderRequest {
  readonly messages: readonly SmsAiProviderMessage[];
  readonly responseSchema: Readonly<Record<string, unknown>>;
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
