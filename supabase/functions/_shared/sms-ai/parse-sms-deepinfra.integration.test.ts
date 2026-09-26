import assert from "node:assert/strict";
import test from "node:test";

import {
  createParseSmsHandler,
  type ParseSmsHandlerDependencies,
} from "../parse-sms-handler.ts";
import { DEFAULT_SMS_SAFEGUARD_POLICY } from "../sms-safeguard-policy.ts";
import { DeepInfraSmsProvider } from "./providers/deepinfra-sms-provider.ts";
import { executeSmsAiProvider } from "./sms-ai-provider-executor.ts";
import type { SmsAiProviderConfig } from "./sms-ai-provider-config.ts";
import {
  buildSmsAiDynamicCategoryContext,
  buildSmsAiResponseSchema,
  buildSmsAiStableSystemPrompt,
} from "./sms-ai-prompt.ts";

const CONFIG: SmsAiProviderConfig = {
  provider: "deepinfra",
  model: "deepseek-ai/DeepSeek-V4-Flash-0731",
  serviceTier: "default",
  apiKey: "test-key",
};

function providerResponse(
  content: string,
  finishReason = "stop",
  status = 200
): Response {
  if (status !== 200) return new Response(null, { status });
  return new Response(
    JSON.stringify({
      choices: [
        {
          finish_reason: finishReason,
          message: { content },
        },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

function requestBody(): Readonly<Record<string, unknown>> {
  return {
    requestKey: "request-key",
    scanSessionId: "scan-session",
    scanKind: "incremental",
    scanStartedAt: "2026-07-20T12:00:00.000Z",
    messages: [
      {
        id: "message-1",
        body: "Purchase EGP 100 at Carrefour",
        sender: "QNB EGYPT",
        date: "2026-07-20T01:00:00.000Z",
        smsFingerprint: "fingerprint-1",
      },
    ],
    categories:
      "EXPENSE categories (return the system_name value):\n  L1: shopping\n    L2: groceries",
    supportedCurrencies: ["EGP"],
  };
}

function post(): Request {
  return new Request("http://localhost/parse-sms", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(requestBody()),
  });
}

function createHandler(
  responses: Response[]
): {
  readonly handler: (request: Request) => Promise<Response>;
  readonly getStartCount: () => number;
  readonly getFetchCount: () => number;
} {
  let startCount = 0;
  let fetchCount = 0;
  const provider = new DeepInfraSmsProvider(CONFIG, {
    fetch: async () => {
      fetchCount++;
      const response = responses.shift();
      if (!response) throw new Error("Missing mocked provider response");
      return response;
    },
    sleep: async () => undefined,
    createTimeoutSignal: () => new AbortController().signal,
  });

  const dependencies: ParseSmsHandlerDependencies = {
    authenticate: async () => "user-id",
    hasConsent: async () => true,
    getPolicy: () => DEFAULT_SMS_SAFEGUARD_POLICY,
    buildFixedPrompt: buildSmsAiStableSystemPrompt,
    buildCategoryContext: buildSmsAiDynamicCategoryContext,
    buildResponseSchema: (currencies) =>
      JSON.stringify(buildSmsAiResponseSchema(currencies)),
    shouldExclude: () => false,
    computeFingerprint: async (message) => message.smsFingerprint,
    computeRequestDigest: async () => "request-digest",
    getServerNowMs: () => Date.parse("2026-07-20T12:00:00.000Z"),
    resolveScanWindowStart: async (input) => input.requestedScanStartedAtMs,
    getProcessingOutcomes: async () => [],
    reserveWork: async () => ({
      requestId: "work-id",
      accepted: true,
      decisionCode: "accepted",
      availableAt: null,
      isReplay: false,
    }),
    markProviderStarted: async () => {
      startCount++;
      return {
        started: true,
        decisionCode: "provider_started",
        terminalFingerprints: [],
        availableAt: null,
      };
    },
    executeProvider: (input) => executeSmsAiProvider(provider, input),
    completeWork: async () => true,
    releaseWork: async () => true,
    reconcileOutcomes: async (input) => ({
      status: "reconciled",
      positiveFingerprints: input.submittedCandidates.map(
        (candidate) => candidate.smsFingerprint
      ),
      negativeFingerprints: [],
    }),
  };

  return {
    handler: createParseSmsHandler(dependencies),
    getStartCount: () => startCount,
    getFetchCount: () => fetchCount,
  };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

test("returns a valid parsed purchase through the provider-neutral executor", async () => {
  const { handler } = createHandler([
    providerResponse(
      JSON.stringify({
        transactions: [
          {
            messageId: "message-1",
            amount: 100,
            currency: "EGP",
            type: "EXPENSE",
            counterparty: "Carrefour",
            date: "2026-07-20",
            categorySystemName: "groceries",
            confidenceScore: 0.95,
            isTrusted: true,
          },
        ],
      })
    ),
  ]);

  const response = await handler(post());
  const data = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal((data.transactions as readonly unknown[]).length, 1);
});

test("accepts a complete empty provider result", async () => {
  const { handler } = createHandler([
    providerResponse(JSON.stringify({ transactions: [] })),
  ]);

  const response = await handler(post());
  const data = await readJson(response);

  assert.equal(response.status, 200);
  assert.deepEqual(data.transactions, []);
  assert.equal(data.completionStatus, "complete");
});

test("rejects unsupported currency/category and malformed provider JSON", async () => {
  for (const content of [
    JSON.stringify({
      transactions: [
        {
          messageId: "message-1",
          amount: 100,
          currency: "USD",
          type: "EXPENSE",
          counterparty: "Carrefour",
          date: "2026-07-20",
          categorySystemName: "groceries",
          confidenceScore: 0.9,
          isTrusted: true,
        },
      ],
    }),
    JSON.stringify({
      transactions: [
        {
          messageId: "message-1",
          amount: 100,
          currency: "EGP",
          type: "EXPENSE",
          counterparty: "Carrefour",
          date: "2026-07-20",
          categorySystemName: "invented_category",
          confidenceScore: 0.9,
          isTrusted: true,
        },
      ],
    }),
    "{not-json",
  ]) {
    const { handler } = createHandler([providerResponse(content)]);
    const response = await handler(post());
    const data = await readJson(response);

    assert.equal(response.status, 502);
    assert.equal(data.reason, "response_invalid");
    assert.deepEqual(data.transactions, []);
  }
});

test("preserves truncated completion without accepting partial financial data", async () => {
  const { handler } = createHandler([
    providerResponse('{"transactions":[', "length"),
  ]);

  const response = await handler(post());
  const data = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(data.completionStatus, "truncated");
  assert.deepEqual(data.transactions, []);
});

test("internal provider retries record exactly one provider start", async () => {
  const { handler, getStartCount, getFetchCount } = createHandler([
    providerResponse("", "stop", 503),
    providerResponse(JSON.stringify({ transactions: [] })),
  ]);

  const response = await handler(post());

  assert.equal(response.status, 200);
  assert.equal(getFetchCount(), 2);
  assert.equal(getStartCount(), 1);
});
