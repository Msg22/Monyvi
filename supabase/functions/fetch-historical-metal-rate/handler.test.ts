import assert from "node:assert/strict";
import test from "node:test";

import {
  createFetchHistoricalMetalRateHandler,
  type FetchHistoricalMetalRateHandlerDependencies,
} from "./handler.ts";

const DATE = "2026-10-10";
const FETCHED_AT = "2026-10-10T15:00:00.000Z";
const DIGEST =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const RAW = [
  '{"status":"success","currency":"USD","unit":"toz",',
  '"start_date":"2026-10-10","end_date":"2026-10-10",',
  '"rates":{"2026-10-10":{"date":"2026-10-10",',
  '"currencies":{"USD":1,"EGP":0.02},',
  '"metals":{"gold":1932.12,"silver":23.45}}}}',
].join("");

interface Harness {
  readonly dependencies: FetchHistoricalMetalRateHandlerDependencies;
  readonly urls: string[];
}

function harness(options?: {
  readonly authenticated?: boolean;
  readonly apiKey?: string;
  readonly providerResponse?: Response;
}): Harness {
  const urls: string[] = [];
  const providerResponse =
    options?.providerResponse ?? new Response(RAW, { status: 200 });
  Object.defineProperty(providerResponse, "json", {
    configurable: true,
    value: (): never => {
      throw new Error("provider response.json must not be authoritative");
    },
  });

  return {
    urls,
    dependencies: {
      authenticate: async (): Promise<string | null> =>
        options?.authenticated === false ? null : "user-1",
      getEnv: (name): string | undefined =>
        name === "METALS.DEV_API_KEY"
          ? (options?.apiKey ?? "server-only-provider-key")
          : undefined,
      fetch: async (url): Promise<Response> => {
        urls.push(url);
        return providerResponse;
      },
      now: (): Date => new Date(FETCHED_AT),
      sha256Hex: async (): Promise<string> => DIGEST,
    },
  };
}

async function invoke(
  testHarness: Harness,
  body: unknown = { date: DATE },
  method: string = "POST"
): Promise<{ readonly response: Response; readonly body: Record<string, unknown> }> {
  const response = await createFetchHistoricalMetalRateHandler(
    testHarness.dependencies
  )(
    new Request("https://example.test/fetch-historical-metal-rate", {
      method,
      ...(method === "POST"
        ? {
            body: JSON.stringify(body),
            headers: { "content-type": "application/json" },
          }
        : {}),
    })
  );
  const parsed = (await response.json()) as Record<string, unknown>;
  return { response, body: parsed };
}

test("requests exactly one provider calendar date and returns normalized history", async () => {
  const h = harness();
  const result = await invoke(h);

  assert.equal(result.response.status, 200);
  assert.equal(result.body["success"], true);
  assert.equal(h.urls.length, 1);
  const url = new URL(h.urls[0]);
  assert.equal(url.pathname, "/v1/timeseries");
  assert.equal(url.searchParams.get("start_date"), DATE);
  assert.equal(url.searchParams.get("end_date"), DATE);
  assert.equal(url.searchParams.get("api_key"), "server-only-provider-key");

  const record = result.body["record"] as Record<string, unknown>;
  assert.equal(record["rateDate"], DATE);
  assert.equal(record["providerKey"], "metals.dev");
  assert.equal(record["responseDigest"], DIGEST);
  assert.equal(JSON.stringify(result.body).includes("server-only-provider-key"), false);
});

test("rejects signed-out calls before provider access", async () => {
  const h = harness({ authenticated: false });
  const result = await invoke(h);

  assert.equal(result.response.status, 401);
  assert.equal(result.body["code"], "authentication_required");
  assert.equal(h.urls.length, 0);
});

test("rejects invalid or extra request fields before provider access", async () => {
  for (const body of [
    { date: "2026-02-30" },
    { date: "10/10/2026" },
    { date: DATE, nearest: true },
  ]) {
    const h = harness();
    const result = await invoke(h, body);
    assert.equal(result.response.status, 400);
    assert.equal(result.body["code"], "invalid_request");
    assert.equal(h.urls.length, 0);
  }
});

test("missing provider key fails without provider access", async () => {
  const h = harness({ apiKey: "" });
  const result = await invoke(h);

  assert.equal(result.response.status, 500);
  assert.equal(result.body["code"], "configuration_error");
  assert.equal(h.urls.length, 0);
});

test("missing exact date is unavailable rather than substituted", async () => {
  const h = harness({
    providerResponse: new Response(
      RAW.replace(
        '"rates":{"2026-10-10":{"date":"2026-10-10"',
        '"rates":{"2026-10-09":{"date":"2026-10-09"'
      ),
      { status: 200 }
    ),
  });
  const result = await invoke(h);

  assert.equal(result.response.status, 404);
  assert.equal(result.body["code"], "date_unavailable");
});

test("provider failure returns an honest error without leaking body or key", async () => {
  const h = harness({
    providerResponse: new Response("provider diagnostic", { status: 503 }),
  });
  const result = await invoke(h);

  assert.equal(result.response.status, 502);
  assert.equal(result.body["code"], "provider_error");
  assert.equal(JSON.stringify(result.body).includes("provider diagnostic"), false);
  assert.equal(JSON.stringify(result.body).includes("server-only-provider-key"), false);
});

test("OPTIONS succeeds without auth or provider access", async () => {
  const h = harness({ authenticated: false });
  const response = await createFetchHistoricalMetalRateHandler(h.dependencies)(
    new Request("https://example.test", { method: "OPTIONS" })
  );
  assert.equal(response.status, 200);
  assert.equal(h.urls.length, 0);
});

test("unsupported methods fail before auth/provider work", async () => {
  const h = harness();
  const result = await invoke(h, undefined, "GET");
  assert.equal(result.response.status, 405);
  assert.equal(result.body["code"], "method_not_allowed");
  assert.equal(h.urls.length, 0);
});
