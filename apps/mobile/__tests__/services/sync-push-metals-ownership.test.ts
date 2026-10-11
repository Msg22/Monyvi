const mockGetCurrentUserId = jest.fn();
const mockFrom = jest.fn();
const mockUpsert = jest.fn();
const mockRpc = jest.fn();
const mockCommitMetalOutcome = jest.fn();
const mockCommitMetadataOutcome = jest.fn();
const mockReadMixedOutcome = jest.fn();

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
      metal_metadata_edit_outcomes: {},
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

jest.mock("../../services/metal-metadata-evidence-reconciliation", () => ({
  commitCanonicalMetalMetadataEditOutcomeLocally: (
    ...args: readonly unknown[]
  ): unknown => mockCommitMetadataOutcome(...args),
  discardRejectedMixedMetadataEvidence: jest.fn(),
}));
jest.mock("../../services/metal-metadata-server-outcome-service", () => ({
  readCanonicalMixedMetalMetadataOutcome: (
    ...args: readonly unknown[]
  ): unknown => mockReadMixedOutcome(...args),
}));

import { readRejectedIdsForTable } from "../../services/sync/account-protected-fields";
import {
  pushChanges,
  pushMetalDedicatedChanges,
} from "../../services/sync/push-service";

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

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCurrentUserId.mockResolvedValue(USER_ID);
  mockFrom.mockReturnValue({ upsert: mockUpsert });
  mockUpsert.mockResolvedValue({ error: null });
  mockCommitMetalOutcome.mockResolvedValue("accepted");
  mockCommitMetadataOutcome.mockResolvedValue(undefined);
});

describe("pushChanges Metals ownership scoping", () => {
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

    mockCommitMetalOutcome.mockResolvedValueOnce("incomplete");
    const unsettled = await pushChanges(database, { changes, lastPulledAt: 0 });
    expect(unsettled).toBeDefined();
    expect(
      readRejectedIdsForTable(
        unsettled?.experimentalRejectedIds,
        "financial_action_groups"
      )
    ).toContain(actionId);
  });
});

