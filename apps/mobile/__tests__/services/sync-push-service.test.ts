const mockGetCurrentUserId = jest.fn();
const mockFrom = jest.fn();
const mockUpsert = jest.fn();
const mockRpc = jest.fn();
const mockMarkSyncFailed = jest.fn();
const mockMarkSyncPending = jest.fn();
const mockRecordOutcome = jest.fn();

jest.mock("@monyvi/db", () => ({
  schema: {
    tables: {
      account_financial_effects: {},
      accounts: {},
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
  recordFinancialActionGroupServerOutcome: (...args: readonly unknown[]): unknown =>
    mockRecordOutcome(...args),
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

import {
  GENERIC_SYNC_ERROR_CODES,
  pushChanges,
} from "../../services/sync/push-service";

type PushChangesDatabase = Parameters<typeof pushChanges>[0];
type PushChangesArgs = Parameters<typeof pushChanges>[1];

describe("pushChanges", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUserId.mockResolvedValue("current-user");
    mockFrom.mockReturnValue({
      upsert: mockUpsert,
    });
    mockUpsert.mockResolvedValue({ error: null });
    mockMarkSyncFailed.mockResolvedValue(undefined);
    mockMarkSyncPending.mockResolvedValue(undefined);
    mockRecordOutcome.mockResolvedValue(undefined);
  });

  it.each([
    ["created", { created: [{ id: "root-1" }], updated: [], deleted: [] }],
    ["updated", { created: [], updated: [{ id: "root-1" }], deleted: [] }],
    ["deleted", { created: [], updated: [], deleted: ["root-1"] }],
  ] as const)(
    "returns dirty dedicated-table %s ids as rejected while pushing unrelated rows",
    async (_changeKind, dedicatedChanges) => {
      const database = Object.create(null) as PushChangesDatabase;
      const changes: PushChangesArgs["changes"] = {
        financial_action_groups: {
          created: [...dedicatedChanges.created],
          updated: [...dedicatedChanges.updated],
          deleted: [...dedicatedChanges.deleted],
        },
        profiles: {
          created: [
            {
              id: "profile-1",
              user_id: "current-user",
              deleted: false,
            },
          ],
          updated: [],
          deleted: [],
        },
      };
      const pushArgs: PushChangesArgs = {
        changes,
        lastPulledAt: 0,
      };

      await expect(pushChanges(database, pushArgs)).resolves.toEqual({
        experimentalRejectedIds: {
          financial_action_groups: ["root-1"],
        },
      });

      expect(mockGetCurrentUserId).toHaveBeenCalledTimes(2);
      expect(mockFrom).not.toHaveBeenCalledWith("financial_action_groups");
      expect(mockFrom).toHaveBeenCalledWith("profiles");
      expect(mockUpsert).toHaveBeenCalledTimes(1);
    }
  );

  it("keeps foreign prior-user dedicated roots dirty without blocking current-user generic sync", async () => {
    const database = Object.create(null) as PushChangesDatabase;
    const pushArgs: PushChangesArgs = {
      changes: {
        financial_action_groups: {
          created: [
            {
              id: "foreign-root",
              user_id: "prior-user",
            },
          ],
          updated: [],
          deleted: [],
        },
        profiles: {
          created: [
            {
              id: "profile-1",
              user_id: "current-user",
              deleted: false,
            },
          ],
          updated: [],
          deleted: [],
        },
      },
      lastPulledAt: 0,
    };

    await expect(pushChanges(database, pushArgs)).resolves.toEqual({
      experimentalRejectedIds: {
        financial_action_groups: ["foreign-root"],
      },
    });

    expect(mockFrom).not.toHaveBeenCalledWith("financial_action_groups");
    expect(mockFrom).toHaveBeenCalledWith("profiles");
    expect(mockUpsert).toHaveBeenCalledTimes(1);
  });

  it("fails when auth disappears before push so no captured row is acknowledged", async () => {
    mockGetCurrentUserId.mockResolvedValue(null);
    const database = Object.create(null) as PushChangesDatabase;
    const pushArgs: PushChangesArgs = {
      changes: {
        financial_action_groups: {
          created: [{ id: "dedicated-root" }],
          updated: [],
          deleted: [],
        },
        profiles: {
          created: [
            {
              id: "profile-1",
              user_id: "current-user",
              deleted: false,
            },
          ],
          updated: [],
          deleted: [],
        },
      },
      lastPulledAt: 0,
    };

    await expect(pushChanges(database, pushArgs)).rejects.toThrow(
      GENERIC_SYNC_ERROR_CODES.AUTH_SCOPE_LOST
    );

    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it.each([
    ["disappears", null],
    ["changes", "different-user"],
  ])(
    "fails when auth %s after an awaited remote upsert",
    async (_case, finalUserId) => {
      const executionOrder: string[] = [];
      mockGetCurrentUserId
        .mockImplementationOnce((): Promise<string> => {
          executionOrder.push("initial-auth");
          return Promise.resolve("current-user");
        })
        .mockImplementationOnce((): Promise<string | null> => {
          executionOrder.push("final-auth");
          return Promise.resolve(finalUserId);
        });
      mockUpsert.mockImplementationOnce(async (): Promise<{ error: null }> => {
        executionOrder.push("upsert-start");
        await Promise.resolve();
        executionOrder.push("upsert-complete");
        return { error: null };
      });
      const database = Object.create(null) as PushChangesDatabase;
      const pushArgs: PushChangesArgs = {
        changes: {
          profiles: {
            created: [
              {
                id: "profile-1",
                user_id: "current-user",
                deleted: false,
              },
            ],
            updated: [],
            deleted: [],
          },
        },
        lastPulledAt: 0,
      };

      await expect(
        pushChanges(database, pushArgs, "current-user")
      ).rejects.toThrow(GENERIC_SYNC_ERROR_CODES.AUTH_SCOPE_LOST);

      expect(executionOrder).toEqual([
        "initial-auth",
        "upsert-start",
        "upsert-complete",
        "final-auth",
      ]);
      expect(mockUpsert).toHaveBeenCalledTimes(1);
    }
  );

  it("allows an empty dedicated-table change set without generating a generic remote write", async () => {
    const database = Object.create(null) as PushChangesDatabase;
    const profile = {
      id: "profile-1",
      user_id: "current-user",
      deleted: false,
    };
    const changes = {
      financial_action_groups: { created: [], updated: [], deleted: [] },
      profiles: { created: [profile], updated: [], deleted: [] },
    };
    const pushArgs: PushChangesArgs = {
      changes,
      lastPulledAt: 0,
    };

    await expect(pushChanges(database, pushArgs)).resolves.toBeUndefined();

    expect(mockFrom).not.toHaveBeenCalledWith("financial_action_groups");
    expect(mockFrom).toHaveBeenCalledWith("profiles");
  });

  it("acknowledges an accepted account action and all linked local rows", async () => {
    const actionId = "10000000-0000-4000-8000-000000000001";
    const accountId = "20000000-0000-4000-8000-000000000002";
    const transactionId = "30000000-0000-4000-8000-000000000003";
    const effectId = "40000000-0000-4000-8000-000000000004";
    const payloadJson = JSON.stringify({
      payloadVersion: "account.balance-effects/v1",
      payload: {
        domainMutation: {
          records: [
            { entity: "account", after: { id: accountId } },
            { entity: "transaction", after: { id: transactionId } },
          ],
        },
      },
    });
    const coordinator = {
      coordinatePush: jest.fn().mockResolvedValue({
        decisions: [
          { actionId, disposition: "acknowledge", outcome: null },
        ],
      }),
    };
    const pushArgs: PushChangesArgs = {
      changes: {
        financial_action_groups: {
          created: [
            {
              id: actionId,
              action_id: actionId,
              payload_hash: "a".repeat(64),
              payload_json: payloadJson,
              state: "accepted",
            },
          ],
          updated: [],
          deleted: [],
        },
        account_financial_effects: {
          created: [{ id: effectId, action_id: actionId }],
          updated: [],
          deleted: [],
        },
        accounts: {
          created: [],
          updated: [
            {
              id: accountId,
              user_id: "current-user",
              balance: 100,
              financial_revision: "1",
              deleted: false,
            },
          ],
          deleted: [],
        },
        transactions: {
          created: [
            {
              id: transactionId,
              user_id: "current-user",
              deleted: false,
            },
          ],
          updated: [],
          deleted: [],
        },
      },
      lastPulledAt: 0,
    };

    await expect(
      pushChanges(
        Object.create(null) as PushChangesDatabase,
        pushArgs,
        undefined,
        coordinator
      )
    ).resolves.toBeUndefined();

    expect(coordinator.coordinatePush).toHaveBeenCalledTimes(1);
    expect(mockFrom).not.toHaveBeenCalledWith("accounts");
    expect(mockFrom).not.toHaveBeenCalledWith("transactions");
  });

  it("uses the production owner-scoped RPC before acknowledging an account action", async () => {
    const actionId = "10000000-0000-4000-8000-000000000011";
    const accountId = "20000000-0000-4000-8000-000000000012";
    const effectId = "40000000-0000-4000-8000-000000000014";
    const payloadJson = JSON.stringify({
      payloadVersion: "account.balance-effects/v1",
      payload: {
        domainMutation: {
          records: [{ entity: "account", after: { id: accountId } }],
        },
      },
    });
    mockRpc.mockResolvedValue({
      data: { actionId, status: "accepted" },
      error: null,
    });
    const pushArgs: PushChangesArgs = {
      changes: {
        financial_action_groups: {
          created: [
            {
              id: actionId,
              action_id: actionId,
              payload_hash: "c".repeat(64),
              payload_json: payloadJson,
              state: "local_complete",
            },
          ],
          updated: [],
          deleted: [],
        },
        account_financial_effects: {
          created: [{ id: effectId, action_id: actionId }],
          updated: [],
          deleted: [],
        },
        accounts: {
          created: [],
          updated: [{ id: accountId }],
          deleted: [],
        },
      },
      lastPulledAt: 0,
    };

    await expect(
      pushChanges(Object.create(null) as PushChangesDatabase, pushArgs)
    ).resolves.toBeUndefined();

    expect(mockMarkSyncPending).toHaveBeenCalledWith(actionId);
    expect(mockRpc).toHaveBeenCalledWith("apply_account_financial_action_v1", {
      p_payload_hash: "c".repeat(64),
      p_payload_json: payloadJson,
    });
    expect(mockRecordOutcome).toHaveBeenCalledWith(
      actionId,
      "accepted",
      expect.any(String),
      null
    );
  });

  it("keeps a stale account action and every linked row dirty", async () => {
    const actionId = "10000000-0000-4000-8000-000000000001";
    const accountId = "20000000-0000-4000-8000-000000000002";
    const effectId = "40000000-0000-4000-8000-000000000004";
    const coordinator = {
      coordinatePush: jest.fn().mockResolvedValue({
        decisions: [
          { actionId, disposition: "reject", outcome: null },
        ],
      }),
    };
    const pushArgs: PushChangesArgs = {
      changes: {
        financial_action_groups: {
          created: [
            {
              id: actionId,
              action_id: actionId,
              payload_hash: "a".repeat(64),
              payload_json: JSON.stringify({
                payloadVersion: "account.balance-effects/v1",
                payload: {
                  domainMutation: {
                    records: [{ entity: "account", after: { id: accountId } }],
                  },
                },
              }),
              state: "rejected_compensating",
            },
          ],
          updated: [],
          deleted: [],
        },
        account_financial_effects: {
          created: [{ id: effectId, action_id: actionId }],
          updated: [],
          deleted: [],
        },
        accounts: {
          created: [],
          updated: [{ id: accountId }],
          deleted: [],
        },
      },
      lastPulledAt: 0,
    };

    await expect(
      pushChanges(
        Object.create(null) as PushChangesDatabase,
        pushArgs,
        undefined,
        coordinator
      )
    ).resolves.toEqual({
      experimentalRejectedIds: {
        account_financial_effects: [effectId],
        accounts: [accountId],
        financial_action_groups: [actionId],
      },
    });
  });

  it("skips dirty shared system categories instead of pushing them through user RLS", async () => {
    const database = Object.create(null) as PushChangesDatabase;
    const pushArgs: PushChangesArgs = {
      changes: {
        categories: {
          created: [],
          updated: [
            {
              id: "00000000-0000-0000-0001-000000000002",
              user_id: null,
              is_system: true,
              system_name: "food",
              deleted: false,
            },
          ],
          deleted: [],
        },
      },
      lastPulledAt: 0,
    };

    await expect(pushChanges(database, pushArgs)).resolves.toBeUndefined();

    expect(mockFrom).not.toHaveBeenCalledWith("categories");
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("upserts profiles by their unique user identity", async () => {
    const database = Object.create(null) as PushChangesDatabase;
    const profile = {
      id: "local-profile-id",
      user_id: "current-user",
      display_name: "Manual QA",
      deleted: false,
    };
    const pushArgs: PushChangesArgs = {
      changes: {
        profiles: {
          created: [profile],
          updated: [],
          deleted: [],
        },
      },
      lastPulledAt: 0,
    };

    await expect(pushChanges(database, pushArgs)).resolves.toBeUndefined();

    expect(mockFrom).toHaveBeenCalledWith("profiles");
    expect(mockUpsert).toHaveBeenCalledWith(
      [expect.objectContaining(profile)],
      {
        onConflict: "user_id",
      }
    );
  });

  it("strips server-authoritative metal projections from generic asset pushes", async () => {
    const database = Object.create(null) as PushChangesDatabase;
    const pushArgs: PushChangesArgs = {
      changes: {
        assets: {
          created: [
            {
              id: "asset-1",
              user_id: "current-user",
              name: "Gold holding",
              purchase_price_decimal: "100000.125",
              purchase_currency: "EGP",
              acquisition_action_id: "action-1",
              deleted: false,
            },
          ],
          updated: [],
          deleted: [],
        },
      },
      lastPulledAt: 0,
    };

    await expect(pushChanges(database, pushArgs)).resolves.toBeUndefined();

    expect(mockFrom).toHaveBeenCalledWith("assets");
    expect(mockUpsert).toHaveBeenCalledWith(
      [
        {
          id: "asset-1",
          user_id: "current-user",
          name: "Gold holding",
          deleted: false,
        },
      ],
      { onConflict: "id" }
    );
  });
});
