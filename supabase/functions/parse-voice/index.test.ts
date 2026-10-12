import assert from "node:assert/strict";

import {
  createDefaultWavFile,
  createEmptyAudioFile,
  RECOGNIZED_AUDIO_FIXTURES,
} from "./test-fixtures/audio-files.ts";
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
  readonly audioFile?: File | null;
}

for (const [n, v] of [
  ["SUPABASE_URL", "https://supabase.test.invalid"],
  ["SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key"],
  ["GEMINI_API_KEY", "test-gemini-key"],
  ["VOICE_AI_DAILY_LIMIT", "5"],
  ["VOICE_AI_BURST_LIMIT", "2"],
  ["VOICE_AI_BURST_WINDOW_SECONDS", "60"],
  ["VOICE_AI_RESERVATION_LEASE_SECONDS", "120"],
  ["VOICE_AI_POLICY_VERSION", "free-launch-v1"],
] as const) {
  Deno.env.set(n, v);
}

resetParseVoiceTestState();
await import("./index.ts");
const handler = getCapturedServeHandler();

// Harness helper: intercept real structured console.info calls emitted by telemetry
interface CapturedTelemetryEvent {
  readonly event: string;
  readonly model: string;
  readonly attempt: number;
  readonly promptTokenCount: number | null;
  readonly cachedContentTokenCount: number | null;
  readonly candidatesTokenCount: number | null;
  readonly totalTokenCount: number | null;
  readonly cacheObservedHit: boolean | null;
  readonly cachedInputRatio: number | null;
}

async function withCapturedTelemetry(
  fn: (capturedEvents: CapturedTelemetryEvent[]) => Promise<void>
): Promise<void> {
  const events: CapturedTelemetryEvent[] = [];
  const originalConsoleInfo = console.info;

  console.info = (...args: unknown[]): void => {
    if (args.length > 0 && typeof args[0] === "string") {
      try {
        const parsed = JSON.parse(args[0]);
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          parsed.event === "voice_ai_gemini_usage"
        ) {
          events.push(parsed as CapturedTelemetryEvent);
          return;
        }
      } catch {
        // Not a JSON telemetry message; forward to original
      }
    }
    originalConsoleInfo(...args);
  };

  try {
    await fn(events);
  } finally {
    console.info = originalConsoleInfo;
  }
}

function queueProviderSuccess(usageMetadata?: unknown): void {
  setProviderResults([
    {
      kind: "success",
      text: SUCCESS_MODEL_TEXT,
      ...(usageMetadata !== undefined ? { usageMetadata } : {}),
    },
  ]);
}

function createReservationRow(
  overrides: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
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
    ...overrides,
  };
}

function createProviderStartRow(
  overrides: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
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
    ...overrides,
  };
}

const EXPECTED_RESERVE_PARAMS = {
  p_user_id: "voice-user",
  p_request_key: VALID_REQUEST_KEY,
  p_time_zone: VALID_TIME_ZONE,
  p_mode: "metered",
  p_burst_limit: 2,
  p_burst_window_seconds: 60,
  p_reservation_lease_seconds: 120,
  p_policy_version: "free-launch-v1",
  p_daily_limit: 5,
} as const;

const EXPECTED_PROVIDER_START_PARAMS = {
  p_user_id: "voice-user",
  p_request_id: VOICE_REQUEST_ID,
  p_time_zone: VALID_TIME_ZONE,
  p_mode: "metered",
  p_burst_limit: 2,
  p_burst_window_seconds: 60,
  p_policy_version: "free-launch-v1",
  p_daily_limit: 5,
} as const;

