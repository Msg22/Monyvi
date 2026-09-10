import assert from "node:assert/strict";
import test from "node:test";

import type { PersistRpcPayload } from "../_shared/market-rate-snapshot-contract.ts";
import {
  createFetchMetalRatesHandler,
  type FetchMetalRatesHandlerDependencies,
} from "./handler.ts";

const SNAPSHOT_ID = "11111111-1111-4111-8111-111111111111";
const CAPTURED_AT = "2026-09-08T10:00:00.000Z";
const RAW_PROVIDER_SUCCESS = `{"status":"success","currency":"USD","unit":"g",
"metals":{"gold":3738.74,"silver":43.73874,"platinum":1.2300e+2,"palladium":1020.50000000000000001},
"currencies":{"AED":0.2722854563,"AUD":0.6572,"BHD":0.2650066252,"BTC":95000.5,"CAD":0.7296,
"CHF":1.1229,"CNH":0.13750,"CNY":0.13842,"DKK":0.15713,"DZD":0.0073624976,
"EGP":0.0210523309,"EUR":1.1712,"GBP":1.2724,"HKD":0.12821,"INR":0.01135,"IQD":0.0007633588,
"ISK":0.007543,"JOD":0.1408450704,"JPY":0.006678,"KPW":3.73874e-10,"KRW":0.0007185,
"KWD":0.3255287081,"LYD":0.0002234475,"MAD":0.0999014878,"MYR":0.22345,"NOK":0.09417,
"NZD":0.5983,"OMR":0.10000000000000001,"QAR":0.2747252747,"RUB":0.01106,"SAR":0.2666480021,
"SEK":0.10524,"SGD":0.7431,"TND":0.3215434083,"TRY":0.02589,"USD":1,"ZAR":0.05518},
"timestamps":{"metal":"2026-09-08T09:55:00Z","currency":"2026-09-08T09:50:00Z"}}`;

interface Harness {
  readonly dependencies: FetchMetalRatesHandlerDependencies;
  readonly fetchUrls: string[];
  readonly persistenceCalls: PersistRpcPayload[];
}

