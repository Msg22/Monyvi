import assert from "node:assert/strict";
import {
  makeReviewRequestContext,
  makeVoiceV2Response,
} from "../../../packages/logic/src/account-review/__tests__/fixtures.ts";

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
  readonly review?: {
    readonly reviewContractVersion: string;
    readonly preferredCurrency: string;
    readonly accounts: string;
  };
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
  if (options.review !== undefined) {
    formData.set("reviewContractVersion", options.review.reviewContractVersion);
    formData.set("preferredCurrency", options.review.preferredCurrency);
    formData.set("accounts", options.review.accounts);
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

Deno.test(
  "safeguard ordering: quota refusal rejects before prompt/audio encoding or provider invocation",
  async (): Promise<void> => {
    resetParseVoiceTestState();
    queueProviderSuccess();

    let encodingAttempted = false;
    const originalBtoa = globalThis.btoa;
    globalThis.btoa = (data: string): string => {
      encodingAttempted = true;
      return originalBtoa(data);
    };

    try {
      setRpcResponder(async (name, params): Promise<RpcResult> => {
        if (name === "voice_ai_reserve_work") {
          return {
            data: [
              {
                request_id: VOICE_REQUEST_ID,
                accepted: false,
                decision_code: "daily_limit",
                is_replay: false,
                server_now: SERVER_NOW,
                time_zone: VALID_TIME_ZONE,
                daily_limit: 5,
                remaining: 0,
                reset_at: RESET_AT,
                available_at: RESET_AT,
                burst_available_at: null,
                reservation_expires_at: null,
                policy_version: "free-launch-v1",
              },
            ],
            error: null,
          };
        }
        throw new Error(`Unexpected RPC call during quota refusal: ${name}`);
      });

      const response = await handler(createVoiceRequest());

      assert.equal(response.status, 429);
      assert.equal(getProviderInvocations().length, 0);
      assert.equal(encodingAttempted, false);
      assert.deepEqual(
        getRpcCalls().map((c) => c.name),
        ["voice_ai_reserve_work"]
      );
    } finally {
      globalThis.btoa = originalBtoa;
    }
  }
);

Deno.test(
  "safeguard ordering: accepted reservation releases work when local prompt/encoding preparation fails",
  async (): Promise<void> => {
    resetParseVoiceTestState();
    queueProviderSuccess();

    const originalBtoa = globalThis.btoa;
    globalThis.btoa = (): string => {
      throw new Error("Injected base64 encoding preparation failure");
    };

    try {
      setRpcResponder(async (name, params): Promise<RpcResult> => {
        switch (name) {
          case "voice_ai_reserve_work":
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

          case "voice_ai_release_work":
            assert.deepEqual(params, {
              p_user_id: "voice-user",
              p_request_id: VOICE_REQUEST_ID,
              p_decision_code: "preparation_failed",
            });
            return { data: true, error: null };

          default:
            throw new Error(`Unexpected RPC during prep failure: ${name}`);
        }
      });

      const response = await handler(createVoiceRequest());

      assert.equal(response.status, 500);
      assert.equal(getProviderInvocations().length, 0);
      assert.deepEqual(
        getRpcCalls().map((c) => c.name),
        ["voice_ai_reserve_work", "voice_ai_release_work"]
      );
    } finally {
      globalThis.btoa = originalBtoa;
    }
  }
);

Deno.test(
  "safeguard ordering: ambiguous mark-start RPC failure never releases work",
  async (): Promise<void> => {
    resetParseVoiceTestState();
    queueProviderSuccess();

    setRpcResponder(async (name, params): Promise<RpcResult> => {
      switch (name) {
        case "voice_ai_reserve_work":
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
          return {
            data: null,
            error: { message: "Network timeout communicating with database" },
          };

        case "voice_ai_release_work":
          throw new Error(
            "CRITICAL SAFETY VIOLATION: ambiguous mark-start failure must NEVER release work"
          );

        default:
          throw new Error(
            `Unexpected RPC during ambiguous mark-start: ${name}`
          );
      }
    });

    const response = await handler(createVoiceRequest());

    assert.equal(response.status, 503);
    assert.equal(getProviderInvocations().length, 0);
    assert.deepEqual(
      getRpcCalls().map((c) => c.name),
      ["voice_ai_reserve_work", "voice_ai_mark_provider_started"]
    );
  }
);

Deno.test(
  "safeguard ordering: prep failure handles release returning false gracefully without throwing",
  async (): Promise<void> => {
    resetParseVoiceTestState();
    queueProviderSuccess();

    const originalBtoa = globalThis.btoa;
    globalThis.btoa = (): string => {
      throw new Error("Injected base64 encoding preparation failure");
    };

    try {
      setRpcResponder(async (name, params): Promise<RpcResult> => {
        switch (name) {
          case "voice_ai_reserve_work":
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

          case "voice_ai_release_work":
            assert.deepEqual(params, {
              p_user_id: "voice-user",
              p_request_id: VOICE_REQUEST_ID,
              p_decision_code: "preparation_failed",
            });
            // Return false to simulate release returning false
            return { data: false, error: null };

          default:
            throw new Error(`Unexpected RPC during prep failure: ${name}`);
        }
      });

      const response = await handler(createVoiceRequest());

      assert.equal(response.status, 500);
      assert.equal(getProviderInvocations().length, 0);
      assert.deepEqual(
        getRpcCalls().map((c) => c.name),
        ["voice_ai_reserve_work", "voice_ai_release_work"]
      );
    } finally {
      globalThis.btoa = originalBtoa;
    }
  }
);

Deno.test(
  "safeguard ordering: prep failure handles release RPC error gracefully and returns safe 500",
  async (): Promise<void> => {
    resetParseVoiceTestState();
    queueProviderSuccess();

    const originalBtoa = globalThis.btoa;
    globalThis.btoa = (): string => {
      throw new Error("Injected base64 encoding preparation failure");
    };

    try {
      setRpcResponder(async (name, params): Promise<RpcResult> => {
        switch (name) {
          case "voice_ai_reserve_work":
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

          case "voice_ai_release_work":
            assert.deepEqual(params, {
              p_user_id: "voice-user",
              p_request_id: VOICE_REQUEST_ID,
              p_decision_code: "preparation_failed",
            });
            // Simulate release throwing an RPC error
            throw new Error("Database connection dropped during release");

          default:
            throw new Error(`Unexpected RPC during prep failure: ${name}`);
        }
      });

      const response = await handler(createVoiceRequest());

      assert.equal(response.status, 500);
      assert.equal(getProviderInvocations().length, 0);
      assert.deepEqual(
        getRpcCalls().map((c) => c.name),
        ["voice_ai_reserve_work", "voice_ai_release_work"]
      );
    } finally {
      globalThis.btoa = originalBtoa;
    }
  }
);

Deno.test(
  "pre-reserve configuration: missing GEMINI_API_KEY returns 500 without reserving quota or invoking provider",
  async (): Promise<void> => {
    resetParseVoiceTestState();
    queueProviderSuccess();

    const originalApiKey = Deno.env.get("GEMINI_API_KEY");
    Deno.env.delete("GEMINI_API_KEY");

    try {
      const response = await handler(createVoiceRequest());

      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), {
        error: "GEMINI_API_KEY not configured",
        code: 500,
      });
      assert.equal(getRpcCalls().length, 0);
      assert.equal(getProviderInvocations().length, 0);
    } finally {
      if (originalApiKey !== undefined) {
        Deno.env.set("GEMINI_API_KEY", originalApiKey);
      }
    }
  }
);

