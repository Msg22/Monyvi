/**
 * #395 T012 — real parse-voice handler v2 text-context admission (tests only).
 * The network, quota RPCs and Gemini provider are replaced only by the existing
 * Edge test fixtures. Neither the handler nor its context/prompt builder is mocked.
 */
import assert from "node:assert/strict";
import {
  makeReviewRequestContext,
  makeVoiceV1Response,
  makeVoiceV2Response,
} from "./test-fixtures/account-review.ts";
import {
  getAuthTokens,
  getCapturedServeHandler,
  getProviderInvocations,
  getRpcCalls,
  resetParseVoiceTestState,
  setProviderResults,
  setRpcResponder,
  type RpcResult,
} from "./test-fixtures/state.ts";

type ReviewContext = ReturnType<typeof makeReviewRequestContext>;
type ReviewAccount = ReviewContext["accounts"][number];

interface RequestOptions {
  readonly review?: ReviewContext | null;
  readonly categories?: string;
  readonly authorization?: string | null;
  readonly accountsJson?: string;
}

const REQUEST_KEY = "voice-request-1";
const USER_TOKEN = "Bearer test-token";
const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const MAX_TEXT_BYTES = 128 * 1024;
const MAX_ESTIMATED_TEXT_TOKENS = 32_000;
const ESTIMATOR_BYTES_PER_TOKEN = 3;
const PRIVATE_SYNTHETIC_MARKER = "SYNTHETIC_PRIVATE_ACCOUNT";

for (const [name, value] of [
  ["SUPABASE_URL", "https://supabase.test.invalid"],
  ["SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key"],
  ["GEMINI_API_KEY", "test-gemini-key"],
  ["VOICE_AI_DAILY_LIMIT", "5"],
  ["VOICE_AI_BURST_LIMIT", "2"],
  ["VOICE_AI_BURST_WINDOW_SECONDS", "60"],
  ["VOICE_AI_RESERVATION_LEASE_SECONDS", "120"],
  ["VOICE_AI_POLICY_VERSION", "free-launch-v1"],
]) {
  Deno.env.set(name, value);
}

resetParseVoiceTestState();
await import("./index.ts");
const handler = getCapturedServeHandler();

function makeRequest(options: RequestOptions = {}): Request {
  const data = new FormData();
  const sample = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45,
  ]);
  data.set("audio", new File([sample], "sample.wav", { type: "audio/wav" }));
  data.set("requestKey", REQUEST_KEY);
  data.set("callerTimeZone", "Africa/Cairo");
  data.set("callerLocalDate", "2026-10-06");
  if (options.categories !== undefined)
    data.set("categories", options.categories);
  if (options.review !== null && options.review !== undefined) {
    data.set("reviewContractVersion", options.review.reviewContractVersion);
    data.set("preferredCurrency", options.review.preferredCurrency);
    data.set(
      "accounts",
      options.accountsJson ?? JSON.stringify(options.review.accounts)
    );
  }
  const headers = new Headers();
  if (options.authorization !== null) {
    headers.set("authorization", options.authorization ?? USER_TOKEN);
  }
  return new Request("https://example.test/functions/v1/parse-voice", {
    method: "POST",
    headers,
    body: data,
  });
}

function prepareAllowedQuota(): void {
  setRpcResponder((name): Promise<RpcResult> => {
    const ordinary = {
      request_id: REQUEST_ID,
      server_now: "2026-10-07T14:00:00.000Z",
      time_zone: "Africa/Cairo",
      daily_limit: 5,
      remaining: 4,
      reset_at: "2026-10-07T21:00:00.000Z",
      available_at: null,
      burst_available_at: null,
      policy_version: "free-launch-v1",
    };
    if (name === "voice_ai_reserve_work") {
      return Promise.resolve({
        data: [
          {
            ...ordinary,
            accepted: true,
            decision_code: "accepted",
            is_replay: false,
            reservation_expires_at: "2026-10-07T14:02:00.000Z",
          },
        ],
        error: null,
      });
    }
    if (name === "voice_ai_mark_provider_started") {
      return Promise.resolve({
        data: [
          {
            ...ordinary,
            started: true,
            decision_code: "provider_started",
            is_replay: false,
          },
        ],
        error: null,
      });
    }
    if (name === "voice_ai_complete_work") {
      return Promise.resolve({ data: true, error: null });
    }
    return Promise.reject(new Error("Unexpected synthetic Voice RPC"));
  });
}

