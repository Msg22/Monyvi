import { createHash } from "node:crypto";
import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import type {
  Asset,
  AssetMetal,
  FinancialActionGroup,
  MetalActionEvidence,
  MetalHoldingState,
  MetalLifecycleEvent,
  MetalRateReference,
} from "@monyvi/db";
import {
  DEFAULT_FINANCIAL_ACTION_REGISTRY,
  canonicalizeFinancialActionEnvelope,
  type FinancialActionEnvelopeV1,
  type Sha256Provider,
} from "@monyvi/logic";

import { createFinancialActionFoundationRepository } from "../../services/financial-action-foundation-repository";
import type {
  DisposeMetalHoldingCommandDependencies,
  DisposeMetalHoldingCommandInput,
  DisposeMetalHoldingCommandService,
} from "../../services/dispose-metal-holding-command-service";

interface TestDatabaseModule {
  readonly database: Database;
  readonly __adapter: SQLiteAdapter;
}

interface DisposeServiceModule {
  readonly createDisposeMetalHoldingCommandService: (
    dependencies: DisposeMetalHoldingCommandDependencies
  ) => DisposeMetalHoldingCommandService;
}

const IDS = {
  user: "018f0c7a-1234-7abc-8def-000000000003",
  holding: "018f0c7a-1234-7abc-8def-000000000002",
  state: "018f0c7a-1234-7abc-8def-000000000004",
  createdAction: "018f0c7a-1234-7abc-8def-000000000005",
  createdEvent: "018f0c7a-1234-7abc-8def-000000000006",
  disposeAction: "018f0c7a-1234-7abc-8def-000000000010",
  disposeEvidence: "018f0c7a-1234-7abc-8def-000000000011",
  disposeEvent: "018f0c7a-1234-7abc-8def-000000000012",
  terminalMetalReference: "018f0c7a-1234-7abc-8def-000000000017",
  terminalCurrencyReference: "018f0c7a-1234-7abc-8def-000000000018",
} as const;

jest.mock("../../services/user-data-access", () => ({
  getCurrentUserDataScope: jest.fn(),
  assertExpectedCurrentUser: jest.fn(() => Promise.resolve()),
}));
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
  };
});

const { database, __adapter: adapter } =
  jest.requireMock<TestDatabaseModule>("@monyvi/db");
const sha256Provider: Sha256Provider = {
  digestUtf8: (value: string): Promise<string> =>
    Promise.resolve(createHash("sha256").update(value, "utf8").digest("hex")),
};

function loadService(): DisposeServiceModule {
  return jest.requireActual<DisposeServiceModule>(
    "../../services/dispose-metal-holding-command-service"
  );
}

function command(
  overrides: Partial<DisposeMetalHoldingCommandInput> = {}
): DisposeMetalHoldingCommandInput {
  return {
    actionId: IDS.disposeAction,
    actionEvidenceId: IDS.disposeEvidence,
    lifecycleEventId: IDS.disposeEvent,
    predecessorEventId: IDS.createdEvent,
    holdingId: IDS.holding,
    userId: IDS.user,
    occurredAt: "2026-09-05T10:15:30.123Z",
    cairoTodayDate: "2026-09-05",
    expectedFinancialRevision: "0",
    disposalDate: "2026-09-05",
    category: "lost_stolen",
    otherTreatment: null,
    notes: null,
    rateSnapshots: [],
    ...overrides,
  };
}

function terminalRateSnapshots(): DisposeMetalHoldingCommandInput["rateSnapshots"] {
  return [
    {
      referenceId: IDS.terminalMetalReference,
      role: "terminal_metal",
      kind: "metal",
      instrumentCode: "metal:GOLD",
      valueDecimal: "3600",
      unit: "usd_per_pure_gram",
      orientation: "quote_per_base",
      providerObservedAt: "2026-09-05T10:00:00.000Z",
      source: "provider-a",
      quality: "valid",
      capturedFreshness: "fresh",
      capturedAt: "2026-09-05T10:00:10.000Z",
    },
    {
      referenceId: IDS.terminalCurrencyReference,
      role: "terminal_purchase_currency",
      kind: "currency",
      instrumentCode: "currency:EGP",
      valueDecimal: "0.02",
      unit: "usd_per_currency_unit",
      orientation: "quote_per_base",
      providerObservedAt: "2026-09-05T10:00:00.000Z",
      source: "provider-a",
      quality: "valid",
      capturedFreshness: "fresh",
      capturedAt: "2026-09-05T10:00:10.000Z",
    },
  ];
}

