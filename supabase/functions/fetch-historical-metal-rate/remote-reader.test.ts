import assert from "node:assert/strict";
import test from "node:test";
import { readRemoteHistoricalRates } from "./remote-reader.ts";
import { DATE, root, atoms, raw } from "./remote-fixture.test-data.ts";

test("reads raw numeric JSON by provider timestamp bounds and same batch ids", async () => {
  const urls: URL[] = [];
  const result = await readRemoteHistoricalRates({
    date: DATE,
    signal: new AbortController().signal,
    supabaseUrl: "https://project.test",
    serviceRoleKey: "server-key",
    fetch: async (url, init): Promise<Response> => {
      urls.push(new URL(url));
      assert.equal(init.signal?.aborted, false);
      assert.equal(new Headers(init.headers).get("apikey"), "server-key");
      const response = new Response(
        raw(urls.length === 1 ? [root()] : atoms())
      );
      Object.defineProperty(response, "json", {
        value: (): never => {
          throw new Error("must preserve raw numeric tokens");
        },
      });
      return response;
    },
  });
  assert.ok(result.rawRootResponseText.includes("100.123456789012345678901"));
  assert.ok(result.rawObservationResponseText.includes("0.020000000000000001"));
  assert.equal(urls[0].pathname, "/rest/v1/market_rates");
  assert.ok(urls[0].searchParams.get("and")?.includes("timestamp_metal.gte."));
  assert.ok(
    urls[0].searchParams.get("and")?.includes("timestamp_currency.gte.")
  );
  assert.equal(urls[0].searchParams.has("created_at"), false);
  assert.equal(urls[1].pathname, "/rest/v1/market_rate_observations");
  assert.ok(urls[1].searchParams.get("batch_id")?.startsWith("in.("));
});

test("pages every root before looking up atom batches and preserves all raw prices", async () => {
  const rootRows = Array.from({ length: 501 }, (_, index) =>
    root({ id: "018f0c7a-1234-7abc-8def-" + String(index).padStart(12, "0") })
  );
  const offsets: string[] = [];
  let observationCalls = 0;
  const result = await readRemoteHistoricalRates({
    date: DATE,
    signal: new AbortController().signal,
    supabaseUrl: "https://project.test",
    serviceRoleKey: "key",
    fetch: async (url): Promise<Response> => {
      const request = new URL(url);
      if (request.pathname.endsWith("market_rates")) {
        const offset = Number(request.searchParams.get("offset"));
        offsets.push(String(offset));
        return new Response(raw(rootRows.slice(offset, offset + 500)));
      }
      observationCalls++;
      return new Response("[]");
    },
  });
  assert.deepEqual(offsets, ["0", "500"]);
  assert.equal(observationCalls, 6);
  assert.equal(
    (result.rawRootResponseText.match(/100.123456789012345678901/g) ?? [])
      .length,
    501
  );
});

test("request abort cancels the in-flight remote read", async () => {
  const controller = new AbortController();
  const promise = readRemoteHistoricalRates({
    date: DATE,
    signal: controller.signal,
    supabaseUrl: "https://project.test",
    serviceRoleKey: "key",
    fetch: async (_url, init): Promise<Response> =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          { once: true }
        );
        controller.abort();
      }),
  });
  await assert.rejects(promise);
});

test("remote failure/invalid JSON and abort are not successful empty history", async () => {
  for (const response of [
    new Response("private error", { status: 500 }),
    new Response("{}"),
  ]) {
    await assert.rejects(
      readRemoteHistoricalRates({
        date: DATE,
        signal: new AbortController().signal,
        supabaseUrl: "https://project.test",
        serviceRoleKey: "key",
        fetch: async (): Promise<Response> => response,
      })
    );
  }
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assert.rejects(
    readRemoteHistoricalRates({
      date: DATE,
      signal: controller.signal,
      supabaseUrl: "https://project.test",
      serviceRoleKey: "key",
      fetch: async (): Promise<Response> => {
        calls++;
        return new Response("[]");
      },
    })
  );
  assert.equal(calls, 0);
});