function createHarness(options?: {
  readonly apiKey?: string;
  readonly providerResponse?: Response;
  readonly persistenceError?: string;
  readonly persistenceStatus?: "created" | "replayed";
}): Harness {
  const fetchUrls: string[] = [];
  const persistenceCalls: PersistRpcPayload[] = [];
  const providerResponse =
    options?.providerResponse ??
    new Response(RAW_PROVIDER_SUCCESS, {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  Object.defineProperty(providerResponse, "json", {
    configurable: true,
    value: (): never => {
      throw new Error("authoritative handler must not call response.json()");
    },
  });

  return {
    fetchUrls,
    persistenceCalls,
    dependencies: {
      getEnv(name): string | undefined {
        if (name === "METALS.DEV_API_KEY") {
          return options?.apiKey ?? "provider-secret";
        }
        return undefined;
      },
      async fetch(url): Promise<Response> {
        fetchUrls.push(url);
        return providerResponse;
      },
      now(): Date {
        return new Date(CAPTURED_AT);
      },
      createSnapshotId(): string {
        return SNAPSHOT_ID;
      },
      async persistSnapshot(payload): Promise<{
        readonly data: unknown;
        readonly error: { readonly message: string } | null;
      }> {
        persistenceCalls.push(payload);
        if (options?.persistenceError) {
          return {
            data: null,
            error: { message: options.persistenceError },
          };
        }
        return {
          data: {
            status: options?.persistenceStatus ?? "created",
            snapshotId: SNAPSHOT_ID,
          },
          error: null,
        };
      },
    },
  };
}

function requireRecord(value: unknown): Record<string, unknown> {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);
  return Object.fromEntries(Object.entries(value));
}

async function invoke(
  method: string,
  harness: Harness
): Promise<{ readonly body: Record<string, unknown>; readonly response: Response }> {
  const handler = createFetchMetalRatesHandler(harness.dependencies);
  const response = await handler(
    new Request("https://example.test/fetch-metal-rates", { method })
  );
  return { response, body: requireRecord(await response.json()) };
}

test("OPTIONS returns CORS success without fetching or persisting", async () => {
  const harness = createHarness();
  const handler = createFetchMetalRatesHandler(harness.dependencies);

  const response = await handler(
    new Request("https://example.test/fetch-metal-rates", { method: "OPTIONS" })
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal(response.headers.get("access-control-allow-methods"), "GET, POST, OPTIONS");
  assert.equal(harness.fetchUrls.length, 0);
  assert.equal(harness.persistenceCalls.length, 0);
});

test("scheduled POST persists one exact atomic snapshot", async () => {
  const harness = createHarness();
  const { response, body } = await invoke("POST", harness);

  assert.equal(response.status, 200);
  assert.equal(body["success"], true);
  assert.equal(body["snapshotId"], SNAPSHOT_ID);
  assert.equal(harness.fetchUrls.length, 1);
  assert.equal(harness.persistenceCalls.length, 1);
});

test("unsupported methods fail before provider or persistence access", async () => {
  const harness = createHarness();
  const { response, body } = await invoke("PUT", harness);

  assert.equal(response.status, 405);
  assert.equal(body["code"], "method_not_allowed");
  assert.equal(harness.fetchUrls.length, 0);
  assert.equal(harness.persistenceCalls.length, 0);
});

test("GET persists one exact atomic snapshot from response text", async () => {
  const harness = createHarness();
  const { response, body } = await invoke("GET", harness);

  assert.equal(response.status, 200);
  assert.equal(harness.fetchUrls.length, 1);
  assert.equal(harness.persistenceCalls.length, 1);
  const payload = harness.persistenceCalls[0];
  assert.equal(payload.p_snapshot_id, SNAPSHOT_ID);
  assert.equal(payload.p_captured_at, CAPTURED_AT);
  assert.equal(payload.p_observations.length, 37);
  assert.equal(payload.p_root.platinumUsdPerGram, "123.00");
  assert.equal(payload.p_root.palladiumUsdPerGram, "1020.50000000000000001");
  assert.equal(payload.p_root.fiatUsdPerUnit.OMR, "0.10000000000000001");
  assert.equal(payload.p_root.fiatUsdPerUnit.KPW, "0.000000000373874");
  assert.equal(
    payload.p_observations.find(
      ({ instrumentCode }) => instrumentCode === "currency:USD"
    )?.valueDecimal,
    "1"
  );
  assert.equal(
    payload.p_observations.some(
      ({ instrumentCode }) => instrumentCode === "currency:BTC"
    ),
    false
  );

  assert.equal(body["success"], true);
  assert.equal(body["snapshotId"], SNAPSHOT_ID);
  assert.equal(body["persistenceStatus"], "created");
});

test("reports replayed persistence without issuing a second write path", async () => {
  const harness = createHarness({ persistenceStatus: "replayed" });
  const { response, body } = await invoke("GET", harness);

  assert.equal(response.status, 200);
  assert.equal(body["persistenceStatus"], "replayed");
  assert.equal(harness.persistenceCalls.length, 1);
});

test("missing provider key fails before provider or database access", async () => {
  const harness = createHarness({ apiKey: "" });
  const { response, body } = await invoke("GET", harness);

  assert.equal(response.status, 500);
  assert.equal(body["code"], "configuration_error");
  assert.equal(harness.fetchUrls.length, 0);
  assert.equal(harness.persistenceCalls.length, 0);
});

test("provider failure never calls persistence", async () => {
  const harness = createHarness({
    providerResponse: new Response("upstream unavailable", { status: 503 }),
  });
  const { response, body } = await invoke("GET", harness);

  assert.equal(response.status, 502);
  assert.equal(body["code"], "provider_error");
  assert.equal(harness.persistenceCalls.length, 0);
});

test("RPC failure returns an honest error after exactly one atomic attempt", async () => {
  const harness = createHarness({ persistenceError: "database unavailable" });
  const { response, body } = await invoke("GET", harness);

  assert.equal(response.status, 502);
  assert.equal(body["code"], "persistence_error");
  assert.equal(harness.persistenceCalls.length, 1);
  assert.equal(JSON.stringify(body).includes("database unavailable"), false);
  assert.equal(JSON.stringify(body).includes("provider-secret"), false);
});
