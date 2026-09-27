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

export async function executeSmsAiProvider(
  provider: SmsAiProvider,
  input: ExecuteSmsProviderInput
): Promise<SmsProviderExecutionResult> {
  const raw = await provider.execute({
    messages: buildSmsAiProviderMessages(input),
    responseSchema: buildSmsAiResponseSchema(input.supportedCurrencies),
  });

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

  const validated = parseSmsProviderTransactions(parsed, {
    supportedCurrencies,
    categoryTree,
  });

  return {
    completionStatus: "complete",
    isResponseSchemaValid: validated.isValid,
    transactions: validated.transactions,
  };
}
