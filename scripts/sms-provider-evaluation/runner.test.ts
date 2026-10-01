import assert from "node:assert/strict";
import test from "node:test";

import type { ParseSmsProviderTransaction } from "../../supabase/functions/_shared/sms-ai/sms-ai-provider.ts";
import { buildSyntheticEvaluationCorpus } from "./corpus.ts";
import {
  runSmsProviderEvaluation,
  validateEvaluationRunOptions,
} from "./runner.ts";
import {
  DEFAULT_EVALUATION_BATCH_SIZE,
  STAGING_PARSE_SMS_ENDPOINT,
  STAGING_PROJECT_REF,
  type EvaluationReport,
  type EvaluationRunOptions,
} from "./types.ts";

const ANCHOR_MS = Date.parse("2026-10-01T17:00:00.000Z");

interface SentMessage {
  readonly id: string;
  readonly body: string;
  readonly sender: string;
  readonly date: string;
  readonly smsFingerprint: string;
}

function options(
  overrides: Partial<EvaluationRunOptions> = {}
): EvaluationRunOptions {
  return {
    mode: "dry-run",
    runId: "run-live-red",
    anchorMs: ANCHOR_MS,
    maxCases: 20,
    maxRequests: 4,
    ...overrides,
  };
}

function validFinalResponse(
  overrides: Readonly<Record<string, unknown>> = {}
): Response {
  return new Response(
    JSON.stringify({
      transactions: [],
      completionStatus: "complete",
      negativeFingerprints: [],
      terminalFingerprints: [],
      unresolvedFingerprints: [],
      ...overrides,
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    }
  );
}

function parsedTransaction(messageId: string): ParseSmsProviderTransaction {
  return {
    messageId,
    amount: 100,
    currency: "EGP",
    type: "EXPENSE",
    counterparty: "Merchant",
    date: "2026-10-01T16:00:00.000Z",
    categorySystemName: "shopping",
    confidenceScore: 0.8,
    isTrusted: true,
  };
}

function readSentMessages(init: RequestInit | undefined): readonly SentMessage[] {
  if (typeof init?.body !== "string") {
    throw new Error("request_body_not_string");
  }
  const parsed = JSON.parse(init.body) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("request_body_not_object");
  }
  const messages = (parsed as Record<string, unknown>).messages;
  if (!Array.isArray(messages)) throw new Error("request_messages_missing");
  return messages.map((message, index) => {
    if (
      typeof message !== "object" ||
      message === null ||
      Array.isArray(message)
    ) {
      throw new Error(`request_message_invalid_${index}`);
    }
    const record = message as Record<string, unknown>;
    for (const field of ["id", "body", "sender", "date", "smsFingerprint"]) {
      if (typeof record[field] !== "string") {
        throw new Error(`request_message_${field}_invalid_${index}`);
      }
    }
    return {
      id: record.id as string,
      body: record.body as string,
      sender: record.sender as string,
      date: record.date as string,
      smsFingerprint: record.smsFingerprint as string,
    };
  });
}

function expectRunOptionError(
  input: EvaluationRunOptions,
  expectedCode: RegExp
): void {
  assert.throws(
    () => validateEvaluationRunOptions(input),
    (error: unknown) => {
      assert.match(String(error), expectedCode);
      return true;
    }
  );
}

function assertAllCasesClassified(
  report: EvaluationReport,
  classification: string
): void {
  assert.ok(report.cases.length > 0);
  assert.ok(
    report.cases.every(
      ({ finalClassification }) => finalClassification === classification
    )
  );
}

void test("dry-run is the default network-safe path and performs zero fetches", async () => {
  let fetchCalls = 0;
  const report = await runSmsProviderEvaluation(options(), {
    fetch: (): Promise<Response> => {
      fetchCalls++;
      return Promise.reject(new Error("network must not run in dry mode"));
    },
    now: (): number => ANCHOR_MS,
  });

  assert.equal(fetchCalls, 0);
  assert.equal(report.mode, "dry-run");
  assert.ok(report.cases.length > 0);
});

