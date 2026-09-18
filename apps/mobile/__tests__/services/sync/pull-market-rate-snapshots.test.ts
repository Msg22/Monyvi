import type { SyncTableChangeSet } from "@nozbe/watermelondb/sync";
import {
  isSupportedCurrentCurrencyInstrumentCode,
  SUPPORTED_CURRENCIES,
} from "@monyvi/logic";

jest.mock("@monyvi/db", () => ({
  schema: { tables: {} },
}));

jest.mock("@/services/supabase", () => ({
  supabase: {
    rpc: (): never => {
      throw new Error("unexpected real Supabase RPC in injected-client test");
    },
  },
}));

import {
  pullMarketRateSnapshotsWithClient,
  type MarketRateSnapshotRpcClient,
  type MarketRateSnapshotRpcRequest,
  type MarketRateSnapshotRpcResponse,
} from "@/services/sync/market-rate-snapshot-pull";

const WATERMARK = "2026-09-09T12:00:00.000Z";
const SNAPSHOT_A = "11111111-1111-4111-8111-111111111111";
const SNAPSHOT_B = "22222222-2222-4222-8222-222222222222";
const CAPTURED_A = "2026-09-09T10:00:00.000Z";
const CAPTURED_B = "2026-09-09T11:00:00.000Z";
const METAL_TIME = "2026-09-09T09:55:00.000Z";
const CURRENCY_TIME = "2026-09-09T09:50:00.000Z";

interface RpcPageOptions {
  readonly snapshotId?: string;
  readonly capturedAt?: string;
  readonly source?: string;
  readonly omitInstrument?: string;
  readonly observationBatchId?: string;
  readonly goldObservationValue?: string;
  readonly nextCursor?: {
    readonly createdAt: string;
    readonly id: string;
  } | null;
  readonly upperWatermark?: string;
}

class FakeRpcClient implements MarketRateSnapshotRpcClient {
  constructor(private readonly responses: MarketRateSnapshotRpcResponse[]) {}

  readonly requests: MarketRateSnapshotRpcRequest[] = [];
  pull(
    request: MarketRateSnapshotRpcRequest
  ): Promise<MarketRateSnapshotRpcResponse> {
    this.requests.push(request);
    const response = this.responses.shift();
    if (!response) {
      throw new Error("test fixture exhausted RPC responses");
    }
    return Promise.resolve(response);
  }
}

function successfulPage(
  options: RpcPageOptions = {}
): MarketRateSnapshotRpcResponse {
  const snapshotId = options.snapshotId ?? SNAPSHOT_A;
  const capturedAt = options.capturedAt ?? CAPTURED_A;
  const root = createRoot();
  const observations = createObservations({
    batchId: options.observationBatchId ?? snapshotId,
    capturedAt,
    source: options.source ?? "metals.dev",
    goldObservationValue:
      options.goldObservationValue ?? requireString(root.goldUsdPerGram),
  }).filter(
    (observation) => observation.instrumentCode !== options.omitInstrument
  );

  return {
    data: {
      snapshots: [
        {
          snapshotId,
          capturedAt,
          root,
          observations,
        },
      ],
      upperWatermark: options.upperWatermark ?? WATERMARK,
      nextCursor: options.nextCursor ?? null,
    },
    error: null,
  };
}

function createRoot(): Record<string, unknown> {
  const fiatUsdPerUnit: Record<string, string> = {
    BTC: "95000.5000000001",
  };
  for (const { code } of SUPPORTED_CURRENCIES) {
    if (code !== "USD") {
      fiatUsdPerUnit[code] = code === "OMR" ? "0.10000000000000001" : "0.5";
    }
  }

  return {
    goldUsdPerGram: "3738.7400000000001",
    silverUsdPerGram: "43.7387400000001",
    platinumUsdPerGram: "123.00",
    palladiumUsdPerGram: "1020.50000000000000001",
    fiatUsdPerUnit,
    providerMetalObservedAt: METAL_TIME,
    providerCurrencyObservedAt: CURRENCY_TIME,
  };
}

