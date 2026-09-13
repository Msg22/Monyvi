import { Database, Q, type Model } from "@nozbe/watermelondb";
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import {
  DEFAULT_FINANCIAL_ACTION_REGISTRY,
  hashFinancialActionEnvelope,
} from "@monyvi/logic";
import { schema } from "../../../../packages/db/src/schema";
import { Asset } from "../../../../packages/db/src/models/Asset";
import { AssetMetal } from "../../../../packages/db/src/models/AssetMetal";
import { FinancialActionGroup } from "../../../../packages/db/src/models/FinancialActionGroup";
import { MetalActionEvidence } from "../../../../packages/db/src/models/MetalActionEvidence";
import { MetalHoldingState } from "../../../../packages/db/src/models/MetalHoldingState";
import { MetalLifecycleEvent } from "../../../../packages/db/src/models/MetalLifecycleEvent";
import { MetalRateReference } from "../../../../packages/db/src/models/MetalRateReference";
import {
  METAL_ACTION_KINDS,
  assertCanonicalMetalRevision,
  createMetalFinancialActionEnvelope,
} from "../../services/metal-financial-action-adapter";
import { createMetalHoldingCommandService } from "../../services/metal-holding-command-service";
import {
  createMetalFinancialActionRepository,
  createWatermelonMetalFinancialActionRepositoryDependencies,
  formatMetalLocalCalendarDate,
} from "../../services/metal-financial-action-repository";
import { commitMetalRpcOutcomeLocally } from "../../services/metal-reconciliation-service";
import {
  FOREIGN_USER_ID,
  HOLDING_ID,
  USER_ID,
  VALIDATION_INPUT,
  actionId,
  commandInput,
  materialFacts,
  rateSnapshot,
  sha256Provider,
} from "./metal-financial-action-test-data";

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown =>
  jest.requireActual(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);
jest.mock("../../services/supabase", () => ({
  getCurrentUserId: jest.fn(),
  supabase: {},
}));

const MODEL_CLASSES: Array<typeof Model> = [
  Asset,
  AssetMetal,
  FinancialActionGroup,
  MetalActionEvidence,
  MetalHoldingState,
  MetalLifecycleEvent,
  MetalRateReference,
];

async function createDatabase(): Promise<{
  readonly adapter: SQLiteAdapter;
  readonly database: Database;
}> {
  const adapter = new SQLiteAdapter({ schema });
  await adapter.initializingPromise;
  return {
    adapter,
    database: new Database({ adapter, modelClasses: MODEL_CLASSES }),
  };
}

function createService(
  database: Database,
  currentUserId = USER_ID
): ReturnType<typeof createMetalHoldingCommandService> {
  return createMetalHoldingCommandService({
    repository: createMetalFinancialActionRepository(
      createWatermelonMetalFinancialActionRepositoryDependencies({
        database,
        getCurrentUserId: () => Promise.resolve(currentUserId),
      })
    ),
    hashProvider: sha256Provider,
  });
}

async function count(database: Database, table: string): Promise<number> {
  return database.get<Model>(table).query().fetchCount();
}

