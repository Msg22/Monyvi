import assert from "node:assert/strict";
import test from "node:test";

import { readSmsAiProviderConfig } from "./sms-ai-provider-config.ts";

const VALID_ENV: Readonly<Record<string, string>> = {
  SMS_AI_PROVIDER: "deepinfra",
  SMS_AI_MODEL: "deepseek-ai/DeepSeek-V4-Flash-0731",
  SMS_AI_APPROVED_MODELS: "deepseek-ai/DeepSeek-V4-Flash-0731",
  SMS_AI_SERVICE_TIER: "default",
  DEEPINFRA_API_KEY: "test-secret",
};

function getEnvironment(
  overrides: Readonly<Record<string, string | undefined>> = {}
): (name: string) => string | undefined {
  const values = { ...VALID_ENV, ...overrides };
  return (name: string): string | undefined => values[name];
}

test("parses explicit DeepInfra provider configuration", () => {
  assert.deepEqual(readSmsAiProviderConfig(getEnvironment()), {
    provider: "deepinfra",
    model: "deepseek-ai/DeepSeek-V4-Flash-0731",
    serviceTier: "default",
    apiKey: "test-secret",
  });
});

test("accepts every supported service tier explicitly", () => {
  for (const serviceTier of ["default", "priority", "flex"] as const) {
    assert.equal(
      readSmsAiProviderConfig(
        getEnvironment({ SMS_AI_SERVICE_TIER: serviceTier })
      ).serviceTier,
      serviceTier
    );
  }
});

test("fails closed when any required configuration value is missing", () => {
  for (const key of [
    "SMS_AI_PROVIDER",
    "SMS_AI_MODEL",
    "SMS_AI_APPROVED_MODELS",
    "SMS_AI_SERVICE_TIER",
    "DEEPINFRA_API_KEY",
  ] as const) {
    assert.throws(
      () => readSmsAiProviderConfig(getEnvironment({ [key]: undefined })),
      /SMS AI provider configuration/
    );
  }
});

test("fails closed on blank provider, model, approved list, service tier, or API key", () => {
  for (const key of [
    "SMS_AI_PROVIDER",
    "SMS_AI_MODEL",
    "SMS_AI_APPROVED_MODELS",
    "SMS_AI_SERVICE_TIER",
    "DEEPINFRA_API_KEY",
  ] as const) {
    assert.throws(
      () => readSmsAiProviderConfig(getEnvironment({ [key]: "   " })),
      /SMS AI provider configuration/
    );
  }
});

test("rejects unsupported providers and service tiers", () => {
  assert.throws(
    () =>
      readSmsAiProviderConfig(getEnvironment({ SMS_AI_PROVIDER: "gemini" })),
    /Unsupported SMS AI provider/
  );
  assert.throws(
    () =>
      readSmsAiProviderConfig(getEnvironment({ SMS_AI_SERVICE_TIER: "turbo" })),
    /Unsupported SMS AI service tier/
  );
});

test("trims explicit configuration values before returning them", () => {
  assert.deepEqual(
    readSmsAiProviderConfig(
      getEnvironment({
        SMS_AI_PROVIDER: "  deepinfra  ",
        SMS_AI_MODEL: "  deepseek-ai/DeepSeek-V4-Flash-0731  ",
        SMS_AI_APPROVED_MODELS:
          "  deepseek-ai/DeepSeek-V4-Flash-0731 , deepseek-ai/Future-Model-2  ",
        SMS_AI_SERVICE_TIER: "  priority  ",
        DEEPINFRA_API_KEY: "  test-secret  ",
      })
    ),
    {
      provider: "deepinfra",
      model: "deepseek-ai/DeepSeek-V4-Flash-0731",
      serviceTier: "priority",
      apiKey: "test-secret",
    }
  );
});

test("accepts a model selection present in the hosted approved-model list", () => {
  assert.equal(
    readSmsAiProviderConfig(getEnvironment()).model,
    "deepseek-ai/DeepSeek-V4-Flash-0731"
  );
});

test("approves a future model by hosted config change only", () => {
  assert.equal(
    readSmsAiProviderConfig(
      getEnvironment({
        SMS_AI_MODEL: "deepseek-ai/Future-Model-2",
        SMS_AI_APPROVED_MODELS:
          "deepseek-ai/DeepSeek-V4-Flash-0731, deepseek-ai/Future-Model-2",
      })
    ).model,
    "deepseek-ai/Future-Model-2"
  );
});

test("rejects a model selection outside the hosted approved-model list", () => {
  assert.throws(
    () =>
      readSmsAiProviderConfig(
        getEnvironment({ SMS_AI_MODEL: "openai/gpt-4o" })
      ),
    /Unsupported SMS AI model/
  );
  assert.throws(
    () =>
      readSmsAiProviderConfig(
        getEnvironment({ SMS_AI_MODEL: "deepseek-ai/future-unapproved-model" })
      ),
    /Unsupported SMS AI model/
  );
});

test("fails closed on malformed approved-model lists", () => {
  for (const approvedModels of [
    "deepseek-ai/DeepSeek-V4-Flash-0731,,deepseek-ai/Other",
    "deepseek-ai/DeepSeek-V4-Flash-0731,",
    ",deepseek-ai/DeepSeek-V4-Flash-0731",
    "deepseek-ai/*",
    "*",
    "deepseek-ai/Deep Seek",
  ]) {
    assert.throws(
      () =>
        readSmsAiProviderConfig(
          getEnvironment({ SMS_AI_APPROVED_MODELS: approvedModels })
        ),
      /SMS AI provider configuration/
    );
  }
});
