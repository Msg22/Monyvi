import { createHash } from "node:crypto";

import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import type {
  Asset,
  AssetMetal,
  MetalHoldingState,
  MetalLifecycleEvent,
} from "@monyvi/db";
import {
  DEFAULT_FINANCIAL_ACTION_REGISTRY,
  canonicalizeFinancialActionEnvelope,
  type FinancialActionEnvelopeV1,
  type Sha256Provider,
} from "@monyvi/logic";

import {
  createFinancialActionFoundationRepository,
  type FinancialActionUserDataScope,
} from "../../services/financial-action-foundation-repository";
import type {
  EditMetalHoldingCommandDependencies,
  EditMetalHoldingCommandInput,
  EditMetalHoldingCommandService,
} from "../../services/edit-metal-holding-command-service";

interface TestDatabaseModule {
  readonly database: Database;
  readonly __adapter: SQLiteAdapter;
  readonly __modelClasses: Array<typeof Model>;
}
interface EditServiceModule {
  readonly createEditMetalHoldingCommandService: (
    dependencies: EditMetalHoldingCommandDependencies
  ) => EditMetalHoldingCommandService;
}

const IDS = {
  user: "018f0c7a-1234-7abc-8def-000000000003",
  holding: "018f0c7a-1234-7abc-8def-000000000002",
  state: "018f0c7a-1234-7abc-8def-000000000004",
  createdAction: "018f0c7a-1234-7abc-8def-000000000005",
  createdEvent: "018f0c7a-1234-7abc-8def-000000000006",
  correctionAction: "018f0c7a-1234-7abc-8def-000000000010",
  correctionEvidence: "018f0c7a-1234-7abc-8def-000000000011",
  correctionEvent: "018f0c7a-1234-7abc-8def-000000000012",
} as const;

jest.mock("../../services/user-data-access", () => {
  const { Q: WatermelonQuery } = jest.requireActual<
    typeof import("@nozbe/watermelondb")
  >("@nozbe/watermelondb");
  const userId = "018f0c7a-1234-7abc-8def-000000000003";
  return {
    getCurrentUserDataScope: jest.fn(() =>
      Promise.resolve({
        userId,
        queryOwned: (
          collection: { query: (...clauses: unknown[]) => unknown },
          ...clauses: unknown[]
        ) =>
          collection.query(
            WatermelonQuery.where("user_id", userId),
            ...clauses
          ),
        assertOwned: <T extends { userId: string }>(record: T): T => record,
      })
    ),
    assertExpectedCurrentUser: jest.fn(() => Promise.resolve()),
    findOwnedById: async <T extends { readonly userId: string }>(
      collection: { readonly find: (id: string) => Promise<T> },
      id: string,
      expectedUserId: string
    ): Promise<T> => {
      const record = await collection.find(id);
      if (record.userId !== expectedUserId) throw new Error("ownership_failed");
      return record;
    },
    queryChildrenOfOwnedParent: (
      collection: { readonly query: (...clauses: unknown[]) => unknown },
      parent: { readonly id: string; readonly userId: string },
      expectedUserId: string,
      foreignKey: string,
      ...clauses: unknown[]
    ): unknown => {
      if (parent.userId !== expectedUserId) throw new Error("ownership_failed");
      return collection.query(
        WatermelonQuery.where(foreignKey, parent.id),
        ...clauses
      );
    },
  };
});
jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown =>
  jest.requireActual(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);
jest.mock("@monyvi/db", () => {
  const { Database: WatermelonDatabase } = jest.requireActual<
    typeof import("@nozbe/watermelondb")
  >("@nozbe/watermelondb");
  const SQLiteAdapter = jest.requireActual<
    typeof import("@nozbe/watermelondb/adapters/sqlite")
  >("@nozbe/watermelondb/adapters/sqlite").default;
  const { schema } = jest.requireActual<
    typeof import("../../../../packages/db/src/schema")
  >("../../../../packages/db/src/schema");
  const modelClasses = [
    "Asset",
    "AssetMetal",
    "FinancialActionGroup",
    "MetalActionEvidence",
    "MetalHoldingState",
    "MetalLifecycleEvent",
    "MetalRateReference",
  ].map(
    (name) =>
      jest.requireActual<
        Record<string, typeof import("@nozbe/watermelondb").Model>
      >(`../../../../packages/db/src/models/${name}`)[name]
  );
  const adapter = new SQLiteAdapter({ schema });
  return {
    database: new WatermelonDatabase({ adapter, modelClasses }),
    __adapter: adapter,
    __modelClasses: modelClasses,
  };
});

