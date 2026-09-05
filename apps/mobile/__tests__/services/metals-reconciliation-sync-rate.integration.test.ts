import {
  classifyMetalServerOutcome,
  createMetalReconciliationService,
  type MetalRpcOutcome,
} from "../../services/metal-reconciliation-service";
import { Database, type Model } from "@nozbe/watermelondb";
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import { schema } from "../../../../packages/db/src/schema";
import { Asset } from "../../../../packages/db/src/models/Asset";
import { MetalHoldingState } from "../../../../packages/db/src/models/MetalHoldingState";
import {
  createMetalRateReferenceService,
  type MetalRateReferenceCapture,
} from "../../services/metal-rate-reference-service";
import {
  applyMetalMetadataPatch,
  createMetalMetadataService,
} from "../../services/metal-metadata-service";

jest.mock("@monyvi/db", (): unknown => {
  const schemaModule: unknown = jest.requireActual(
    "../../../../packages/db/src/schema"
  );
  return schemaModule;
});
jest.mock("../../services/supabase", () => ({
  getCurrentUserId: jest.fn(),
  supabase: {},
}));

import {
  DEDICATED_SYNC_TABLES,
  METALS_ACTION_FRAGMENT_COLUMNS,
} from "../../services/sync/config";
import { stripMetalActionFragments } from "../../services/sync/ownership-guards";
import {
  protectMetalMetadataPullFragments,
  runMetalPullStrategy,
} from "../../services/sync/pull-strategies";
import {
  pushMetalDedicatedChanges,
  runMetalPushStrategy,
} from "../../services/sync/push-service";

const USER_ID = "018f0c7a-1234-7abc-8def-000000000003";
const ACTION_ID = "018f0c7a-1234-7abc-8def-000000000001";
const HOLDING_ACTION_ID = "018f0c7a-1234-7abc-8def-000000000002";
const HASH = "a".repeat(64);
const ACCOUNT_HASH = "b".repeat(64);
const HOLDING_ID = "018f0c7a-1234-7abc-8def-000000000004";

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown =>
  jest.requireActual(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);

async function createMetadataDatabase(): Promise<{
  readonly adapter: SQLiteAdapter;
  readonly database: Database;
}> {
  const adapter = new SQLiteAdapter({ schema });
  await adapter.initializingPromise;
  const database = new Database({
    adapter,
    modelClasses: [Asset, MetalHoldingState] as Array<typeof Model>,
  });
  await database.write(async (): Promise<void> => {
    const asset = database.get<Asset>("assets").prepareCreate((row) => {
      row._raw.id = HOLDING_ID;
      row.acquisitionActionId = ACTION_ID;
      row.currency = "EGP";
      row.deleted = false;
      row.isLiquid = false;
      row.name = "Baseline";
      row.notes = "Baseline note";
      row.purchaseCurrency = "EGP";
      row.purchaseDate = new Date("2026-08-01T00:00:00.000Z");
      row.purchasePrice = 100;
      row.purchasePriceDecimal = "100";
      row.type = "METAL";
      row.updatedAt = new Date();
      row.userId = USER_ID;
    });
    const state = database
      .get<MetalHoldingState>("metal_holding_states")
      .prepareCreate((row) => {
        row._raw.id = HOLDING_ID;
        row.deleted = false;
        row.effectiveActionId = ACTION_ID;
        row.effectiveEventId = ACTION_ID;
        row.financialRevision = "4";
        row.holdingId = HOLDING_ID;
        row.isVisible = true;
        row.nameWrittenAt = null;
        row.nameWriterId = null;
        row.notesWrittenAt = null;
        row.notesWriterId = null;
        row.reconciliationState = "accepted";
        row.status = "sold";
        row.updatedAt = new Date();
        row.userId = USER_ID;
      });
    await database.batch(asset, state);
  });
  return { adapter, database };
}

type StaleMetalRpcOutcome = Extract<
  MetalRpcOutcome,
  { readonly status: "stale" }
>;

