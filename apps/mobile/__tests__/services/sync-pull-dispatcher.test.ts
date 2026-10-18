import type { SyncPullResult } from "@nozbe/watermelondb/sync";

const mockGetCurrentUserId = jest.fn();
const mockFrom = jest.fn();
const mockRpc = jest.fn();
const mockLoggerError = jest.fn();

interface SupabaseResult {
  readonly count?: number;
  readonly data: ReadonlyArray<Record<string, unknown>> | null;
  readonly error: { readonly message: string } | null;
}

interface SelectChain {
  readonly select: jest.Mock;
  readonly eq: jest.Mock;
  readonly gt: jest.Mock;
  readonly lte: jest.Mock;
  readonly or: jest.Mock;
  readonly in: jest.Mock;
  readonly limit: jest.Mock;
  readonly order: jest.Mock;
  readonly then: (
    resolve: (value: SupabaseResult) => unknown,
    reject?: (reason: unknown) => unknown
  ) => Promise<unknown>;
}

const tableChains = new Map<string, SelectChain[]>();

jest.mock("@monyvi/db", () => ({
  schema: {
    tables: {
      market_rates: {},
      market_rate_observations: {},
      financial_action_groups: {},
      metal_holding_states: {},
      metal_action_evidence: {},
      metal_lifecycle_events: {},
      metal_rate_references: {},
      daily_snapshot_balance: {},
      categories: {},
      assets: {},
      asset_metals: {},
      profiles: {},
    },
  },
}));

jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string | null> =>
    mockGetCurrentUserId() as Promise<string | null>,
  supabase: {
    from: (table: string): unknown => mockFrom(table),
    rpc: (name: string, args: unknown): unknown => mockRpc(name, args),
  },
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    debug: jest.fn(),
    error: (...args: unknown[]): unknown => mockLoggerError(...args),
  },
}));

import {
  SYNC_PULL_ERROR_CODES,
  pullChanges,
  pullMarketRateObservations,
  pullMarketRates,
  pullMetalDedicatedTable,
  pullMetalHoldingStates,
} from "../../services/sync/pull-strategies";
import { MARKET_RATE_VALUE_COLUMNS } from "@monyvi/logic";

function expectCompletedPullResult(
  value: SyncPullResult
): asserts value is Extract<
  SyncPullResult,
  { readonly changes: unknown; readonly timestamp: number }
> {
  const isCompleted = "changes" in value && "timestamp" in value;
  expect(isCompleted).toBe(true);
  if (!isCompleted) {
    throw new Error("Expected a completed pull result");
  }
}

const VALID_MARKET_RATE = {
  ...Object.fromEntries(MARKET_RATE_VALUE_COLUMNS.map((column) => [column, 1])),
  id: "rate-1",
  created_at: "2026-05-18T08:00:00.000Z",
  updated_at: "2026-05-18T08:00:00.000Z",
};

function makeSelectChain(
  result: SupabaseResult = { data: [], error: null }
): SelectChain {
  const chain: SelectChain = {
    select: jest.fn((): SelectChain => chain),
    eq: jest.fn((): SelectChain => chain),
    gt: jest.fn((): SelectChain => chain),
    lte: jest.fn((): SelectChain => chain),
    or: jest.fn((): SelectChain => chain),
    in: jest.fn((): SelectChain => chain),
    limit: jest.fn((): SelectChain => chain),
    order: jest.fn((): SelectChain => chain),
    then: (
      resolve: (value: SupabaseResult) => unknown,
      reject?: (reason: unknown) => unknown
    ) =>
      Promise.resolve({
        ...result,
        count: result.count ?? result.data?.length ?? 0,
      }).then(resolve, reject),
  };

  return chain;
}

function getFirstChain(table: string): SelectChain {
  const chains = tableChains.get(table);
  if (!chains || chains.length === 0) {
    throw new Error(`Missing Supabase chain for ${table}`);
  }

  return chains[0];
}

function getChainSelecting(
  table: string,
  expectedSelection: string
): SelectChain {
  const chain = tableChains
    .get(table)
    ?.find((candidate) =>
      candidate.select.mock.calls.some(
        ([selection]: readonly [unknown]) =>
          typeof selection === "string" && selection.includes(expectedSelection)
      )
    );

  if (!chain) {
    throw new Error(
      `Missing Supabase chain for ${table} selecting ${expectedSelection}`
    );
  }

  return chain;
}

