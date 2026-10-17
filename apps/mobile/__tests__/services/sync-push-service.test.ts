const mockGetCurrentUserId = jest.fn();
const mockFrom = jest.fn();
const mockUpsert = jest.fn();
const mockRpc = jest.fn();
const mockMarkSyncFailed = jest.fn();
const mockMarkSyncPending = jest.fn();
const mockRecordOutcome = jest.fn();
const mockCommitMetalOutcome = jest.fn();
const mockGetFinancialActionGroup = jest.fn();

jest.mock("@monyvi/db", () => ({
  schema: {
    tables: {
      account_financial_effects: {},
      accounts: {},
      bank_details: {},
      asset_metals: {},
      assets: {},
      categories: {},
      financial_action_groups: {},
      market_rate_observations: {},
      profiles: {},
      transactions: {},
    },
  },
}));

jest.mock("expo-crypto", () => {
  const { createHash } =
    jest.requireActual<typeof import("node:crypto")>("node:crypto");
  return {
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    digestStringAsync: (algorithm: string, text: string): Promise<string> => {
      if (algorithm !== "SHA-256") throw new Error("unknown_crypto_algorithm");
      return Promise.resolve(
        createHash("sha256").update(text, "utf8").digest("hex")
      );
    },
  };
});

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
  getFinancialActionGroup: (...args: readonly unknown[]): unknown =>
    mockGetFinancialActionGroup(...args),
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

import {
  GENERIC_SYNC_ERROR_CODES,
  pushChanges,
} from "../../services/sync/push-service";
import type { FinancialActionPushCoordinator } from "../../services/financial-action-sync-service";
import {
  CANONICAL_ACCOUNT_PUSH_OWNER,
  canonicalLegacyAccountEdit,
  legacyPushDatabase,
} from "./sync-push-legacy-test-fixtures";