const { database, __adapter: adapter } =
  jest.requireMock<TestDatabaseModule>("@monyvi/db");
const sha256Provider: Sha256Provider = {
  digestUtf8: (value: string): Promise<string> =>
    Promise.resolve(createHash("sha256").update(value, "utf8").digest("hex")),
};

function loadService(): EditServiceModule {
  return jest.requireActual<EditServiceModule>(
    "../../services/edit-metal-holding-command-service"
  );
}
function command(
  overrides: Partial<EditMetalHoldingCommandInput> = {}
): EditMetalHoldingCommandInput {
  return {
    actionId: IDS.correctionAction,
    actionEvidenceId: IDS.correctionEvidence,
    lifecycleEventId: IDS.correctionEvent,
    predecessorEventId: IDS.createdEvent,
    holdingId: IDS.holding,
    userId: IDS.user,
    occurredAt: "2026-09-01T10:15:30.123Z",
    cairoTodayDate: "2026-09-01",
    expectedFinancialRevision: "0",
    correctionReason: "Corrected original receipt",
    originalMetadata: { name: "Wedding coin", notes: "Gift" },
    metadata: { name: "Wedding coin corrected", notes: "هدية 🎁" },
    originalMaterialFacts: {
      weightGramsDecimal: "10.125",
      purityCode: "gold-999",
      purityCatalogVersion: "1",
      purityFactorDecimal: "0.999",
      purchasePriceDecimal: "47800",
      purchaseCurrency: "EGP",
      purchaseDate: "2024-03-14",
      physicalForm: "COIN",
    },
    materialFacts: {
      weightGramsDecimal: "11.125",
      purityCode: "gold-999",
      purityCatalogVersion: "1",
      purityFactorDecimal: "0.999",
      purchasePriceDecimal: "47800",
      purchaseCurrency: "EGP",
      purchaseDate: "2024-03-14",
      physicalForm: "COIN",
    },
    rateSnapshots: [],
    ...overrides,
  };
}
function createEnvelope(
  input: EditMetalHoldingCommandInput,
  payload: Parameters<EditMetalHoldingCommandDependencies["createEnvelope"]>[1]
): FinancialActionEnvelopeV1 {
  return canonicalizeFinancialActionEnvelope(
    {
      actionId: input.actionId,
      accountGuards: [],
      domain: "metals",
      domainReferenceId: input.holdingId,
      envelopeVersion: "monyvi.financial-action/v1",
      kind: "correct",
      occurredAt: input.occurredAt,
      payloadVersion: "metals.correct/v1",
      userId: input.userId,
      payload,
    },
    DEFAULT_FINANCIAL_ACTION_REGISTRY,
    { latestAllowedCalendarDate: input.cairoTodayDate }
  );
}
function scope(): Promise<FinancialActionUserDataScope> {
  return Promise.resolve({
    userId: IDS.user,
    queryOwned: (collection, ...clauses) =>
      collection.query(Q.where("user_id", IDS.user), ...clauses),
    assertOwned: <T extends { userId: string }>(record: T): T => record,
  });
}
function createService(
  db: Database = database
): EditMetalHoldingCommandService {
  const repository = createFinancialActionFoundationRepository({
    database: db,
    getCurrentUserDataScope: scope,
    assertExpectedCurrentUser: (): Promise<void> => Promise.resolve(),
    registry: DEFAULT_FINANCIAL_ACTION_REGISTRY,
  });
  return loadService().createEditMetalHoldingCommandService({
    database: db,
    commitFinancialActionGroupLocally:
      repository.commitFinancialActionGroupLocally,
    createEnvelope,
    hashProvider: sha256Provider,
  });
}
async function seedHolding(
  status: "active" | "sold" = "active",
  isLegacy = false
): Promise<void> {
  await database.write(async (): Promise<void> => {
    await database.get<Asset>("assets").create((record): void => {
      record._raw.id = IDS.holding;
      record.acquisitionActionId = IDS.createdAction;
      record.currency = "EGP";
      record.deleted = false;
      record.isLiquid = true;
      record.name = "Wedding coin";
      record.notes = "Gift";
      record.purchaseCurrency = "EGP";
      record.purchaseDate = new Date("2024-03-14T00:00:00.000Z");
      record.purchasePrice = 47800;
      record.purchasePriceDecimal = isLegacy ? null : "47800";
      record.type = "METAL";
      record.updatedAt = new Date("2026-08-31T10:00:00.000Z");
      record.userId = IDS.user;
    });
    await database.get<AssetMetal>("asset_metals").create((record): void => {
      record.assetId = IDS.holding;
      record.deleted = false;
      record.itemForm = "COIN";
      record.metalType = "GOLD";
      record.purityCatalogVersion = isLegacy ? null : "1";
      record.purityCode = isLegacy ? null : "gold-999";
      record.purityFactorDecimal = isLegacy ? null : "0.999";
      record.purityFraction = 0.999;
      record.updatedAt = new Date("2026-08-31T10:00:00.000Z");
      record.weightGrams = 10.125;
      record.weightGramsDecimal = isLegacy ? null : "10.125";
    });
    await database
      .get<MetalHoldingState>("metal_holding_states")
      .create((record): void => {
        record._raw.id = IDS.state;
        record.deleted = false;
        record.effectiveActionId = IDS.createdAction;
        record.effectiveEventId = IDS.createdEvent;
        record.financialRevision = "0";
        record.holdingId = IDS.holding;
        record.isVisible = true;
        record.reconciliationState = "complete";
        record.status = status;
        record.updatedAt = new Date("2026-08-31T10:00:00.000Z");
        record.userId = IDS.user;
      });
    await database
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .create((record): void => {
        record._raw.id = IDS.createdEvent;
        record.actionId = IDS.createdAction;
        record.deleted = false;
        record.holdingId = IDS.holding;
        record.isEffective = true;
        record.isHistoryVisible = true;
        record.kind = "created";
        record.occurredAt = new Date("2024-03-14T00:00:00.000Z");
        record.payloadJson = "{}";
        record.predecessorEventId = null;
        record.reversesEventId = null;
        record.updatedAt = new Date("2026-08-31T10:00:00.000Z");
        record.userId = IDS.user;
      });
  });
}