void test("pins live execution to the one approved staging parse-sms HTTPS endpoint with specific guard failures", () => {
  assert.equal(STAGING_PROJECT_REF, "yulbcndyssdjicbpmlrk");
  assert.equal(
    STAGING_PARSE_SMS_ENDPOINT,
    "https://yulbcndyssdjicbpmlrk.supabase.co/functions/v1/parse-sms"
  );

  assert.doesNotThrow(() =>
    validateEvaluationRunOptions(
      options({
        mode: "live",
        projectRef: STAGING_PROJECT_REF,
        endpoint: STAGING_PARSE_SMS_ENDPOINT,
        accessToken: "staging-user-token",
      })
    )
  );

  for (const endpoint of [
    "http://yulbcndyssdjicbpmlrk.supabase.co/functions/v1/parse-sms",
    "https://user:pass@yulbcndyssdjicbpmlrk.supabase.co/functions/v1/parse-sms",
    "https://yulbcndyssdjicbpmlrk.supabase.co/functions/v1/parse-sms?x=1",
    "https://yulbcndyssdjicbpmlrk.supabase.co/functions/v1/parse-sms#fragment",
    "https://other-project.supabase.co/functions/v1/parse-sms",
    "https://yulbcndyssdjicbpmlrk.supabase.co/functions/v1/other",
    "https://yulbcndyssdjicbpmlrk.supabase.co.evil.example/functions/v1/parse-sms",
  ]) {
    expectRunOptionError(
      options({
        mode: "live",
        projectRef: STAGING_PROJECT_REF,
        endpoint,
        accessToken: "staging-user-token",
      }),
      /sms_provider_evaluation_invalid_staging_target/
    );
  }
});

void test("live mode requires finite positive integer bounds and a staging user token before fetch", async () => {
  for (const invalidLimit of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
    expectRunOptionError(
      options({
        mode: "live",
        maxCases: invalidLimit,
        maxRequests: 2,
        projectRef: STAGING_PROJECT_REF,
        endpoint: STAGING_PARSE_SMS_ENDPOINT,
        accessToken: "token",
      }),
      /sms_provider_evaluation_invalid_limit/
    );
    expectRunOptionError(
      options({
        mode: "live",
        maxCases: 10,
        maxRequests: invalidLimit,
        projectRef: STAGING_PROJECT_REF,
        endpoint: STAGING_PARSE_SMS_ENDPOINT,
        accessToken: "token",
      }),
      /sms_provider_evaluation_invalid_limit/
    );
  }

  expectRunOptionError(
    options({
      mode: "live",
      projectRef: STAGING_PROJECT_REF,
      endpoint: STAGING_PARSE_SMS_ENDPOINT,
      accessToken: undefined,
    }),
    /sms_provider_evaluation_access_token_required/
  );

  let fetchCalls = 0;
  await assert.rejects(
    () =>
      runSmsProviderEvaluation(
        options({
          mode: "live",
          maxCases: Number.NaN,
          projectRef: STAGING_PROJECT_REF,
          endpoint: STAGING_PARSE_SMS_ENDPOINT,
          accessToken: "token",
        }),
        {
          fetch: (): Promise<Response> => {
            fetchCalls++;
            return Promise.resolve(validFinalResponse());
          },
          now: (): number => ANCHOR_MS,
        }
      ),
    /sms_provider_evaluation_invalid_limit/
  );
  assert.equal(fetchCalls, 0);
});