type PushChangesArgs = Parameters<typeof pushChanges>[1];
type CoordinatePush = FinancialActionPushCoordinator["coordinatePush"];

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
    mockCommitMetalOutcome.mockResolvedValue("accepted");
    mockGetFinancialActionGroup.mockResolvedValue(null);
  });

  it.each(["add", "created"] as const)(
    "routes a %s Metal holding through its action RPC without direct asset upserts",
    async (eventKind) => {
      const actionId = "10000000-0000-4000-8000-000000000011";
      const holdingId = "20000000-0000-4000-8000-000000000012";
      const userId = "current-user";
      const database = legacyPushDatabase({
        assets: [
          {
            id: holdingId,
            userId,
            type: "METAL",
            deleted: false,
          },
        ],
        financial_action_groups: [],
      }).database;
      const changes: PushChangesArgs["changes"] = {
        financial_action_groups: {
          created: [
            {
              id: actionId,
              action_id: actionId,
              domain: "metals",
              domain_reference_id: holdingId,
              kind: "add",
              user_id: userId,
              payload_hash: "hash",
              payload_json: JSON.stringify({
                actionId,
                domainReferenceId: holdingId,
                kind: "add",
                payload: { holdingId, rateSnapshots: [] },
                userId,
              }),
            },
          ],
          updated: [],
          deleted: [],
        },
        metal_action_evidence: {
          created: [
            {
              id: eventKind === "created" ? "legacy-evidence" : actionId,
              action_id: actionId,
              holding_id: holdingId,
              kind: "add",
              user_id: userId,
            },
          ],
          updated: [],
          deleted: [],
        },
        metal_lifecycle_events: {
          created: [
            {
              id: eventKind === "created" ? "legacy-event" : actionId,
              action_id: actionId,
              holding_id: holdingId,
              kind: eventKind,
              user_id: userId,
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
              user_id: userId,
            },
          ],
          updated: [],
          deleted: [],
        },
        assets: {
          created: [
            { id: holdingId, type: "METAL", user_id: userId, name: "Btc 20" },
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
      ).resolves.toBeUndefined();
      expect(mockRpc).toHaveBeenCalledWith(
        "apply_metal_action_v1",
        expect.any(Object)
      );
      expect(mockFrom).not.toHaveBeenCalledWith("assets");
      expect(mockFrom).not.toHaveBeenCalledWith("asset_metals");
    }
  );

  it("keeps an orphan local Metal asset dirty instead of silently marking it synced", async () => {
    const holdingId = "20000000-0000-4000-8000-000000000012";
    const changes: PushChangesArgs["changes"] = {
      assets: {
        created: [{ id: holdingId, type: "METAL", user_id: "current-user" }],
        updated: [],
        deleted: [],
      },
    };
    await expect(
      pushChanges(legacyPushDatabase().database, {
        changes,
        lastPulledAt: 0,
      })
    ).resolves.toEqual({
      experimentalRejectedIds: { assets: [holdingId] },
    });
    expect(mockFrom).not.toHaveBeenCalledWith("assets");
  });

  it("never parses or dispatches foreign financial actions before syncing current-user data", async () => {
    const pushArgs: PushChangesArgs = {
      changes: {
        financial_action_groups: {
          created: [
            {
              id: "foreign-account-action",
              user_id: "prior-user",
              payload_json: "{invalid-json",
            },
          ],
          updated: [
            {
              id: "foreign-metal-action",
              user_id: "prior-user",
              domain: "metals",
              payload_json: "{invalid-json",
            },
          ],
          deleted: [],
        },
        account_financial_effects: {
          created: [
            {
              id: "foreign-effect",
              user_id: "prior-user",
              action_id: "foreign-account-action",
            },
          ],
          updated: [],
          deleted: [],
        },
        metal_holding_states: {
          created: [
            {
              id: "foreign-state",
              user_id: "prior-user",
              holding_id: "foreign-asset",
              name_written_at: 1,
              name_writer_id: "writer-a",
            },
          ],
          updated: [],
          deleted: [],
        },
        assets: {
          created: [
            {
              id: "foreign-asset",
              user_id: "prior-user",
              type: "METAL",
              name: "Foreign name",
            },
          ],
          updated: [],
          deleted: [],
        },
        profiles: {
          created: [{ id: "profile-1", user_id: "current-user" }],
          updated: [],
          deleted: [],
        },
      },
      lastPulledAt: 0,
    };
    const coordinator = { coordinatePush: jest.fn() };
    await expect(
      pushChanges(
        legacyPushDatabase().database,
        pushArgs,
        "current-user",
        coordinator
      )
    ).resolves.toEqual({
      experimentalRejectedIds: {
        financial_action_groups: [
          "foreign-account-action",
          "foreign-metal-action",
        ],
        account_financial_effects: ["foreign-effect"],
        metal_holding_states: ["foreign-state"],
        assets: ["foreign-asset"],
      },
    });
    expect(coordinator.coordinatePush).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockMarkSyncPending).not.toHaveBeenCalled();
    expect(mockRecordOutcome).not.toHaveBeenCalled();
    expect(mockUpsert).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, null, "", 12])(
    "rejects invalid generic owner %s instead of assigning current user",
    async (owner) => {
      await expect(
        pushChanges(legacyPushDatabase().database, {
          changes: {
            assets: {
              created: [{ id: "asset-without-owner", user_id: owner }],
              updated: [],
              deleted: [],
            },
          },
          lastPulledAt: 0,
        })
      ).rejects.toThrow("Refusing to sync foreign local changes for assets");
      expect(mockUpsert).not.toHaveBeenCalled();
    }
  );

  it("ignores dirty pull-only shared observations without requiring user ownership", async () => {
    await expect(
      pushChanges(legacyPushDatabase().database, {
        changes: {
          market_rate_observations: {
            created: [{ id: "observation-1" }],
            updated: [],
            deleted: [],
          },
        },
        lastPulledAt: 0,
      })
    ).resolves.toBeUndefined();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("aborts before any write if auth changes during local ownership resolution", async () => {
    // Change the actor at the actual owned-parent fetch boundary, not at an
    // arbitrary nth getCurrentUserId call introduced by catalog rechecks.
    let resolvedParents = 0;
    const scoped = legacyPushDatabase(
      {
        accounts: [
          {
            id: "account-current",
            userId: "current-user",
            deleted: false,
          },
        ],
      },
      (table): void => {
        if (table === "accounts") {
          resolvedParents += 1;
          mockGetCurrentUserId.mockResolvedValue("different-user");
        }
      }
    );
    await expect(
      pushChanges(scoped.database, {
        changes: {
          bank_details: {
            created: [
              {
                id: "bank-1",
                account_id: "account-current",
                deleted: false,
              },
            ],
            updated: [],
            deleted: [],
          },
          profiles: {
            created: [{ id: "profile-1", user_id: "current-user" }],
            updated: [],
            deleted: [],
          },
        },
        lastPulledAt: 0,
      })
    ).rejects.toThrow(GENERIC_SYNC_ERROR_CODES.AUTH_SCOPE_LOST);
    expect(resolvedParents).toBe(1);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it.each([
    ["created", { created: [{ id: "root-1" }], updated: [], deleted: [] }],
    ["updated", { created: [], updated: [{ id: "root-1" }], deleted: [] }],
    ["deleted", { created: [], updated: [], deleted: ["root-1"] }],
  ] as const)(
    "returns dirty dedicated-table %s ids as rejected while pushing unrelated rows",
    async (_changeKind, dedicatedChanges) => {
      const database = legacyPushDatabase().database;
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

      expect(mockGetCurrentUserId.mock.calls.length).toBeGreaterThanOrEqual(3);
      expect(
        mockGetCurrentUserId.mock.results.every(
          (item) => item.type === "return"
        )
      ).toBe(true);
      expect(mockFrom).not.toHaveBeenCalledWith("financial_action_groups");
      expect(mockFrom).toHaveBeenCalledWith("profiles");
      expect(mockUpsert).toHaveBeenCalledTimes(1);
    }
  );

  it("keeps foreign prior-user dedicated roots dirty without blocking current-user generic sync", async () => {
    const database = legacyPushDatabase().database;
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
    const database = legacyPushDatabase().database;
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
      let upsertCompleted = false;
      mockGetCurrentUserId.mockImplementation((): Promise<string | null> => {
        const actor = upsertCompleted ? finalUserId : "current-user";
        executionOrder.push(
          upsertCompleted ? "post-upsert-auth" : "owned-auth"
        );
        return Promise.resolve(actor);
      });
      mockUpsert.mockImplementationOnce(async (): Promise<{ error: null }> => {
        executionOrder.push("upsert-start");
        await Promise.resolve();
        upsertCompleted = true;
        executionOrder.push("upsert-complete");
        return { error: null };
      });
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
        pushChanges(legacyPushDatabase().database, pushArgs, "current-user")
      ).rejects.toThrow(GENERIC_SYNC_ERROR_CODES.AUTH_SCOPE_LOST);
      expect(executionOrder.indexOf("owned-auth")).toBeGreaterThanOrEqual(0);
      expect(executionOrder.indexOf("upsert-start")).toBeGreaterThan(0);
      expect(executionOrder.indexOf("upsert-complete")).toBeGreaterThan(
        executionOrder.indexOf("upsert-start")
      );
      expect(executionOrder.indexOf("post-upsert-auth")).toBeGreaterThan(
        executionOrder.indexOf("upsert-complete")
      );
      expect(mockUpsert).toHaveBeenCalledTimes(1);
    }
  );

  it("allows an empty dedicated-table change set without generating a generic remote write", async () => {
    const database = legacyPushDatabase().database;
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

  it.each([false, true])(
    "acknowledges an owned account action with foreign pending rows present: %s",
    async (hasForeignRows) => {
      const action = canonicalLegacyAccountEdit({
        actionId: "10000000-0000-4000-8000-000000000001",
        accountId: "20000000-0000-4000-8000-000000000002",
        effectId: "40000000-0000-4000-8000-000000000004",
        transactionId: "30000000-0000-4000-8000-000000000003",
      });
      if (!action.transactionRaw)
        throw new Error("missing_canonical_transaction");
      const actionId = action.rootRaw.action_id;
      if (
        typeof actionId !== "string" ||
        actionId !== action.localRoot.actionId ||
        actionId !== "10000000-0000-4000-8000-000000000001"
      ) {
        throw new Error("invalid_canonical_action_fixture");
      }
      mockGetCurrentUserId.mockResolvedValue(CANONICAL_ACCOUNT_PUSH_OWNER);
      const coordinator = {
        coordinatePush: jest
          .fn<ReturnType<CoordinatePush>, Parameters<CoordinatePush>>()
          .mockResolvedValue({
            decisions: [
              {
                actionId,
                disposition: "acknowledge",
                outcome: null,
              },
            ],
          }),
      };
      const changes: PushChangesArgs["changes"] = {
        financial_action_groups: {
          created: [
            { ...action.rootRaw },
            ...(hasForeignRows
              ? [
                  {
                    id: "foreign-action",
                    user_id: "prior-user",
                    domain: "accounts",
                    payload_json: "{invalid-json",
                  },
                ]
              : []),
          ],
          updated: [],
          deleted: [],
        },
        account_financial_effects: {
          created: [{ ...action.effectRaw }],
          updated: [],
          deleted: [],
        },
        accounts: {
          created: [],
          updated: [{ ...action.accountRaw }],
          deleted: [],
        },
        transactions: {
          created: [{ ...action.transactionRaw }],
          updated: [],
          deleted: [],
        },
      };
      const database = legacyPushDatabase({
        financial_action_groups: [action.localRoot],
      }).database;
      const result = await pushChanges(
        database,
        { changes, lastPulledAt: 0 },
        CANONICAL_ACCOUNT_PUSH_OWNER,
        coordinator
      );
      expect(result).toEqual(
        hasForeignRows
          ? {
              experimentalRejectedIds: {
                financial_action_groups: ["foreign-action"],
              },
            }
          : undefined
      );
      expect(coordinator.coordinatePush).toHaveBeenCalledTimes(1);
      const coordinated: unknown =
        coordinator.coordinatePush.mock.calls[0]?.[0];
      expect(coordinated).toEqual([
        expect.objectContaining({
          actionId: action.rootRaw.action_id,
          payloadHash: action.payloadHash,
          payloadJson: action.payloadJson,
        }),
      ]);
      expect(mockFrom).not.toHaveBeenCalledWith("accounts");
      expect(mockFrom).not.toHaveBeenCalledWith("transactions");
    }
  );

  it("uses the production owner-scoped RPC before acknowledging a canonical account action", async () => {
    const action = canonicalLegacyAccountEdit({
      actionId: "10000000-0000-4000-8000-000000000011",
      accountId: "20000000-0000-4000-8000-000000000012",
      effectId: "40000000-0000-4000-8000-000000000014",
    });
    mockGetCurrentUserId.mockResolvedValue(CANONICAL_ACCOUNT_PUSH_OWNER);
    mockGetFinancialActionGroup.mockResolvedValue(action.localRoot);
    mockRpc.mockResolvedValue({
      data: { actionId: action.rootRaw.action_id, status: "accepted" },
      error: null,
    });
    const pushArgs: PushChangesArgs = {
      changes: {
        financial_action_groups: {
          created: [{ ...action.rootRaw }],
          updated: [],
          deleted: [],
        },
        account_financial_effects: {
          created: [{ ...action.effectRaw }],
          updated: [],
          deleted: [],
        },
        accounts: {
          created: [],
          updated: [{ ...action.accountRaw }],
          deleted: [],
        },
      },
      lastPulledAt: 0,
    };
    const database = legacyPushDatabase({
      financial_action_groups: [action.localRoot],
    }).database;

    await expect(pushChanges(database, pushArgs)).resolves.toBeUndefined();
    expect(mockMarkSyncPending).toHaveBeenCalledWith(action.rootRaw.action_id);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith("apply_account_financial_action_v1", {
      p_payload_hash: action.payloadHash,
      p_payload_json: action.payloadJson,
    });
    expect(mockRecordOutcome).toHaveBeenCalledWith(
      action.rootRaw.action_id,
      "accepted",
      expect.any(String),
      null
    );
  });

  it("keeps a stale canonical account action and every linked row dirty", async () => {
    const action = canonicalLegacyAccountEdit({
      actionId: "10000000-0000-4000-8000-000000000001",
      accountId: "20000000-0000-4000-8000-000000000002",
      effectId: "40000000-0000-4000-8000-000000000004",
      state: "rejected_compensating",
    });
    mockGetCurrentUserId.mockResolvedValue(CANONICAL_ACCOUNT_PUSH_OWNER);
    const coordinator = {
      coordinatePush: jest.fn().mockResolvedValue({
        decisions: [
          {
            actionId: action.rootRaw.action_id,
            disposition: "reject",
            outcome: null,
          },
        ],
      }),
    };
    const changes: PushChangesArgs["changes"] = {
      financial_action_groups: {
        created: [{ ...action.rootRaw }],
        updated: [],
        deleted: [],
      },
      account_financial_effects: {
        created: [{ ...action.effectRaw }],
        updated: [],
        deleted: [],
      },
      accounts: {
        created: [],
        updated: [{ ...action.accountRaw }],
        deleted: [],
      },
    };
    const result = await pushChanges(
      legacyPushDatabase({
        financial_action_groups: [action.localRoot],
      }).database,
      { changes, lastPulledAt: 0 },
      CANONICAL_ACCOUNT_PUSH_OWNER,
      coordinator
    );
    expect(coordinator.coordinatePush).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      experimentalRejectedIds: {
        account_financial_effects: [action.effectRaw.id],
        accounts: [action.accountRaw.id],
        financial_action_groups: [action.rootRaw.id],
      },
    });
  });

  it("skips dirty shared system categories instead of pushing them through user RLS", async () => {
    const database = legacyPushDatabase().database;
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
    const database = legacyPushDatabase().database;
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

  it("keeps Metal projections out of generic asset pushes", async () => {
    const database = legacyPushDatabase().database;
    const pushArgs: PushChangesArgs = {
      changes: {
        assets: {
          created: [
            {
              id: "asset-1",
              user_id: "current-user",
              type: "METAL",
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

    await expect(pushChanges(database, pushArgs)).resolves.toEqual({
      experimentalRejectedIds: { assets: ["asset-1"] },
    });

    expect(mockFrom).not.toHaveBeenCalledWith("assets");
  });
});
