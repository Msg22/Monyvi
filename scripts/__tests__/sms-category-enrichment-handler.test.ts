import assert from "node:assert/strict";
import test from "node:test";
import {
  handleSmsCategoryEnrichmentRequest,
  type SmsCategoryHandlerDependencies,
} from "../../supabase/functions/_shared/sms-category-enrichment-handler";
import { withTimeout } from "../../supabase/functions/_shared/promise-timeout";

const validBody = {
  merchants: [
    {
      id: "merchant-1",
      merchant: "MYFAWRY",
      transactionType: "EXPENSE",
      messageFamily: "card_purchase",
    },
  ],
};

function dependencies(
  overrides: Partial<SmsCategoryHandlerDependencies> = {}
): SmsCategoryHandlerDependencies {
  return {
    authenticate: async () => ({ userId: "user-1" }),
    hasConsent: async () => true,
    isProviderConfigured: true,
    classify: async () => ({
      categories: [
        {
          merchantId: "merchant-1",
          categorySystemName: "shopping",
          confidence: 0.95,
        },
      ],
    }),
    logInfo: () => undefined,
    logError: () => undefined,
    ...overrides,
  };
}

function request(body: unknown = validBody): Request {
  return new Request("https://example.test/enrich-sms-categories", {
    method: "POST",
    headers: {
      authorization: "Bearer token",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

test("rejects unauthenticated category enrichment before classification", async () => {
  let classifyCalls = 0;
  const response = await handleSmsCategoryEnrichmentRequest(
    request(),
    dependencies({
      authenticate: async () => null,
      classify: async () => {
        classifyCalls += 1;
        return null;
      },
    })
  );

  assert.equal(response.status, 401);
  assert.equal(classifyCalls, 0);
});

test("rejects stale consent before merchant data reaches the provider", async () => {
  let classifyCalls = 0;
  const response = await handleSmsCategoryEnrichmentRequest(
    request(),
    dependencies({
      hasConsent: async () => false,
      classify: async () => {
        classifyCalls += 1;
        return null;
      },
    })
  );

  assert.equal(response.status, 403);
  assert.equal(classifyCalls, 0);
});

test("rejects payload fields outside the minimal contract", async () => {
  const response = await handleSmsCategoryEnrichmentRequest(
    request({ ...validBody, rawSmsBody: "private" }),
    dependencies()
  );

  assert.equal(response.status, 400);
});

test("returns only validated classification output", async () => {
  const response = await handleSmsCategoryEnrichmentRequest(
    request(),
    dependencies()
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    categories: [
      {
        merchantId: "merchant-1",
        categorySystemName: "shopping",
        confidence: 0.95,
      },
    ],
  });
});

test("logs only aggregate counts after successful classification", async () => {
  const infoEvents: unknown[][] = [];
  await handleSmsCategoryEnrichmentRequest(
    request(),
    dependencies({ logInfo: (...values) => infoEvents.push(values) })
  );

  const serialized = JSON.stringify(infoEvents);
  assert.match(serialized, /merchantCount/);
  assert.match(serialized, /resultCount/);
  assert.doesNotMatch(serialized, /MYFAWRY/);
});

test("bounds a provider operation with a real timeout", async () => {
  let wasAborted = false;

  await assert.rejects(
    withTimeout(
      (signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              wasAborted = true;
              reject(signal.reason);
            },
            { once: true }
          );
        }),
      1
    ),
    (error: unknown) => error instanceof Error && error.name === "TimeoutError"
  );
  assert.equal(wasAborted, true);
});

test("passes the request cancellation signal to classification", async () => {
  let receivedSignal: AbortSignal | undefined;
  const incomingRequest = request();

  const response = await handleSmsCategoryEnrichmentRequest(
    incomingRequest,
    dependencies({
      classify: async (_body, signal) => {
        receivedSignal = signal;
        return { categories: [] };
      },
    })
  );

  assert.equal(response.status, 200);
  assert.equal(receivedSignal, incomingRequest.signal);
});