type DisposeServiceScope = Awaited<
  ReturnType<DisposeMetalHoldingCommandDependencies["getCurrentUserDataScope"]>
>;

function scope(): Promise<DisposeServiceScope> {
  return Promise.resolve({
    userId: IDS.user,
    queryOwned: (collection, ...clauses) =>
      collection.query(Q.where("user_id", IDS.user), ...clauses),
    assertOwned: <T extends { userId: string }>(record: T): T => {
      if (record.userId !== IDS.user) throw new Error("ownership_failed");
      return record;
    },
    queryChildrenOfOwnedParent: (
      collection,
      parentRecord,
      foreignKey,
      ...clauses
    ) => collection.query(Q.where(foreignKey, parentRecord.id), ...clauses),
  });
}

function createEnvelope(
  input: DisposeMetalHoldingCommandInput,
  payload: Parameters<
    DisposeMetalHoldingCommandDependencies["createEnvelope"]
  >[1]
): FinancialActionEnvelopeV1 {
  return canonicalizeFinancialActionEnvelope(
    {
      actionId: input.actionId,
      accountGuards: [],
      domain: "metals",
      domainReferenceId: input.holdingId,
      envelopeVersion: "monyvi.financial-action/v1",
      kind: "dispose",
      occurredAt: input.occurredAt,
      payloadVersion: "metals.dispose/v1",
      userId: input.userId,
      payload,
    },
    DEFAULT_FINANCIAL_ACTION_REGISTRY,
    { cairoTodayDate: input.cairoTodayDate }
  );
}

function createService(): DisposeMetalHoldingCommandService {
  const repository = createFinancialActionFoundationRepository({
    database,
    getCurrentUserDataScope: () => scope(),
    assertExpectedCurrentUser: (): Promise<void> => Promise.resolve(),
    registry: DEFAULT_FINANCIAL_ACTION_REGISTRY,
  });
  return loadService().createDisposeMetalHoldingCommandService({
    database,
    getCurrentUserDataScope: () => scope(),
    commitFinancialActionGroupLocally:
      repository.commitFinancialActionGroupLocally,
    createEnvelope: (input, payload) => createEnvelope(input, payload),
    hashProvider: sha256Provider,
  });
}

async function seedHolding(): Promise<void> {
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
      record.purchasePriceDecimal = "47800";
      record.type = "METAL";
      record.updatedAt = new Date("2026-09-04T10:00:00.000Z");
      record.userId = IDS.user;
    });
    await database.get<AssetMetal>("asset_metals").create((record): void => {
      record.assetId = IDS.holding;
      record.deleted = false;
      record.itemForm = "COIN";
      record.metalType = "GOLD";
      record.purityCatalogVersion = "1";
      record.purityCode = "gold-999";
      record.purityFactorDecimal = "0.999";
      record.purityFraction = 0.999;
      record.updatedAt = new Date("2026-09-04T10:00:00.000Z");
      record.weightGrams = 10.125;
      record.weightGramsDecimal = "10.125";
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
        record.reconciliationState = "accepted";
        record.status = "active";
        record.updatedAt = new Date("2026-09-04T10:00:00.000Z");
        record.userId = IDS.user;
      });
    await database
      .get<FinancialActionGroup>("financial_action_groups")
      .create((record): void => {
        record._raw.id = IDS.createdAction;
        record.accountGuardsJson = "[]";
        record.actionId = IDS.createdAction;
        record.deleted = false;
        record.domain = "metals";
        record.domainReferenceId = IDS.holding;
        record.kind = "add";
        record.outcomeJson = null;
        record.payloadHash = "a".repeat(64);
        record.payloadJson = "{}";
        record.rejectionCode = null;
        record.serverOutcome = null;
        record.state = "accepted";
        record.updatedAt = new Date("2026-09-04T10:00:00.000Z");
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
        record.updatedAt = new Date("2026-09-04T10:00:00.000Z");
        record.userId = IDS.user;
      });
  });
}

