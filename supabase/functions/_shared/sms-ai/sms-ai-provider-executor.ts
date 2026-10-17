import {
  parseSmsProviderTransactions,
  smsProviderAccessibleCategories,
} from "../sms-provider-transaction-validator.ts";
import { throwIfSmsAiProviderCallerAborted } from "./sms-ai-provider.ts";
import type {
  ExecuteSmsProviderInput,
  SmsAiProvider,
  SmsAiProviderRequest,
  SmsProviderExecutionResult,
  SmsAiProviderRawResult,
} from "./sms-ai-provider.ts";
import {
  BUILT_IN_SMS_CATEGORY_TREE,
  DEFAULT_SMS_CURRENCIES,
  buildSmsAiProviderMessages,
  buildSmsAiResponseSchema,
} from "./sms-ai-prompt.ts";
import { groundSmsAiProviderResponse } from "./sms-ai-response-grounding.ts";
import { recoverSmsReviewV2Financial } from "./sms-ai-review-v2.ts";

export interface SmsAiProviderRequestInputMessage {
  readonly sender: string;
  readonly body: string;
  readonly date: string;
}

export interface SmsAiProviderDiagnostics {
  readonly onRequestInput?: (
    smsMessages: readonly SmsAiProviderRequestInputMessage[]
  ) => void;
}

function createRequestInputSnapshot(
  messages: ExecuteSmsProviderInput["messages"]
): readonly SmsAiProviderRequestInputMessage[] {
  return Object.freeze(
    messages.map((message) =>
      Object.freeze({
        sender: message.sender,
        body: message.body,
        date: message.date,
      })
    )
  );
}

function providerRequestFor(
  input: ExecuteSmsProviderInput
): SmsAiProviderRequest {
  if (input.reviewProviderRequest !== undefined) {
    // Identical immutable schema/prompt/context was measured before quota.
    return input.reviewProviderRequest;
  }
  return {
    messages: buildSmsAiProviderMessages(input),
    responseSchema: buildSmsAiResponseSchema(input.supportedCurrencies),
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  };
}

function incompleteResult(
  input: ExecuteSmsProviderInput,
  completionStatus: SmsAiProviderRawResult["completionStatus"],
  valid: boolean
): SmsProviderExecutionResult {
  const common = {
    completionStatus,
    isResponseSchemaValid: valid,
    transactions: [],
  };
  return input.reviewProviderRequest === undefined
    ? common
    : {
        ...common,
        reviewContractVersion: "account-review/v2",
        rawReviewResponse: null,
      };
}

function parsedJson(
  raw: string
):
  | { readonly valid: true; readonly value: unknown }
  | { readonly valid: false } {
  try {
    const value: unknown = JSON.parse(raw);
    return { valid: true, value };
  } catch {
    return { valid: false };
  }
}

function validateOriginalSms(
  source: unknown,
  input: ExecuteSmsProviderInput,
  categories: string,
  currencies: readonly string[]
): SmsProviderExecutionResult {
  const validated = parseSmsProviderTransactions(source, {
    supportedCurrencies: currencies,
    categoryTree: categories,
    submittedMessageIds: input.messages.map((message) => message.id),
  });
  return {
    completionStatus: "complete",
    isResponseSchemaValid: validated.isValid,
    transactions: validated.transactions,
    invalidMessageIds: validated.invalidMessageIds,
    hasUncorrelatedInvalidEntries: validated.hasUncorrelatedInvalidEntries,
  };
}

function validateReviewSms(
  source: unknown,
  input: ExecuteSmsProviderInput,
  categories: string,
  currencies: readonly string[]
): SmsProviderExecutionResult {
  const validated = recoverSmsReviewV2Financial(
    source,
    input.messages,
    currencies,
    smsProviderAccessibleCategories(categories)
  );
  return {
    reviewContractVersion: "account-review/v2",
    completionStatus: "complete",
    isResponseSchemaValid: validated.isResponseSchemaValid,
    transactions: validated.transactions,
    invalidMessageIds: validated.invalidMessageIds,
    hasUncorrelatedInvalidEntries: validated.hasUncorrelatedInvalidEntries,
    rawReviewResponse: validated.rawReviewResponse,
  };
}

/** Original configured provider call: one request, one completion, no replay. */
export async function executeSmsAiProvider(
  provider: SmsAiProvider,
  input: ExecuteSmsProviderInput,
  diagnostics: SmsAiProviderDiagnostics = {}
): Promise<SmsProviderExecutionResult> {
  throwIfSmsAiProviderCallerAborted(input.signal);
  const providerRequest = providerRequestFor(input);
  if (diagnostics.onRequestInput !== undefined) {
    try {
      diagnostics.onRequestInput(createRequestInputSnapshot(input.messages));
    } catch {
      // Development-only diagnostics must never alter provider behavior.
    }
  }
  throwIfSmsAiProviderCallerAborted(input.signal);
  const raw = await provider.execute(providerRequest);
  throwIfSmsAiProviderCallerAborted(input.signal);
  if (raw.completionStatus !== "complete") {
    return incompleteResult(input, raw.completionStatus, true);
  }
  const parsed = parsedJson(raw.content);
  if (!parsed.valid) return incompleteResult(input, "complete", false);
  const currencies =
    input.supportedCurrencies.length > 0
      ? input.supportedCurrencies
      : DEFAULT_SMS_CURRENCIES;
  const categories =
    input.categories.trim().length > 0
      ? input.categories
      : BUILT_IN_SMS_CATEGORY_TREE;
  const grounded = groundSmsAiProviderResponse(
    parsed.value,
    input.messages,
    categories
  );
  return input.reviewProviderRequest !== undefined
    ? validateReviewSms(grounded, input, categories, currencies)
    : validateOriginalSms(grounded, input, categories, currencies);
}