describe("Edit metal holding command SQLite atomicity", () => {
  beforeEach(async (): Promise<void> => {
    await adapter.initializingPromise;
    await database.write(
      async (): Promise<void> => database.unsafeResetDatabase()
    );
    jest.restoreAllMocks();
  });
  it("commits projection, incremented revision, immutable evidence, and History atomically", async (): Promise<void> => {
    await seedHolding();
    await expect(createService().save(command())).resolves.toEqual({
      kind: "correction",
    });
    expect((await database.get<Asset>("assets").find(IDS.holding)).name).toBe(
      "Wedding coin corrected"
    );
    expect(
      (
        await database
          .get<MetalHoldingState>("metal_holding_states")
          .query()
          .fetch()
      )[0].financialRevision
    ).toBe("1");
    expect(
      await database.get<Model>("metal_action_evidence").query().fetch()
    ).toHaveLength(1);
    const history = await database
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .query()
      .fetch();
    expect(history).toHaveLength(2);
    expect(
      history.find((event) => event.id === IDS.createdEvent)?.isEffective
    ).toBe(false);
  });
  it("uses metadata LWW without financial history and requires a reason for material changes", async (): Promise<void> => {
    await seedHolding();
    const service = createService();
    await expect(
      service.save(command({ materialFacts: null, correctionReason: null }))
    ).resolves.toEqual({ kind: "metadata" });
    const stateAfterMetadata = (
      await database
        .get<MetalHoldingState>("metal_holding_states")
        .query()
        .fetch()
    )[0];
    expect(stateAfterMetadata.nameWrittenAt).toBe(
      new Date("2026-09-01T10:15:30.123Z").getTime()
    );
    expect(stateAfterMetadata.nameWriterId).toBe(IDS.user);
    expect(stateAfterMetadata.notesWrittenAt).toBe(
      new Date("2026-09-01T10:15:30.123Z").getTime()
    );
    expect(stateAfterMetadata.notesWriterId).toBe(IDS.user);
    expect(
      await database.get<Model>("metal_action_evidence").query().fetch()
    ).toHaveLength(0);
    await expect(
      service.save(command({ correctionReason: null }))
    ).rejects.toThrow("correction_reason_required");
  });
  it("ignores older metadata edit and honors newer clock under LWW", async (): Promise<void> => {
    await seedHolding();
    const service = createService();
    await service.save(
      command({
        materialFacts: null,
        correctionReason: null,
        metadata: { name: "Newer Name", notes: "Newer Note" },
        occurredAt: "2026-09-01T12:00:00.000Z",
      })
    );
    expect((await database.get<Asset>("assets").find(IDS.holding)).name).toBe(
      "Newer Name"
    );

    await service.save(
      command({
        materialFacts: null,
        correctionReason: null,
        metadata: { name: "Older Name", notes: "Older Note" },
        occurredAt: "2026-09-01T11:00:00.000Z",
      })
    );
    expect((await database.get<Asset>("assets").find(IDS.holding)).name).toBe(
      "Newer Name"
    );
  });
  it("updates metadata clocks in mixed edits and ignores older metadata in mixed edits", async (): Promise<void> => {
    await seedHolding();
    const service = createService();
    await service.save(
      command({
        metadata: { name: "Mixed Newer Name", notes: "Mixed Newer Note" },
        occurredAt: "2026-09-01T12:00:00.000Z",
      })
    );
    const asset = await database.get<Asset>("assets").find(IDS.holding);
    const state = (
      await database
        .get<MetalHoldingState>("metal_holding_states")
        .query()
        .fetch()
    )[0];
    expect(asset.name).toBe("Mixed Newer Name");
    expect(state.nameWrittenAt).toBe(
      new Date("2026-09-01T12:00:00.000Z").getTime()
    );
    expect(state.nameWriterId).toBe(IDS.user);
    expect(state.notesWrittenAt).toBe(
      new Date("2026-09-01T12:00:00.000Z").getTime()
    );
    expect(state.notesWriterId).toBe(IDS.user);

    const nextCmd = command({
      actionId: "018f0c7a-1234-7abc-8def-000000000091",
      actionEvidenceId: "018f0c7a-1234-7abc-8def-000000000092",
      lifecycleEventId: "018f0c7a-1234-7abc-8def-000000000093",
      predecessorEventId: IDS.correctionEvent,
      expectedFinancialRevision: "1",
      originalMetadata: { name: "Mixed Newer Name", notes: "Mixed Newer Note" },
      originalMaterialFacts: {
        ...command().originalMaterialFacts,
        weightGramsDecimal: "11.125",
      },
      materialFacts: {
        ...command().originalMaterialFacts,
        weightGramsDecimal: "12.125",
      },
      metadata: { name: "Mixed Older Name", notes: "Mixed Older Note" },
      occurredAt: "2026-09-01T11:00:00.000Z",
    });
    await service.save(nextCmd);
    const assetAfter = await database.get<Asset>("assets").find(IDS.holding);
    const stateAfter = (
      await database
        .get<MetalHoldingState>("metal_holding_states")
        .query()
        .fetch()
    )[0];
    expect(assetAfter.name).toBe("Mixed Newer Name");
    expect(stateAfter.nameWrittenAt).toBe(
      new Date("2026-09-01T12:00:00.000Z").getTime()
    );
  });
  it("keeps legacy Name and Notes editable without fabricating exact material evidence", async (): Promise<void> => {
    await seedHolding("active", true);
    const legacyFacts = {
      ...command().originalMaterialFacts,
      weightGramsDecimal: "",
      purityCode: "",
      purityFactorDecimal: "",
      purchasePriceDecimal: "",
    };
    await expect(
      createService().save(
        command({
          originalMaterialFacts: legacyFacts,
          materialFacts: null,
          correctionReason: null,
        })
      )
    ).resolves.toEqual({ kind: "metadata" });
    expect((await database.get<Asset>("assets").find(IDS.holding)).name).toBe(
      "Wedding coin corrected"
    );
    expect(
      (
        await database
          .get<MetalHoldingState>("metal_holding_states")
          .query()
          .fetch()
      )[0].financialRevision
    ).toBe("0");
    expect(
      await database.get<Model>("metal_action_evidence").query().fetch()
    ).toHaveLength(0);
    expect(
      await database.get<Model>("metal_lifecycle_events").query().fetch()
    ).toHaveLength(1);
  });
  it("replays the same action and rejects a changed payload with the same action id", async (): Promise<void> => {
    await seedHolding();
    const service = createService();
    await service.save(command());
    await expect(service.save(command())).resolves.toEqual({ kind: "replay" });
    await expect(
      service.save(command({ metadata: { name: "Changed", notes: null } }))
    ).rejects.toThrow("action_id_payload_mismatch");
  });
  it("refuses material correction of terminal holdings while metadata remains editable", async (): Promise<void> => {
    await seedHolding("sold");
    const service = createService();
    await expect(service.save(command())).rejects.toThrow(
      "terminal_holding_material_edit_forbidden"
    );
    await expect(
      service.save(command({ materialFacts: null, correctionReason: null }))
    ).resolves.toEqual({ kind: "metadata" });
  });
  it("blocks material corrections during reconciliation_incomplete", async (): Promise<void> => {
    await seedHolding();
    await database.write(async () => {
      const state = (
        await database
          .get<MetalHoldingState>("metal_holding_states")
          .query()
          .fetch()
      )[0];
      await state.update((record) => {
        record.reconciliationState = "reconciliation_incomplete";
      });
    });
    const service = createService();
    await expect(service.save(command())).rejects.toThrow(
      "holding_reconciliation_incomplete"
    );
  });
  it("invalidates acquisition links when acquisition basis changes without rate snapshots", async (): Promise<void> => {
    await seedHolding();
    const service = createService();
    const cmd = command({
      materialFacts: {
        ...command().originalMaterialFacts,
        purchaseDate: "2024-03-20",
      },
      rateSnapshots: [],
    });
    await service.save(cmd);
    const asset = await database.get<Asset>("assets").find(IDS.holding);
    expect(asset.acquisitionActionId).toBeNull();
  });
  it("corrects a legacy holding without throwing holding_projection_changed", async (): Promise<void> => {
    await seedHolding("active", true);
    const legacyFacts = {
      weightGramsDecimal: null,
      purityCode: null,
      purityCatalogVersion: null,
      purityFactorDecimal: null,
      purchasePriceDecimal: null,
      purchaseCurrency: "EGP",
      purchaseDate: "2024-03-14",
      physicalForm: "COIN" as const,
    };
    const completeFacts = {
      weightGramsDecimal: "10.125",
      purityCode: "gold-999",
      purityCatalogVersion: "1" as const,
      purityFactorDecimal: "0.999",
      purchasePriceDecimal: "47800",
      purchaseCurrency: "EGP",
      purchaseDate: "2024-03-14",
      physicalForm: "COIN" as const,
    };
    const service = createService();
    await expect(
      service.save(
        command({
          originalMaterialFacts: legacyFacts,
          materialFacts: completeFacts,
          correctionReason: "Adding missing receipt facts",
        })
      )
    ).resolves.toEqual({ kind: "correction" });
    const metal = (
      await database.get<AssetMetal>("asset_metals").query().fetch()
    )[0];
    expect(metal.weightGramsDecimal).toBe("10.125");
    expect(metal.purityCode).toBe("gold-999");
  });
});