beforeEach(() => {
  jest.clearAllMocks();
  tableChains.clear();
  mockGetCurrentUserId.mockResolvedValue("current-user");
  mockRpc.mockResolvedValue({
    data: {
      hasMore: false,
      nextCursor: null,
      rows: [],
      upperWatermark: "2026-05-18T08:05:00.000Z",
    },
    error: null,
  });
  mockFrom.mockImplementation((table: string) => {
    const result =
      table === "financial_action_groups"
        ? {
            data: [
              {
                id: "11111111-1111-4111-8111-000000000001",
                action_id: "action-1",
                user_id: "current-user",
                account_guards_json_text: "[]",
                outcome_json_text: null,
                payload_json_text: '{"kind":"add"}',
                deleted: false,
                updated_at: "2026-05-18T08:02:00.000Z",
              },
            ],
            error: null,
          }
        : table === "metal_action_evidence"
          ? {
              data: [
                {
                  id: "11111111-1111-4111-8111-000000000002",
                  action_id: "action-1",
                  user_id: "current-user",
                  canonical_holding_revision_text: "0",
                  domain_payload_json_text:
                    '{"holdingId":"11111111-1111-4111-8111-000000000007"}',
                  expected_holding_revision_text: null,
                  deleted: false,
                  updated_at: "2026-05-18T08:02:00.000Z",
                },
              ],
              error: null,
            }
          : table === "metal_lifecycle_events"
            ? {
                data: [
                  {
                    id: "11111111-1111-4111-8111-000000000003",
                    action_id: "action-1",
                    user_id: "current-user",
                    payload_json_text:
                      '{"holdingId":"11111111-1111-4111-8111-000000000007"}',
                    deleted: false,
                    updated_at: "2026-05-18T08:02:00.000Z",
                  },
                ],
                error: null,
              }
            : table === "metal_rate_references"
              ? {
                  data: [
                    {
                      id: "11111111-1111-4111-8111-000000000004",
                      action_id: "action-1",
                      user_id: "current-user",
                      value_decimal_text: "3510.500000000000000001",
                      deleted: false,
                      updated_at: "2026-05-18T08:02:00.000Z",
                    },
                  ],
                  error: null,
                }
              : table === "assets"
                ? {
                    data: [
                      {
                        id: "11111111-1111-4111-8111-000000000007",
                        deleted: false,
                        purchase_currency: "EGP",
                        updated_at: "2026-05-18T08:02:00.000Z",
                        purchase_price_decimal_text: "100000.125",
                        acquisition_action_id: "action-1",
                      },
                    ],
                    error: null,
                  }
                : table === "asset_metals"
                  ? {
                      data: [
                        {
                          id: "11111111-1111-4111-8111-000000000005",
                          asset_id: "11111111-1111-4111-8111-000000000007",
                          deleted: false,
                          weight_grams_decimal_text: "10.125",
                          updated_at: "2026-05-18T08:02:00.000Z",
                          sync_owner: { user_id: "current-user" },
                          purity_factor_decimal_text: "0.999",
                        },
                      ],
                      error: null,
                    }
                  : table === "metal_holding_states"
                    ? {
                        data: [
                          {
                            id: "11111111-1111-4111-8111-000000000006",
                            user_id: "current-user",
                            holding_id: "11111111-1111-4111-8111-000000000007",
                            financial_revision_text: "9223372036854775807",
                            deleted: false,
                            created_at: "2026-05-18T08:01:00.000Z",
                            updated_at: "2026-05-18T08:02:00.000Z",
                          },
                        ],
                        error: null,
                      }
                    : table === "market_rates"
                      ? { data: [VALID_MARKET_RATE], error: null }
                      : { data: [], error: null };
    const chain = makeSelectChain(result);
    const chains = tableChains.get(table) ?? [];
    chains.push(chain);
    tableChains.set(table, chains);

    return chain;
  });
});