void test("live calls are sequential five-message batches, bounded, non-retrying, and refuse redirects", async () => {
  let active = 0;
  let maxActive = 0;
  const requests: Array<{ readonly url: string; readonly init?: RequestInit }> = [];

  const report = await runSmsProviderEvaluation(
    options({
      mode: "live",
      maxCases: DEFAULT_EVALUATION_BATCH_SIZE * 2 + 1,
      maxRequests: 3,
      endpoint: STAGING_PARSE_SMS_ENDPOINT,
      projectRef: STAGING_PROJECT_REF,
      accessToken: "secret-user-token",
      publicApiKey: "public-anon-key",
    }),
    {
      fetch: async (input, init): Promise<Response> => {
        active++;
        maxActive = Math.max(maxActive, active);
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        requests.push({ url, init });
        await Promise.resolve();
        active--;
        return validFinalResponse();
      },
      now: (): number => ANCHOR_MS,
    }
  );

  assert.equal(maxActive, 1);
  assert.equal(requests.length, 3);
  assert.equal(report.mode, "live");

  for (const request of requests) {
    assert.equal(request.url, STAGING_PARSE_SMS_ENDPOINT);
    assert.equal(request.init?.redirect, "error");
    const headers = new Headers(request.init?.headers);
    assert.equal(headers.get("authorization"), "Bearer secret-user-token");
    assert.equal(headers.get("apikey"), "public-anon-key");
    const messages = readSentMessages(request.init);
    assert.ok(messages.length <= DEFAULT_EVALUATION_BATCH_SIZE);
    if (typeof request.init?.body !== "string") {
      throw new Error("request_body_not_string");
    }
    const serialized = request.init.body;
    assert.equal(serialized.includes("expected"), false);
    assert.equal(serialized.includes("holdout"), false);
    assert.equal(serialized.includes("provenance"), false);
    assert.equal(serialized.includes("secret-user-token"), false);
  }
});

void test("outbound messages use the canonical fingerprint helper output", async () => {
  const corpus = await buildSyntheticEvaluationCorpus({
    runId: "run-live-red",
    anchorMs: ANCHOR_MS,
  });
  const expectedFirst = corpus[0];
  if (expectedFirst === undefined) throw new Error("expected_corpus_case_missing");

  let sentMessages: readonly SentMessage[] = [];
  await runSmsProviderEvaluation(
    options({
      mode: "live",
      maxCases: 1,
      maxRequests: 1,
      endpoint: STAGING_PARSE_SMS_ENDPOINT,
      projectRef: STAGING_PROJECT_REF,
      accessToken: "token",
    }),
    {
      fetch: (_input, init): Promise<Response> => {
        sentMessages = readSentMessages(init);
        return Promise.resolve(validFinalResponse());
      },
      now: (): number => ANCHOR_MS,
    }
  );

  const sent = sentMessages[0];
  if (sent === undefined) throw new Error("sent_message_missing");
  assert.equal(sent.smsFingerprint, expectedFirst.message.smsFingerprint);
});