describe("#363 legacy metadata push safety", () => {
  it("fails closed rather than acknowledging a METAL asset Name/Notes edit with no durable request", async () => {
    await expect(
      pushMetalDedicatedChanges(
        makeScopedDatabase([]),
        {
          assets: {
            created: [],
            updated: [
              {
                id: "20000000-0000-4000-8000-000000000022",
                user_id: USER_ID,
                type: "METAL",
                name: "Unversioned rename",
                _changed: "name,notes",
              },
            ],
            deleted: [],
          },
        },
        USER_ID
      )
    ).rejects.toThrow("metal_metadata_edit_request_missing");
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe("#363 generic sync dispatch for a mixed financial CAS loser", () => {
  it("commits its independently applied metadata outcome through dedicated sync and never upserts outcome rows", async () => {
    const actionId = "10000000-0000-4000-8000-000000000021";
    const holdingId = "20000000-0000-4000-8000-000000000022";
    mockGetCurrentUserId.mockResolvedValue(USER_ID);
    mockFrom.mockReturnValue({ upsert: mockUpsert });
    mockUpsert.mockResolvedValue({ error: null });
    mockCommitMetalOutcome.mockResolvedValue("reconciled");
    const payloadJson = JSON.stringify({
      actionId,
      domainReferenceId: holdingId,
      kind: "correct",
      payload: {
        holdingId,
        expectedHoldingRevision: "0",
        materialCorrection: null,
        metadataChange: {
          before: { name: "Old", notes: null },
          after: { name: "New", notes: null },
        },
      },
      userId: USER_ID,
    });
    const root = {
      id: actionId,
      action_id: actionId,
      user_id: USER_ID,
      domain: "metals",
      domain_reference_id: holdingId,
      kind: "correct",
      payload_json: payloadJson,
      payload_hash: "a".repeat(64),
    };
    const fragment = {
      id: actionId,
      action_id: actionId,
      holding_id: holdingId,
      user_id: USER_ID,
      kind: "correct",
    };
    const metadataOutcome = {
      editId: actionId,
      holdingId,
      status: "applied",
      appliedChanges: {
        name: {
          before: "Old",
          after: "New",
          clock: { writtenAt: 100, writerId: actionId },
        },
      },
      canonicalMetadata: {
        name: { value: "New", writtenAt: 100, writerId: actionId },
        notes: null,
      },
    };
    mockReadMixedOutcome.mockResolvedValue(metadataOutcome);
    mockRpc.mockResolvedValue({
      data: {
        actionId,
        status: "stale",
        code: "HOLDING_REVISION_STALE",
        canonicalHoldingRevision: "1",
        canonicalHoldingActionId: "another-action",
        canonicalHoldingEvidenceHash: "b".repeat(64),
        canonicalAccounts: [],
        staleAccountIds: [],
      },
      error: null,
    });
    const database = makeScopedDatabase([root]);
    await pushChanges(database, {
      lastPulledAt: 0,
      changes: {
        financial_action_groups: { created: [root], updated: [], deleted: [] },
        metal_action_evidence: {
          created: [fragment],
          updated: [],
          deleted: [],
        },
        metal_lifecycle_events: {
          created: [fragment],
          updated: [],
          deleted: [],
        },
        metal_holding_states: {
          created: [],
          updated: [
            {
              id: holdingId,
              holding_id: holdingId,
              effective_action_id: actionId,
              user_id: USER_ID,
            },
          ],
          deleted: [],
        },
        metal_metadata_edit_outcomes: {
          created: [
            {
              id: actionId,
              action_id: actionId,
              holding_id: holdingId,
              user_id: USER_ID,
              status: "pending",
              occurred_at: 100,
              payload_hash: root.payload_hash,
              request_json: payloadJson,
            },
          ],
          updated: [],
          deleted: [],
        },
      },
    });
    expect(mockReadMixedOutcome).toHaveBeenCalledWith(
      actionId,
      holdingId,
      USER_ID,
      root.payload_hash
    );
    expect(mockCommitMetadataOutcome).toHaveBeenCalledWith(
      database,
      metadataOutcome,
      actionId,
      holdingId,
      USER_ID
    );
    expect(mockFrom).not.toHaveBeenCalledWith("metal_metadata_edit_outcomes");
    expect(mockRpc).toHaveBeenCalledWith(
      "apply_metal_action_v1",
      expect.any(Object)
    );
  });
});

describe("#363 unresolved mixed metadata sync safety", () => {
  it("does not acknowledge a durable mixed edit whose financial action has no complete RPC group", async () => {
    const actionId = "10000000-0000-4000-8000-000000000021";
    const holdingId = "20000000-0000-4000-8000-000000000022";
    const requestJson = JSON.stringify({
      actionId,
      domainReferenceId: holdingId,
      userId: USER_ID,
      kind: "correct",
      occurredAt: "2026-10-10T12:00:00.000Z",
      payload: {
        metadataChange: {
          before: { name: "Before", notes: null },
          after: { name: "After", notes: null },
        },
      },
    });
    const database = makeScopedDatabase([]);
    await expect(
      pushMetalDedicatedChanges(
        database,
        {
          financial_action_groups: {
            created: [
              {
                id: actionId,
                action_id: actionId,
                user_id: USER_ID,
                domain: "metals",
                kind: "correct",
                domain_reference_id: holdingId,
                payload_json: requestJson,
                payload_hash: "a".repeat(64),
              },
            ],
            updated: [],
            deleted: [],
          },
          metal_metadata_edit_outcomes: {
            created: [
              {
                id: actionId,
                action_id: actionId,
                user_id: USER_ID,
                holding_id: holdingId,
                occurred_at: Date.parse("2026-10-10T12:00:00.000Z"),
                payload_hash: "a".repeat(64),
                request_json: requestJson,
                status: "pending",
              },
            ],
            updated: [],
            deleted: [],
          },
        },
        USER_ID
      )
    ).rejects.toThrow("metal_metadata_canonical_outcome_unavailable");
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockCommitMetadataOutcome).not.toHaveBeenCalled();
  });
});
