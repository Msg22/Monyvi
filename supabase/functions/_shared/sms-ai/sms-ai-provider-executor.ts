import { parseSmsProviderTransactions } from "../sms-provider-transaction-validator.ts";
import type {
  ExecuteSmsProviderInput,
  SmsAiProvider,
  SmsProviderExecutionResult,
} from "./sms-ai-provider.ts";
import {
  BUILT_IN_SMS_CATEGORY_TREE,
  DEFAULT_SMS_CURRENCIES,
  buildSmsAiProviderMessages,
  buildSmsAiResponseSchema,
} from "./sms-ai-prompt.ts";
import { groundSmsAiProviderResponse } from "./sms-ai-response-grounding.ts";

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

export async function executeSmsAiProvider(
  provider: SmsAiProvider,
  input: ExecuteSmsProviderInput,
  diagnostics: SmsAiProviderDiagnostics = {}
): Promise<SmsProviderExecutionResult> {
  const providerRequest = {
    messages: buildSmsAiProviderMessages(input),
    responseSchema: buildSmsAiResponseSchema(input.supportedCurrencies),
  };

  if (diagnostics.onRequestInput !== undefined) {
    const smsMessages = createRequestInputSnapshot(input.messages);
    try {
      diagnostics.onRequestInput(smsMessages);
    } catch {
      // Development-only diagnostics must never alter provider behavior.
    }
  }

  const raw = await provider.execute(providerRequest);

  if (raw.completionStatus !== "complete") {
    return {
      completionStatus: raw.completionStatus,
      isResponseSchemaValid: true,
      transactions: [],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.content);
  } catch {
    return {
      completionStatus: "complete",
      isResponseSchemaValid: false,
      transactions: [],
    };
  }

  const supportedCurrencies =
    input.supportedCurrencies.length > 0
      ? input.supportedCurrencies
      : DEFAULT_SMS_CURRENCIES;
  const categoryTree =
    input.categories.trim().length > 0
      ? input.categories
      : BUILT_IN_SMS_CATEGORY_TREE;

  const groundedResponse = groundSmsAiProviderResponse(
    parsed,
    input.messages,
    categoryTree
  );
  const validated = parseSmsProviderTransactions(groundedResponse, {
    supportedCurrencies,
    categoryTree,
    submittedMessageIds: input.messages.map((message) => message.id),
  });

  return {
    completionStatus: "complete",
    isResponseSchemaValid: validated.isValid,
    transactions: validated.transactions,
    invalidMessageIds: validated.invalidMessageIds,
    hasUncorrelatedInvalidEntries:
      validated.hasUncorrelatedInvalidEntries,
  };
}
