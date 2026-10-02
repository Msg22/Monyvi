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

interface GroupIds {
  readonly actionId: string;
  readonly holdingId: string;
  readonly evidenceId: string;
  readonly eventId: string;
  readonly stateId: string;
}

interface GroupChangesInput {
  readonly ids: GroupIds;
  readonly kind: "add" | "correct";
  readonly eventKind: string;
  readonly revision: string | null;
  readonly userId: string;
  readonly includeLifecycleRow: boolean;
  readonly rootHoldingId?: string;
  readonly rootKind?: string;
  readonly includeStateRow?: boolean;
}

function rootPayload(input: GroupChangesInput): string {
  return JSON.stringify({
    actionId: input.ids.actionId,
    domainReferenceId: input.ids.holdingId,
    kind: input.kind,
    payload: {
      expectedHoldingRevision: input.revision,
      holdingId: input.ids.holdingId,
      rateSnapshots: [],
    },
    userId: input.userId,
  });
}

interface TableSlice {
  readonly created: ReadonlyArray<Record<string, unknown>>;
  readonly updated: ReadonlyArray<Record<string, unknown>>;
  readonly deleted: ReadonlyArray<string>;
}

interface MetalsGroupSlices {
  readonly financial_action_groups: TableSlice;
  readonly metal_action_evidence: TableSlice;
  readonly metal_lifecycle_events: TableSlice;
  readonly metal_holding_states: TableSlice;
}

function groupChanges(input: GroupChangesInput, hash: string): MetalsGroupSlices {
  return {
    financial_action_groups: {
      created: [
        {
          id: input.ids.actionId,
          action_id: input.ids.actionId,
          domain: "metals",
          domain_reference_id: input.rootHoldingId ?? input.ids.holdingId,
          kind: input.rootKind ?? input.kind,
          user_id: input.userId,
          payload_hash: hash,
          payload_json: rootPayload(input),
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
          id: input.ids.evidenceId,
          action_id: input.ids.actionId,
          holding_id: input.ids.holdingId,
          kind: input.kind,
          user_id: input.userId,
        },
      ],
      updated: [],
      deleted: [],
    },
    metal_lifecycle_events: {
      created: input.includeLifecycleRow
        ? [
            {
              id: input.ids.eventId,
              action_id: input.ids.actionId,
              holding_id: input.ids.holdingId,
              kind: input.eventKind,
              user_id: input.userId,
            },
          ]
        : [],
      updated: [],
      deleted: [],
    },
    metal_holding_states: {
      created:
        input.includeStateRow === false
          ? []
          : [
              {
                id: input.ids.stateId,
                holding_id: input.ids.holdingId,
                effective_action_id: input.ids.actionId,
                user_id: input.userId,
              },
            ],
      updated: [],
      deleted: [],
    },
  };
}

function mergeSlices(first: TableSlice, second: TableSlice): TableSlice {
  return {
    created: [...first.created, ...second.created],
    updated: [...first.updated, ...second.updated],
    deleted: [],
  };
}

function mergeGroupChanges(
  first: MetalsGroupSlices,
  second: MetalsGroupSlices,
  firstHolding: string,
  secondHolding: string
): PushChangesArgs["changes"] {
  return {
    financial_action_groups: {
      ...mergeSlices(
        first.financial_action_groups,
        second.financial_action_groups
      ),
      deleted: [],
    },
    metal_action_evidence: {
      ...mergeSlices(first.metal_action_evidence, second.metal_action_evidence),
      deleted: [],
    },
    metal_lifecycle_events: {
      ...mergeSlices(
        first.metal_lifecycle_events,
        second.metal_lifecycle_events
      ),
      deleted: [],
    },
    metal_holding_states: {
      ...mergeSlices(first.metal_holding_states, second.metal_holding_states),
      deleted: [],
    },
    metal_rate_references: { created: [], updated: [], deleted: [] },
    assets: {
      created: [],
      updated: [
        { id: firstHolding, type: "METAL", user_id: USER_ID, name: "Gold" },
        { id: secondHolding, type: "METAL", user_id: USER_ID, name: "Silver" },
      ],
      deleted: [],
    },
    asset_metals: {
      created: [],
      updated: [
        { id: firstHolding, asset_id: firstHolding, metal_type: "GOLD" },
        { id: secondHolding, asset_id: secondHolding, metal_type: "SILVER" },
      ],
      deleted: [],
    },
  };
}

