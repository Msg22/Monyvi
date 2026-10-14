import assert from "node:assert/strict";
import test from "node:test";
import {
  createFetchHistoricalMetalRateHandler,
  type FetchHistoricalMetalRateHandlerDependencies,
} from "./handler.ts";
import {
  DATE,
  FETCHED_AT,
  DIGEST,
  root,
  atoms,
  raw,
} from "./remote-fixture.test-data.ts";
import type { HistoricalMetalRateLimiterResult } from "./rate-limiter.ts";

interface HarnessOptions {
  authenticated?: boolean;
  userId?: string;
  remoteError?: boolean;
  empty?: boolean;
  rateLimitResult?: HistoricalMetalRateLimiterResult;
  rateLimitError?: boolean;
  rateLimitTimeout?: boolean;
}

function harness(options: HarnessOptions = {}): {
  dependencies: FetchHistoricalMetalRateHandlerDependencies;
  calls: string[];
  rateLimitCalls: string[];
} {
  const calls: string[] = [];
  const rateLimitCalls: string[] = [];
  const dependencies: FetchHistoricalMetalRateHandlerDependencies = {
    authenticate: async (): Promise<string | null> =>
      options.authenticated === false ? null : (options.userId ?? "user-1"),
    reserveRateLimit: async (
      userId: string,
      signal: AbortSignal
    ): Promise<HistoricalMetalRateLimiterResult> => {
      rateLimitCalls.push(userId);
      assert.equal(signal.aborted, false);
      if (options.rateLimitTimeout) {
        const error = new Error("Reservation timed out");
        error.name = "TimeoutError";
        throw error;
      }
      if (options.rateLimitError) {
        throw new Error("RPC failure");
      }
      return (
        options.rateLimitResult ?? {
          accepted: true,
          remaining: 59,
          resetAt: new Date(Date.now() + 3600 * 1000).toISOString(),
          retryAfterSeconds: 0,
        }
      );
    },
    readRemoteRates: async (
      date,
      signal
    ): Promise<{
      rawRootResponseText: string;
      rawObservationResponseText: string;
    }> => {
      calls.push(date);
      assert.equal(signal.aborted, false);
      if (options.remoteError) throw new Error("private database diagnostics");
      return {
        rawRootResponseText: raw(options.empty ? [] : [root()]),
        rawObservationResponseText: raw(options.empty ? [] : atoms()),
      };
    },
    now: (): Date => new Date(FETCHED_AT),
    sha256Hex: async (): Promise<string> => DIGEST,
  };
  return { dependencies, calls, rateLimitCalls };
}

async function invoke(
  h: ReturnType<typeof harness>,
  body: unknown = { date: DATE }
): Promise<Response> {
  return createFetchHistoricalMetalRateHandler(h.dependencies)(
    new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    })
  );
}

test("authenticated exact-date remote lookup reserves slot with signal and returns 200 record", async () => {
  const h = harness();
  const response = await invoke(h);
  assert.equal(response.status, 200);
  assert.deepEqual(h.rateLimitCalls, ["user-1"]);
  assert.deepEqual(h.calls, [DATE]);
  const body: unknown = await response.json();
  assert.ok(typeof body === "object" && body !== null && "record" in body);
  const record = (body as { record: unknown }).record;
  assert.ok(
    typeof record === "object" &&
      record !== null &&
      "resolution" in record &&
      "source" in record
  );
  assert.equal((record as { resolution: string }).resolution, "snapshot");
  assert.equal((record as { source: string }).source, "stored-provider");
});

test("authentication and date validation happen before rate reservation and remote reads", async () => {
  const signedOut = harness({ authenticated: false });
  assert.equal((await invoke(signedOut)).status, 401);
  assert.equal(signedOut.rateLimitCalls.length, 0);
  assert.equal(signedOut.calls.length, 0);

  for (const body of [
    { date: "2026-02-30" },
    { date: DATE, nearest: true },
    { date: "10/10/2026" },
  ]) {
    const h = harness();
    assert.equal((await invoke(h, body)).status, 400);
    assert.equal(h.rateLimitCalls.length, 0);
    assert.equal(h.calls.length, 0);
  }
});

