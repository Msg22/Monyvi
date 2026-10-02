import assert from "node:assert/strict";
import test from "node:test";

import type { SmsAiProviderConfig } from "../sms-ai-provider-config.ts";
import { DEEPINFRA_SMS_ENDPOINT } from "./deepinfra-sms-provider.ts";
import {
  DEEPINFRA_SMS_CATEGORY_ATTEMPT_TIMEOUT_MS,
  DeepInfraSmsCategoryProvider,
  type DeepInfraSmsCategoryProviderDependencies,
} from "./deepinfra-sms-category-provider.ts";

const CONFIG: SmsAiProviderConfig = {
  provider: "deepinfra",
  model: "deepseek-ai/DeepSeek-V4-Flash-0731",
  serviceTier: "default",
  apiKey: "test-category-key",
};

const CATEGORY_REQUEST = {
  merchants: [
    {
      id: "merchant-1",
      merchant: "Test Market",
      transactionType: "EXPENSE" as const,
      messageFamily: "card_purchase" as const,
    },
  ],
};

function providerResponse(
  content: string | null,
  finishReason: string | null = "stop"
): Response {
  return new Response(
    JSON.stringify({
      id: "chatcmpl-category-test",
      model: CONFIG.model,
      choices: [
        {
          index: 0,
          finish_reason: finishReason,
          message: { role: "assistant", content },
        },
      ],
      usage: {
        prompt_tokens: 25,
        completion_tokens: 8,
        total_tokens: 33,
      },
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    }
  );
}

function validCategoryContent(categorySystemName = "shopping"): string {
  return JSON.stringify({
    categories: [
      {
        merchantId: "merchant-1",
        categorySystemName,
        confidence: 0.91,
      },
    ],
  });
}

type WithTimeoutDependency = NonNullable<
  DeepInfraSmsCategoryProviderDependencies["withTimeout"]
>;

interface TimeoutScopeState {
  isActive: boolean;
  invocationCount: number;
}

function createProviderPayload(
  content: string | null,
  onContentRead: () => void = () => undefined
): Readonly<Record<string, unknown>> {
  const message: Record<string, unknown> = { role: "assistant" };
  Object.defineProperty(message, "content", {
    enumerable: true,
    get: (): string | null => {
      onContentRead();
      return content;
    },
  });
  return {
    id: "chatcmpl-category-test",
    model: CONFIG.model,
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message,
      },
    ],
  };
}

function responseWithJson(readJson: () => Promise<unknown>): Response {
  const response = new Response(null, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  Object.defineProperty(response, "json", {
    configurable: true,
    value: readJson,
  });
  return response;
}

function createScopedWithTimeout(
  state: TimeoutScopeState
): WithTimeoutDependency {
  return async function runWithTimeout<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
    externalSignal?: AbortSignal
  ): Promise<T> {
    assert.equal(timeoutMs, DEEPINFRA_SMS_CATEGORY_ATTEMPT_TIMEOUT_MS);
    if (externalSignal?.aborted) {
      throw (
        externalSignal.reason ??
        new DOMException("Operation aborted", "AbortError")
      );
    }

    const controller = new AbortController();
    const abortFromExternalSignal = (): void => {
      controller.abort(externalSignal?.reason);
    };
    externalSignal?.addEventListener("abort", abortFromExternalSignal, {
      once: true,
    });
    state.invocationCount += 1;
    state.isActive = true;
    try {
      return await operation(controller.signal);
    } finally {
      state.isActive = false;
      externalSignal?.removeEventListener("abort", abortFromExternalSignal);
    }
  };
}

function createFirstBodyDeadlineWithTimeout(
  state: TimeoutScopeState,
  isBodyReadStarted: () => boolean
): WithTimeoutDependency {
  let invocation = 0;
  return async function runWithTimeout<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
    externalSignal?: AbortSignal
  ): Promise<T> {
    assert.equal(timeoutMs, DEEPINFRA_SMS_CATEGORY_ATTEMPT_TIMEOUT_MS);
    if (externalSignal?.aborted) {
      throw (
        externalSignal.reason ??
        new DOMException("Operation aborted", "AbortError")
      );
    }

    const controller = new AbortController();
    const abortFromExternalSignal = (): void => {
      controller.abort(externalSignal?.reason);
    };
    externalSignal?.addEventListener("abort", abortFromExternalSignal, {
      once: true,
    });
    invocation += 1;
    state.invocationCount += 1;
    state.isActive = true;
    const operationPromise = operation(controller.signal);
    try {
      if (invocation === 1) {
        await Promise.resolve();
        await Promise.resolve();
        if (isBodyReadStarted()) {
          const timeoutError = new Error("Operation timed out");
          timeoutError.name = "TimeoutError";
          controller.abort(timeoutError);
        }
      }
      return await operationPromise;
    } finally {
      state.isActive = false;
      externalSignal?.removeEventListener("abort", abortFromExternalSignal);
    }
  };
}

