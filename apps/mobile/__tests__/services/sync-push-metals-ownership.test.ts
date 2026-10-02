const mockGetCurrentUserId = jest.fn();
const mockFrom = jest.fn();
const mockUpsert = jest.fn();
const mockRpc = jest.fn();
const mockCommitMetalOutcome = jest.fn();

jest.mock("@monyvi/db", () => ({
  schema: {
    tables: {
      account_financial_effects: {},
      accounts: {},
      asset_metals: {},
      assets: {},
      financial_action_groups: {},
      metal_action_evidence: {},
      metal_holding_states: {},
      metal_lifecycle_events: {},
      profiles: {},
    },
  },
}));

jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string | null> =>
    mockGetCurrentUserId() as Promise<string | null>,
  supabase: {
    from: (table: string): unknown => mockFrom(table),
    rpc: (...args: readonly unknown[]): Promise<unknown> =>
      mockRpc(...args) as Promise<unknown>,
  },
}));

jest.mock("../../services/financial-action-foundation-repository", () => ({
  markFinancialActionGroupSyncFailed: jest.fn(),
  markFinancialActionGroupSyncPending: jest.fn(),
  recordFinancialActionGroupServerOutcome: jest.fn(),
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("../../services/metal-reconciliation-service", () => ({
  commitMetalRpcOutcomeLocally: (...args: readonly unknown[]): unknown =>
    mockCommitMetalOutcome(...args),
}));

import { pushChanges } from "../../services/sync/push-service";

type PushChangesDatabase = Parameters<typeof pushChanges>[0];
type PushChangesArgs = Parameters<typeof pushChanges>[1];

const USER_ID = "current-user";
const FOREIGN_USER_ID = "prior-user";

/**
 * Owned Metal holdings are proven through the `assets` parent lookup, so that
 * table must answer with holding ids derived from the action roots' domain
 * reference. Answering every table with the roots would resolve the parent
 * lookup to action ids and reject the owned `asset_metals` rows.
 */
function makeScopedDatabase(
  fetchedRoots: ReadonlyArray<Record<string, unknown>>
): PushChangesDatabase {
  const ownedAssets = fetchedRoots
    .filter((root) => typeof root["domain_reference_id"] === "string")
    .map((root) => ({ id: root["domain_reference_id"] }));
  const get = jest.fn((table: string) => ({
    query: jest.fn(() => ({
      fetch: jest
        .fn()
        .mockResolvedValue(table === "assets" ? ownedAssets : fetchedRoots),
    })),
  }));
  return { get } as unknown as PushChangesDatabase;
}

describe("pushChanges Metals ownership scoping", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUserId.mockResolvedValue(USER_ID);
    mockFrom.mockReturnValue({ upsert: mockUpsert });
    mockUpsert.mockResolvedValue({ error: null });
    mockCommitMetalOutcome.mockResolvedValue("accepted");
  });

  it("scopes a foreign Metal action out before the RPC while acknowledging only the owned action", async () => {
    const actionId = "10000000-0000-4000-8000-000000000021";
    const holdingId = "20000000-0000-4000-8000-000000000022";
    const roots = [
      {
        id: actionId,
        action_id: actionId,
        domain: "metals",
        domain_reference_id: holdingId,
        kind: "add",
        user_id: USER_ID,
        payload_hash: "hash",
        payload_json: JSON.stringify({
          actionId,
          domainReferenceId: holdingId,
          kind: "add",
          payload: { holdingId, rateSnapshots: [] },
          userId: USER_ID,
        }),
      },
      {
        id: "foreign-metal-action",
        user_id: FOREIGN_USER_ID,
        domain: "metals",
        payload_json: "{invalid-json",
      },
    ];
    const database = makeScopedDatabase(roots);
    const changes: PushChangesArgs["changes"] = {
      financial_action_groups: {
        created: roots,
        updated: [],
        deleted: [],
      },
      metal_action_evidence: {
        created: [
          {
            id: actionId,
            action_id: actionId,
            holding_id: holdingId,
            kind: "add",
            user_id: USER_ID,
          },
        ],
        updated: [],
        deleted: [],
      },
      metal_lifecycle_events: {
        created: [
          {
            id: actionId,
            action_id: actionId,
            holding_id: holdingId,
            kind: "add",
            user_id: USER_ID,
          },
        ],
        updated: [],
        deleted: [],
      },
      metal_holding_states: {
        created: [
          {
            id: holdingId,
            holding_id: holdingId,
            effective_action_id: actionId,
            user_id: USER_ID,
          },
        ],
        updated: [],
        deleted: [],
      },
      assets: {
        created: [
          { id: holdingId, type: "METAL", user_id: USER_ID, name: "Gold 24K" },
        ],
        updated: [],
        deleted: [],
      },
      asset_metals: {
        created: [{ id: holdingId, asset_id: holdingId, metal_type: "GOLD" }],
        updated: [],
        deleted: [],
      },
    };
    mockRpc.mockResolvedValue({
      data: { actionId, status: "accepted", holdingRevision: "0" },
      error: null,
    });

    await expect(
      pushChanges(database, { changes, lastPulledAt: 0 })
    ).resolves.toEqual({
      experimentalRejectedIds: {
        financial_action_groups: ["foreign-metal-action"],
      },
    });

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith(
      "apply_metal_action_v1",
      expect.any(Object)
    );
    expect(mockFrom).not.toHaveBeenCalledWith("assets");
    expect(mockFrom).not.toHaveBeenCalledWith("asset_metals");
  });
});