function prepareProviderRun(v2 = true): void {
  resetParseVoiceTestState();
  prepareAllowedQuota();
  setProviderResults([
    {
      kind: "success",
      text: JSON.stringify(
        v2 ? makeVoiceV2Response(REQUEST_KEY) : makeVoiceV1Response()
      ),
    },
  ]);
}

function assertNoChargeOrProvider(): void {
  assert.deepEqual(
    getRpcCalls().map((call) => call.name),
    []
  );
  assert.equal(getProviderInvocations().length, 0);
}

function assertOneCompleteCall(): void {
  assert.deepEqual(
    getRpcCalls().map((call) => call.name),
    [
      "voice_ai_reserve_work",
      "voice_ai_mark_provider_started",
      "voice_ai_complete_work",
    ]
  );
  assert.equal(getProviderInvocations().length, 1);
}

async function assertBudgetRefusal(options: RequestOptions): Promise<void> {
  prepareProviderRun();
  const response = await handler(makeRequest(options));
  assert.equal(response.status, 413);
  const body: unknown = await response.json();
  if (!isRecord(body) || typeof body.error !== "string") {
    throw new Error("Expected actionable 413 JSON error response");
  }
  assert.equal(body.code, 413);
  assert.match(body.error, /too (large|long)|size|limit|exceed/i);
  assert.match(body.error, /manual|shorten|reduce|try again/i);
  assert.doesNotMatch(body.error, /SYNTHETIC_PRIVATE_ACCOUNT/);
  assert.deepEqual(getAuthTokens(), ["test-token"]);
  assertNoChargeOrProvider();
}