test("serializes category-only DeepInfra requests with the configured model and strict schema", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const timeoutValues: number[] = [];
  const provider = new DeepInfraSmsCategoryProvider(CONFIG, {
    fetch: async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return providerResponse(validCategoryContent());
    },
    sleep: async () => undefined,
    withTimeout: async (operation, timeoutMs) => {
      timeoutValues.push(timeoutMs);
      return operation(new AbortController().signal);
    },
  });

  const result = await provider.classify(
    CATEGORY_REQUEST,
    new AbortController().signal
  );

  assert.equal(capturedUrl, DEEPINFRA_SMS_ENDPOINT);
  assert.equal(
    (capturedInit?.headers as Record<string, string>).Authorization,
    "Bearer test-category-key"
  );
  const body = JSON.parse(String(capturedInit?.body)) as Record<
    string,
    unknown
  >;
  assert.equal(body.model, CONFIG.model);
  assert.equal(body.temperature, 0);
  assert.equal(body.reasoning_effort, "none");
  assert.equal("service_tier" in body, false);
  assert.deepEqual(timeoutValues, [DEEPINFRA_SMS_CATEGORY_ATTEMPT_TIMEOUT_MS]);

  const messages = body.messages as readonly {
    readonly role: string;
    readonly content: string;
  }[];
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /Do not invent categories/);
  assert.equal(messages[1].role, "user");
  assert.match(messages[1].content, /Allowed categories/);
  assert.match(messages[1].content, /Test Market/);
  assert.equal(messages[1].content.includes("sender"), false);
  assert.equal(messages[1].content.includes("currency"), false);

  const responseFormat = body.response_format as {
    readonly type: string;
    readonly json_schema: {
      readonly name: string;
      readonly strict: boolean;
      readonly schema: Record<string, unknown>;
    };
  };
  assert.equal(responseFormat.type, "json_schema");
  assert.equal(
    responseFormat.json_schema.name,
    "monyvi_sms_category_enrichment"
  );
  assert.equal(responseFormat.json_schema.strict, true);
  assert.equal(responseFormat.json_schema.schema.additionalProperties, false);
  assert.deepEqual(result, {
    categories: [
      {
        merchantId: "merchant-1",
        categorySystemName: "shopping",
        confidence: 0.91,
      },
    ],
  });
});

test("sends configured non-default service tiers without changing the category contract", async () => {
  for (const serviceTier of ["priority", "flex"] as const) {
    let body: Record<string, unknown> = {};
    const provider = new DeepInfraSmsCategoryProvider(
      { ...CONFIG, serviceTier },
      {
        fetch: async (_input, init) => {
          body = JSON.parse(String(init?.body)) as Record<string, unknown>;
          return providerResponse(validCategoryContent());
        },
        sleep: async () => undefined,
        withTimeout: async (operation) =>
          operation(new AbortController().signal),
      }
    );

    const result = await provider.classify(
      CATEGORY_REQUEST,
      new AbortController().signal
    );

    assert.equal(body.service_tier, serviceTier);
    assert.deepEqual(
      result?.categories.map((item) => item.categorySystemName),
      ["shopping"]
    );
  }
});

test("filters unsupported categories through the existing immutable allow-list", async () => {
  const provider = new DeepInfraSmsCategoryProvider(CONFIG, {
    fetch: async () =>
      providerResponse(validCategoryContent("invented_category")),
    sleep: async () => undefined,
    withTimeout: async (operation) => operation(new AbortController().signal),
  });

  const result = await provider.classify(
    CATEGORY_REQUEST,
    new AbortController().signal
  );

  assert.deepEqual(result, { categories: [] });
});

