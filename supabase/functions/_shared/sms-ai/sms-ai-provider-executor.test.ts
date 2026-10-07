import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type {
  ExecuteSmsProviderInput,
  SmsAiProvider,
  SmsAiProviderRequest,
} from "./sms-ai-provider.ts";
import type { SmsAiProviderConfig } from "./sms-ai-provider-config.ts";
import {
  executeSmsAiProvider,
  type SmsAiProviderRequestInputMessage,
} from "./sms-ai-provider-executor.ts";
import { DeepInfraSmsProvider } from "./providers/deepinfra-sms-provider.ts";
import { BUILT_IN_SMS_CATEGORY_TREE } from "./sms-ai-prompt.ts";

const INPUT: ExecuteSmsProviderInput = {
  messages: [
    {
      id: "message-1",
      sender: "QNB EGYPT",
      body: "Purchase EGP 100 at Cafe",
      date: "2026-09-30T20:18:00.000Z",
      smsFingerprint: "fingerprint-secret-1",
    },
    {
      id: "message-2",
      sender: "WALLET",
      body: "Received EGP 250",
      date: "2026-09-30T20:19:00.000Z",
      smsFingerprint: "fingerprint-secret-2",
    },
  ],
  categories: BUILT_IN_SMS_CATEGORY_TREE,
  supportedCurrencies: ["EGP"],
};

const EMPTY_PROVIDER_RESULT = {
  completionStatus: "complete" as const,
  content: '{"transactions":[]}',
};

const CONFIG: SmsAiProviderConfig = {
  provider: "deepinfra",
  model: "deepseek-ai/DeepSeek-V4-Flash-0731",
  serviceTier: "default",
  apiKey: "test-key",
};

function deepInfraResponse(content: string, status = 200): Response {
  if (status !== 200) return new Response(null, { status });
  return new Response(
    JSON.stringify({
      choices: [
        {
          finish_reason: "stop",
          message: { role: "assistant", content },
        },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

test("captures only admitted sender/body/date before the provider request", async () => {
  const order: string[] = [];
  const diagnostics: Array<readonly SmsAiProviderRequestInputMessage[]> = [];
  const outboundRequests: SmsAiProviderRequest[] = [];

  const provider: SmsAiProvider = {
    execute: async (request) => {
      order.push("provider");
      outboundRequests.push(request);
      return EMPTY_PROVIDER_RESULT;
    },
  };

  const result = await executeSmsAiProvider(provider, INPUT, {
    onRequestInput: (smsMessages) => {
      order.push("diagnostic");
      diagnostics.push(smsMessages);
    },
  });

  assert.deepEqual(order, ["diagnostic", "provider"]);
  assert.equal(diagnostics.length, 1);
  assert.deepEqual(diagnostics[0], [
    {
      sender: "QNB EGYPT",
      body: "Purchase EGP 100 at Cafe",
      date: "2026-09-30T20:18:00.000Z",
    },
    {
      sender: "WALLET",
      body: "Received EGP 250",
      date: "2026-09-30T20:19:00.000Z",
    },
  ]);
  assert.equal(Object.isFrozen(diagnostics[0]), true);
  assert.equal(
    diagnostics[0].every((message) => Object.isFrozen(message)),
    true
  );

  const diagnosticJson = JSON.stringify(diagnostics[0]);
  assert.equal(diagnosticJson.includes("message-1"), false);
  assert.equal(diagnosticJson.includes("fingerprint-secret"), false);
  assert.equal(diagnosticJson.includes(INPUT.categories), false);

  const outboundRequest = outboundRequests[0];
  assert.ok(outboundRequest);
  const outboundChat = outboundRequest.messages
    .map((message) => message.content)
    .join("\n");
  for (const message of diagnostics[0]) {
    assert.equal(outboundChat.includes(message.sender), true);
    assert.equal(outboundChat.includes(message.body), true);
    assert.equal(outboundChat.includes(message.date), true);
  }

  assert.equal(result.completionStatus, "complete");
  assert.deepEqual(result.transactions, []);
});

test("runs normally when request-input diagnostics are not configured", async () => {
  let providerCalls = 0;
  const provider: SmsAiProvider = {
    execute: async () => {
      providerCalls++;
      return EMPTY_PROVIDER_RESULT;
    },
  };

  const result = await executeSmsAiProvider(provider, INPUT);

  assert.equal(providerCalls, 1);
  assert.equal(result.completionStatus, "complete");
  assert.equal(result.isResponseSchemaValid, true);
  assert.deepEqual(result.transactions, []);
});

test("a throwing request-input diagnostic cannot prevent fetch or alter an empty parse", async () => {
  let callbackCalls = 0;
  let providerCalls = 0;
  const provider: SmsAiProvider = {
    execute: async () => {
      providerCalls++;
      return EMPTY_PROVIDER_RESULT;
    },
  };

  const result = await executeSmsAiProvider(provider, INPUT, {
    onRequestInput: () => {
      callbackCalls++;
      throw new Error("diagnostic sink unavailable");
    },
  });

  assert.equal(callbackCalls, 1);
  assert.equal(providerCalls, 1);
  assert.equal(result.completionStatus, "complete");
  assert.equal(result.isResponseSchemaValid, true);
  assert.deepEqual(result.transactions, []);
});

test("a failed single DeepInfra attempt emits exactly one request-input diagnostic snapshot", async () => {
  let fetchCalls = 0;
  const diagnostics: Array<readonly SmsAiProviderRequestInputMessage[]> = [];
  const provider = new DeepInfraSmsProvider(CONFIG, {
    fetch: async () => {
      fetchCalls++;
      return deepInfraResponse("", 503);
    },
    sleep: async () => undefined,
    createTimeoutSignal: () => new AbortController().signal,
  });

  await assert.rejects(() =>
    executeSmsAiProvider(provider, INPUT, {
      onRequestInput: (smsMessages) => {
        diagnostics.push(smsMessages);
      },
    })
  );

  assert.equal(fetchCalls, 1);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]?.length, INPUT.messages.length);
  assert.equal(diagnostics[0]?.[0]?.sender, INPUT.messages[0]?.sender);
  assert.equal(diagnostics[0]?.[0]?.body, INPUT.messages[0]?.body);
  assert.equal(diagnostics[0]?.[0]?.date, INPUT.messages[0]?.date);
});

test("parse-sms wires request-input capture only through the existing debug guard", () => {
  const source = readFileSync(
    new URL("../../parse-sms/index.ts", import.meta.url),
    "utf8"
  );

  assert.match(source, /isSmsAiProviderResponseOutputCaptureEnabled/);
  assert.match(source, /smsAi\.providerResponseOutput/);
  assert.match(
    source,
    /const providerRequestDiagnostics:[\s\S]*?isProviderResponseOutputCaptureEnabled[\s\S]*?onRequestInput[\s\S]*?smsAi\.providerRequestInput[\s\S]*?: undefined;/
  );
  assert.match(source, /smsMessages/);
  assert.match(
    source,
    /executeSmsAiProvider\(smsAiProvider, input, providerRequestDiagnostics\)/
  );
});