void test("malformed or non-JSON HTTP 200 responses are response-invalid, never semantic empty observations", async () => {
  const responses = [
    new Response("not-json", {
      status: 200,
      headers: { "content-type": "text/plain" },
    }),
    new Response("42", {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
    new Response(
      JSON.stringify({
        transactions: [
          {
            ...parsedTransaction("message-id"),
            amount: "100",
          },
        ],
        completionStatus: "complete",
        negativeFingerprints: [],
        terminalFingerprints: [],
        unresolvedFingerprints: [],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    ),
  ];

  for (const response of responses) {
    const report = await runSmsProviderEvaluation(
      options({
        mode: "live",
        maxCases: 2,
        maxRequests: 1,
        endpoint: STAGING_PARSE_SMS_ENDPOINT,
        projectRef: STAGING_PROJECT_REF,
        accessToken: "token",
      }),
      {
        fetch: (): Promise<Response> => Promise.resolve(response.clone()),
        now: (): number => ANCHOR_MS,
      }
    );

    assertAllCasesClassified(report, "response_invalid");
    assert.equal(report.aggregate.truePositive, 0);
    assert.equal(report.aggregate.trueNegative, 0);
    assert.equal(report.aggregate.falsePositive, 0);
    assert.equal(report.aggregate.falseNegative, 0);
  }
});

void test("mixed accepted, unresolved, and terminal candidates stay separately represented", async () => {
  const report = await runSmsProviderEvaluation(
    options({
      mode: "live",
      maxCases: 3,
      maxRequests: 1,
      endpoint: STAGING_PARSE_SMS_ENDPOINT,
      projectRef: STAGING_PROJECT_REF,
      accessToken: "token",
    }),
    {
      fetch: (_input, init): Promise<Response> => {
        const messages = readSentMessages(init);
        const first = messages[0];
        const second = messages[1];
        const third = messages[2];
        if (first === undefined || second === undefined || third === undefined) {
          throw new Error("expected_three_messages");
        }
        return Promise.resolve(
          validFinalResponse({
            transactions: [parsedTransaction(first.id)],
            unresolvedFingerprints: [second.smsFingerprint],
            terminalFingerprints: [third.smsFingerprint],
          })
        );
      },
      now: (): number => ANCHOR_MS,
    }
  );

  assert.equal(report.cases.length, 3);
  assert.deepEqual(
    report.cases.map(({ finalClassification }) => finalClassification),
    ["observed", "unresolved", "suppressed"]
  );
});

void test("truncated completion remains unresolved rather than becoming a semantic omission or true negative", async () => {
  const report = await runSmsProviderEvaluation(
    options({
      mode: "live",
      maxCases: 2,
      maxRequests: 1,
      endpoint: STAGING_PARSE_SMS_ENDPOINT,
      projectRef: STAGING_PROJECT_REF,
      accessToken: "token",
    }),
    {
      fetch: (): Promise<Response> =>
        Promise.resolve(
          validFinalResponse({
            completionStatus: "truncated",
          })
        ),
      now: (): number => ANCHOR_MS,
    }
  );

  assertAllCasesClassified(report, "unresolved");
  assert.equal(report.aggregate.truePositive, 0);
  assert.equal(report.aggregate.trueNegative, 0);
  assert.equal(report.aggregate.falsePositive, 0);
  assert.equal(report.aggregate.falseNegative, 0);
});

void test("auth, consent, and capacity refusal stop later batches while preserving the partial report", async () => {
  const refusalCases = [
    { response: new Response(JSON.stringify({ reason: "unauthorized" }), { status: 401 }) },
    { response: new Response(JSON.stringify({ reason: "consent_required" }), { status: 403 }) },
    {
      response: new Response(
        JSON.stringify({ reason: "rolling_window_exceeded" }),
        { status: 429 }
      ),
    },
  ];

  for (const { response } of refusalCases) {
    let fetchCalls = 0;
    const report = await runSmsProviderEvaluation(
      options({
        mode: "live",
        maxCases: 12,
        maxRequests: 3,
        endpoint: STAGING_PARSE_SMS_ENDPOINT,
        projectRef: STAGING_PROJECT_REF,
        accessToken: "token",
      }),
      {
        fetch: (): Promise<Response> => {
          fetchCalls++;
          return Promise.resolve(response.clone());
        },
        now: (): number => ANCHOR_MS,
      }
    );

    assert.equal(fetchCalls, 1);
    assert.ok(
      report.cases.some(({ finalClassification }) =>
        ["admission_failure", "unattempted"].includes(finalClassification)
      )
    );
  }
});

void test("refusal payloads cannot leak access token or public API key into reports", async () => {
  const accessToken = "secret-refusal-token";
  const publicApiKey = "public-refusal-key";

  const report = await runSmsProviderEvaluation(
    options({
      mode: "live",
      maxCases: 5,
      maxRequests: 1,
      endpoint: STAGING_PARSE_SMS_ENDPOINT,
      projectRef: STAGING_PROJECT_REF,
      accessToken,
      publicApiKey,
    }),
    {
      fetch: (): Promise<Response> =>
        Promise.resolve(
          new Response(
            JSON.stringify({
            reason: `consent_required:${accessToken}`,
            error: `upstream:${publicApiKey}`,
          }),
            { status: 403, headers: { "content-type": "application/json" } }
          )
        ),
      now: (): number => ANCHOR_MS,
    }
  );

  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes(accessToken), false);
  assert.equal(serialized.includes(publicApiKey), false);
  assert.ok(
    report.cases.some(
      ({ finalClassification }) => finalClassification === "admission_failure"
    )
  );
});

void test("ordinary transport failure is not automatically retried against live allowance", async () => {
  let fetchCalls = 0;
  const report = await runSmsProviderEvaluation(
    options({
      mode: "live",
      maxCases: 5,
      maxRequests: 1,
      endpoint: STAGING_PARSE_SMS_ENDPOINT,
      projectRef: STAGING_PROJECT_REF,
      accessToken: "token",
    }),
    {
      fetch: (): Promise<Response> => {
        fetchCalls++;
        return Promise.reject(new TypeError("synthetic network failure"));
      },
      now: (): number => ANCHOR_MS,
    }
  );

  assert.equal(fetchCalls, 1);
  assertAllCasesClassified(report, "transport_failure");
});

void test("cancellation while fetch is pending forwards the AbortSignal and preserves a partial report", async () => {
  const controller = new AbortController();
  let forwardedSignal: AbortSignal | null = null;
  let markStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });

  const runPromise = runSmsProviderEvaluation(
    options({
      mode: "live",
      maxCases: 10,
      maxRequests: 2,
      endpoint: STAGING_PARSE_SMS_ENDPOINT,
      projectRef: STAGING_PROJECT_REF,
      accessToken: "token",
      signal: controller.signal,
    }),
    {
      fetch: async (_input, init): Promise<Response> => {
        forwardedSignal = init?.signal ?? null;
        markStarted?.();
        return await new Promise<Response>((_resolve, reject) => {
          forwardedSignal?.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true }
          );
        });
      },
      now: (): number => ANCHOR_MS,
    }
  );

  await started;
  assert.equal(forwardedSignal, controller.signal);
  controller.abort();

  const report = await runPromise;
  assert.equal(report.cancelled, true);
  assert.ok(
    report.cases.some(
      ({ finalClassification }) => finalClassification === "unattempted"
    )
  );
});