function makeDatabase(): PushChangesDatabase {
  return {
    get: jest.fn(() => ({
      query: jest.fn(() => ({
        fetch: jest.fn().mockResolvedValue([]),
      })),
    })),
  } as unknown as PushChangesDatabase;
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

describe("pushChanges F3 - malformed group isolation", () => {
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
    mockRpc.mockImplementation((name: unknown, args: unknown) => {
      const payload = JSON.parse(
        String((args as Record<string, unknown>).p_payload_json)
      ) as { readonly actionId: string };
      return Promise.resolve({
        data: {
          actionId: payload.actionId,
          status: "accepted",
          holdingRevision: "0",
        },
        error: null,
      });
    });
  });

  it("submits the valid group after a malformed group and keeps only the malformed rows dirty", async () => {
    const malformed: GroupIds = {
      actionId: "10000000-0000-4000-8000-0000000000a1",
      holdingId: "20000000-0000-4000-8000-0000000000a2",
      evidenceId: "30000000-0000-4000-8000-0000000000a3",
      eventId: "40000000-0000-4000-8000-0000000000a4",
      stateId: "50000000-0000-4000-8000-0000000000a5",
    };
    const valid: GroupIds = {
      actionId: "10000000-0000-4000-8000-0000000000b1",
      holdingId: "20000000-0000-4000-8000-0000000000b2",
      evidenceId: "30000000-0000-4000-8000-0000000000b3",
      eventId: "40000000-0000-4000-8000-0000000000b4",
      stateId: "50000000-0000-4000-8000-0000000000b5",
    };
    const hashMalformed = "e".repeat(64);
    const hashValid = "f".repeat(64);
    const changes = mergeGroupChanges(
      groupChanges(
        {
          ids: malformed,
          kind: "add",
          eventKind: "created",
          revision: null,
          userId: USER_ID,
          includeLifecycleRow: false,
        },
        hashMalformed
      ),
      groupChanges(
        {
          ids: valid,
          kind: "correct",
          eventKind: "correct",
          revision: "0",
          userId: USER_ID,
          includeLifecycleRow: true,
        },
        hashValid
      ),
      malformed.holdingId,
      valid.holdingId
    );

    const result = await pushChanges(makeDatabase(), {
      changes,
      lastPulledAt: 0,
    });

    expect(mockRpc).toHaveBeenCalledTimes(1);
    const rpcCall = mockRpc.mock.calls[0] as
      | readonly [unknown, unknown]
      | undefined;
    const rpcArgs: unknown = rpcCall?.[1];
    expect(rpcArgs).toMatchObject({ p_payload_hash: hashValid });
    expect(result).toBeDefined();
    const rejected = readRejectedIds(result);
    expect(rejected["financial_action_groups"] ?? []).toContain(
      malformed.actionId
    );
    expect(rejected["financial_action_groups"] ?? []).not.toContain(
      valid.actionId
    );
    expect(rejected["metal_action_evidence"] ?? []).toContain(
      malformed.evidenceId
    );
    expect(rejected["metal_action_evidence"] ?? []).not.toContain(
      valid.evidenceId
    );
  });

  it("submits the valid group when a foreign-owner root shares the push", async () => {
    const foreign: GroupIds = {
      actionId: "10000000-0000-4000-8000-0000000000c1",
      holdingId: "20000000-0000-4000-8000-0000000000c2",
      evidenceId: "30000000-0000-4000-8000-0000000000c3",
      eventId: "40000000-0000-4000-8000-0000000000c4",
      stateId: "50000000-0000-4000-8000-0000000000c5",
    };
    const valid: GroupIds = {
      actionId: "10000000-0000-4000-8000-0000000000d1",
      holdingId: "20000000-0000-4000-8000-0000000000d2",
      evidenceId: "30000000-0000-4000-8000-0000000000d3",
      eventId: "40000000-0000-4000-8000-0000000000d4",
      stateId: "50000000-0000-4000-8000-0000000000d5",
    };
    const hashForeign = "1".repeat(64);
    const hashValid = "2".repeat(64);
    const changes = mergeGroupChanges(
      groupChanges(
        {
          ids: foreign,
          kind: "add",
          eventKind: "created",
          revision: null,
          userId: "other-user",
          includeLifecycleRow: true,
        },
        hashForeign
      ),
      groupChanges(
        {
          ids: valid,
          kind: "correct",
          eventKind: "correct",
          revision: "0",
          userId: USER_ID,
          includeLifecycleRow: true,
        },
        hashValid
      ),
      foreign.holdingId,
      valid.holdingId
    );

    const result = await pushChanges(makeDatabase(), {
      changes,
      lastPulledAt: 0,
    });

    expect(mockRpc).toHaveBeenCalledTimes(1);
    const rpcCall = mockRpc.mock.calls[0] as
      | readonly [unknown, unknown]
      | undefined;
    const rpcArgs: unknown = rpcCall?.[1];
    expect(rpcArgs).toMatchObject({ p_payload_hash: hashValid });
    expect(result).toBeDefined();
    const rejected = readRejectedIds(result);
    expect(rejected["financial_action_groups"] ?? []).toContain(
      foreign.actionId
    );
    expect(rejected["financial_action_groups"] ?? []).not.toContain(
      valid.actionId
    );
  });

  it("keeps shared-holding generic rows dirty when only one group on the holding is accepted", async () => {
    // B is a partially written offline group: it has evidence rows but is
    // missing its lifecycle event and state, so A stays exactly complete
    // (one matching state) while B is malformed on the same holding.
    const holdingId = "20000000-0000-4000-8000-0000000000e0";
    const accepted: GroupIds = {
      actionId: "10000000-0000-4000-8000-0000000000e1",
      holdingId,
      evidenceId: "30000000-0000-4000-8000-0000000000e3",
      eventId: "40000000-0000-4000-8000-0000000000e4",
      stateId: "50000000-0000-4000-8000-0000000000e5",
    };
    const malformed: GroupIds = {
      actionId: "10000000-0000-4000-8000-0000000000e2",
      holdingId,
      evidenceId: "30000000-0000-4000-8000-0000000000e6",
      eventId: "40000000-0000-4000-8000-0000000000e7",
      stateId: "50000000-0000-4000-8000-0000000000e8",
    };
    const hashAccepted = "3".repeat(64);
    const hashMalformed = "4".repeat(64);
    const changes = mergeGroupChanges(
      groupChanges(
        {
          ids: accepted,
          kind: "add",
          eventKind: "created",
          revision: null,
          userId: USER_ID,
          includeLifecycleRow: true,
        },
        hashAccepted
      ),
      groupChanges(
        {
          ids: malformed,
          kind: "correct",
          eventKind: "correct",
          revision: "0",
          userId: USER_ID,
          includeLifecycleRow: false,
          includeStateRow: false,
        },
        hashMalformed
      ),
      holdingId,
      holdingId
    );

    const result = await pushChanges(makeDatabase(), {
      changes,
      lastPulledAt: 0,
    });

    expect(mockRpc).toHaveBeenCalledTimes(1);
    const rpcCall = mockRpc.mock.calls[0] as
      | readonly [unknown, unknown]
      | undefined;
    const rpcArgs: unknown = rpcCall?.[1];
    expect(rpcArgs).toMatchObject({ p_payload_hash: hashAccepted });
    expect(result).toBeDefined();
    const rejected = readRejectedIds(result);
    expect(rejected["financial_action_groups"] ?? []).toContain(
      malformed.actionId
    );
    expect(rejected["financial_action_groups"] ?? []).not.toContain(
      accepted.actionId
    );
    expect(rejected["metal_action_evidence"] ?? []).toContain(
      malformed.evidenceId
    );
    expect(rejected["metal_action_evidence"] ?? []).not.toContain(
      accepted.evidenceId
    );
    expect(rejected["assets"] ?? []).toContain(holdingId);
    expect(rejected["asset_metals"] ?? []).toContain(holdingId);
    expect(rejected["metal_holding_states"] ?? []).not.toContain(
      accepted.stateId
    );
  });

  it("blocks a root whose holding does not match its signed envelope", async () => {
    const otherHolding = "20000000-0000-4000-8000-0000000000f0";
    const stray: GroupIds = {
      actionId: "10000000-0000-4000-8000-0000000000f1",
      holdingId: "20000000-0000-4000-8000-0000000000f2",
      evidenceId: "30000000-0000-4000-8000-0000000000f3",
      eventId: "40000000-0000-4000-8000-0000000000f4",
      stateId: "50000000-0000-4000-8000-0000000000f5",
    };
    const valid: GroupIds = {
      actionId: "10000000-0000-4000-8000-0000000000f6",
      holdingId: "20000000-0000-4000-8000-0000000000f7",
      evidenceId: "30000000-0000-4000-8000-0000000000f8",
      eventId: "40000000-0000-4000-8000-0000000000f9",
      stateId: "50000000-0000-4000-8000-0000000000fa",
    };
    const hashStray = "5".repeat(64);
    const hashValid = "6".repeat(64);
    const changes = mergeGroupChanges(
      groupChanges(
        {
          ids: stray,
          kind: "add",
          eventKind: "created",
          revision: null,
          userId: USER_ID,
          includeLifecycleRow: true,
          rootHoldingId: otherHolding,
        },
        hashStray
      ),
      groupChanges(
        {
          ids: valid,
          kind: "correct",
          eventKind: "correct",
          revision: "0",
          userId: USER_ID,
          includeLifecycleRow: true,
        },
        hashValid
      ),
      stray.holdingId,
      valid.holdingId
    );

    const result = await pushChanges(makeDatabase(), {
      changes,
      lastPulledAt: 0,
    });

    expect(mockRpc).toHaveBeenCalledTimes(1);
    const rpcCall = mockRpc.mock.calls[0] as
      | readonly [unknown, unknown]
      | undefined;
    const rpcArgs: unknown = rpcCall?.[1];
    expect(rpcArgs).toMatchObject({ p_payload_hash: hashValid });
    expect(result).toBeDefined();
    const rejected = readRejectedIds(result);
    expect(rejected["financial_action_groups"] ?? []).toContain(stray.actionId);
    expect(rejected["financial_action_groups"] ?? []).not.toContain(
      valid.actionId
    );
  });

  it("blocks a root whose kind does not match its signed envelope", async () => {
    const ids: GroupIds = {
      actionId: "10000000-0000-4000-8000-0000000000a7",
      holdingId: "20000000-0000-4000-8000-0000000000a8",
      evidenceId: "30000000-0000-4000-8000-0000000000a9",
      eventId: "40000000-0000-4000-8000-0000000000aa",
      stateId: "50000000-0000-4000-8000-0000000000ab",
    };
    const changes = mergeGroupChanges(
      groupChanges(
        {
          ids,
          kind: "correct",
          eventKind: "correct",
          revision: null,
          userId: USER_ID,
          includeLifecycleRow: true,
          rootKind: "add",
        },
        "7".repeat(64)
      ),
      groupChanges(
        {
          ids: {
            actionId: "10000000-0000-4000-8000-0000000000ac",
            holdingId: "20000000-0000-4000-8000-0000000000ad",
            evidenceId: "30000000-0000-4000-8000-0000000000ae",
            eventId: "40000000-0000-4000-8000-0000000000af",
            stateId: "50000000-0000-4000-8000-0000000000b0",
          },
          kind: "add",
          eventKind: "created",
          revision: "0",
          userId: USER_ID,
          includeLifecycleRow: true,
        },
        "8".repeat(64)
      ),
      ids.holdingId,
      "20000000-0000-4000-8000-0000000000ad"
    );

    const result = await pushChanges(makeDatabase(), {
      changes,
      lastPulledAt: 0,
    });

    expect(mockRpc).toHaveBeenCalledTimes(1);
    const rpcCall = mockRpc.mock.calls[0] as
      | readonly [unknown, unknown]
      | undefined;
    const rpcArgs: unknown = rpcCall?.[1];
    expect(rpcArgs).toMatchObject({ p_payload_hash: "8".repeat(64) });
    expect(result).toBeDefined();
    const rejected = readRejectedIds(result);
    expect(rejected["financial_action_groups"] ?? []).toContain(ids.actionId);
    expect(rejected["financial_action_groups"] ?? []).not.toContain(
      "10000000-0000-4000-8000-0000000000ac"
    );
  });
});