function installSuccessfulQuotaLifecycle(): void {
  setRpcResponder(async (name, params): Promise<RpcResult> => {
    switch (name) {
      case "voice_ai_reserve_work":
        assert.deepEqual(params, EXPECTED_RESERVE_PARAMS);
        return { data: [createReservationRow()], error: null };
      case "voice_ai_mark_provider_started":
        assert.deepEqual(params, EXPECTED_PROVIDER_START_PARAMS);
        return { data: [createProviderStartRow()], error: null };
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
    getRpcCalls().map((c): string => c.name),
    [
      "voice_ai_reserve_work",
      "voice_ai_mark_provider_started",
      "voice_ai_complete_work",
    ]
  );
}

function createVoiceRequest(options: VoiceRequestOptions = {}): Request {
  const formData = new FormData();
  if (options.audioFile !== null) {
    const file =
      options.audioFile !== undefined
        ? options.audioFile
        : createDefaultWavFile();
    formData.set("audio", file);
  }

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

  if (requestKey !== null) formData.set("requestKey", requestKey);
  if (callerTimeZone !== null) formData.set("callerTimeZone", callerTimeZone);
  if (callerLocalDate !== null)
    formData.set("callerLocalDate", callerLocalDate);

  const headers = new Headers();
  if (authorization !== null) headers.set("authorization", authorization);

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
  expectedStatus: number,
  telemetryEventsCount = 0
): void {
  assert.deepEqual(
    {
      status: response.status,
      providerInvocations: getProviderInvocations().length,
      rpcCalls: getRpcCalls().length,
      telemetryEvents: telemetryEventsCount,
    },
    {
      status: expectedStatus,
      providerInvocations: 0,
      rpcCalls: 0,
      telemetryEvents: 0,
    }
  );
}

async function assertRequestRejectedBeforeProvider(
  options: VoiceRequestOptions,
  expectedStatus = 400
): Promise<void> {
  resetParseVoiceTestState();
  queueProviderSuccess();
  await withCapturedTelemetry(async (events) => {
    const response = await handler(createVoiceRequest(options));
    assertRejectedBeforeProvider(response, expectedStatus, events.length);
  });
}

Deno.test("captures the unchanged parse-voice Deno.serve handler", () => {
  assert.equal(typeof handler, "function");
});

Deno.test(
  "preserves the existing success payload and explicit callerLocalDate behavior",
  async (): Promise<void> => {
    resetParseVoiceTestState();
    queueProviderSuccess({
      promptTokenCount: 1200,
      cachedContentTokenCount: 600,
      candidatesTokenCount: 80,
      totalTokenCount: 1280,
    });
    installSuccessfulQuotaLifecycle();

    await withCapturedTelemetry(async (events) => {
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

      // Verify real telemetry event intercepted from structured console.info
      assert.equal(events.length, 1);
      assert.deepEqual(events[0], {
        event: "voice_ai_gemini_usage",
        model: "gemini-2.5-flash-lite",
        attempt: 0,
        promptTokenCount: 1200,
        cachedContentTokenCount: 600,
        candidatesTokenCount: 80,
        totalTokenCount: 1280,
        cacheObservedHit: true,
        cachedInputRatio: 0.5,
      });
    });
  }
);

Deno.test(
  "rejects unauthenticated requests before provider invocation without telemetry",
  async (): Promise<void> => {
    await assertRequestRejectedBeforeProvider({ authorization: null }, 401);
    assert.deepEqual(getAuthTokens(), []);
  }
);

Deno.test(
  "uses the real consent helper and rejects revoked consent before provider invocation without telemetry",
  async (): Promise<void> => {
    resetParseVoiceTestState();
    queueProviderSuccess();
    setConsentValue({
      version: "2026-07-ai-processing-v1",
      consentedAt: "2026-10-07T12:00:00.000Z",
      revokedAt: "2026-10-07T12:30:00.000Z",
    });

    await withCapturedTelemetry(async (events) => {
      const response = await handler(createVoiceRequest());
      assertRejectedBeforeProvider(response, 403, events.length);
      assert.deepEqual(getAuthTokens(), ["test-token"]);
    });
  }
);

Deno.test(
  "keeps invalid nonempty callerLocalDate as an existing pre-provider rejection without telemetry",
  async (): Promise<void> => {
    await assertRequestRejectedBeforeProvider(
      { callerLocalDate: "2026-02-30" },
      400
    );
  }
);

Deno.test(
  "retains the existing four-attempt retry behavior and records telemetry only on returned responses",
  async (): Promise<void> => {
    resetParseVoiceTestState();
    installSuccessfulQuotaLifecycle();
    // 3 transport/network errors (throw before returning response, so NO usageMetadata and NO fabricated miss)
    // 4th is success with usageMetadata
    const results: readonly ProviderResult[] = [
      { kind: "error", message: "retryable fixture failure 1" },
      { kind: "error", message: "retryable fixture failure 2" },
      { kind: "error", message: "retryable fixture failure 3" },
      {
        kind: "success",
        text: SUCCESS_MODEL_TEXT,
        usageMetadata: {
          promptTokenCount: 1000,
          cachedContentTokenCount: 0,
          candidatesTokenCount: 50,
          totalTokenCount: 1050,
        },
      },
    ];
    setProviderResults(results);

    await withCapturedTelemetry(async (events) => {
      const response = await handler(createVoiceRequest());
      assert.equal(response.status, 200);
      assert.equal(getProviderInvocations().length, 4);
      assertSuccessfulQuotaLifecycle();

      // Exactly 1 telemetry event recorded because 3 attempts threw before response
      assert.equal(events.length, 1);
      assert.deepEqual(events[0], {
        event: "voice_ai_gemini_usage",
        model: "gemini-2.5-flash-lite",
        attempt: 3,
        promptTokenCount: 1000,
        cachedContentTokenCount: 0,
        candidatesTokenCount: 50,
        totalTokenCount: 1050,
        cacheObservedHit: false,
        cachedInputRatio: 0,
      });
    });
  }
);

Deno.test(
  "observes usageMetadata on each returned provider attempt including empty text and malformed JSON before retry",
  async (): Promise<void> => {
    resetParseVoiceTestState();
    installSuccessfulQuotaLifecycle();
    // Attempt 0 returns empty text (throws after response returned and metadata observed)
    // Attempt 1 returns malformed JSON (throws after response returned and metadata observed)
    // Attempt 2 succeeds with valid JSON
    const results: readonly ProviderResult[] = [
      {
        kind: "success",
        text: "",
        usageMetadata: { promptTokenCount: 800, cachedContentTokenCount: 400 },
      },
      {
        kind: "success",
        text: "{ malformed json",
        usageMetadata: { promptTokenCount: 800, cachedContentTokenCount: 800 },
      },
      {
        kind: "success",
        text: SUCCESS_MODEL_TEXT,
        usageMetadata: { promptTokenCount: 800, cachedContentTokenCount: 800 },
      },
    ];
    setProviderResults(results);

    await withCapturedTelemetry(async (events) => {
      const response = await handler(createVoiceRequest());
      assert.equal(response.status, 200);
      assert.equal(getProviderInvocations().length, 3);
      assertSuccessfulQuotaLifecycle();

      assert.equal(events.length, 3);

      assert.deepEqual(events[0], {
        event: "voice_ai_gemini_usage",
        model: "gemini-2.5-flash-lite",
        attempt: 0,
        promptTokenCount: 800,
        cachedContentTokenCount: 400,
        candidatesTokenCount: null,
        totalTokenCount: null,
        cacheObservedHit: true,
        cachedInputRatio: 0.5,
      });

      assert.deepEqual(events[1], {
        event: "voice_ai_gemini_usage",
        model: "gemini-2.5-flash-lite",
        attempt: 1,
        promptTokenCount: 800,
        cachedContentTokenCount: 800,
        candidatesTokenCount: null,
        totalTokenCount: null,
        cacheObservedHit: true,
        cachedInputRatio: 1,
      });

      assert.deepEqual(events[2], {
        event: "voice_ai_gemini_usage",
        model: "gemini-2.5-flash-lite",
        attempt: 2,
        promptTokenCount: 800,
        cachedContentTokenCount: 800,
        candidatesTokenCount: null,
        totalTokenCount: null,
        cacheObservedHit: true,
        cachedInputRatio: 1,
      });
    });
  }
);

Deno.test(
  "returned-response usageMetadata getter throw does not trigger retry and succeeds with 1 call",
  async (): Promise<void> => {
    resetParseVoiceTestState();
    installSuccessfulQuotaLifecycle();

    setProviderResults([
      {
        kind: "success",
        text: SUCCESS_MODEL_TEXT,
        get usageMetadata(): never {
          throw new Error("Simulated response.usageMetadata getter crash!");
        },
      },
    ]);

    await withCapturedTelemetry(async (events) => {
      const response = await handler(createVoiceRequest());
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), SUCCESS_RESPONSE);

      // Exactly 1 provider invocation was made: getter throw did NOT enter retry catch
      assert.equal(getProviderInvocations().length, 1);
      assertSuccessfulQuotaLifecycle();

      // Telemetry boundary caught the throw cleanly and logged an empty/null event
      assert.equal(events.length, 1);
      assert.deepEqual(events[0], {
        event: "voice_ai_gemini_usage",
        model: "gemini-2.5-flash-lite",
        attempt: 0,
        promptTokenCount: null,
        cachedContentTokenCount: null,
        candidatesTokenCount: null,
        totalTokenCount: null,
        cacheObservedHit: null,
        cachedInputRatio: null,
      });
    });
  }
);

