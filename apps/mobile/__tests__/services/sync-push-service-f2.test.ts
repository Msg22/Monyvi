const mockGetCurrentUserId = jest.fn();
const mockFrom = jest.fn();
const mockUpsert = jest.fn();
const mockRpc = jest.fn();
const mockMarkSyncFailed = jest.fn();
const mockMarkSyncPending = jest.fn();
const mockRecordOutcome = jest.fn();
const mockCommitMetalOutcome = jest.fn();

jest.mock("@monyvi/db", () => ({
  schema: {
    tables: {
      account_financial_effects: {},
      accounts: {},
      asset_metals: {},
      assets: {},
      categories: {},
      financial_action_groups: {},
      profiles: {},
      transactions: {},
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
  markFinancialActionGroupSyncFailed: (...args: readonly unknown[]): unknown =>
    mockMarkSyncFailed(...args),
  markFinancialActionGroupSyncPending: (...args: readonly unknown[]): unknown =>
    mockMarkSyncPending(...args),
  recordFinancialActionGroupServerOutcome: (
    ...args: readonly unknown[]
  ): unknown => mockRecordOutcome(...args),
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

interface A2GroupIds {
  readonly actionIdA1: string;
  readonly actionIdA2: string;
  readonly holdingId: string;
  readonly predecessorEventId: string;
  readonly a2EvidenceId: string;
  readonly a2EventId: string;
  readonly a2StateId: string;
}

function buildExactA2Changes(ids: A2GroupIds): PushChangesArgs["changes"] {
  const payloadJson = JSON.stringify({
    actionId: ids.actionIdA2,
    domainReferenceId: ids.holdingId,
    kind: "correct",
    payload: { holdingId: ids.holdingId, rateSnapshots: [] },
    userId: USER_ID,
  });
  return {
    financial_action_groups: {
      created: [
        {
          id: ids.actionIdA2,
          action_id: ids.actionIdA2,
          domain: "metals",
          domain_reference_id: ids.holdingId,
          kind: "correct",
          user_id: USER_ID,
          payload_hash: "d".repeat(64),
          payload_json: payloadJson,
          state: "sync_pending",
          server_outcome: null,
          outcome_json: null,
          rejection_code: null,
        },
      ],
      updated: [],
      deleted: [],
    },
    metal_action_evidence: {
      created: [
        {
          id: ids.a2EvidenceId,
          action_id: ids.actionIdA2,
          holding_id: ids.holdingId,
          kind: "correct",
          user_id: USER_ID,
        },
      ],
      updated: [
        {
          id: ids.predecessorEventId,
          action_id: ids.actionIdA1,
          holding_id: ids.holdingId,
          kind: "created",
          user_id: USER_ID,
          is_effective: true,
          predecessor_event_id: null,
        },
      ],
      deleted: [],
    },
    metal_lifecycle_events: {
      created: [
        {
          id: ids.a2EventId,
          action_id: ids.actionIdA2,
          holding_id: ids.holdingId,
          kind: "correct",
          user_id: USER_ID,
        },
      ],
      updated: [
        {
          id: ids.predecessorEventId,
          action_id: ids.actionIdA1,
          holding_id: ids.holdingId,
          kind: "created",
          user_id: USER_ID,
          is_effective: true,
          predecessor_event_id: null,
        },
      ],
      deleted: [],
    },
    metal_holding_states: {
      created: [
        {
          id: ids.a2StateId,
          holding_id: ids.holdingId,
          effective_action_id: ids.actionIdA2,
          user_id: USER_ID,
        },
      ],
      updated: [],
      deleted: [],
    },
    metal_rate_references: {
      created: [],
      updated: [],
      deleted: [],
    },
    assets: {
      created: [],
      updated: [
        { id: ids.holdingId, type: "METAL", user_id: USER_ID, name: "Gold" },
      ],
      deleted: [],
    },
    asset_metals: {
      created: [],
      updated: [
        { id: ids.holdingId, asset_id: ids.holdingId, metal_type: "GOLD" },
      ],
      deleted: [],
    },
  };
}

interface LocalActionRoot {
  readonly id: string;
  readonly actionId: string;
  readonly domain: string;
  readonly domainReferenceId: string;
  readonly kind: string;
  readonly userId: string;
  readonly state: string;
  readonly serverOutcome: string | null;
  readonly outcomeJson: string;
  readonly rejectionCode: string | null;
  readonly deleted: boolean;
}

function localRoot(
  ids: A2GroupIds,
  overrides: Partial<LocalActionRoot>
): LocalActionRoot {
  return {
    id: ids.actionIdA1,
    actionId: ids.actionIdA1,
    domain: "metals",
    domainReferenceId: ids.holdingId,
    kind: "add",
    userId: USER_ID,
    state: "accepted",
    serverOutcome: "accepted",
    outcomeJson: "{}",
    rejectionCode: null,
    deleted: false,
    ...overrides,
  };
}

interface ScopedDatabase {
  readonly database: PushChangesDatabase;
  readonly getMock: jest.Mock;
  readonly queryArgs: unknown[][];
}

function makeScopedDatabase(
  fetchedRoots: readonly LocalActionRoot[]
): ScopedDatabase {
  // Owned holdings are proven through the `assets` parent lookup, so that table
  // must answer with holding ids derived from the action roots' domain
  // reference. Returning the roots for every table would resolve the parent
  // lookup to action ids and reject the owned `asset_metals` rows.
  const ownedAssets = fetchedRoots.map((root) => ({
    id: root.domainReferenceId,
  }));
  const queryArgs: unknown[][] = [];
  const getMock = jest.fn((table: string) => ({
    query: jest.fn((...args: readonly unknown[]) => {
      queryArgs.push([...args]);
      return {
        fetch: jest
          .fn()
          .mockResolvedValue(table === "assets" ? ownedAssets : fetchedRoots),
      };
    }),
  }));
  const database = { get: getMock } as unknown as PushChangesDatabase;
  return { database, getMock, queryArgs };
}

function readRejectedIds(result: unknown): Record<string, readonly string[]> {
  if (typeof result !== "object" || result === null) return {};
  const rejected = (
    result as {
      readonly experimentalRejectedIds?: Record<string, readonly string[]>;
    }
  ).experimentalRejectedIds;
  return rejected ?? {};
}

function expectScopedTerminalLookup(
  scoped: ScopedDatabase,
  holdingId: string
): void {
  expect(scoped.getMock).toHaveBeenCalledWith("financial_action_groups");
  const scope = JSON.stringify(scoped.queryArgs);
  expect(scope).toContain(USER_ID);
  expect(scope).toContain(holdingId);
  expect(scope).toContain("metals");
}

describe("pushChanges F2 - absent-predecessor terminal acknowledgment", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUserId.mockResolvedValue(USER_ID);
    mockFrom.mockReturnValue({
      upsert: mockUpsert,
    });
    mockUpsert.mockResolvedValue({ error: null });
    mockMarkSyncFailed.mockResolvedValue(undefined);
    mockMarkSyncPending.mockResolvedValue(undefined);
    mockRecordOutcome.mockResolvedValue(undefined);
    mockCommitMetalOutcome.mockResolvedValue("accepted");
  });

  it("acknowledges an exact A2 group when absent A1 is accepted+accepted locally", async () => {
    const ids: A2GroupIds = {
      actionIdA1: "10000000-0000-4000-8000-000000000051",
      actionIdA2: "10000000-0000-4000-8000-000000000052",
      holdingId: "20000000-0000-4000-8000-000000000053",
      predecessorEventId: "30000000-0000-4000-8000-000000000054",
      a2EvidenceId: "40000000-0000-4000-8000-000000000055",
      a2EventId: "50000000-0000-4000-8000-000000000056",
      a2StateId: "60000000-0000-4000-8000-000000000057",
    };
    const scoped = makeScopedDatabase([
      localRoot(ids, { state: "accepted", serverOutcome: "accepted" }),
    ]);
    mockRpc.mockResolvedValue({
      data: {
        actionId: ids.actionIdA2,
        status: "accepted",
        holdingRevision: "0",
      },
      error: null,
    });

    const result = await pushChanges(scoped.database, {
      changes: buildExactA2Changes(ids),
      lastPulledAt: 0,
    });

    expect(result).toBeUndefined();
    expect(mockRpc).toHaveBeenCalledWith(
      "apply_metal_action_v1",
      expect.any(Object)
    );
    expectScopedTerminalLookup(scoped, ids.holdingId);
  });

  it("acknowledges an exact A2 group when absent A1 is reconciled+stale locally", async () => {
    const ids: A2GroupIds = {
      actionIdA1: "10000000-0000-4000-8000-000000000061",
      actionIdA2: "10000000-0000-4000-8000-000000000062",
      holdingId: "20000000-0000-4000-8000-000000000063",
      predecessorEventId: "30000000-0000-4000-8000-000000000064",
      a2EvidenceId: "40000000-0000-4000-8000-000000000065",
      a2EventId: "50000000-0000-4000-8000-000000000066",
      a2StateId: "60000000-0000-4000-8000-000000000067",
    };
    const scoped = makeScopedDatabase([
      localRoot(ids, { state: "reconciled", serverOutcome: "stale" }),
    ]);
    mockRpc.mockResolvedValue({
      data: {
        actionId: ids.actionIdA2,
        status: "accepted",
        holdingRevision: "0",
      },
      error: null,
    });

    const result = await pushChanges(scoped.database, {
      changes: buildExactA2Changes(ids),
      lastPulledAt: 0,
    });

    expect(result).toBeUndefined();
    expect(mockRpc).toHaveBeenCalledWith(
      "apply_metal_action_v1",
      expect.any(Object)
    );
    expectScopedTerminalLookup(scoped, ids.holdingId);
  });

  it("withholds batch acknowledgment when absent A1 is reconciliation_incomplete+rejected", async () => {
    const ids: A2GroupIds = {
      actionIdA1: "10000000-0000-4000-8000-000000000071",
      actionIdA2: "10000000-0000-4000-8000-000000000072",
      holdingId: "20000000-0000-4000-8000-000000000073",
      predecessorEventId: "30000000-0000-4000-8000-000000000074",
      a2EvidenceId: "40000000-0000-4000-8000-000000000075",
      a2EventId: "50000000-0000-4000-8000-000000000076",
      a2StateId: "60000000-0000-4000-8000-000000000077",
    };
    const scoped = makeScopedDatabase([
      localRoot(ids, {
        state: "reconciliation_incomplete",
        serverOutcome: "rejected",
      }),
    ]);
    mockRpc.mockResolvedValue({
      data: {
        actionId: ids.actionIdA2,
        status: "accepted",
        holdingRevision: "0",
      },
      error: null,
    });

    const result = await pushChanges(scoped.database, {
      changes: buildExactA2Changes(ids),
      lastPulledAt: 0,
    });

    expect(mockRpc).toHaveBeenCalledWith(
      "apply_metal_action_v1",
      expect.any(Object)
    );
    expectScopedTerminalLookup(scoped, ids.holdingId);
    expect(result).toBeDefined();
    const rejected = readRejectedIds(result);
    expect(rejected["financial_action_groups"] ?? []).not.toContain(
      ids.actionIdA2
    );
    expect(rejected["metal_action_evidence"] ?? []).toContain(
      ids.predecessorEventId
    );
  });

  it("withholds batch acknowledgment when the local predecessor is still pending", async () => {
    const ids: A2GroupIds = {
      actionIdA1: "10000000-0000-4000-8000-000000000081",
      actionIdA2: "10000000-0000-4000-8000-000000000082",
      holdingId: "20000000-0000-4000-8000-000000000083",
      predecessorEventId: "30000000-0000-4000-8000-000000000084",
      a2EvidenceId: "40000000-0000-4000-8000-000000000085",
      a2EventId: "50000000-0000-4000-8000-000000000086",
      a2StateId: "60000000-0000-4000-8000-000000000087",
    };
    // A pending predecessor carries no server outcome, so the scoped lookup
    // (server_outcome oneOf accepted/idempotent/stale/rejected) excludes it;
    // even if such a row is fetched, the terminal-pair filter must not treat
    // it as safe. Foreign-user roots never reach the filter because the query
    // itself scopes user_id to the current owner.
    const scoped = makeScopedDatabase([
      localRoot(ids, { state: "sync_pending", serverOutcome: null }),
    ]);
    mockRpc.mockResolvedValue({
      data: {
        actionId: ids.actionIdA2,
        status: "accepted",
        holdingRevision: "0",
      },
      error: null,
    });

    const result = await pushChanges(scoped.database, {
      changes: buildExactA2Changes(ids),
      lastPulledAt: 0,
    });

    expect(mockRpc).toHaveBeenCalledWith(
      "apply_metal_action_v1",
      expect.any(Object)
    );
    expectScopedTerminalLookup(scoped, ids.holdingId);
    expect(result).toBeDefined();
    const rejected = readRejectedIds(result);
    expect(rejected["financial_action_groups"] ?? []).not.toContain(
      ids.actionIdA2
    );
    expect(rejected["metal_lifecycle_events"] ?? []).toContain(
      ids.predecessorEventId
    );
  });

  it("blocks an incomplete A2 group before any RPC while still consulting the terminal lookup", async () => {
    const ids: A2GroupIds = {
      actionIdA1: "10000000-0000-4000-8000-000000000091",
      actionIdA2: "10000000-0000-4000-8000-000000000092",
      holdingId: "20000000-0000-4000-8000-000000000093",
      predecessorEventId: "30000000-0000-4000-8000-000000000094",
      a2EvidenceId: "40000000-0000-4000-8000-000000000095",
      a2EventId: "50000000-0000-4000-8000-000000000096",
      a2StateId: "60000000-0000-4000-8000-000000000097",
    };
    const scoped = makeScopedDatabase([
      localRoot(ids, { state: "accepted", serverOutcome: "accepted" }),
    ]);
    mockRpc.mockResolvedValue({
      data: {
        actionId: ids.actionIdA2,
        status: "accepted",
        holdingRevision: "0",
      },
      error: null,
    });
    const changes = buildExactA2Changes(ids);
    const incomplete = {
      ...changes,
      metal_lifecycle_events: { created: [], updated: [], deleted: [] },
    };

    const result = await pushChanges(scoped.database, {
      changes: incomplete,
      lastPulledAt: 0,
    });

    expect(mockRpc).not.toHaveBeenCalled();
    expectScopedTerminalLookup(scoped, ids.holdingId);
    expect(result).toBeDefined();
    expect(readRejectedIds(result)["financial_action_groups"] ?? []).toContain(
      ids.actionIdA2
    );
  });
});
