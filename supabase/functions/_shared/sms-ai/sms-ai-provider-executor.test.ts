import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type {
  ExecuteSmsProviderInput,
  SmsAiProvider,
  SmsAiProviderRequest,
  SmsProviderExecutionResult,
} from "./sms-ai-provider.ts";
import type { SmsAiProviderConfig } from "./sms-ai-provider-config.ts";
import { executeSmsAiProvider } from "./sms-ai-provider-executor.ts";
import { DeepInfraSmsProvider } from "./providers/deepinfra-sms-provider.ts";

interface ProviderRequestSmsDiagnostic {
  readonly sender: string;
  readonly body: string;
  readonly date: string;
}

interface ProviderRequestDiagnostics {
  readonly onRequestInput?: (
    smsMessages: readonly ProviderRequestSmsDiagnostic[]
  ) => void;
}

type ExecuteSmsAiProviderWithDiagnostics = (
  provider: SmsAiProvider,
  input: ExecuteSmsProviderInput,
  diagnostics?: ProviderRequestDiagnostics
) => Promise<SmsProviderExecutionResult>;

const executeWithDiagnostics =
  executeSmsAiProvider as unknown as ExecuteSmsAiProviderWithDiagnostics;

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
  categories: "SECRET CATEGORY CONTEXT",
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

function deepInfraResponse(
  content: string,
  status = 200
): Response {
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
  const diagnostics: Array<readonly ProviderRequestSmsDiagnostic[]> = [];
  let outboundRequest: SmsAiProviderRequest | null = null;

  const provider: SmsAiProvider = {
    execute: async (request) => {
      order.push("provider");
      outboundRequest = request;
      return EMPTY_PROVIDER_RESULT;
    },
  };

  const result = await executeWithDiagnostics(provider, INPUT, {
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
  assert.equal(diagnostics[0].every((message) => Object.isFrozen(message)), true);

  const diagnosticJson = JSON.stringify(diagnostics[0]);
  assert.equal(diagnosticJson.includes("message-1"), false);
  assert.equal(diagnosticJson.includes("fingerprint-secret"), false);
  assert.equal(diagnosticJson.includes("SECRET CATEGORY CONTEXT"), false);

  const outboundChat = outboundRequest?.messages
    .map((message) => message.content)
    .join("\n");
  assert.ok(outboundChat);
  for (const message of diagnostics[0]) {
    assert.equal(outboundChat.includes(message.sender), true);
    assert.equal(outboundChat.includes(message.body), true);
    assert.equal(outboundChat.includes(message.date), true);
  }

  assert.equal(result.completionStatus, "complete");
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

  const result = await executeWithDiagnostics(provider, INPUT, {
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

test("internal DeepInfra retries reuse one logical request-input diagnostic snapshot", async () => {
  let fetchCalls = 0;
  const fetchBodies: string[] = [];
  const diagnostics: Array<readonly ProviderRequestSmsDiagnostic[]> = [];
  const provider = new DeepInfraSmsProvider(CONFIG, {
    fetch: async (_input, init) => {
      fetchCalls++;
      fetchBodies.push(String(init?.body));
      if (fetchCalls === 1) {
        return deepInfraResponse("", 503);
      }
      return deepInfraResponse('{"transactions":[]}');
    },
    sleep: async () => undefined,
    createTimeoutSignal: () => new AbortController().signal,
  });

  const result = await executeWithDiagnostics(provider, INPUT, {
    onRequestInput: (smsMessages) => {
      diagnostics.push(smsMessages);
    },
  });

  assert.equal(fetchCalls, 2);
  assert.equal(diagnostics.length, 1);
  assert.deepEqual(fetchBodies[0], fetchBodies[1]);
  assert.equal(result.completionStatus, "complete");
  assert.deepEqual(result.transactions, []);
});

test("parse-sms wires request-input capture only through the existing debug guard", () => {
  const source = readFileSync(
    new URL("../../parse-sms/index.ts", import.meta.url),
    "utf8"
  );

  assert.match(source, /isSmsAiProviderResponseOutputCaptureEnabled/);
  assert.match(source, /onRequestInput/);
  assert.match(source, /smsAi\.providerRequestInput/);
  assert.match(source, /smsMessages/);

  const guardedBlock = source.match(
    /isProviderResponseOutputCaptureEnabled\s*\?\s*\{[\s\S]*?\}\s*:\s*\{\}/
  )?.[0];
  assert.ok(guardedBlock);
  assert.match(guardedBlock, /onResponseOutput/);
  assert.match(guardedBlock, /onRequestInput/);
  assert.match(guardedBlock, /smsAi\.providerResponseOutput/);
  assert.match(guardedBlock, /smsAi\.providerRequestInput/);
});