Deno.test(
  "telemetry sink failure (console.info throwing) does not throw or trigger provider retry",
  async (): Promise<void> => {
    resetParseVoiceTestState();
    installSuccessfulQuotaLifecycle();

    queueProviderSuccess({
      promptTokenCount: 500,
      cachedContentTokenCount: 250,
    });

    let sinkInvocations = 0;
    const originalConsoleInfo = console.info;
    console.info = (): never => {
      sinkInvocations++;
      throw new Error("Simulated console.info failure");
    };

    try {
      const response = await handler(createVoiceRequest());
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), SUCCESS_RESPONSE);
      assert.equal(getProviderInvocations().length, 1);
      assert.equal(sinkInvocations, 1);
      assertSuccessfulQuotaLifecycle();
    } finally {
      console.info = originalConsoleInfo;
    }
  }
);

Deno.test(
  "proves observation happens BEFORE text getter by asserting telemetry is recorded even when text getter throws",
  async (): Promise<void> => {
    resetParseVoiceTestState();
    installSuccessfulQuotaLifecycle();

    let attempt0TextAccessed = false;
    let attempt0TelemetryLoggedBeforeAttempt0Text = false;

    await withCapturedTelemetry(async (events) => {
      setProviderResults([
        {
          kind: "success",
          get text(): never {
            attempt0TextAccessed = true;
            if (events.length === 1 && events[0].attempt === 0) {
              attempt0TelemetryLoggedBeforeAttempt0Text = true;
            }
            throw new Error(
              "Empty model response — Gemini returned no text. Retrying."
            );
          },
          usageMetadata: {
            promptTokenCount: 500,
            cachedContentTokenCount: 200,
          },
        },
        {
          kind: "success",
          text: SUCCESS_MODEL_TEXT,
          usageMetadata: {
            promptTokenCount: 500,
            cachedContentTokenCount: 200,
          },
        },
      ]);

      const response = await handler(createVoiceRequest());
      assert.equal(response.status, 200);
      assert.equal(getProviderInvocations().length, 2);
      assert.equal(events.length, 2);
      assert.equal(attempt0TextAccessed, true);
      assert.equal(attempt0TelemetryLoggedBeforeAttempt0Text, true);
      assert.equal(events[0].attempt, 0);
      assert.equal(events[1].attempt, 1);
    });
  }
);

