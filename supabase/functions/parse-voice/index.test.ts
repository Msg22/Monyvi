import assert from "node:assert/strict";

import {
  getAuthTokens,
  getCapturedServeHandler,
  getProviderInvocations,
  getRpcCalls,
  resetParseVoiceTestState,
  setConsentValue,
  setProviderResults,
  setRpcResponder,
  type ProviderResult,
  type RpcResult,
} from "./test-fixtures/state.ts";

const VALID_REQUEST_KEY = "voice-request-1";
const VALID_TIME_ZONE = "Africa/Cairo";
const VALID_LOCAL_DATE = "2026-10-06";
const TEST_AUTHORIZATION = "Bearer test-token";
const VOICE_REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const SERVER_NOW = "2026-10-07T14:00:00.000Z";
const RESET_AT = "2026-10-07T21:00:00.000Z";
const RESERVATION_EXPIRES_AT = "2026-10-07T14:02:00.000Z";

const SUCCESS_RESPONSE = {
  transcript: "Spent 80 EGP on coffee",
  original_transcript: "دفعت ٨٠ جنيه قهوة",
  detected_language: "ar",
  transactions: [
    {
      amount: 80,
      type: "EXPENSE",
      counterparty: null,
      categorySystemName: "coffee_tea",
      description: "Coffee",
      accountId: null,
      currency: "EGP",
      date: VALID_LOCAL_DATE,
      confidenceScore: 0.95,
    },
  ],
} as const;

const SUCCESS_MODEL_TEXT = JSON.stringify(SUCCESS_RESPONSE);

interface VoiceRequestOptions {
  readonly authorization?: string | null;
  readonly requestKey?: string | null;
  readonly callerTimeZone?: string | null;
  readonly callerLocalDate?: string | null;
}

for (const [name, value] of [
  ["SUPABASE_URL", "https://supabase.test.invalid"],
  ["SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key"],
  ["GEMINI_API_KEY", "test-gemini-key"],
  ["VOICE_AI_DAILY_LIMIT", "5"],
  ["VOICE_AI_BURST_LIMIT", "2"],
  ["VOICE_AI_BURST_WINDOW_SECONDS", "60"],
  ["VOICE_AI_RESERVATION_LEASE_SECONDS", "120"],
  ["VOICE_AI_POLICY_VERSION", "free-launch-v1"],
] as const) {
  Deno.env.set(name, value);
}

resetParseVoiceTestState();
await import("./index.ts");
const handler = getCapturedServeHandler();

function queueProviderSuccess(): void {
  setProviderResults([{ kind: "success", text: SUCCESS_MODEL_TEXT }]);
}

function installSuccessfulQuotaLifecycle(): void {
  setRpcResponder(async (name, params): Promise<RpcResult> => {
    switch (name) {
      case "voice_ai_reserve_work":
        assert.deepEqual(params, {
          p_user_id: "voice-user",
          p_request_key: VALID_REQUEST_KEY,
          p_time_zone: VALID_TIME_ZONE,
          p_mode: "metered",
          p_burst_limit: 2,
          p_burst_window_seconds: 60,
          p_reservation_lease_seconds: 120,
          p_policy_version: "free-launch-v1",
          p_daily_limit: 5,
        });
        return {
          data: [
            {
              request_id: VOICE_REQUEST_ID,
              accepted: true,
              decision_code: "accepted",
              is_replay: false,
              server_now: SERVER_NOW,
              time_zone: VALID_TIME_ZONE,
              daily_limit: 5,
              remaining: 4,
              reset_at: RESET_AT,
              available_at: null,
              burst_available_at: null,
              reservation_expires_at: RESERVATION_EXPIRES_AT,
              policy_version: "free-launch-v1",
            },
          ],
          error: null,
        };

      case "voice_ai_mark_provider_started":
        assert.deepEqual(params, {
          p_user_id: "voice-user",
          p_request_id: VOICE_REQUEST_ID,
          p_time_zone: VALID_TIME_ZONE,
          p_mode: "metered",
          p_burst_limit: 2,
          p_burst_window_seconds: 60,
          p_policy_version: "free-launch-v1",
          p_daily_limit: 5,
        });
        return {
          data: [
            {
              request_id: VOICE_REQUEST_ID,
              started: true,
              decision_code: "provider_started",
              is_replay: false,
              server_now: SERVER_NOW,
              time_zone: VALID_TIME_ZONE,
              daily_limit: 5,
              remaining: 4,
              reset_at: RESET_AT,
              available_at: null,
              burst_available_at: null,
              policy_version: "free-launch-v1",
            },
          ],
          error: null,
        };

      case "voice_ai_complete_work":
        assert.deepEqual(params, {
          p_user_id: "voice-user",
          p_request_id: VOICE_REQUEST_ID,
          p_completed_with_provider_error: false,
          p_decision_code: "completed",
        });
        return { data: true, error: null };

      default:
        throw new Error(`Unexpected Voice safeguard RPC: ${name}`);
    }
  });
}