function withFirstAccount(
  update: (account: ReviewAccount) => ReviewAccount
): ReviewContext {
  const base = makeReviewRequestContext();
  return {
    ...base,
    accounts: base.accounts.map((account, index) =>
      index === 0 ? update(account) : account
    ),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface RenderedTextParts {
  readonly instruction: string;
  readonly userPrompt: string;
  readonly responseSchema: string;
}

function providerTextParts(value: unknown): RenderedTextParts {
  if (
    !isRecord(value) ||
    !isRecord(value.config) ||
    !Array.isArray(value.contents)
  ) {
    throw new Error("Expected captured Gemini v2 request");
  }
  const second = value.contents[1];
  if (
    !isRecord(second) ||
    typeof second.text !== "string" ||
    typeof value.config.systemInstruction !== "string" ||
    value.config.responseJsonSchema === undefined
  ) {
    throw new Error("Expected complete Gemini text/schema framing");
  }
  const schema = JSON.stringify(value.config.responseJsonSchema);
  if (typeof schema !== "string")
    throw new Error("Missing actual v2 response schema");
  return {
    instruction: value.config.systemInstruction,
    userPrompt: second.text,
    responseSchema: schema,
  };
}

function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

function conservativeTokenEstimate(parts: RenderedTextParts): number {
  return [parts.instruction, parts.userPrompt, parts.responseSchema].reduce(
    (tokens, text) =>
      tokens + Math.ceil(utf8Bytes(text) / ESTIMATOR_BYTES_PER_TOKEN),
    0
  );
}

Deno.test(
  "T012 budget: ordinary grounded Voice v2 stays one provider/quota cycle",
  async () => {
    prepareProviderRun();
    const response = await handler(
      makeRequest({
        review: makeReviewRequestContext(),
        categories: "food\ntransport\ncoffee_tea",
      })
    );
    assert.equal(response.status, 200);
    const body: unknown = await response.json();
    assert.ok(isRecord(body));
    assert.equal(body.reviewContractVersion, "account-review/v2");
    assertOneCompleteCall();
    const parts = providerTextParts(getProviderInvocations()[0]);
    assert.match(parts.instruction, /QNB salary/);
    assert.match(parts.instruction, /food\r?\ntransport\r?\ncoffee_tea/);
    assert.match(parts.instruction, /original Voice evidence sourceRef/);
    assert.match(parts.responseSchema, /suggestedAccounts/);
    assert.ok(conservativeTokenEstimate(parts) < MAX_ESTIMATED_TEXT_TOKENS);
  }
);

Deno.test(
  "T012 budget: many distinct short aliases are not a semantic count cap",
  async () => {
    const context = withFirstAccount((account) => ({
      ...account,
      senderNames: Array.from({ length: 300 }, (_, i) => `Sender-${i}`),
    }));
    prepareProviderRun();
    const response = await handler(makeRequest({ review: context }));
    assert.equal(response.status, 200);
    assertOneCompleteCall();
    const parts = providerTextParts(getProviderInvocations()[0]);
    assert.match(parts.instruction, /Sender-299/);
  }
);

Deno.test(
  "T012 budget: oversized valid account nickname refuses before reserve",
  async () => {
    const review = withFirstAccount((account) => ({
      ...account,
      name: PRIVATE_SYNTHETIC_MARKER + "N".repeat(120_000),
    }));
    await assertBudgetRefusal({ review });
  }
);

Deno.test(
  "T012 budget: oversized valid sender alias refuses before reserve",
  async () => {
    const review = withFirstAccount((account) => ({
      ...account,
      senderNames: [PRIVATE_SYNTHETIC_MARKER + "A".repeat(110_000)],
    }));
    await assertBudgetRefusal({ review });
  }
);

Deno.test(
  "T012 budget: oversized valid provider display name refuses before reserve",
  async () => {
    const review = withFirstAccount((account) => ({
      ...account,
      providerDisplayName: PRIVATE_SYNTHETIC_MARKER + "P".repeat(112_000),
    }));
    await assertBudgetRefusal({ review });
  }
);

Deno.test(
  "T012 budget: huge categories alone refuse before reserve",
  async () => {
    await assertBudgetRefusal({
      review: makeReviewRequestContext(),
      categories: "C".repeat(125_000),
    });
  }
);

Deno.test(
  "T012 budget: Arabic account text counted as UTF-8, not JS length",
  async () => {
    const name = "حساب".repeat(16_000);
    assert.ok(
      utf8Bytes(name) > MAX_ESTIMATED_TEXT_TOKENS * ESTIMATOR_BYTES_PER_TOKEN
    );
    const review = withFirstAccount((account) => ({ ...account, name }));
    await assertBudgetRefusal({ review });
  }
);

Deno.test(
  "T012 budget: emoji category text counted as UTF-8, not UTF-16",
  async () => {
    const categories = "💵".repeat(27_000);
    assert.ok(
      utf8Bytes(categories) >
        MAX_ESTIMATED_TEXT_TOKENS * ESTIMATOR_BYTES_PER_TOKEN
    );
    assert.ok(
      categories.length < MAX_ESTIMATED_TEXT_TOKENS * ESTIMATOR_BYTES_PER_TOKEN
    );
    await assertBudgetRefusal({
      review: makeReviewRequestContext(),
      categories,
    });
  }
);

Deno.test(
  "T012 budget: mixed English/Arabic aliases and categories count together",
  async () => {
    const review = withFirstAccount((account) => ({
      ...account,
      senderNames: ["Bank رسالة ".repeat(3_000)],
    }));
    const categories = "Taxi مواصلات ".repeat(2_500);
    prepareProviderRun();
    assert.equal((await handler(makeRequest({ review }))).status, 200);
    assertOneCompleteCall();
    prepareProviderRun();
    assert.equal(
      (
        await handler(
          makeRequest({ review: makeReviewRequestContext(), categories })
        )
      ).status,
      200
    );
    assertOneCompleteCall();
    await assertBudgetRefusal({ review, categories });
  }
);

Deno.test(
  "T012 budget: combined categories, aliases and account names share one limit",
  async () => {
    const review = withFirstAccount((account) => ({
      ...account,
      name: PRIVATE_SYNTHETIC_MARKER + "N".repeat(23_000),
      senderNames: ["S".repeat(28_000)],
    }));
    await assertBudgetRefusal({ review, categories: "K".repeat(57_000) });
  }
);

Deno.test(
  "T012 budget: generated response schema and user text are measured once",
  async () => {
    const marker = "CATEGORY_BUDGET_PROBE";
    prepareProviderRun();
    const reference = await handler(
      makeRequest({ review: makeReviewRequestContext(), categories: marker })
    );
    assert.equal(reference.status, 200);
    const parts = providerTextParts(getProviderInvocations()[0]);
    assert.equal(parts.instruction.split(marker).length, 2);
    const fixedSystemBytes = utf8Bytes(parts.instruction) - utf8Bytes(marker);
    const otherTokens =
      Math.ceil(utf8Bytes(parts.userPrompt) / 3) +
      Math.ceil(utf8Bytes(parts.responseSchema) / 3);
    const budgetedCategoryLength =
      (MAX_ESTIMATED_TEXT_TOKENS - otherTokens) * 3 - fixedSystemBytes;
    assert.ok(budgetedCategoryLength > 3_000);
    const under = "X".repeat(budgetedCategoryLength - 512);
    const over = "Y".repeat(budgetedCategoryLength + 512);
    const totalOverBytes =
      fixedSystemBytes +
      utf8Bytes(over) +
      utf8Bytes(parts.userPrompt) +
      utf8Bytes(parts.responseSchema);
    assert.ok(
      totalOverBytes < MAX_TEXT_BYTES,
      "token budget must bind before 128KiB limit"
    );
    prepareProviderRun();
    const allowed = await handler(
      makeRequest({ review: makeReviewRequestContext(), categories: under })
    );
    assert.equal(allowed.status, 200);
    assertOneCompleteCall();
    const actualAllowed = providerTextParts(getProviderInvocations()[0]);
    assert.ok(
      conservativeTokenEstimate(actualAllowed) <= MAX_ESTIMATED_TEXT_TOKENS
    );
    await assertBudgetRefusal({
      review: makeReviewRequestContext(),
      categories: over,
    });
  }
);

Deno.test(
  "T012 budget: unauthenticated oversized context remains 401, no provider",
  async () => {
    prepareProviderRun();
    const huge = withFirstAccount((account) => ({
      ...account,
      name: "N".repeat(130_000),
    }));
    const response = await handler(
      makeRequest({ review: huge, authorization: null })
    );
    assert.equal(response.status, 401);
    assert.deepEqual(getAuthTokens(), []);
    assertNoChargeOrProvider();
  }
);

Deno.test(
  "T012 budget: invalid v2 private fields still fail structural 400",
  async () => {
    prepareProviderRun();
    const base = makeReviewRequestContext();
    const accountsJson = JSON.stringify(
      base.accounts.map((account) => ({ ...account, isDefault: true }))
    );
    const response = await handler(makeRequest({ review: base, accountsJson }));
    assert.equal(response.status, 400);
    assertNoChargeOrProvider();
  }
);

Deno.test(
  "T012 budget: legacy no-opt-in large categories retains prior provider behavior",
  async () => {
    prepareProviderRun(false);
    const response = await handler(
      makeRequest({ review: null, categories: "L".repeat(130_000) })
    );
    assert.equal(response.status, 200);
    assertOneCompleteCall();
    const body: unknown = await response.json();
    assert.ok(isRecord(body));
    assert.equal(body.reviewContractVersion, undefined);
  }
);