describe("pullChanges", () => {
  it("dispatches each syncable table through its scoped pull strategy", async () => {
    const result = await pullChanges(Date.UTC(2026, 4, 18, 8), "current-user");
    expectCompletedPullResult(result);

    expect(result.timestamp).toBe(Date.UTC(2026, 4, 18, 8, 5));
    // First page: only the cursor and page size are sent. p_upper_watermark is
    // omitted because the RPC declares it DEFAULT NULL, so the exact-match
    // expectation below also proves the key is absent rather than null.
    expect(mockRpc).toHaveBeenNthCalledWith(
      1,
      "pull_metal_observations_page_v1",
      {
        p_after_created_at: "2026-05-18T08:00:00.000Z",
        p_after_id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
        p_limit: 500,
      }
    );

    expect(getFirstChain("market_rates").select).toHaveBeenCalledWith("*");
    expect(getFirstChain("market_rates").gt).toHaveBeenCalledWith(
      "created_at",
      expect.any(String)
    );
    expect(getFirstChain("market_rates").order).toHaveBeenCalledWith(
      "created_at",
      { ascending: false }
    );

    expect(getFirstChain("daily_snapshot_balance").eq).toHaveBeenCalledWith(
      "user_id",
      "current-user"
    );
    expect(getFirstChain("daily_snapshot_balance").gt).toHaveBeenCalledWith(
      "created_at",
      "2026-05-18T08:00:00.000Z"
    );

    expect(getFirstChain("categories").or).toHaveBeenCalledWith(
      "user_id.eq.current-user,user_id.is.null"
    );
    expect(getFirstChain("categories").gt).toHaveBeenCalledWith(
      "updated_at",
      "2026-05-18T08:00:00.000Z"
    );

    expect(getFirstChain("assets").eq).toHaveBeenCalledWith(
      "user_id",
      "current-user"
    );
    expect(getFirstChain("asset_metals").eq).toHaveBeenCalledWith(
      "sync_owner.user_id",
      "current-user"
    );
    expect(getFirstChain("asset_metals").in).not.toHaveBeenCalled();
    expect(getFirstChain("asset_metals").gt).toHaveBeenCalledWith(
      "updated_at",
      "2026-05-18T08:00:00.000Z"
    );

    expect(getFirstChain("profiles").eq).toHaveBeenCalledWith(
      "user_id",
      "current-user"
    );
    expect(getFirstChain("profiles").gt).toHaveBeenCalledWith(
      "updated_at",
      "2026-05-18T08:00:00.000Z"
    );
    expect(getFirstChain("profiles").lte).toHaveBeenCalledWith(
      "updated_at",
      "2026-05-18T08:05:00.000Z"
    );

    expect(
      getChainSelecting("assets", "purchase_price_decimal_text").select
    ).toHaveBeenCalledWith(
      expect.stringContaining(
        "purchase_price_decimal_text:purchase_price_decimal::text"
      ),
      { count: "exact" }
    );
    expect(getFirstChain("asset_metals").select).toHaveBeenCalledWith(
      expect.stringContaining(
        "weight_grams_decimal_text:weight_grams_decimal::text"
      ),
      { count: "exact" }
    );
    expect(getFirstChain("metal_holding_states").select).toHaveBeenCalledWith(
      expect.stringContaining(
        "financial_revision_text:financial_revision::text"
      ),
      { count: "exact" }
    );
    for (const table of [
      "financial_action_groups",
      "metal_action_evidence",
      "metal_lifecycle_events",
      "metal_rate_references",
    ]) {
      expect(getFirstChain(table).eq).toHaveBeenCalledWith(
        "user_id",
        "current-user"
      );
      expect(getFirstChain(table).lte).toHaveBeenCalledWith(
        "updated_at",
        "2026-05-18T08:05:00.000Z"
      );
    }

    const changes = result.changes as Record<
      string,
      { readonly updated: ReadonlyArray<Record<string, unknown>> }
    >;
    expect(changes.assets?.updated[0]).toMatchObject({
      acquisition_action_id: "action-1",
      purchase_currency: "EGP",
      purchase_price_decimal: "100000.125",
    });
    expect(changes.asset_metals?.updated[0]).toMatchObject({
      purity_factor_decimal: "0.999",
      weight_grams_decimal: "10.125",
    });
    expect(changes.metal_holding_states?.updated[0]).toMatchObject({
      financial_revision: "9223372036854775807",
    });
    expect(changes.financial_action_groups?.updated[0]).toMatchObject({
      account_guards_json: "[]",
      id: "11111111-1111-4111-8111-000000000001",
      payload_json: '{"kind":"add"}',
    });
    expect(changes.metal_action_evidence?.updated[0]).toMatchObject({
      canonical_holding_revision: "0",
      domain_payload_json:
        '{"holdingId":"11111111-1111-4111-8111-000000000007"}',
      expected_holding_revision: null,
    });
    expect(changes.metal_lifecycle_events?.updated[0]).toMatchObject({
      payload_json: '{"holdingId":"11111111-1111-4111-8111-000000000007"}',
    });
    expect(changes.metal_rate_references?.updated[0]).toMatchObject({
      value_decimal: "3510.500000000000000001",
    });
  });

  it("fails without querying Supabase when the expected auth scope is lost", async () => {
    mockGetCurrentUserId.mockResolvedValue(null);

    await expect(pullChanges(null, "current-user")).rejects.toThrow(
      SYNC_PULL_ERROR_CODES.AUTH_SCOPE_LOST
    );
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe("pullMarketRateObservations", () => {
  it("paginates inside one server-frozen upper watermark and preserves exact text", async () => {
    mockRpc
      .mockResolvedValueOnce({
        data: {
          hasMore: true,
          nextCursor: {
            createdAt: "2026-05-18T08:01:00.000001Z",
            id: "018f0c7a-1234-7abc-8def-000000000001",
          },
          rows: [
            {
              id: "018f0c7a-1234-7abc-8def-000000000001",
              batchId: "018f0c7a-1234-7abc-8def-000000000011",
              instrumentCode: "metal:GOLD",
              valueDecimal: "12345678901234567890.123456789",
              unit: "usd_per_pure_gram",
              orientation: "quote_per_base",
              providerObservedAt: "2026-05-18T07:59:00.000Z",
              source: "fixture",
              quality: "valid",
              createdAt: "2026-05-18T08:01:00.000001Z",
            },
          ],
          upperWatermark: "2026-05-18T08:05:00.123456Z",
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          hasMore: false,
          nextCursor: null,
          rows: [
            {
              id: "018f0c7a-1234-7abc-8def-000000000002",
              batchId: "018f0c7a-1234-7abc-8def-000000000011",
              instrumentCode: "currency:EGP",
              valueDecimal:
                "0.020000000000000000000000000000000000000000000000001",
              unit: "usd_per_currency_unit",
              orientation: "quote_per_base",
              providerObservedAt: null,
              source: null,
              quality: "valid",
              createdAt: "2026-05-18T08:02:00.000Z",
            },
          ],
          upperWatermark: "2026-05-18T08:05:00.123456Z",
        },
        error: null,
      });

    const result = await pullMarketRateObservations("2026-05-18T08:00:00.000Z");

    expect(mockRpc).toHaveBeenNthCalledWith(
      2,
      "pull_metal_observations_page_v1",
      {
        p_after_created_at: "2026-05-18T08:01:00.000001Z",
        p_after_id: "018f0c7a-1234-7abc-8def-000000000001",
        p_limit: 500,
        p_upper_watermark: "2026-05-18T08:05:00.123456Z",
      }
    );
    expect(result.upperWatermark).toBe("2026-05-18T08:05:00.123456Z");
    expect(result.changes.updated).toHaveLength(2);
    expect(result.changes.updated[0]).toMatchObject({
      value_decimal: "12345678901234567890.123456789",
    });
    expect(result.changes.updated[1]).toMatchObject({
      value_decimal: "0.020000000000000000000000000000000000000000000000001",
    });
  });

  it("fails the pull when a later page changes the frozen watermark", async () => {
    mockRpc
      .mockResolvedValueOnce({
        data: {
          hasMore: true,
          nextCursor: {
            createdAt: "2026-05-18T08:01:00.000Z",
            id: "018f0c7a-1234-7abc-8def-000000000001",
          },
          rows: [
            {
              id: "018f0c7a-1234-7abc-8def-000000000001",
              batchId: "018f0c7a-1234-7abc-8def-000000000011",
              instrumentCode: "metal:GOLD",
              valueDecimal: "1.25",
              unit: "usd_per_pure_gram",
              orientation: "quote_per_base",
              providerObservedAt: null,
              source: null,
              quality: "valid",
              createdAt: "2026-05-18T08:01:00.000Z",
            },
          ],
          upperWatermark: "2026-05-18T08:05:00.000Z",
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          hasMore: false,
          nextCursor: null,
          rows: [],
          upperWatermark: "2026-05-18T08:06:00.000Z",
        },
        error: null,
      });

    await expect(pullMarketRateObservations(null)).rejects.toThrow(
      "sync_invalid_metal_observation_page"
    );
  });

  it("fails before advancing when a page cursor does not identify its last row", async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        hasMore: true,
        nextCursor: {
          createdAt: "2026-05-18T08:01:00.000Z",
          id: "018f0c7a-1234-7abc-8def-000000000099",
        },
        rows: [
          {
            id: "018f0c7a-1234-7abc-8def-000000000001",
            batchId: "018f0c7a-1234-7abc-8def-000000000011",
            instrumentCode: "metal:GOLD",
            valueDecimal: "1.25",
            unit: "usd_per_pure_gram",
            orientation: "quote_per_base",
            providerObservedAt: null,
            source: null,
            quality: "valid",
            createdAt: "2026-05-18T08:01:00.000Z",
          },
        ],
        upperWatermark: "2026-05-18T08:05:00.000Z",
      },
      error: null,
    });

    await expect(pullMarketRateObservations(null)).rejects.toThrow(
      "sync_invalid_metal_observation_page"
    );
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});

describe("pullMarketRates", () => {
  it("returns an empty changeset when the server has no recent market rates", async () => {
    mockFrom.mockReturnValue(makeSelectChain({ data: [], error: null }));

    await expect(pullMarketRates()).resolves.toEqual({
      created: [],
      updated: [],
      deleted: [],
    });
    expect(mockLoggerError).not.toHaveBeenCalled();
  });
});

describe("pullMetalHoldingStates", () => {
  it("paginates the complete bounded interval before returning", async () => {
    const rows = Array.from({ length: 501 }, (_, index) => ({
      id: `22222222-2222-4222-8222-${String(index).padStart(12, "0")}`,
      deleted: false,
      financial_revision_text: String(index),
      updated_at: `2026-05-18T08:02:${String(Math.floor(index / 10)).padStart(2, "0")}.000Z`,
    }));
    let page = 0;
    mockFrom.mockImplementation(() => {
      const offset = page * 500;
      page += 1;
      return makeSelectChain({
        data: rows.slice(offset, offset + 500),
        count: rows.length - offset,
        error: null,
      });
    });

    const result = await pullMetalHoldingStates(
      "current-user",
      null,
      "2026-05-18T08:05:00.000Z"
    );

    expect(result.updated).toHaveLength(501);
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  it("maps a server root to the settled local root by owner and action ID", async () => {
    mockFrom.mockReturnValue(
      makeSelectChain({
        data: [
          {
            id: "11111111-1111-4111-8111-000000000001",
            action_id: "action-1",
            user_id: "current-user",
            account_guards_json_text: "[]",
            outcome_json_text: '{"status":"accepted"}',
            payload_json_text: '{"kind":"add"}',
            deleted: false,
            updated_at: "2026-05-18T08:02:00.000Z",
          },
        ],
        error: null,
      })
    );
    const database = {
      get: jest.fn(() => ({
        query: jest.fn(() => ({
          fetch: jest.fn(() =>
            Promise.resolve([
              {
                actionId: "action-1",
                id: "local-root-1",
                userId: "current-user",
                state: "accepted",
              },
            ])
          ),
        })),
      })),
    };

    const result = await pullMetalDedicatedTable(
      "financial_action_groups",
      "current-user",
      null,
      "2026-05-18T08:05:00.000Z",
      database as never
    );

    expect(result.updated).toEqual([
      expect.objectContaining({
        action_id: "action-1",
        id: "local-root-1",
        outcome_json: '{"status":"accepted"}',
      }),
    ]);
  });
});
