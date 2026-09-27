import assert from "node:assert/strict";
import test from "node:test";

import type { SmsAiProviderConfig } from "../sms-ai-provider-config.ts";
import {
  DEEPINFRA_SMS_ATTEMPT_TIMEOUT_MS,
  DEEPINFRA_SMS_ENDPOINT,
  DeepInfraSmsProvider,
} from "./deepinfra-sms-provider.ts";

const CONFIG: SmsAiProviderConfig = {
  provider: "deepinfra",
  model: "deepseek-ai/DeepSeek-V4-Flash-0731",
  serviceTier: "default",
  apiKey: "test-key",
};

const REQUEST = {
  messages: [
    { role: "system" as const, content: "stable" },
    { role: "user" as const, content: "sms" },
  ],
  responseSchema: {
    type: "object",
    properties: { transactions: { type: "array" } },
    required: ["transactions"],
  },
};

function successResponse(
  content = '{"transactions":[]}',
  finishReason: string | null = "stop",
  extra: Readonly<Record<string, unknown>> = {}
): Response {
  return new Response(
    JSON.stringify({
      id: "chatcmpl-test",
      model: CONFIG.model,
      choices: [
        {
          index: 0,
          finish_reason: finishReason,
          message: { role: "assistant", content },
        },
      ],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 20,
        total_tokens: 120,
        prompt_tokens_details: { cached_tokens: 80 },
        estimated_cost: 0.00001,
      },
      service_tier: "default",
      ...extra,
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

test("serializes the strict DeepInfra request without explicit cache controls", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const timeoutValues: number[] = [];
  const provider = new DeepInfraSmsProvider(CONFIG, {
    fetch: async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return successResponse();
    },
    sleep: async () => undefined,
    createTimeoutSignal: (milliseconds) => {
      timeoutValues.push(milliseconds);
      return new AbortController().signal;
    },
  });

  const result = await provider.execute(REQUEST);

  assert.equal(capturedUrl, DEEPINFRA_SMS_ENDPOINT);
  assert.equal(
    (capturedInit?.headers as Record<string, string>).Authorization,
    "Bearer test-key"
  );
  const body = JSON.parse(String(capturedInit?.body)) as Record<
    string,
    unknown
  >;
  assert.equal(body.model, CONFIG.model);
  assert.equal(body.temperature, 0);
  assert.equal(body.max_tokens, 8192);
  assert.equal(body.reasoning_effort, "none");
  assert.equal("service_tier" in body, false);
  assert.equal("prompt_cache_key" in body, false);
  assert.equal("prompt_cache_options" in body, false);
  assert.deepEqual(body.messages, REQUEST.messages);
  assert.deepEqual(body.response_format, {
    type: "json_schema",
    json_schema: {
      name: "monyvi_sms_transactions",
      strict: true,
      schema: REQUEST.responseSchema,
    },
  });
  assert.deepEqual(timeoutValues, [DEEPINFRA_SMS_ATTEMPT_TIMEOUT_MS]);
  assert.equal(result.completionStatus, "complete");
  assert.equal(result.content, '{"transactions":[]}');
  assert.deepEqual(result.operationalMetadata, {
    serviceTier: "default",
    promptTokens: 100,
    completionTokens: 20,
    cachedTokens: 80,
    estimatedCost: 0.00001,
  });
});

test("maps explicit priority and flex tiers while default omits service_tier", async () => {
  for (const tier of ["default", "priority", "flex"] as const) {
    let body: Record<string, unknown> = {};
    const provider = new DeepInfraSmsProvider(
      { ...CONFIG, serviceTier: tier },
      {
        fetch: async (_input, init) => {
          body = JSON.parse(String(init?.body)) as Record<string, unknown>;
          return successResponse();
        },
        sleep: async () => undefined,
        createTimeoutSignal: () => new AbortController().signal,
      }
    );

    await provider.execute(REQUEST);

    if (tier === "default") {
      assert.equal("service_tier" in body, false);
    } else {
      assert.equal(body.service_tier, tier);
    }
  }
});

test("retries transient HTTP failures with 2s/4s backoff", async () => {
  const statuses = [429, 500, 200];
  const delays: number[] = [];
  let calls = 0;
  const provider = new DeepInfraSmsProvider(CONFIG, {
    fetch: async () => {
      const status = statuses[calls++] ?? 200;
      return status === 200
        ? successResponse()
        : new Response(null, { status });
    },
    sleep: async (milliseconds) => {
      delays.push(milliseconds);
    },
    createTimeoutSignal: () => new AbortController().signal,
  });

  const result = await provider.execute(REQUEST);

  assert.equal(result.completionStatus, "complete");
  assert.equal(calls, 3);
  assert.deepEqual(delays, [2000, 4000]);
});

test("retries HTTP 408 explicitly with 2s backoff", async () => {
  const delays: number[] = [];
  let calls = 0;
  const provider = new DeepInfraSmsProvider(CONFIG, {
    fetch: async () => {
      calls++;
      if (calls === 1) return new Response(null, { status: 408 });
      return successResponse();
    },
    sleep: async (milliseconds) => {
      delays.push(milliseconds);
    },
    createTimeoutSignal: () => new AbortController().signal,
  });

  const result = await provider.execute(REQUEST);

  assert.equal(result.completionStatus, "complete");
  assert.equal(calls, 2);
  assert.deepEqual(delays, [2000]);
});

test("retries a thrown timeout AbortError with bounded backoff", async () => {
  const delays: number[] = [];
  let calls = 0;
  const provider = new DeepInfraSmsProvider(CONFIG, {
    fetch: async () => {
      calls++;
      if (calls === 1) {
        throw new DOMException("The operation was aborted", "AbortError");
      }
      return successResponse();
    },
    sleep: async (milliseconds) => {
      delays.push(milliseconds);
    },
    createTimeoutSignal: () => new AbortController().signal,
  });

  const result = await provider.execute(REQUEST);

  assert.equal(result.completionStatus, "complete");
  assert.equal(calls, 2);
  assert.deepEqual(delays, [2000]);
});

test("retries a network error but does not retry auth or malformed-request statuses", async () => {
  let networkCalls = 0;
  const networkProvider = new DeepInfraSmsProvider(CONFIG, {
    fetch: async () => {
      networkCalls++;
      if (networkCalls === 1) throw new TypeError("network unavailable");
      return successResponse();
    },
    sleep: async () => undefined,
    createTimeoutSignal: () => new AbortController().signal,
  });
  assert.equal(
    (await networkProvider.execute(REQUEST)).completionStatus,
    "complete"
  );
  assert.equal(networkCalls, 2);

  for (const status of [400, 401, 403, 404]) {
    let calls = 0;
    const provider = new DeepInfraSmsProvider(CONFIG, {
      fetch: async () => {
        calls++;
        return new Response(null, { status });
      },
      sleep: async () => undefined,
      createTimeoutSignal: () => new AbortController().signal,
    });

    await assert.rejects(
      () => provider.execute(REQUEST),
      /DeepInfra SMS request failed/
    );
    assert.equal(calls, 1);
  }
});

test("exhausts bounded retries after four transient attempts", async () => {
  const delays: number[] = [];
  let calls = 0;
  const provider = new DeepInfraSmsProvider(CONFIG, {
    fetch: async () => {
      calls++;
      return new Response(null, { status: 503 });
    },
    sleep: async (milliseconds) => {
      delays.push(milliseconds);
    },
    createTimeoutSignal: () => new AbortController().signal,
  });

  await assert.rejects(
    () => provider.execute(REQUEST),
    /DeepInfra SMS request failed/
  );
  assert.equal(calls, 4);
  assert.deepEqual(delays, [2000, 4000, 8000]);
});

test("fails closed on a malformed successful provider envelope", async () => {
  const provider = new DeepInfraSmsProvider(CONFIG, {
    fetch: async () =>
      new Response(JSON.stringify({ choices: "invalid" }), { status: 200 }),
    sleep: async () => undefined,
    createTimeoutSignal: () => new AbortController().signal,
  });

  await assert.rejects(
    () => provider.execute(REQUEST),
    /Invalid DeepInfra SMS response/
  );
});

test("normalizes provider finish reasons without parsing financial semantics", async () => {
  for (const [finishReason, expected] of [
    ["stop", "complete"],
    ["length", "truncated"],
    ["content_filter", "safety_stopped"],
    ["safety", "safety_stopped"],
    ["tool_calls", "failed"],
    [null, "failed"],
  ] as const) {
    const provider = new DeepInfraSmsProvider(CONFIG, {
      fetch: async () => successResponse("not-json-by-design", finishReason),
      sleep: async () => undefined,
      createTimeoutSignal: () => new AbortController().signal,
    });

    const result = await provider.execute(REQUEST);
    assert.equal(result.completionStatus, expected);
    assert.equal(result.content, "not-json-by-design");
  }
});

test("logs only aggregate cache usage metadata and never request/provider-body content", async () => {
  const logs: Array<{
    readonly event: string;
    readonly metadata: Readonly<Record<string, unknown>>;
  }> = [];
  const provider = new DeepInfraSmsProvider(CONFIG, {
    fetch: async () => successResponse('{"transactions":[]}'),
    sleep: async () => undefined,
    createTimeoutSignal: () => new AbortController().signal,
    log: (event, metadata) => {
      logs.push({ event, metadata });
    },
  });

  await provider.execute({
    messages: [
      {
        role: "user",
        content: "SECRET SMS BODY EGP 100 at merchant",
      },
    ],
    responseSchema: REQUEST.responseSchema,
  });

  assert.equal(logs.length, 1);
  assert.equal(logs[0].event, "smsAi.providerUsage");
  assert.deepEqual(logs[0].metadata, {
    serviceTier: "default",
    promptTokens: 100,
    completionTokens: 20,
    cachedTokens: 80,
    estimatedCost: 0.00001,
  });
  const serialized = JSON.stringify(logs);
  assert.equal(serialized.includes("SECRET SMS BODY"), false);
  assert.equal(serialized.includes("test-key"), false);
  assert.equal(serialized.includes("transactions"), false);
});

test("never logs an upstream error body that may echo SMS content", async () => {
  const logs: unknown[] = [];
  let calls = 0;
  const provider = new DeepInfraSmsProvider(CONFIG, {
    fetch: async () => {
      calls++;
      return new Response("ECHOED SECRET SMS BODY", { status: 503 });
    },
    sleep: async () => undefined,
    createTimeoutSignal: () => new AbortController().signal,
    log: (...values) => {
      logs.push(values);
    },
  });

  await assert.rejects(
    () => provider.execute(REQUEST),
    /DeepInfra SMS request failed/
  );
  assert.equal(calls, 4);
  assert.equal(JSON.stringify(logs).includes("ECHOED SECRET SMS BODY"), false);
});