Deno.test(
  "rejects empty audio payload with 400 before provider or reservation (zero-byte check regression)",
  async (): Promise<void> => {
    await assertRequestRejectedBeforeProvider(
      { audioFile: createEmptyAudioFile() },
      400
    );
  }
);

Deno.test(
  "rejects missing audio payload with 400 before provider or reservation",
  async (): Promise<void> => {
    await assertRequestRejectedBeforeProvider({ audioFile: null }, 400);
  }
);

Deno.test(
  "returns 429 quota refusal without provider start or telemetry when capacity refused",
  async (): Promise<void> => {
    resetParseVoiceTestState();
    queueProviderSuccess();

    setRpcResponder(async (name, params): Promise<RpcResult> => {
      if (name === "voice_ai_reserve_work") {
        assert.deepEqual(params, EXPECTED_RESERVE_PARAMS);
        return {
          data: [
            createReservationRow({
              accepted: false,
              decision_code: "daily_limit",
              remaining: 0,
              available_at: RESET_AT,
              reservation_expires_at: null,
            }),
          ],
          error: null,
        };
      }
      throw new Error(`Unexpected RPC: ${name}`);
    });

    await withCapturedTelemetry(async (events) => {
      const response = await handler(createVoiceRequest());
      assert.equal(response.status, 429);
      const json = await response.json();
      assert.equal(json.error, "Voice request unavailable");
      assert.equal(json.reason, "daily_limit");
      assert.equal(json.availability.remaining, 0);
      assert.equal(json.availability.reason, "daily_limit");
      assert.equal(json.availability.availableAt, RESET_AT);
      assert.equal(getProviderInvocations().length, 0);
      assert.equal(events.length, 0);
      assert.deepEqual(
        getRpcCalls().map((call) => call.name),
        ["voice_ai_reserve_work"]
      );
    });
  }
);