test("rate limit denial returns 429 with Retry-After header, error envelope, and no remote reads", async () => {
  const h = harness({
    rateLimitResult: {
      accepted: false,
      remaining: 0,
      resetAt: "2026-10-15T01:14:56.000Z",
      retryAfterSeconds: 3120,
    },
  });
  const response = await invoke(h);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "3120");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
  assert.equal(h.rateLimitCalls.length, 1);
  assert.equal(h.calls.length, 0);

  const body: unknown = await response.json();
  assert.deepEqual(body, {
    success: false,
    code: "rate_limit_exceeded",
  });
});

test("rate limiter RPC failure fails closed with 500 internal_error and performs no remote reads", async () => {
  const h = harness({ rateLimitError: true });
  const response = await invoke(h);
  assert.equal(response.status, 500);
  assert.equal(h.rateLimitCalls.length, 1);
  assert.equal(h.calls.length, 0);

  const body: unknown = await response.json();
  assert.deepEqual(body, {
    success: false,
    code: "internal_error",
  });
});

test("rate limiter timeout returns 504 and performs no remote reads", async () => {
  const h = harness({ rateLimitTimeout: true });
  const response = await invoke(h);
  assert.equal(response.status, 504);
  assert.equal(h.rateLimitCalls.length, 1);
  assert.equal(h.calls.length, 0);

  const body: unknown = await response.json();
  assert.deepEqual(body, {
    success: false,
    code: "remote_rate_error",
  });
});

test("already aborted request before reservation does not reserve slot or read remote", async () => {
  const h = harness();
  const controller = new AbortController();
  controller.abort();
  const response = await createFetchHistoricalMetalRateHandler(h.dependencies)(
    new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({ date: DATE }),
      signal: controller.signal,
    })
  );
  assert.equal(response.status, 499);
  assert.equal(h.rateLimitCalls.length, 0);
  assert.equal(h.calls.length, 0);
});

test("request aborted during reservation does not perform remote read and returns 499", async () => {
  const controller = new AbortController();
  const calls: string[] = [];
  const dependencies: FetchHistoricalMetalRateHandlerDependencies = {
    authenticate: async (): Promise<string | null> => "user-1",
    reserveRateLimit: async (
      _userId: string,
      _signal: AbortSignal
    ): Promise<HistoricalMetalRateLimiterResult> => {
      controller.abort();
      return {
        accepted: true,
        remaining: 59,
        resetAt: "2026-10-15T01:14:56.000Z",
        retryAfterSeconds: 0,
      };
    },
    readRemoteRates: async (
      date
    ): Promise<{
      rawRootResponseText: string;
      rawObservationResponseText: string;
    }> => {
      calls.push(date);
      return {
        rawRootResponseText: raw([root()]),
        rawObservationResponseText: raw(atoms()),
      };
    },
    now: (): Date => new Date(FETCHED_AT),
    sha256Hex: async (): Promise<string> => DIGEST,
  };

  const response = await createFetchHistoricalMetalRateHandler(dependencies)(
    new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({ date: DATE }),
      signal: controller.signal,
    })
  );
  assert.equal(response.status, 499);
  assert.equal(calls.length, 0);
});

test("remote absence and database failure remain honest unavailable/retry states after reservation", async () => {
  const emptyHarness = harness({ empty: true });
  assert.equal((await invoke(emptyHarness)).status, 404);
  assert.equal(emptyHarness.rateLimitCalls.length, 1);

  const errorHarness = harness({ remoteError: true });
  const response = await invoke(errorHarness);
  assert.equal(response.status, 502);
  assert.equal(errorHarness.rateLimitCalls.length, 1);
  const body: unknown = await response.json();
  assert.deepEqual(body, { success: false, code: "remote_rate_error" });
});

test("OPTIONS/unsupported method does no auth, rate reservation, or remote work", async () => {
  const h = harness({ authenticated: false });
  const handler = createFetchHistoricalMetalRateHandler(h.dependencies);
  assert.equal(
    (await handler(new Request("https://example.test", { method: "OPTIONS" })))
      .status,
    200
  );
  assert.equal(
    (await handler(new Request("https://example.test"))).status,
    405
  );
  assert.equal(h.rateLimitCalls.length, 0);
  assert.equal(h.calls.length, 0);
});