function assertSuccessfulQuotaLifecycle(): void {
  assert.deepEqual(
    getRpcCalls().map((call): string => call.name),
    [
      "voice_ai_reserve_work",
      "voice_ai_mark_provider_started",
      "voice_ai_complete_work",
    ]
  );
}

function createVoiceRequest(options: VoiceRequestOptions = {}): Request {
  const formData = new FormData();
  const audioBytes = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
  ]);
  formData.set(
    "audio",
    new File([audioBytes], "voice.wav", { type: "audio/wav" })
  );

  const requestKey =
    options.requestKey === undefined ? VALID_REQUEST_KEY : options.requestKey;
  const callerTimeZone =
    options.callerTimeZone === undefined
      ? VALID_TIME_ZONE
      : options.callerTimeZone;
  const callerLocalDate =
    options.callerLocalDate === undefined
      ? VALID_LOCAL_DATE
      : options.callerLocalDate;
  const authorization =
    options.authorization === undefined
      ? TEST_AUTHORIZATION
      : options.authorization;

  if (requestKey !== null) {
    formData.set("requestKey", requestKey);
  }
  if (callerTimeZone !== null) {
    formData.set("callerTimeZone", callerTimeZone);
  }
  if (callerLocalDate !== null) {
    formData.set("callerLocalDate", callerLocalDate);
  }

  const headers = new Headers();
  if (authorization !== null) {
    headers.set("authorization", authorization);
  }

  return new Request("https://example.test/functions/v1/parse-voice", {
    method: "POST",
    headers,
    body: formData,
  });
}

function getPromptText(invocation: unknown): string {
  if (
    typeof invocation !== "object" ||
    invocation === null ||
    !("contents" in invocation) ||
    !Array.isArray(invocation.contents)
  ) {
    throw new Error("Provider invocation has no contents array");
  }

  const promptPart = invocation.contents[1];
  if (
    typeof promptPart !== "object" ||
    promptPart === null ||
    !("text" in promptPart) ||
    typeof promptPart.text !== "string"
  ) {
    throw new Error("Provider invocation has no prompt text");
  }

  return promptPart.text;
}

function assertRejectedBeforeProvider(
  response: Response,
  expectedStatus: number
): void {
  assert.deepEqual(
    {
      status: response.status,
      providerInvocations: getProviderInvocations().length,
      rpcCalls: getRpcCalls().length,
    },
    {
      status: expectedStatus,
      providerInvocations: 0,
      rpcCalls: 0,
    }
  );
}

Deno.test("captures the unchanged parse-voice Deno.serve handler", () => {
  assert.equal(typeof handler, "function");
});

Deno.test(
  "preserves the existing success payload and explicit callerLocalDate behavior",
  async (): Promise<void> => {
    resetParseVoiceTestState();
    queueProviderSuccess();
    installSuccessfulQuotaLifecycle();

    const response = await handler(createVoiceRequest());
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), SUCCESS_RESPONSE);
    assert.deepEqual(getAuthTokens(), ["test-token"]);
    assert.equal(getProviderInvocations().length, 1);
    assertSuccessfulQuotaLifecycle();
    assert.match(
      getPromptText(getProviderInvocations()[0]),
      /Today's date is 2026-10-06\./
    );
  }
);