describe("Dispose terminal rate evidence SQLite lifecycle", () => {
  beforeEach(async (): Promise<void> => {
    await adapter.initializingPromise;
    await database.write(
      async (): Promise<void> => database.unsafeResetDatabase()
    );
    jest.restoreAllMocks();
  });

  it("persists the terminal rate snapshot pair with the disposal evidence", async (): Promise<void> => {
    await seedHolding();
    const rateSnapshots = terminalRateSnapshots();
    await expect(
      createService().dispose(command({ rateSnapshots }))
    ).resolves.toEqual({ kind: "committed", holdingId: IDS.holding });

    const references = await database
      .get<MetalRateReference>("metal_rate_references")
      .query()
      .fetch();
    expect(
      references.map((reference) => [
        reference.id,
        reference.role,
        reference.kind,
        reference.instrumentCode,
        reference.valueDecimal,
        reference.capturedFreshness,
        reference.userId,
        reference.holdingId,
        reference.actionId,
      ])
    ).toEqual([
      [
        IDS.terminalMetalReference,
        "terminal_metal",
        "metal",
        "metal:GOLD",
        "3600",
        "fresh",
        IDS.user,
        IDS.holding,
        IDS.disposeAction,
      ],
      [
        IDS.terminalCurrencyReference,
        "terminal_purchase_currency",
        "currency",
        "currency:EGP",
        "0.02",
        "fresh",
        IDS.user,
        IDS.holding,
        IDS.disposeAction,
      ],
    ]);
    const evidence = await database
      .get<MetalActionEvidence>("metal_action_evidence")
      .query()
      .fetch();
    expect(JSON.parse(evidence[0].domainPayloadJson)).toMatchObject({
      rateSnapshots,
    });
  });

  it("validates terminal rate reference ids and pair completeness before the local commit", async (): Promise<void> => {
    await seedHolding();
    await expect(
      createService().dispose(
        command({
          rateSnapshots: terminalRateSnapshots().map((snapshot, index) =>
            index === 0 ? { ...snapshot, referenceId: "not-a-uuid" } : snapshot
          ),
        })
      )
    ).rejects.toThrow("metal_dispose_invalid_local_id");
    await expect(
      createService().dispose(
        command({
          rateSnapshots: terminalRateSnapshots().slice(0, 1),
        })
      )
    ).rejects.toThrow("financial_action_invalid_payload");
    await expect(
      createService().dispose(
        command({
          rateSnapshots: terminalRateSnapshots().map((snapshot) => ({
            ...snapshot,
            referenceId: IDS.terminalMetalReference,
          })),
        })
      )
    ).rejects.toThrow("metal_dispose_invalid_local_id");
    expect(
      await database.get<Model>("metal_rate_references").query().fetch()
    ).toHaveLength(0);
    expect(
      await database.get<Model>("metal_action_evidence").query().fetch()
    ).toHaveLength(0);
    expect(
      (
        await database
          .get<MetalHoldingState>("metal_holding_states")
          .query()
          .fetch()
      )[0]
    ).toMatchObject({ status: "active", financialRevision: "0" });
  });

  it("rejects terminal rate evidence bound to another instrument", async (): Promise<void> => {
    await seedHolding();
    await expect(
      createService().dispose(
        command({
          rateSnapshots: terminalRateSnapshots().map((snapshot) =>
            snapshot.kind === "metal"
              ? { ...snapshot, instrumentCode: "metal:SILVER" }
              : snapshot
          ),
        })
      )
    ).rejects.toThrow("metal_dispose_rate_context_invalid");
    expect(
      await database.get<Model>("metal_rate_references").query().fetch()
    ).toHaveLength(0);
    expect(
      await database.get<Model>("metal_action_evidence").query().fetch()
    ).toHaveLength(0);
    expect(
      (
        await database
          .get<MetalHoldingState>("metal_holding_states")
          .query()
          .fetch()
      )[0]
    ).toMatchObject({ status: "active", financialRevision: "0" });
  });

  it("rolls back terminal rate references with the failed group and replays them idempotently", async (): Promise<void> => {
    await seedHolding();
    const rateSnapshots = terminalRateSnapshots();
    const batch = jest
      .spyOn(database, "batch")
      .mockRejectedValueOnce(new Error("disk_full"));
    await expect(
      createService().dispose(command({ rateSnapshots }))
    ).rejects.toThrow("disk_full");
    expect(
      await database.get<Model>("metal_rate_references").query().fetch()
    ).toHaveLength(0);
    batch.mockRestore();

    await expect(
      createService().dispose(command({ rateSnapshots }))
    ).resolves.toMatchObject({ kind: "committed" });
    await expect(
      createService().dispose(command({ rateSnapshots }))
    ).resolves.toMatchObject({ kind: "replay" });
    expect(
      await database
        .get<MetalRateReference>("metal_rate_references")
        .query()
        .fetch()
    ).toHaveLength(2);
    expect(
      await database
        .get<MetalLifecycleEvent>("metal_lifecycle_events")
        .query()
        .fetch()
    ).toHaveLength(2);
  });
});
