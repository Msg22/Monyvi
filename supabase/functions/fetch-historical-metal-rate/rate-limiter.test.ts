import assert from "node:assert/strict";
import test from "node:test";
import {
  reserveHistoricalMetalRateRequest,
  type HistoricalMetalRateLimiterResult,
  type HistoricalMetalRateRpcClient,
  type HistoricalMetalRateReserveArgs,
} from "./rate-limiter.ts";

function createTypedRpcClient(
  rpcHandler: (
    functionName: "historical_metal_rate_reserve_request",
    args: HistoricalMetalRateReserveArgs,
    signal: AbortSignal
  ) => Promise<{ data: unknown; error: { message: string } | null }>
): HistoricalMetalRateRpcClient {
  return {
    rpc: (functionName, args, signal) =>
      rpcHandler(functionName, args, signal) as ReturnType<
        HistoricalMetalRateRpcClient["rpc"]
      >,
  };
}

test("reserveHistoricalMetalRateRequest attaches signal and validates accepted response with remaining 0..59 and retryAfter 0", async () => {
  let forwardedSignal: AbortSignal | null = null;
  const client = createTypedRpcClient(async (name, args, signal) => {
    assert.equal(name, "historical_metal_rate_reserve_request");
    assert.deepEqual(args, { p_user_id: "user-123" });
    forwardedSignal = signal;
    return {
      data: [
        {
          accepted: true,
          remaining: 59,
          reset_at: "2026-10-15T01:14:56.000Z",
          retry_after_seconds: 0,
        },
      ],
      error: null,
    };
  });

  const controller = new AbortController();
  const result = await reserveHistoricalMetalRateRequest(
    client,
    "user-123",
    controller.signal
  );

  assert.equal(forwardedSignal, controller.signal);
  assert.equal(result.accepted, true);
  assert.equal(result.remaining, 59);
  assert.equal(result.retryAfterSeconds, 0);
  assert.equal(result.resetAt, "2026-10-15T01:14:56.000Z");
});

test("reserveHistoricalMetalRateRequest validates denied response with remaining 0 and retryAfter >= 1", async () => {
  const client = createTypedRpcClient(async (name, args) => {
    assert.equal(name, "historical_metal_rate_reserve_request");
    assert.deepEqual(args, { p_user_id: "user-123" });
    return {
      data: [
        {
          accepted: false,
          remaining: 0,
          reset_at: "2026-10-15T01:14:56.000Z",
          retry_after_seconds: 1800,
        },
      ],
      error: null,
    };
  });

  const result = await reserveHistoricalMetalRateRequest(
    client,
    "user-123",
    new AbortController().signal
  );

  assert.equal(result.accepted, false);
  assert.equal(result.remaining, 0);
  assert.equal(result.retryAfterSeconds, 1800);
});

test("reserveHistoricalMetalRateRequest fails closed on malformed row data types", async () => {
  const malformedRows = [
    // accepted not boolean
    {
      accepted: "true",
      remaining: 50,
      reset_at: "2026-10-15T01:00:00Z",
      retry_after_seconds: 0,
    },
    // remaining negative
    {
      accepted: true,
      remaining: -1,
      reset_at: "2026-10-15T01:00:00Z",
      retry_after_seconds: 0,
    },
    // remaining > 59
    {
      accepted: true,
      remaining: 60,
      reset_at: "2026-10-15T01:00:00Z",
      retry_after_seconds: 0,
    },
    // accepted: true but retry_after_seconds > 0
    {
      accepted: true,
      remaining: 10,
      reset_at: "2026-10-15T01:00:00Z",
      retry_after_seconds: 5,
    },
    // accepted: false but retry_after_seconds < 1
    {
      accepted: false,
      remaining: 0,
      reset_at: "2026-10-15T01:00:00Z",
      retry_after_seconds: 0,
    },
    // accepted: false but remaining != 0
    {
      accepted: false,
      remaining: 5,
      reset_at: "2026-10-15T01:00:00Z",
      retry_after_seconds: 10,
    },
    // reset_at invalid ISO date string
    {
      accepted: true,
      remaining: 0,
      reset_at: "not-a-date",
      retry_after_seconds: 0,
    },
  ];

  for (const row of malformedRows) {
    const client = createTypedRpcClient(async () => ({
      data: [row],
      error: null,
    }));

    await assert.rejects(async () => {
      await reserveHistoricalMetalRateRequest(
        client,
        "user-123",
        new AbortController().signal
      );
    }, /Malformed reservation record/);
  }
});

test("reserveHistoricalMetalRateRequest throws on RPC database error", async () => {
  const client = createTypedRpcClient(async () => ({
    data: null,
    error: { message: "database connection error" },
  }));

  await assert.rejects(async () => {
    await reserveHistoricalMetalRateRequest(
      client,
      "user-123",
      new AbortController().signal
    );
  }, /database connection error/);
});

test("reserveHistoricalMetalRateRequest throws on empty array or multiple rows", async () => {
  for (const data of [[], [{}, {}]]) {
    const client = createTypedRpcClient(async () => ({
      data,
      error: null,
    }));

    await assert.rejects(async () => {
      await reserveHistoricalMetalRateRequest(
        client,
        "user-123",
        new AbortController().signal
      );
    }, /Expected exactly one reservation record/);
  }
});

test("reserveHistoricalMetalRateRequest throws on already aborted signal without calling RPC", async () => {
  const controller = new AbortController();
  controller.abort();
  let rpcCalled = false;
  const client = createTypedRpcClient(async () => {
    rpcCalled = true;
    return { data: null, error: null };
  });

  await assert.rejects(
    async () => {
      await reserveHistoricalMetalRateRequest(
        client,
        "user-123",
        controller.signal
      );
    },
    (err: unknown) => err instanceof Error && err.name === "AbortError"
  );
  assert.equal(rpcCalled, false);
});

test("reserveHistoricalMetalRateRequest forwards abort signal into RPC call and rejects when aborted", async () => {
  const controller = new AbortController();
  let receivedSignal: AbortSignal | null = null;
  const client = createTypedRpcClient(async (_name, _args, signal) => {
    receivedSignal = signal;
    controller.abort();
    return {
      data: [
        {
          accepted: true,
          remaining: 59,
          reset_at: "2026-10-15T01:14:56.000Z",
          retry_after_seconds: 0,
        },
      ],
      error: null,
    };
  });

  await assert.rejects(
    async () => {
      await reserveHistoricalMetalRateRequest(
        client,
        "user-123",
        controller.signal
      );
    },
    (err: unknown) => err instanceof Error && err.name === "AbortError"
  );
  assert.equal(receivedSignal, controller.signal);
});