function staleOutcome(
  overrides: Partial<StaleMetalRpcOutcome> = {}
): StaleMetalRpcOutcome {
  const outcome: StaleMetalRpcOutcome = {
    status: "stale",
    actionId: ACTION_ID,
    code: "HOLDING_REVISION_STALE",
    canonicalHoldingRevision: "3",
    canonicalHoldingActionId: HOLDING_ACTION_ID,
    canonicalHoldingEvidenceHash: HASH,
    canonicalAccounts: [],
    staleAccountIds: [],
    userId: USER_ID,
    payloadHashMatches: true,
    ...overrides,
  };
  return outcome;
}

describe("Metals reconciliation, sync, rates, and metadata", () => {
  it("classifies complete holding/account winners and fails closed on invalid evidence", () => {
    expect(classifyMetalServerOutcome(staleOutcome(), USER_ID)).toBe(
      "stale_ready"
    );
    expect(
      classifyMetalServerOutcome(
        staleOutcome({
          code: "ACCOUNT_REVISION_STALE",
          canonicalHoldingRevision: "2",
          canonicalHoldingActionId: null,
          canonicalAccounts: [
            {
              accountId: "018f0c7a-1234-7abc-8def-000000000010",
              canonicalRevision: "9",
              canonicalActionId: HOLDING_ACTION_ID,
              canonicalEvidenceHash: ACCOUNT_HASH,
            },
          ],
          staleAccountIds: ["018f0c7a-1234-7abc-8def-000000000010"],
        }),
        USER_ID
      )
    ).toBe("account_only_stale_ready");
    expect(
      classifyMetalServerOutcome(
        {
          status: "rejected",
          actionId: ACTION_ID,
          code: "INCOMPLETE_GROUP",
          userId: USER_ID,
          payloadHashMatches: true,
        },
        USER_ID
      )
    ).toBe("reconciliation_incomplete");
    expect(() =>
      classifyMetalServerOutcome(staleOutcome({ userId: "foreign" }), USER_ID)
    ).toThrow("foreign_canonical_evidence");
    expect(() =>
      classifyMetalServerOutcome(
        staleOutcome({ payloadHashMatches: false }),
        USER_ID
      )
    ).toThrow("payload_hash_mismatch_non_retryable");

    const malformed = [
      staleOutcome({ canonicalHoldingActionId: null }),
      staleOutcome({ canonicalHoldingEvidenceHash: "not-a-hash" }),
      staleOutcome({ canonicalHoldingRevision: "01" }),
      staleOutcome({ staleAccountIds: ["unexpected-account"] }),
      staleOutcome({
        code: "ACCOUNT_REVISION_STALE",
        canonicalHoldingActionId: HOLDING_ACTION_ID,
      }),
    ];
    for (const outcome of malformed) {
      expect(classifyMetalServerOutcome(outcome, USER_ID)).toBe(
        "reconciliation_incomplete"
      );
    }
  });

  it("uses one lock and one durable atomic recovery across retry/restart", async () => {
    const recoveredActions = new Set<string>();
    const calls: string[] = [];
    const dependencies = {
      withActionLock: async <T>(
        actionId: string,
        operation: () => Promise<T>
      ): Promise<T> => {
        calls.push(`lock:${actionId}`);
        return operation();
      },
      hasReconciled: (actionId: string): Promise<boolean> =>
        Promise.resolve(recoveredActions.has(actionId)),
      commitAcceptedAtomically: jest.fn(() => Promise.resolve()),
      commitRecoveryAtomically: jest.fn(
        (input: { readonly actionId: string; readonly kind: string }) => {
          calls.push(`recover:${input.kind}`);
          recoveredActions.add(input.actionId);
          return Promise.resolve();
        }
      ),
      markIncomplete: jest.fn(() => Promise.resolve()),
    };
    const outcome = staleOutcome();

    await createMetalReconciliationService(dependencies).reconcile(
      outcome,
      USER_ID
    );
    await createMetalReconciliationService(dependencies).reconcile(
      outcome,
      USER_ID
    );

    expect(dependencies.commitRecoveryAtomically).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      `lock:${ACTION_ID}`,
      "recover:holding_stale",
      `lock:${ACTION_ID}`,
    ]);
    expect(dependencies.markIncomplete).not.toHaveBeenCalled();
  });

  it("does not perform a partial recovery for rejected or malformed outcomes", async () => {
    const commitRecoveryAtomically = jest.fn(() => Promise.resolve());
    const markIncomplete = jest.fn(() => Promise.resolve());
    const service = createMetalReconciliationService({
      withActionLock: async <T>(
        _actionId: string,
        operation: () => Promise<T>
      ): Promise<T> => operation(),
      hasReconciled: () => Promise.resolve(false),
      commitAcceptedAtomically: jest.fn(() => Promise.resolve()),
      commitRecoveryAtomically,
      markIncomplete,
    });

    await service.reconcile(
      {
        status: "rejected",
        actionId: ACTION_ID,
        code: "INCOMPLETE_GROUP",
        userId: USER_ID,
        payloadHashMatches: true,
      },
      USER_ID
    );
    await service.reconcile(
      staleOutcome({ canonicalHoldingEvidenceHash: "missing" }),
      USER_ID
    );

    expect(commitRecoveryAtomically).not.toHaveBeenCalled();
    expect(markIncomplete).toHaveBeenCalledTimes(2);
  });

  it("keeps rate references immutable and validates the role/kind matrix", () => {
    const service = createMetalRateReferenceService();
    const reference = service.capture(
      {
        id: "018f0c7a-1234-7abc-8def-000000000011",
        role: "acquisition_metal",
        kind: "metal",
        instrumentCode: "metal:GOLD",
        valueDecimal: "75.25",
        unit: "usd_per_pure_gram",
        orientation: "quote_per_base",
        providerObservedAt: Date.parse("2026-08-31T10:00:00.000Z"),
        source: "fixture",
        quality: "valid",
        capturedFreshness: "fresh",
        capturedAt: Date.parse("2026-08-31T10:01:00.000Z"),
      },
      { role: "acquisition_metal", instrumentCode: "metal:GOLD" }
    );
    expect(Object.isFrozen(reference)).toBe(true);
    expect(() =>
      service.capture(
        {
          ...reference,
          role: "acquisition_purchase_currency",
        } as unknown as MetalRateReferenceCapture,
        { role: "acquisition_metal", instrumentCode: "metal:GOLD" }
      )
    ).toThrow("invalid_metal_rate_reference");
  });

  it("merges name and notes independently by durable (writtenAt, writerId) clocks", () => {
    const current = {
      holdingId: "holding-1",
      userId: USER_ID,
      name: {
        value: "Old",
        writtenAt: 10,
        writerId: "018f0c7a-1234-7abc-8def-000000000011",
      },
      notes: {
        value: "Old note",
        writtenAt: 20,
        writerId: "018f0c7a-1234-7abc-8def-000000000012",
      },
    };
    const merged = applyMetalMetadataPatch(
      current,
      {
        holdingId: "holding-1",
        userId: USER_ID,
        fields: {
          name: {
            value: "New",
            writtenAt: 11,
            writerId: "018f0c7a-1234-7abc-8def-000000000011",
          },
          notes: {
            value: "Loses",
            writtenAt: 20,
            writerId: "018f0c7a-1234-7abc-8def-000000000011",
          },
        },
      },
      USER_ID
    );

    expect(merged).toEqual({
      ...current,
      name: {
        value: "New",
        writtenAt: 11,
        writerId: "018f0c7a-1234-7abc-8def-000000000011",
      },
    });
    expect(() =>
      applyMetalMetadataPatch(
        current,
        {
          holdingId: "holding-1",
          userId: "foreign",
          fields: {
            name: {
              value: "No",
              writtenAt: 30,
              writerId: "018f0c7a-1234-7abc-8def-000000000099",
            },
          },
        },
        USER_ID
      )
    ).toThrow("foreign_metal_metadata_patch");
    expect(() =>
      applyMetalMetadataPatch(
        current,
        { holdingId: "holding-1", userId: USER_ID, fields: {} },
        USER_ID
      )
    ).toThrow("invalid_metal_metadata_patch");
  });

  it("persists first-write clocks atomically on terminal holdings and replays after restart", async () => {
    const { adapter, database } = await createMetadataDatabase();
    const patch = {
      holdingId: HOLDING_ID,
      userId: USER_ID,
      fields: {
        name: {
          value: "Renamed after sale",
          writtenAt: 1_788_229_200_000,
          writerId: "018f0c7a-1234-7abc-8def-000000000020",
        },
      },
    } as const;
    const createService = (
      target: Database
    ): ReturnType<typeof createMetalMetadataService> =>
      createMetalMetadataService({
        database: target,
        getCurrentUserId: () => Promise.resolve(USER_ID),
      });

    await expect(createService(database).applyPatch(patch)).resolves.toEqual({
      kind: "applied",
    });
    const clonedAdapter = await adapter.testClone();
    const reopened = new Database({
      adapter: clonedAdapter,
      modelClasses: [Asset, MetalHoldingState] as Array<typeof Model>,
    });
    await expect(createService(reopened).applyPatch(patch)).resolves.toEqual({
      kind: "replay",
    });

    const [asset] = await reopened.get<Asset>("assets").query().fetch();
    const [state] = await reopened
      .get<MetalHoldingState>("metal_holding_states")
      .query()
      .fetch();
    expect(asset?.name).toBe("Renamed after sale");
    expect(state).toMatchObject({
      effectiveActionId: ACTION_ID,
      effectiveEventId: ACTION_ID,
      financialRevision: "4",
      nameWrittenAt: 1_788_229_200_000,
      nameWriterId: "018f0c7a-1234-7abc-8def-000000000020",
      notesWrittenAt: null,
      notesWriterId: null,
      status: "sold",
    });
  });

  it("dedicates action-owned tables and strips protected generic fragments", () => {
    expect([...DEDICATED_SYNC_TABLES]).toEqual(
      expect.arrayContaining([
        "financial_action_groups",
        "metal_holding_states",
        "metal_action_evidence",
        "metal_lifecycle_events",
        "metal_rate_references",
      ])
    );
    expect(METALS_ACTION_FRAGMENT_COLUMNS.assets).toEqual(
      expect.arrayContaining([
        "name",
        "notes",
        "acquisition_action_id",
        "purchase_price_decimal",
      ])
    );
    expect(METALS_ACTION_FRAGMENT_COLUMNS.asset_metals).toContain(
      "purity_factor_decimal"
    );
    expect(
      stripMetalActionFragments("assets", {
        id: "a",
        type: "METAL",
        name: "Gold",
        notes: "private",
        acquisition_action_id: "action",
        purchase_price_decimal: "100",
      })
    ).toEqual({ id: "a", type: "METAL" });
    expect(
      stripMetalActionFragments("assets", {
        id: "home",
        type: "REAL_ESTATE",
        name: "Home",
        notes: "unchanged generic metadata",
      })
    ).toMatchObject({ name: "Home", notes: "unchanged generic metadata" });
  });

  it("routes only clock-coupled Metals metadata through the dedicated pull boundary", () => {
    const assets = protectMetalMetadataPullFragments(
      {
        created: [],
        updated: [
          {
            id: "metal-1",
            type: "METAL",
            name: "paired",
            notes: "paired note",
          },
          {
            id: "metal-2",
            type: "METAL",
            name: "bypass",
            notes: "bypass note",
          },
          {
            id: "home-1",
            type: "REAL_ESTATE",
            name: "Home",
            notes: "ordinary",
          },
        ],
        deleted: [],
      },
      {
        created: [],
        updated: [
          {
            id: "metal-1",
            holding_id: "metal-1",
            name_written_at: 1_788_229_200_000,
            name_writer_id: "018f0c7a-1234-7abc-8def-000000000020",
          },
        ],
        deleted: [],
      }
    );

    expect(assets.updated).toEqual([
      expect.objectContaining({
        id: "metal-1",
        name: "paired",
        notes: "paired note",
      }),
      { id: "metal-2", type: "METAL" },
      expect.objectContaining({
        id: "home-1",
        name: "Home",
        notes: "ordinary",
      }),
    ]);
  });

  it("submits complete Metals roots before metadata and acknowledges only accepted RPC groups", async () => {
    const rpc = jest
      .fn()
      .mockResolvedValueOnce({
        data: {
          status: "accepted",
          actionId: ACTION_ID,
          holdingRevision: "0",
          accountRevisions: [],
          effectiveEventId: ACTION_ID,
          serverAcceptedAt: "2026-08-31T10:15:30.123Z",
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { status: "applied", holdingId: HOLDING_ID },
        error: null,
      });
    const payloadJson = JSON.stringify({
      actionId: ACTION_ID,
      kind: "add",
      payload: { expectedHoldingRevision: null },
    });

    await expect(
      pushMetalDedicatedChanges(
        {
          financial_action_groups: {
            created: [
              {
                id: ACTION_ID,
                action_id: ACTION_ID,
                user_id: USER_ID,
                payload_json: payloadJson,
                payload_hash: HASH,
              },
            ],
            updated: [],
            deleted: [],
          },
          metal_action_evidence: {
            created: [{ id: ACTION_ID, action_id: ACTION_ID }],
            updated: [],
            deleted: [],
          },
          metal_lifecycle_events: {
            created: [{ id: ACTION_ID, action_id: ACTION_ID }],
            updated: [],
            deleted: [],
          },
          metal_holding_states: {
            created: [],
            updated: [
              {
                id: HOLDING_ID,
                effective_action_id: ACTION_ID,
                name_written_at: 1_788_229_200_000,
                name_writer_id: "018f0c7a-1234-7abc-8def-000000000020",
              },
            ],
            deleted: [],
          },
          assets: {
            created: [],
            updated: [{ id: HOLDING_ID, type: "METAL", name: "Renamed" }],
            deleted: [],
          },
        },
        USER_ID,
        rpc
      )
    ).resolves.toEqual({ acknowledgeAllDedicatedRows: true });
    expect(rpc).toHaveBeenNthCalledWith(1, "apply_metal_action_v1", {
      p_payload_hash: HASH,
      p_payload_json: payloadJson,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "apply_metal_metadata_patch_v1", {
      p_holding_id: HOLDING_ID,
      p_patch: {
        fields: {
          name: {
            value: "Renamed",
            writtenAt: 1_788_229_200_000,
            writerId: "018f0c7a-1234-7abc-8def-000000000020",
          },
        },
      },
    });
  });

  it("acknowledges a metadata-only Metals patch after the dedicated RPC accepts it", async () => {
    const rpc = jest.fn().mockResolvedValueOnce({
      data: { status: "applied", holdingId: HOLDING_ID },
      error: null,
    });

    await expect(
      pushMetalDedicatedChanges(
        {
          metal_holding_states: {
            created: [],
            updated: [
              {
                id: HOLDING_ID,
                holding_id: HOLDING_ID,
                effective_action_id: ACTION_ID,
                name_written_at: 1_788_229_200_000,
                name_writer_id: "018f0c7a-1234-7abc-8def-000000000020",
              },
            ],
            deleted: [],
          },
          assets: {
            created: [],
            updated: [{ id: HOLDING_ID, type: "METAL", name: "Renamed" }],
            deleted: [],
          },
        },
        USER_ID,
        rpc
      )
    ).resolves.toEqual({ acknowledgeAllDedicatedRows: true });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("apply_metal_metadata_patch_v1", {
      p_holding_id: HOLDING_ID,
      p_patch: {
        fields: {
          name: {
            value: "Renamed",
            writtenAt: 1_788_229_200_000,
            writerId: "018f0c7a-1234-7abc-8def-000000000020",
          },
        },
      },
    });
  });

  it("propagates pull failures without advancing the watermark", async () => {
    const commitWatermark = jest.fn();
    await expect(
      runMetalPullStrategy({
        pull: () => Promise.reject(new Error("pull_failed")),
        commitWatermark,
      })
    ).rejects.toThrow("pull_failed");
    expect(commitWatermark).not.toHaveBeenCalled();
  });

  it("propagates RPC/push failures without marking local changes synced", async () => {
    const markSynced = jest.fn();
    await expect(
      runMetalPushStrategy({
        push: () => Promise.reject(new Error("rpc_failed")),
        markSynced,
      })
    ).rejects.toThrow("rpc_failed");
    expect(markSynced).not.toHaveBeenCalled();
  });
});