Deno.test(
  "T012 rejects private v2 review context before quota admission or provider call",
  async (): Promise<void> => {
    resetParseVoiceTestState();
    queueProviderSuccess();
    const context = makeReviewRequestContext();
    const response = await handler(createVoiceRequest({
      review: {
        reviewContractVersion: "account-review/v2",
        preferredCurrency: context.preferredCurrency,
        accounts: JSON.stringify(context.accounts.map((account) => ({
          ...account, isDefault: true,
        }))),
      },
    }));
    assertRejectedBeforeProvider(response, 400);
  }
);

Deno.test(
  "T012 accepted v2 keeps the existing one-call quota lifecycle and full response",
  async (): Promise<void> => {
    resetParseVoiceTestState();
    installSuccessfulQuotaLifecycle();
    const context = makeReviewRequestContext();
    const raw = makeVoiceV2Response();
    const transactions = raw.transactions.map((row) => ({
      ...row,
      accountEvidence: {
        ...row.accountEvidence,
        evidenceSpans: row.accountEvidence.evidenceSpans.map((span) => ({
          ...span, sourceRef: VALID_REQUEST_KEY,
        })),
      },
      currencyEvidence: {
        ...row.currencyEvidence,
        evidenceSpans: row.currencyEvidence.evidenceSpans.map((span) => ({
          ...span, sourceRef: VALID_REQUEST_KEY,
        })),
      },
    }));
    setProviderResults([{ kind: "success", text: JSON.stringify({
      ...raw, transactions,
    }) }]);
    const response = await handler(createVoiceRequest({
      review: {
        reviewContractVersion: "account-review/v2",
        preferredCurrency: context.preferredCurrency,
        accounts: JSON.stringify(context.accounts),
      },
    }));
    assert.equal(response.status, 200);
    const result: unknown = await response.json();
    assert.equal(typeof result, "object");
    assert.ok(result !== null && "reviewContractVersion" in result);
    assert.equal(result.reviewContractVersion, "account-review/v2");
    assert.equal(getProviderInvocations().length, 1);
    assertSuccessfulQuotaLifecycle();
    const called = JSON.stringify(getProviderInvocations()[0]);
    assert.match(called, /"suggestedAccounts"/);
    assert.doesNotMatch(called, /openingBalanceMinorUnits|accountNumber|cardNumber|isDefault/);
  }
);