void test("tokens and public keys never appear in specific staging-guard errors", async () => {
  const token = "super-secret-user-token";
  const publicKey = "public-test-key";

  await assert.rejects(
    () =>
      runSmsProviderEvaluation(
        options({
          mode: "live",
          endpoint: "https://evil.example/functions/v1/parse-sms",
          projectRef: STAGING_PROJECT_REF,
          accessToken: token,
          publicApiKey: publicKey,
        }),
        {
          fetch: (): Promise<Response> => Promise.resolve(new Response()),
          now: (): number => ANCHOR_MS,
        }
      ),
    (error: unknown) => {
      const serialized = String(error);
      assert.match(serialized, /sms_provider_evaluation_invalid_staging_target/);
      assert.equal(serialized.includes(token), false);
      assert.equal(serialized.includes(publicKey), false);
      return true;
    }
  );
});


void test("batch summary exposes only sanitized status/reason and measures latency through response body completion", async () => {
  let clockMs = 1_000;
  class DelayedBodyResponse extends Response {
    override async text(): Promise<string> {
      clockMs += 275;
      return await super.text();
    }
  }

  const report = await runSmsProviderEvaluation(
    options({
      mode: "live",
      maxCases: 2,
      maxRequests: 1,
      endpoint: STAGING_PARSE_SMS_ENDPOINT,
      projectRef: STAGING_PROJECT_REF,
      accessToken: "secret-token",
      publicApiKey: "public-key",
    }),
    {
      fetch: (): Promise<Response> =>
        Promise.resolve(
          new DelayedBodyResponse(
          JSON.stringify({
            reason: "consent_required",
            error: "do-not-expose-upstream-detail",
          }),
          {
            status: 403,
            headers: { "content-type": "application/json" },
          }
        ),
      now: (): number => clockMs,
    }
  );

  const summary = report.batchSummaries[0];
  if (summary === undefined) throw new Error("batch_summary_missing");
  assert.equal(summary.httpStatus, 403);
  assert.equal(summary.refusalReason, "consent_required");
  assert.equal(summary.latencyMs, 275);
  assert.equal(JSON.stringify(summary).includes("do-not-expose-upstream-detail"), false);
  assert.equal(JSON.stringify(summary).includes("secret-token"), false);
  assert.equal(JSON.stringify(summary).includes("public-key"), false);
});
