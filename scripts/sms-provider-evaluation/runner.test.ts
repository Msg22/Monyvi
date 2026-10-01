import assert from "node:assert/strict";
import test from "node:test";

import { buildSyntheticEvaluationCorpus } from "./corpus.ts";
import {
  runSmsProviderEvaluation,
  validateEvaluationRunOptions,
} from "./runner.ts";
import {
  DEFAULT_EVALUATION_BATCH_SIZE,
  STAGING_PARSE_SMS_ENDPOINT,
  STAGING_PROJECT_REF,
} from "./types.ts";

const ANCHOR_MS = Date.parse("2026-10-01T17:00:00.000Z");

function options(
  overrides: Partial<Parameters<typeof runSmsProviderEvaluation>[0]> = {}
): Parameters<typeof runSmsProviderEvaluation>[0] {
  return {
    mode: "dry-run",
    runId: "run-live-red",
    anchorMs: ANCHOR_MS,
    maxCases: 20,
    maxRequests: 4,
    ...overrides,
  };
}

test("dry-run is the default network-safe path and performs zero fetches", async () => {
  let fetchCalls = 0;
  const report = await runSmsProviderEvaluation(options(), {
    fetch: async () => {
      fetchCalls++;
      throw new Error("network must not run in dry mode");
    },
    now: () => ANCHOR_MS,
  });

  assert.equal(fetchCalls, 0);
  assert.equal(report.mode, "dry-run");
  assert.ok(report.cases.length > 0);
});

test("pins live execution to the one approved staging parse-sms HTTPS endpoint", () => {
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
    assert.throws(() =>
      validateEvaluationRunOptions(
        options({
          mode: "live",
          projectRef: STAGING_PROJECT_REF,
          endpoint,
          accessToken: "staging-user-token",
        })
      )
    );
  }
});

test("live mode requires explicit bounded limits and a staging user token before fetch", async () => {
  for (const bad of [
    options({ mode: "live", maxCases: 0, accessToken: "token" }),
    options({ mode: "live", maxRequests: 0, accessToken: "token" }),
    options({ mode: "live", accessToken: undefined }),
    options({ mode: "live", projectRef: "other-project", accessToken: "token" }),
  ]) {
    let fetchCalls = 0;
    await assert.rejects(() =>
      runSmsProviderEvaluation(bad, {
        fetch: async () => {
          fetchCalls++;
          return new Response();
        },
        now: () => ANCHOR_MS,
      })
    );
    assert.equal(fetchCalls, 0);
  }
});

test("live calls are sequential five-message batches, bounded, non-retrying, and refuse redirects", async () => {
  let active = 0;
  let maxActive = 0;
  const requests: Array<{ url: string; init?: RequestInit }> = [];

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
      fetch: async (input, init) => {
        active++;
        maxActive = Math.max(maxActive, active);
        requests.push({ url: String(input), init });
        await Promise.resolve();
        active--;
        return new Response(
          JSON.stringify({
            transactions: [],
            completionStatus: "complete",
            negativeFingerprints: [],
            terminalFingerprints: [],
            unresolvedFingerprints: [],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        );
      },
      now: () => ANCHOR_MS,
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
    const payload = JSON.parse(String(request.init?.body)) as Record<string, unknown>;
    const messages = payload.messages as readonly Record<string, unknown>[];
    assert.ok(messages.length <= DEFAULT_EVALUATION_BATCH_SIZE);
    const serialized = JSON.stringify(payload);
    assert.equal(serialized.includes("expected"), false);
    assert.equal(serialized.includes("holdout"), false);
    assert.equal(serialized.includes("provenance"), false);
    assert.equal(serialized.includes("secret-user-token"), false);
  }
});

test("outbound messages use the canonical fingerprint helper output", async () => {
  const corpus = await buildSyntheticEvaluationCorpus({
    runId: "run-live-red",
    anchorMs: ANCHOR_MS,
  });
  let requestBody: Record<string, unknown> | null = null;

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
      fetch: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            transactions: [],
            completionStatus: "complete",
            negativeFingerprints: [],
            terminalFingerprints: [],
            unresolvedFingerprints: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      },
      now: () => ANCHOR_MS,
    }
  );

  const sent = (requestBody?.messages as readonly Record<string, unknown>[])[0];
  assert.equal(sent?.smsFingerprint, corpus[0]?.message.smsFingerprint);
});

test("auth, consent, and capacity refusal stop later batches while preserving the partial report", async () => {
  for (const response of [
    new Response(JSON.stringify({ reason: "unauthorized" }), { status: 401 }),
    new Response(JSON.stringify({ reason: "consent_required" }), { status: 403 }),
    new Response(JSON.stringify({ reason: "rolling_window_exceeded" }), {
      status: 429,
    }),
  ]) {
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
        fetch: async () => {
          fetchCalls++;
          return response.clone();
        },
        now: () => ANCHOR_MS,
      }
    );

    assert.equal(fetchCalls, 1);
    assert.ok(report.cases.some(({ finalClassification }) =>
      ["admission_failure", "unattempted"].includes(finalClassification)
    ));
  }
});

test("ordinary transport failure is not automatically retried against live allowance", async () => {
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
      fetch: async () => {
        fetchCalls++;
        throw new TypeError("synthetic network failure");
      },
      now: () => ANCHOR_MS,
    }
  );

  assert.equal(fetchCalls, 1);
  assert.ok(
    report.cases.every(
      ({ finalClassification }) => finalClassification === "transport_failure"
    )
  );
});

test("cancellation preserves a partial report and marks remaining cases unattempted", async () => {
  const controller = new AbortController();
  let fetchCalls = 0;
  const report = await runSmsProviderEvaluation(
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
      fetch: async () => {
        fetchCalls++;
        controller.abort();
        return new Response(
          JSON.stringify({
            transactions: [],
            completionStatus: "complete",
            negativeFingerprints: [],
            terminalFingerprints: [],
            unresolvedFingerprints: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      },
      now: () => ANCHOR_MS,
    }
  );

  assert.equal(fetchCalls, 1);
  assert.equal(report.cancelled, true);
  assert.ok(
    report.cases.some(
      ({ finalClassification }) => finalClassification === "unattempted"
    )
  );
});

test("tokens and public keys never appear in report output or thrown validation errors", async () => {
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
          fetch: async () => new Response(),
          now: () => ANCHOR_MS,
        }
      ),
    (error: unknown) => {
      const serialized = String(error);
      assert.equal(serialized.includes(token), false);
      assert.equal(serialized.includes(publicKey), false);
      return true;
    }
  );
});
