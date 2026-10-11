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

function harness(
  options: {
    authenticated?: boolean;
    remoteError?: boolean;
    empty?: boolean;
  } = {}
): {
  dependencies: FetchHistoricalMetalRateHandlerDependencies;
  calls: string[];
} {
  const calls: string[] = [];
  const dependencies: FetchHistoricalMetalRateHandlerDependencies = {
    authenticate: async (): Promise<string | null> =>
      options.authenticated === false ? null : "user-1",
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
  return { dependencies, calls };
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

test("authenticated exact-date remote lookup requires no provider key or provider HTTP", async () => {
  const h = harness();
  const response = await invoke(h);
  assert.equal(response.status, 200);
  assert.deepEqual(h.calls, [DATE]);
  const body: unknown = await response.json();
  assert.ok(typeof body === "object" && body !== null && "record" in body);
  const record = body.record;
  assert.ok(
    typeof record === "object" &&
      record !== null &&
      "resolution" in record &&
      "source" in record
  );
  assert.equal(record.resolution, "snapshot");
  assert.equal(record.source, "stored-provider");
});

test("authentication and date validation happen before remote reads", async () => {
  const signedOut = harness({ authenticated: false });
  assert.equal((await invoke(signedOut)).status, 401);
  assert.equal(signedOut.calls.length, 0);
  for (const body of [
    { date: "2026-02-30" },
    { date: DATE, nearest: true },
    { date: "10/10/2026" },
  ]) {
    const h = harness();
    assert.equal((await invoke(h, body)).status, 400);
    assert.equal(h.calls.length, 0);
  }
});

test("remote absence and database failure remain honest unavailable/retry states", async () => {
  assert.equal((await invoke(harness({ empty: true }))).status, 404);
  const response = await invoke(harness({ remoteError: true }));
  assert.equal(response.status, 502);
  const body: unknown = await response.json();
  assert.deepEqual(body, { success: false, code: "remote_rate_error" });
});

test("OPTIONS/unsupported method does no auth or remote work", async () => {
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
  assert.equal(h.calls.length, 0);
});

test("already aborted request does not begin remote read", async () => {
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
  assert.equal(h.calls.length, 0);
});