test("fails safely on empty or malformed provider output without exposing partial results", async () => {
  for (const response of [
    () => providerResponse(""),
    () => providerResponse(null),
    () =>
      new Response(JSON.stringify({ choices: "invalid" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    () =>
      new Response("{not-json", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    () => providerResponse(validCategoryContent(), "length"),
  ]) {
    let calls = 0;
    const provider = new DeepInfraSmsCategoryProvider(CONFIG, {
      fetch: async () => {
        calls += 1;
        return response();
      },
      sleep: async () => undefined,
      withTimeout: async (operation) => operation(new AbortController().signal),
    });

    const result = await provider.classify(
      CATEGORY_REQUEST,
      new AbortController().signal
    );

    assert.equal(result, null);
    assert.equal(calls, 2);
  }
});

test("preserves one retry with 1s backoff for transient provider failures", async () => {
  let calls = 0;
  const delays: number[] = [];
  const provider = new DeepInfraSmsCategoryProvider(CONFIG, {
    fetch: async () => {
      calls += 1;
      if (calls === 1) return new Response(null, { status: 503 });
      return providerResponse(validCategoryContent());
    },
    sleep: async (milliseconds) => {
      delays.push(milliseconds);
    },
    withTimeout: async (operation) => operation(new AbortController().signal),
  });

  const result = await provider.classify(
    CATEGORY_REQUEST,
    new AbortController().signal
  );

  assert.equal(calls, 2);
  assert.deepEqual(delays, [1000]);
  assert.equal(result?.categories.length, 1);
});

test("preserves the 8s attempt timeout and retries one timeout before succeeding", async () => {
  let timeoutCalls = 0;
  const delays: number[] = [];
  const provider = new DeepInfraSmsCategoryProvider(CONFIG, {
    fetch: async () => providerResponse(validCategoryContent()),
    sleep: async (milliseconds) => {
      delays.push(milliseconds);
    },
    withTimeout: async (operation, timeoutMs) => {
      assert.equal(timeoutMs, DEEPINFRA_SMS_CATEGORY_ATTEMPT_TIMEOUT_MS);
      timeoutCalls += 1;
      if (timeoutCalls === 1) {
        const error = new Error("Operation timed out");
        error.name = "TimeoutError";
        throw error;
      }
      return operation(new AbortController().signal);
    },
  });

  const result = await provider.classify(
    CATEGORY_REQUEST,
    new AbortController().signal
  );

  assert.equal(timeoutCalls, 2);
  assert.deepEqual(delays, [1000]);
  assert.equal(result?.categories.length, 1);
});

test("returns null after exactly two failed provider attempts", async () => {
  let calls = 0;
  const delays: number[] = [];
  const provider = new DeepInfraSmsCategoryProvider(CONFIG, {
    fetch: async () => {
      calls += 1;
      return new Response(null, { status: 503 });
    },
    sleep: async (milliseconds) => {
      delays.push(milliseconds);
    },
    withTimeout: async (operation) => operation(new AbortController().signal),
  });

  const result = await provider.classify(
    CATEGORY_REQUEST,
    new AbortController().signal
  );

  assert.equal(result, null);
  assert.equal(calls, 2);
  assert.deepEqual(delays, [1000]);
});

test("propagates request cancellation without retrying the provider", async () => {
  const requestController = new AbortController();
  requestController.abort(new DOMException("cancelled", "AbortError"));
  let calls = 0;
  let sleeps = 0;
  const provider = new DeepInfraSmsCategoryProvider(CONFIG, {
    fetch: async () => {
      calls += 1;
      return providerResponse(validCategoryContent());
    },
    sleep: async () => {
      sleeps += 1;
    },
  });

  await assert.rejects(
    () => provider.classify(CATEGORY_REQUEST, requestController.signal),
    /cancelled/
  );
  assert.equal(calls, 0);
  assert.equal(sleeps, 0);
});

test("never logs provider bodies, merchant text, or credentials on exhaustion", async () => {
  const logs: unknown[] = [];
  const provider = new DeepInfraSmsCategoryProvider(CONFIG, {
    fetch: async () =>
      new Response("ECHOED Test Market test-category-key", { status: 503 }),
    sleep: async () => undefined,
    withTimeout: async (operation) => operation(new AbortController().signal),
    logWarn: (...values) => {
      logs.push(values);
    },
    logError: (...values) => {
      logs.push(values);
    },
  });

  const result = await provider.classify(
    CATEGORY_REQUEST,
    new AbortController().signal
  );

  assert.equal(result, null);
  const serialized = JSON.stringify(logs);
  assert.equal(serialized.includes("Test Market"), false);
  assert.equal(serialized.includes("test-category-key"), false);
  assert.equal(serialized.includes("ECHOED"), false);
});

test("keeps response-body consumption inside the 8s attempt deadline and retries after body timeout", async () => {
  const scope: TimeoutScopeState = { isActive: false, invocationCount: 0 };
  const warnings: unknown[][] = [];
  const delays: number[] = [];
  let calls = 0;
  let firstBodyReadStarted = false;
  let firstBodyReadInsideTimeout = false;
  let firstBodySignalAborted = false;

  const provider = new DeepInfraSmsCategoryProvider(CONFIG, {
    fetch: async (_input, init) => {
      calls += 1;
      if (calls !== 1) {
        return providerResponse(validCategoryContent());
      }

      const signal = init?.signal;
      return responseWithJson(() => {
        firstBodyReadStarted = true;
        firstBodyReadInsideTimeout = scope.isActive;
        if (!scope.isActive) {
          const escaped = new Error("Response body escaped attempt timeout");
          escaped.name = "BodyReadOutsideTimeout";
          return Promise.reject(escaped);
        }

        return new Promise<unknown>((_resolve, reject) => {
          const rejectFromAbort = (): void => {
            firstBodySignalAborted = signal?.aborted === true;
            reject(
              signal?.reason ??
                new DOMException("Operation aborted", "AbortError")
            );
          };
          if (signal?.aborted) {
            rejectFromAbort();
            return;
          }
          signal?.addEventListener("abort", rejectFromAbort, { once: true });
        });
      });
    },
    sleep: async (milliseconds) => {
      delays.push(milliseconds);
    },
    withTimeout: createFirstBodyDeadlineWithTimeout(
      scope,
      () => firstBodyReadStarted
    ),
    logWarn: (...values) => {
      warnings.push([...values]);
    },
  });

  const result = await provider.classify(
    CATEGORY_REQUEST,
    new AbortController().signal
  );

  assert.equal(calls, 2);
  assert.equal(scope.invocationCount, 2);
  assert.deepEqual(delays, [1000]);
  assert.equal(firstBodyReadInsideTimeout, true);
  assert.equal(firstBodySignalAborted, true);
  const firstWarningMetadata = warnings[0]?.[1] as
    | { readonly phase?: unknown }
    | undefined;
  assert.equal(firstWarningMetadata?.phase, "timeout");
  assert.equal(result?.categories.length, 1);
});

test("propagates cancellation during response-body consumption without retrying", async () => {
  const requestController = new AbortController();
  const cancellation = new DOMException("cancelled during body", "AbortError");
  const scope: TimeoutScopeState = { isActive: false, invocationCount: 0 };
  let calls = 0;
  let sleeps = 0;
  let bodyReadInsideTimeout = false;
  let bodySignalAborted = false;

  const provider = new DeepInfraSmsCategoryProvider(CONFIG, {
    fetch: async (_input, init) => {
      calls += 1;
      const signal = init?.signal;
      return responseWithJson(async () => {
        bodyReadInsideTimeout = scope.isActive;
        requestController.abort(cancellation);
        bodySignalAborted = signal?.aborted === true;
        if (signal?.aborted) {
          throw (
            signal.reason ?? new DOMException("Operation aborted", "AbortError")
          );
        }
        return createProviderPayload(validCategoryContent());
      });
    },
    sleep: async () => {
      sleeps += 1;
    },
    withTimeout: createScopedWithTimeout(scope),
  });

  await assert.rejects(
    () => provider.classify(CATEGORY_REQUEST, requestController.signal),
    /cancelled during body/
  );
  assert.equal(calls, 1);
  assert.equal(sleeps, 0);
  assert.equal(bodyReadInsideTimeout, true);
  assert.equal(bodySignalAborted, true);
});

test("keeps successful body consumption and category validation inside the attempt budget", async () => {
  const scope: TimeoutScopeState = { isActive: false, invocationCount: 0 };
  const bodyScopes: boolean[] = [];
  const validationScopes: boolean[] = [];
  const provider = new DeepInfraSmsCategoryProvider(CONFIG, {
    fetch: async () =>
      responseWithJson(async () => {
        bodyScopes.push(scope.isActive);
        return createProviderPayload(validCategoryContent(), () => {
          validationScopes.push(scope.isActive);
        });
      }),
    sleep: async () => undefined,
    withTimeout: createScopedWithTimeout(scope),
  });

  const result = await provider.classify(
    CATEGORY_REQUEST,
    new AbortController().signal
  );

  assert.deepEqual(bodyScopes, [true]);
  assert.deepEqual(validationScopes, [true]);
  assert.equal(scope.invocationCount, 1);
  assert.deepEqual(result, {
    categories: [
      {
        merchantId: "merchant-1",
        categorySystemName: "shopping",
        confidence: 0.91,
      },
    ],
  });
});

test("keeps malformed category validation inside the attempt budget", async () => {
  const scope: TimeoutScopeState = { isActive: false, invocationCount: 0 };
  const bodyScopes: boolean[] = [];
  const validationScopes: boolean[] = [];
  const delays: number[] = [];
  let calls = 0;
  const provider = new DeepInfraSmsCategoryProvider(CONFIG, {
    fetch: async () => {
      calls += 1;
      return responseWithJson(async () => {
        bodyScopes.push(scope.isActive);
        return createProviderPayload("{not-json", () => {
          validationScopes.push(scope.isActive);
        });
      });
    },
    sleep: async (milliseconds) => {
      delays.push(milliseconds);
    },
    withTimeout: createScopedWithTimeout(scope),
  });

  const result = await provider.classify(
    CATEGORY_REQUEST,
    new AbortController().signal
  );

  assert.equal(result, null);
  assert.equal(calls, 2);
  assert.equal(scope.invocationCount, 2);
  assert.deepEqual(delays, [1000]);
  assert.deepEqual(bodyScopes, [true, true]);
  assert.deepEqual(validationScopes, [true, true]);
});