function createObservations(input: {
  readonly batchId: string;
  readonly capturedAt: string;
  readonly source: string;
  readonly goldObservationValue: string;
}): ReadonlyArray<Record<string, unknown>> {
  const root = createRoot();
  const currencyInstruments = SUPPORTED_CURRENCIES.map(
    ({ code }) => `currency:${code}`
  ).filter(isSupportedCurrentCurrencyInstrumentCode);
  const instruments = ["metal:GOLD", "metal:SILVER", ...currencyInstruments];

  return instruments.map((instrumentCode, index) => {
    const isMetal = instrumentCode.startsWith("metal:");
    const currencyCode = isMetal
      ? null
      : instrumentCode.slice("currency:".length);
    const valueDecimal =
      instrumentCode === "metal:GOLD"
        ? input.goldObservationValue
        : instrumentCode === "metal:SILVER"
          ? root.silverUsdPerGram
          : currencyCode === "USD"
            ? "1"
            : requireString(
                requireRecord(root.fiatUsdPerUnit)[currencyCode ?? ""]
              );

    return {
      id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index + 1).padStart(12, "0")}`,
      batchId: input.batchId,
      capturedAt: input.capturedAt,
      instrumentCode,
      valueDecimal,
      unit: isMetal ? "usd_per_pure_gram" : "usd_per_currency_unit",
      orientation: "quote_per_base",
      providerObservedAt: isMetal ? METAL_TIME : CURRENCY_TIME,
      source: input.source,
      quality: "valid",
    };
  });
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error("expected record");
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("expected string");
  }
  return value;
}

function requireUpdatedRows(
  changes: SyncTableChangeSet
): ReadonlyArray<Record<string, unknown>> {
  return changes.updated.map(requireRecord);
}

describe("pullMarketRateSnapshotsWithClient", () => {
  it("validates one complete envelope before producing root and observation changes", async () => {
    const client = new FakeRpcClient([successfulPage()]);

    const result = await pullMarketRateSnapshotsWithClient(client, null);

    expect(client.requests).toEqual([
      {
        cursor: null,
        limit: 50,
        upperWatermark: null,
      },
    ]);
    expect(result.upperWatermark).toBe(WATERMARK);

    const roots = requireUpdatedRows(result.changes.market_rates);
    const observations = requireUpdatedRows(
      result.changes.market_rate_observations
    );
    expect(roots).toHaveLength(1);
    expect(observations).toHaveLength(37);
    expect(roots[0]).toMatchObject({
      id: SNAPSHOT_A,
      created_at: Date.parse(CAPTURED_A),
      gold_usd_per_gram: Number("3738.7400000000001"),
    });
    expect(
      observations.find((row) => row.instrument_code === "currency:OMR")
        ?.value_decimal
    ).toBe("0.10000000000000001");
  });

  it("keeps one upper watermark and advances only with a validated page cursor", async () => {
    const firstCursor = { createdAt: CAPTURED_A, id: SNAPSHOT_A };
    const client = new FakeRpcClient([
      successfulPage({ nextCursor: firstCursor }),
      successfulPage({
        snapshotId: SNAPSHOT_B,
        capturedAt: CAPTURED_B,
      }),
    ]);

    const result = await pullMarketRateSnapshotsWithClient(client, null);

    expect(client.requests).toEqual([
      { cursor: null, limit: 50, upperWatermark: null },
      { cursor: firstCursor, limit: 50, upperWatermark: WATERMARK },
    ]);
    expect(requireUpdatedRows(result.changes.market_rates)).toHaveLength(2);
    expect(
      requireUpdatedRows(result.changes.market_rate_observations)
    ).toHaveLength(74);
  });

  it.each([
    [
      "partial observation set",
      successfulPage({ omitInstrument: "currency:EGP" }),
    ],
    ["blank source", successfulPage({ source: "   " })],
    [
      "cross-snapshot child",
      successfulPage({ observationBatchId: SNAPSHOT_B }),
    ],
    [
      "root/observation value mismatch",
      successfulPage({ goldObservationValue: "9999" }),
    ],
  ])("rejects a %s before returning local changes", async (_name, response) => {
    const client = new FakeRpcClient([response]);

    await expect(
      pullMarketRateSnapshotsWithClient(client, null)
    ).rejects.toThrow("sync_invalid_market_rate_snapshot_page");
  });

  it("rejects a page cursor that does not identify its last validated snapshot", async () => {
    const client = new FakeRpcClient([
      successfulPage({
        nextCursor: { createdAt: CAPTURED_A, id: SNAPSHOT_B },
      }),
    ]);

    await expect(
      pullMarketRateSnapshotsWithClient(client, null)
    ).rejects.toThrow("sync_invalid_market_rate_snapshot_page");
    expect(client.requests).toHaveLength(1);
  });

  it("returns no changes when the complete-envelope RPC returns an empty page", async () => {
    const client = new FakeRpcClient([
      {
        data: {
          snapshots: [],
          upperWatermark: WATERMARK,
          nextCursor: null,
        },
        error: null,
      },
    ]);

    const result = await pullMarketRateSnapshotsWithClient(client, {
      createdAt: CAPTURED_A,
      id: SNAPSHOT_A,
    });

    expect(requireUpdatedRows(result.changes.market_rates)).toEqual([]);
    expect(requireUpdatedRows(result.changes.market_rate_observations)).toEqual(
      []
    );
  });

  it("fails the whole pull when a later page fails instead of returning page one", async () => {
    const cursor = { createdAt: CAPTURED_A, id: SNAPSHOT_A };
    const client = new FakeRpcClient([
      successfulPage({ nextCursor: cursor }),
      { data: null, error: { message: "temporary RPC failure" } },
    ]);

    await expect(
      pullMarketRateSnapshotsWithClient(client, null)
    ).rejects.toThrow("temporary RPC failure");
    expect(client.requests).toHaveLength(2);
  });
});