Deno.test(
  "returns 429 refusal on reservation replay without provider start, telemetry, or completion",
  async (): Promise<void> => {
    resetParseVoiceTestState();
    queueProviderSuccess();

    setRpcResponder(async (name, params): Promise<RpcResult> => {
      if (name === "voice_ai_reserve_work") {
        assert.deepEqual(params, EXPECTED_RESERVE_PARAMS);
        return {
          data: [
            createReservationRow({
              accepted: false,
              decision_code: "already_processed_result_unavailable",
              is_replay: true,
              reservation_expires_at: null,
            }),
          ],
          error: null,
        };
      }
      throw new Error(`Unexpected RPC: ${name}`);
    });

    await withCapturedTelemetry(async (events) => {
      const response = await handler(createVoiceRequest());
      assert.equal(response.status, 429);
      const json = await response.json();
      assert.equal(json.error, "Voice request unavailable");
      assert.equal(json.reason, "already_processed_result_unavailable");
      assert.equal(json.availability.remaining, 4);
      assert.equal(json.availability.policyVersion, "free-launch-v1");
      assert.equal(getProviderInvocations().length, 0);
      assert.equal(events.length, 0);
      assert.deepEqual(
        getRpcCalls().map((call) => call.name),
        ["voice_ai_reserve_work"]
      );
    });
  }
);

Deno.test(
  "returns 429 refusal on provider-start replay without Gemini invocation, telemetry, or completion",
  async (): Promise<void> => {
    resetParseVoiceTestState();
    queueProviderSuccess();

    setRpcResponder(async (name, params): Promise<RpcResult> => {
      switch (name) {
        case "voice_ai_reserve_work":
          assert.deepEqual(params, EXPECTED_RESERVE_PARAMS);
          return { data: [createReservationRow()], error: null };
        case "voice_ai_mark_provider_started":
          assert.deepEqual(params, EXPECTED_PROVIDER_START_PARAMS);
          return {
            data: [
              createProviderStartRow({
                started: false,
                decision_code: "already_processed_result_unavailable",
                is_replay: true,
              }),
            ],
            error: null,
          };
        default:
          throw new Error(`Unexpected Voice safeguard RPC: ${name}`);
      }
    });

    await withCapturedTelemetry(async (events) => {
      const response = await handler(createVoiceRequest());
      assert.equal(response.status, 429);
      const json = await response.json();
      assert.equal(json.error, "Voice request unavailable");
      assert.equal(json.reason, "already_processed_result_unavailable");
      assert.equal(json.availability.remaining, 4);
      assert.equal(json.availability.policyVersion, "free-launch-v1");
      assert.equal(getProviderInvocations().length, 0);
      assert.equal(events.length, 0);
      assert.deepEqual(
        getRpcCalls().map((call) => call.name),
        ["voice_ai_reserve_work", "voice_ai_mark_provider_started"]
      );
      assert.deepEqual(getRpcCalls()[0].params, EXPECTED_RESERVE_PARAMS);
      assert.deepEqual(getRpcCalls()[1].params, EXPECTED_PROVIDER_START_PARAMS);
    });
  }
);

Deno.test(
  "correctly detects and forwards recognized MIME types for valid WAV, MP3, and M4A audio inputs",
  async (): Promise<void> => {
    for (const fixture of RECOGNIZED_AUDIO_FIXTURES) {
      resetParseVoiceTestState();
      queueProviderSuccess();
      installSuccessfulQuotaLifecycle();

      const audioFile = fixture.createFile();
      const response = await handler(createVoiceRequest({ audioFile }));
      assert.equal(response.status, 200);

      const invocations = getProviderInvocations();
      assert.equal(invocations.length, 1);
      const invocation = invocations[0] as {
        readonly contents: ReadonlyArray<{
          readonly inlineData?: { readonly mimeType: string };
        }>;
      };
      assert.equal(
        invocation.contents[0].inlineData?.mimeType,
        fixture.expectedMime
      );
    }
  }
);

Deno.test(
  "rejects a missing requestKey before provider invocation",
  async (): Promise<void> => {
    await assertRequestRejectedBeforeProvider({ requestKey: null }, 400);
  }
);

Deno.test(
  "rejects a missing callerTimeZone before provider invocation",
  async (): Promise<void> => {
    await assertRequestRejectedBeforeProvider({ callerTimeZone: null }, 400);
  }
);

Deno.test(
  "rejects an overlong requestKey before provider invocation",
  async (): Promise<void> => {
    await assertRequestRejectedBeforeProvider(
      { requestKey: "r".repeat(161) },
      400
    );
  }
);

Deno.test(
  "rejects an overlong callerTimeZone before provider invocation",
  async (): Promise<void> => {
    await assertRequestRejectedBeforeProvider(
      { callerTimeZone: "z".repeat(129) },
      400
    );
  }
);

Deno.test(
  "rejects an unknown IANA callerTimeZone before provider invocation",
  async (): Promise<void> => {
    await assertRequestRejectedBeforeProvider(
      { callerTimeZone: "Mars/Olympus" },
      400
    );
  }
);