Deno.test(
  "rejects unauthenticated requests before provider invocation",
  async (): Promise<void> => {
    resetParseVoiceTestState();
    queueProviderSuccess();

    const response = await handler(createVoiceRequest({ authorization: null }));

    assertRejectedBeforeProvider(response, 401);
    assert.deepEqual(getAuthTokens(), []);
  }
);

Deno.test(
  "uses the real consent helper and rejects revoked consent before provider invocation",
  async (): Promise<void> => {
    resetParseVoiceTestState();
    queueProviderSuccess();
    setConsentValue({
      version: "2026-07-ai-processing-v1",
      consentedAt: "2026-10-07T12:00:00.000Z",
      revokedAt: "2026-10-07T12:30:00.000Z",
    });

    const response = await handler(createVoiceRequest());

    assertRejectedBeforeProvider(response, 403);
    assert.deepEqual(getAuthTokens(), ["test-token"]);
  }
);

Deno.test(
  "keeps invalid nonempty callerLocalDate as an existing pre-provider rejection",
  async (): Promise<void> => {
    resetParseVoiceTestState();
    queueProviderSuccess();

    const response = await handler(
      createVoiceRequest({ callerLocalDate: "2026-02-30" })
    );

    assertRejectedBeforeProvider(response, 400);
  }
);

Deno.test(
  "retains the existing four-attempt retry behavior for retryable provider failures",
  async (): Promise<void> => {
    resetParseVoiceTestState();
    installSuccessfulQuotaLifecycle();
    const results: readonly ProviderResult[] = [
      { kind: "error", message: "retryable fixture failure 1" },
      { kind: "error", message: "retryable fixture failure 2" },
      { kind: "error", message: "retryable fixture failure 3" },
      { kind: "success", text: SUCCESS_MODEL_TEXT },
    ];
    setProviderResults(results);

    const response = await handler(createVoiceRequest());

    assert.equal(response.status, 200);
    assert.equal(getProviderInvocations().length, 4);
    assertSuccessfulQuotaLifecycle();
  }
);

Deno.test(
  "rejects a missing requestKey before provider invocation",
  async (): Promise<void> => {
    resetParseVoiceTestState();
    queueProviderSuccess();

    const response = await handler(createVoiceRequest({ requestKey: null }));

    assertRejectedBeforeProvider(response, 400);
  }
);

Deno.test(
  "rejects a missing callerTimeZone before provider invocation",
  async (): Promise<void> => {
    resetParseVoiceTestState();
    queueProviderSuccess();

    const response = await handler(
      createVoiceRequest({ callerTimeZone: null })
    );

    assertRejectedBeforeProvider(response, 400);
  }
);

Deno.test(
  "rejects an overlong requestKey before provider invocation",
  async (): Promise<void> => {
    resetParseVoiceTestState();
    queueProviderSuccess();

    const response = await handler(
      createVoiceRequest({ requestKey: "r".repeat(161) })
    );

    assertRejectedBeforeProvider(response, 400);
  }
);

Deno.test(
  "rejects an overlong callerTimeZone before provider invocation",
  async (): Promise<void> => {
    resetParseVoiceTestState();
    queueProviderSuccess();

    const response = await handler(
      createVoiceRequest({ callerTimeZone: "z".repeat(129) })
    );

    assertRejectedBeforeProvider(response, 400);
  }
);

Deno.test(
  "rejects an unknown IANA callerTimeZone before provider invocation",
  async (): Promise<void> => {
    resetParseVoiceTestState();
    queueProviderSuccess();

    const response = await handler(
      createVoiceRequest({ callerTimeZone: "Mars/Olympus" })
    );

    assertRejectedBeforeProvider(response, 400);
  }
);
