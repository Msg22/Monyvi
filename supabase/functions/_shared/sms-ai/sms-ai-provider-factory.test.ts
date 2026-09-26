import assert from "node:assert/strict";
import test from "node:test";

import type { SmsAiProviderRequest } from "./sms-ai-provider.ts";
import {
  createConfiguredSmsAiProvider,
  createSmsAiProvider,
} from "./sms-ai-provider-factory.ts";
import type { SmsAiProviderConfig } from "./sms-ai-provider-config.ts";

const CONFIG: SmsAiProviderConfig = {
  provider: "deepinfra",
  model: "deepseek-ai/DeepSeek-V4-Flash-0731",
  serviceTier: "default",
  apiKey: "test-key",
};

const REQUEST: SmsAiProviderRequest = {
  messages: [{ role: "user", content: "test" }],
  responseSchema: {
    type: "object",
    properties: { transactions: { type: "array" } },
    required: ["transactions"],
  },
};

test("creates a DeepInfra adapter and propagates model, tier, fetch, and logger dependencies", async () => {
  let requestBody: Record<string, unknown> = {};
  const events: string[] = [];
  const provider = createSmsAiProvider(CONFIG, {
    fetch: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: { content: '{"transactions":[]}' },
            },
          ],
          usage: { prompt_tokens: 1 },
        }),
        { status: 200 }
      );
    },
    sleep: async () => undefined,
    createTimeoutSignal: () => new AbortController().signal,
    log: (event) => {
      events.push(event);
    },
  });

  await provider.execute(REQUEST);

  assert.equal(requestBody.model, CONFIG.model);
  assert.equal("service_tier" in requestBody, false);
  assert.deepEqual(events, ["smsAi.providerUsage"]);
});

test("rejects an unsupported provider in the factory", () => {
  assert.throws(
    () =>
      createSmsAiProvider(
        {
          ...CONFIG,
          provider: "unsupported",
        },
        {}
      ),
    /Unsupported SMS AI provider/
  );
});

test("configured provider creation fails before constructing a provider when env is missing or blank", () => {
  let fetchCalls = 0;
  const base = {
    SMS_AI_PROVIDER: "deepinfra",
    SMS_AI_MODEL: CONFIG.model,
    SMS_AI_SERVICE_TIER: "default",
    DEEPINFRA_API_KEY: "test-key",
  };

  for (const key of Object.keys(base)) {
    const env: Record<string, string | undefined> = {
      ...base,
      [key]: undefined,
    };
    assert.throws(
      () =>
        createConfiguredSmsAiProvider((name) => env[name], {
          fetch: async () => {
            fetchCalls++;
            return new Response();
          },
        }),
      /SMS AI provider configuration/
    );
  }

  assert.equal(fetchCalls, 0);
});