describe("Metals financial action foundation", () => {
  it.each(METAL_ACTION_KINDS)(
    "builds the approved canonical %s envelope with no account effect",
    (kind) => {
      const expectedRevision = kind === "add" ? null : "0";
      const predecessor = kind === "add" ? null : actionId(1);
      const envelope = createMetalFinancialActionEnvelope(
        commandInput(
          kind,
          actionId(20 + METAL_ACTION_KINDS.indexOf(kind)),
          expectedRevision,
          predecessor,
          kind === "undo" ? predecessor : null
        )
      );

      expect(envelope.accountGuards).toEqual([]);
      expect(envelope.payload.expectedHoldingRevision).toBe(expectedRevision);
      expect(envelope.payloadVersion).toBe(
        kind === "sell" ? "metals.sell/v2" : "metals." + kind + "/v1"
      );
    }
  );

  it("commits Add, Correct, Sell, Undo, Dispose, Undo, and Delete atomically in real SQLite", async () => {
    const { adapter, database } = await createDatabase();
    const service = createService(database);
    const inputs = [
      commandInput("add", actionId(1), null, null),
      commandInput("correct", actionId(2), "0", actionId(1)),
      commandInput("sell", actionId(3), "1", actionId(2)),
      commandInput("undo", actionId(4), "2", actionId(3), actionId(3)),
      commandInput("dispose", actionId(5), "3", actionId(4)),
      commandInput("undo", actionId(6), "4", actionId(5), actionId(5)),
      commandInput("delete", actionId(7), "5", actionId(6)),
    ];

    for (const input of inputs) {
      await expect(service.execute(input)).resolves.toMatchObject({
        actionId: input.actionId,
        kind: "committed",
      });
    }

    expect(await count(database, "financial_action_groups")).toBe(7);
    expect(await count(database, "metal_action_evidence")).toBe(7);
    expect(await count(database, "metal_lifecycle_events")).toBe(7);
    expect(await count(database, "metal_rate_references")).toBe(7);
    const roots = await database
      .get<FinancialActionGroup>("financial_action_groups")
      .query()
      .fetch();
    expect(roots.every((root) => root.accountGuardsJson === "[]")).toBe(true);
    expect(
      roots.every((root) => !("expected_holding_revision" in root._raw))
    ).toBe(true);

    const evidence = await database
      .get<MetalActionEvidence>("metal_action_evidence")
      .query()
      .fetch();
    expect(evidence.map((row) => row.expectedHoldingRevision)).toEqual([
      null,
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);
    expect(new Set(evidence.map((row) => row.actionId)).size).toBe(7);

    const events = await database
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .query()
      .fetch();
    expect(new Set(events.map((row) => row.actionId)).size).toBe(7);
    expect(events.filter((event) => event.isHistoryVisible)).toHaveLength(6);
    expect(JSON.parse(events[1]?.payloadJson ?? "{}")).toMatchObject({
      expectedHoldingRevision: "0",
    });

    const [state] = await database
      .get<MetalHoldingState>("metal_holding_states")
      .query()
      .fetch();
    expect(state).toMatchObject({
      effectiveActionId: actionId(7),
      effectiveEventId: actionId(7),
      financialRevision: "6",
      holdingId: HOLDING_ID,
      isVisible: false,
      status: "active",
      userId: USER_ID,
    });

    const [asset] = await database.get<Asset>("assets").query().fetch();
    const [metal] = await database
      .get<AssetMetal>("asset_metals")
      .query()
      .fetch();
    expect(asset).toMatchObject({
      acquisitionActionId: actionId(2),
      purchasePriceDecimal: "151000",
      userId: USER_ID,
    });
    expect(metal).toMatchObject({
      purityCode: "gold-9999",
      purityFactorDecimal: "0.9999",
      weightGramsDecimal: "10.25",
    });

    const addEnvelope = createMetalFinancialActionEnvelope(inputs[0]);
    const expectedHash = await hashFinancialActionEnvelope(
      addEnvelope,
      sha256Provider,
      DEFAULT_FINANCIAL_ACTION_REGISTRY,
      VALIDATION_INPUT
    );
    expect(roots.find((root) => root.actionId === actionId(1))).toMatchObject({
      payloadHash: expectedHash.payloadHash,
      payloadJson: expectedHash.canonicalText,
    });

    const clonedAdapter = await adapter.testClone();
    const reopened = new Database({
      adapter: clonedAdapter,
      modelClasses: MODEL_CLASSES,
    });
    await expect(
      createService(reopened).execute(inputs[0])
    ).resolves.toMatchObject({
      actionId: actionId(1),
      kind: "replay",
    });
    expect(await count(reopened, "financial_action_groups")).toBe(7);
  });

  it("allows one expected-revision winner and leaves the stale loser unwritten", async () => {
    const { database } = await createDatabase();
    const service = createService(database);
    await service.execute(commandInput("add", actionId(1), null, null));
    await service.execute(
      commandInput("correct", actionId(2), "0", actionId(1))
    );

    await expect(
      service.execute(commandInput("dispose", actionId(3), "0", actionId(1)))
    ).rejects.toThrow("metal_holding_revision_stale");

    expect(await count(database, "financial_action_groups")).toBe(2);
    expect(await count(database, "metal_action_evidence")).toBe(2);
    expect(await count(database, "metal_lifecycle_events")).toBe(2);
    const [state] = await database
      .get<MetalHoldingState>("metal_holding_states")
      .query()
      .fetch();
    expect(state?.financialRevision).toBe("1");
  });

  it("binds correction and sale facts to the owned current projection", async () => {
    const { database } = await createDatabase();
    const service = createService(database);
    await service.execute(commandInput("add", actionId(1), null, null));

    const correction = commandInput("correct", actionId(2), "0", actionId(1));
    await expect(
      service.execute({
        ...correction,
        domainPayload: {
          ...correction.domainPayload,
          materialCorrection: {
            ...(correction.domainPayload.materialCorrection as Record<
              string,
              unknown
            >),
            before: materialFacts("149999"),
          },
        },
      })
    ).rejects.toThrow("metal_action_projection_mismatch");

    const sale = commandInput("sell", actionId(3), "0", actionId(1));
    const usdRateSnapshots = (
      sale.domainPayload.rateSnapshots as ReadonlyArray<Record<string, unknown>>
    ).map((snapshot) =>
      snapshot.kind === "currency"
        ? { ...snapshot, instrumentCode: "currency:USD", valueDecimal: "1" }
        : snapshot
    );
    await expect(
      service.execute({
        ...sale,
        domainPayload: {
          ...sale.domainPayload,
          purchaseCurrency: "USD",
          rateSnapshots: usdRateSnapshots,
          saleCurrency: "USD",
        },
      })
    ).rejects.toThrow("metal_action_projection_mismatch");
    expect(await count(database, "financial_action_groups")).toBe(1);
  });

  it("rejects a disposal date before acquisition", async () => {
    const { database } = await createDatabase();
    const service = createService(database);
    await service.execute(commandInput("add", actionId(1), null, null));
    const disposal = commandInput("dispose", actionId(2), "0", actionId(1));

    await expect(
      service.execute({
        ...disposal,
        domainPayload: {
          ...disposal.domainPayload,
          disposalDate: "2026-08-29",
        },
      })
    ).rejects.toThrow("metal_disposal_before_acquisition");
  });

  it("allows the first real action on a revision-zero migrated holding", async () => {
    const { database } = await createDatabase();
    await database.write(async (): Promise<void> => {
      const asset = database.get<Asset>("assets").prepareCreate((row) => {
        row._raw.id = HOLDING_ID;
        row.deleted = false;
        row.isLiquid = false;
        row.name = "Legacy gold";
        row.type = "METAL";
        row.userId = USER_ID;
        applyLegacyAssetFacts(row);
      });
      const metal = database
        .get<AssetMetal>("asset_metals")
        .prepareCreate((row) => {
          row._raw.id = HOLDING_ID;
          row.assetId = HOLDING_ID;
          row.deleted = false;
          row.itemForm = "JEWELRY";
          row.metalType = "GOLD";
          row.purityCatalogVersion = "1";
          row.purityCode = "gold-9999";
          row.purityFactorDecimal = "0.9999";
          row.purityFraction = 0.9999;
          row.weightGrams = 10.25;
          row.weightGramsDecimal = "10.25";
        });
      const state = database
        .get<MetalHoldingState>("metal_holding_states")
        .prepareCreate((row) => {
          row._raw.id = HOLDING_ID;
          row.deleted = false;
          row.effectiveActionId = null;
          row.effectiveEventId = null;
          row.financialRevision = "0";
          row.holdingId = HOLDING_ID;
          row.isVisible = true;
          row.reconciliationState = "accepted";
          row.status = "active";
          row.userId = USER_ID;
        });
      await database.batch(asset, metal, state);
    });

    await expect(
      createService(database).execute(
        commandInput("dispose", actionId(8), "0", null)
      )
    ).resolves.toMatchObject({ kind: "committed" });
  });

  it("advances metadata clocks with a mixed material correction", async () => {
    const { database } = await createDatabase();
    const service = createService(database);
    await service.execute(commandInput("add", actionId(1), null, null));
    const correction = commandInput("correct", actionId(2), "0", actionId(1));
    await service.execute({
      ...correction,
      domainPayload: {
        ...correction.domainPayload,
        metadataChange: {
          before: { name: "Savings gold", notes: null },
          after: { name: "Corrected gold", notes: "Receipt checked" },
        },
      },
    });

    const [state] = await database
      .get<MetalHoldingState>("metal_holding_states")
      .query()
      .fetch();
    expect(state).toMatchObject({
      nameWrittenAt: Date.parse(correction.occurredAt),
      nameWriterId: correction.actionId,
      notesWrittenAt: Date.parse(correction.occurredAt),
      notesWriterId: correction.actionId,
    });
  });

  it("persists accepted reconciliation before acknowledgement and survives restart", async () => {
    const { adapter, database } = await createDatabase();
    const service = createService(database);
    await service.execute(commandInput("add", actionId(1), null, null));

    await expect(
      commitMetalRpcOutcomeLocally(
        database,
        {
          accountRevisions: [],
          actionId: actionId(1),
          effectiveEventId: actionId(1),
          holdingRevision: "0",
          payloadHashMatches: true,
          serverAcceptedAt: "2026-08-31T10:16:00.123Z",
          status: "accepted",
          userId: USER_ID,
        },
        USER_ID
      )
    ).resolves.toBe("accepted");

    const batchSpy = jest.spyOn(database, "batch");
    await expect(
      commitMetalRpcOutcomeLocally(
        database,
        {
          accountRevisions: [],
          actionId: actionId(1),
          effectiveEventId: actionId(1),
          holdingRevision: "0",
          payloadHashMatches: true,
          serverAcceptedAt: "2026-08-31T10:16:00.123Z",
          status: "idempotent",
          userId: USER_ID,
        },
        USER_ID
      )
    ).resolves.toBe("accepted");
    expect(batchSpy).not.toHaveBeenCalled();

    const reopened = new Database({
      adapter: await adapter.testClone(),
      modelClasses: MODEL_CLASSES,
    });
    const [root] = await reopened
      .get<FinancialActionGroup>("financial_action_groups")
      .query()
      .fetch();
    const [evidence] = await reopened
      .get<MetalActionEvidence>("metal_action_evidence")
      .query()
      .fetch();
    const [state] = await reopened
      .get<MetalHoldingState>("metal_holding_states")
      .query()
      .fetch();
    expect(root).toMatchObject({
      serverOutcome: "accepted",
      state: "accepted",
    });
    expect(root?.outcomeJson).toContain('"status":"accepted"');
    expect(evidence?.canonicalHoldingRevision).toBe("0");
    expect(state?.reconciliationState).toBe("accepted");
  });

  it("durably rolls back a rejected material correction", async () => {
    const { database } = await createDatabase();
    const service = createService(database);
    await service.execute(commandInput("add", actionId(1), null, null));
    await service.execute(
      commandInput("correct", actionId(2), "0", actionId(1))
    );

    const rejectedOutcome = {
      actionId: actionId(2),
      code: "INVALID_LINK" as const,
      payloadHashMatches: true,
      status: "rejected" as const,
      userId: USER_ID,
    };
    await expect(
      commitMetalRpcOutcomeLocally(database, rejectedOutcome, USER_ID)
    ).resolves.toBe("reconciled");
    const [asset] = await database.get<Asset>("assets").query().fetch();
    const [rejectedRoot] = await database
      .get<FinancialActionGroup>("financial_action_groups")
      .query(Q.where("action_id", actionId(2)))
      .fetch();
    const [restoredState] = await database
      .get<MetalHoldingState>("metal_holding_states")
      .query()
      .fetch();
    expect(asset?.purchasePriceDecimal).toBe("150000");
    expect(asset?.acquisitionActionId).toBe(actionId(1));
    expect(rejectedRoot).toMatchObject({
      rejectionCode: "INVALID_LINK",
      serverOutcome: "rejected",
      state: "reconciled",
    });
    expect(rejectedRoot?.outcomeJson).toContain('"status":"rejected"');
    expect(restoredState).toMatchObject({
      effectiveActionId: actionId(1),
      financialRevision: "0",
      isVisible: true,
      reconciliationState: "reconciled",
    });
    const batchSpy = jest.spyOn(database, "batch");
    await expect(
      commitMetalRpcOutcomeLocally(database, rejectedOutcome, USER_ID)
    ).resolves.toBe("reconciled");
    expect(batchSpy).not.toHaveBeenCalled();
  });

  it("restores acquisition provenance past metadata-only corrections", async () => {
    const { database } = await createDatabase();
    const service = createService(database);
    await service.execute(commandInput("add", actionId(1), null, null));
    await service.execute(
      commandInput("correct", actionId(2), "0", actionId(1))
    );

    const metadataOnly = commandInput("correct", actionId(3), "1", actionId(2));
    await service.execute({
      ...metadataOnly,
      domainPayload: {
        ...metadataOnly.domainPayload,
        materialCorrection: null,
        metadataChange: {
          before: { name: "Savings gold", notes: null },
          after: { name: "Renamed gold", notes: null },
        },
      },
    });
    const rejectedCorrection = commandInput(
      "correct",
      actionId(4),
      "2",
      actionId(3)
    );
    await service.execute({
      ...rejectedCorrection,
      domainPayload: {
        ...rejectedCorrection.domainPayload,
        materialCorrection: {
          after: materialFacts("152000"),
          before: materialFacts("151000"),
          rateSnapshots: [
            rateSnapshot(actionId(113), "acquisition_metal"),
            rateSnapshot(actionId(114), "acquisition_purchase_currency"),
          ],
          reason: "Receipt correction",
        },
      },
    });

    await expect(
      commitMetalRpcOutcomeLocally(
        database,
        {
          actionId: actionId(4),
          code: "INVALID_LINK",
          payloadHashMatches: true,
          status: "rejected",
          userId: USER_ID,
        },
        USER_ID
      )
    ).resolves.toBe("reconciled");

    const [asset] = await database.get<Asset>("assets").query().fetch();
    expect(asset?.acquisitionActionId).toBe(actionId(2));
    expect(asset?.purchasePriceDecimal).toBe("151000");
  });

  it("restores rejected correction dates as local calendar dates", async () => {
    const { database } = await createDatabase();
    const service = createService(database);
    await service.execute(commandInput("add", actionId(1), null, null));
    await service.execute(
      commandInput("correct", actionId(2), "0", actionId(1))
    );

    await commitMetalRpcOutcomeLocally(
      database,
      {
        actionId: actionId(2),
        code: "INVALID_LINK",
        payloadHashMatches: true,
        status: "rejected",
        userId: USER_ID,
      },
      USER_ID
    );

    const [asset] = await database.get<Asset>("assets").query().fetch();
    expect(asset?.purchaseDate.getTime()).toBe(new Date(2026, 7, 30).getTime());
    expect(
      formatMetalLocalCalendarDate(asset?.purchaseDate ?? new Date(0))
    ).toBe("2026-08-30");
  });

  it("rejects a sale before the acquisition local-calendar date", async () => {
    const { database } = await createDatabase();
    const service = createService(database);
    const add = commandInput("add", actionId(1), null, null);
    await service.execute({
      ...add,
      domainPayload: {
        ...add.domainPayload,
        materialFacts: { ...materialFacts(), purchaseDate: "2026-09-01" },
      },
    });

    await expect(
      service.execute(commandInput("sell", actionId(2), "0", actionId(1)))
    ).rejects.toThrow("metal_sale_before_acquisition");
  });

  it("rejects malformed or impossible purchase dates at the payload boundary before any write", async () => {
    for (const purchaseDate of ["2026-aa-01", "not-a-date-x", "2026-02-31"]) {
      const { database } = await createDatabase();
      const service = createService(database);
      const add = commandInput("add", actionId(1), null, null);

      await expect(
        service.execute({
          ...add,
          domainPayload: {
            ...add.domainPayload,
            materialFacts: { ...materialFacts(), purchaseDate },
          },
        })
      ).rejects.toThrow("financial_action_invalid_payload");
      await expect(count(database, "assets")).resolves.toBe(0);
    }
  });

  it("formats persisted purchase dates from local calendar components", () => {
    const date = new Date("2026-07-31T22:00:00.000Z");
    jest.spyOn(date, "getFullYear").mockReturnValue(2026);
    jest.spyOn(date, "getMonth").mockReturnValue(7);
    jest.spyOn(date, "getDate").mockReturnValue(1);

    expect(formatMetalLocalCalendarDate(date)).toBe("2026-08-01");
  });

  it("reconciles sequential accepted actions without clobbering the latest local state", async () => {
    const { database } = await createDatabase();
    const service = createService(database);
    await service.execute(commandInput("add", actionId(1), null, null));
    await service.execute(
      commandInput("correct", actionId(2), "0", actionId(1))
    );

    await commitMetalRpcOutcomeLocally(
      database,
      {
        accountRevisions: [],
        actionId: actionId(1),
        effectiveEventId: actionId(1),
        holdingRevision: "0",
        payloadHashMatches: true,
        serverAcceptedAt: "2026-08-31T10:16:00.123Z",
        status: "accepted",
        userId: USER_ID,
      },
      USER_ID
    );
    const [pendingLatestState] = await database
      .get<MetalHoldingState>("metal_holding_states")
      .query()
      .fetch();
    expect(pendingLatestState).toMatchObject({
      effectiveActionId: actionId(2),
      financialRevision: "1",
      reconciliationState: "local_complete",
    });

    await commitMetalRpcOutcomeLocally(
      database,
      {
        accountRevisions: [],
        actionId: actionId(2),
        effectiveEventId: actionId(2),
        holdingRevision: "1",
        payloadHashMatches: true,
        serverAcceptedAt: "2026-08-31T10:16:01.123Z",
        status: "accepted",
        userId: USER_ID,
      },
      USER_ID
    );
    const [acceptedLatestState] = await database
      .get<MetalHoldingState>("metal_holding_states")
      .query()
      .fetch();
    expect(acceptedLatestState?.reconciliationState).toBe("accepted");
  });

  it("restores the terminal state when an optimistic Undo is rejected", async () => {
    const { database } = await createDatabase();
    const service = createService(database);
    await service.execute(commandInput("add", actionId(1), null, null));
    await service.execute(commandInput("sell", actionId(2), "0", actionId(1)));
    await service.execute(
      commandInput("undo", actionId(3), "1", actionId(2), actionId(2))
    );

    await expect(
      commitMetalRpcOutcomeLocally(
        database,
        {
          actionId: actionId(3),
          code: "INVALID_STATE",
          payloadHashMatches: true,
          status: "rejected",
          userId: USER_ID,
        },
        USER_ID
      )
    ).resolves.toBe("reconciled");
    const [state] = await database
      .get<MetalHoldingState>("metal_holding_states")
      .query()
      .fetch();
    expect(state).toMatchObject({
      effectiveActionId: actionId(2),
      financialRevision: "1",
      isVisible: true,
      reconciliationState: "reconciled",
      status: "sold",
    });
  });

  it("replays one action/hash, rejects payload mismatch, and skips linked writes", async () => {
    const { database } = await createDatabase();
    const service = createService(database);
    const input = commandInput("add", actionId(1), null, null);

    await expect(service.execute(input)).resolves.toMatchObject({
      kind: "committed",
    });
    await expect(service.execute(input)).resolves.toMatchObject({
      kind: "replay",
    });
    await expect(
      service.execute({
        ...input,
        domainPayload: {
          ...input.domainPayload,
          metadata: { name: "Different", notes: null },
        },
      })
    ).rejects.toThrow("action_id_payload_mismatch");

    expect(await count(database, "financial_action_groups")).toBe(1);
    expect(await count(database, "metal_action_evidence")).toBe(1);
    expect(await count(database, "metal_lifecycle_events")).toBe(1);
  });

  it("rolls back a failed batch and rejects cross-user writes", async () => {
    const { adapter, database } = await createDatabase();
    const service = createService(database);
    jest
      .spyOn(database.adapter, "batch")
      .mockRejectedValueOnce(new Error("write_failed"));

    await expect(
      service.execute(commandInput("add", actionId(1), null, null))
    ).rejects.toThrow("write_failed");
    expect(await count(database, "financial_action_groups")).toBe(0);
    expect(await count(database, "metal_action_evidence")).toBe(0);
    expect(await count(database, "metal_lifecycle_events")).toBe(0);

    const foreignService = createService(database);
    await expect(
      foreignService.execute(
        commandInput("add", actionId(2), null, null, null, FOREIGN_USER_ID)
      )
    ).rejects.toThrow("financial_action_auth_scope_changed");
    expect(await count(database, "financial_action_groups")).toBe(0);
    await adapter.initializingPromise;
  });

  it("rejects noncanonical or overflowing revision values before persistence", () => {
    for (const revision of [
      "",
      "00",
      "01",
      "-1",
      "1.0",
      "9223372036854775808",
    ]) {
      expect(() => assertCanonicalMetalRevision(revision)).toThrow(
        "invalid_metal_revision"
      );
    }
    expect(assertCanonicalMetalRevision("9223372036854775807")).toBe(
      "9223372036854775807"
    );
  });
});

function applyLegacyAssetFacts(asset: Asset): void {
  asset.currency = "EGP";
  asset.purchaseCurrency = "EGP";
  asset.purchaseDate = new Date("2026-08-30T00:00:00.000Z");
  asset.purchasePrice = 150000;
  asset.purchasePriceDecimal = "150000";
}
