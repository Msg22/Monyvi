import { createHash } from "node:crypto";

import type { Database, Model } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import {
  DEFAULT_FINANCIAL_ACTION_REGISTRY,
  canonicalizeFinancialActionEnvelope,
  type FinancialActionEnvelopeV1,
  type Sha256Provider,
} from "@monyvi/logic";

import type {
  Asset,
  AssetMetal,
  FinancialActionGroup,
  MetalActionEvidence,
  MetalHoldingState,
  MetalLifecycleEvent,
  MetalRateReference,
} from "@monyvi/db";
import { createFinancialActionFoundationRepository } from "../../services/financial-action-foundation-repository";

interface TestDatabaseModule {
  readonly database: Database;
  readonly __adapter: SQLiteAdapter;
  readonly __modelClasses: Array<typeof Model>;
}

interface AddMetalHoldingCommandModule {
  readonly createAddMetalHoldingCommandService: (
    dependencies: AddMetalHoldingCommandDependencies
  ) => {
    readonly add: (
      input: AddMetalHoldingCommandInput
    ) => Promise<{
      readonly kind: "committed" | "replay";
      readonly holdingId: string;
    }>;
  };
}

interface AddMetalHoldingCommandDependencies {
  readonly database: Database;
  readonly commitFinancialActionGroupLocally: ReturnType<
    typeof createFinancialActionFoundationRepository
  >["commitFinancialActionGroupLocally"];
  readonly createEnvelope: (
    input: AddMetalHoldingCommandInput
  ) => FinancialActionEnvelopeV1;
  readonly hashProvider: Sha256Provider;
}

interface AddRateSnapshot {
  readonly referenceId: string;
  readonly role: "acquisition_metal" | "acquisition_purchase_currency";
  readonly kind: "metal" | "currency";
  readonly instrumentCode: string;
  readonly valueDecimal: string;
  readonly unit:
    | "usd_per_pure_gram"
    | "usd_per_currency_unit"
    | "currency_units_per_usd";
  readonly orientation: "quote_per_base" | "base_per_quote";
  readonly providerObservedAt: string | null;
  readonly source: string | null;
  readonly quality: "valid";
  readonly capturedFreshness: "fresh" | "stale" | "unknown";
  readonly capturedAt: string;
}

interface AddMetalHoldingCommandInput {
  readonly actionId: string;
  readonly holdingId: string;
  readonly holdingStateId: string;
  readonly actionEvidenceId: string;
  readonly lifecycleEventId: string;
  readonly userId: string;
  readonly occurredAt: string;
  readonly cairoTodayDate: string;
  readonly holding: {
    readonly name: string;
    readonly metal: "GOLD" | "SILVER";
    readonly weightGramsDecimal: string;
    readonly purity: {
      readonly code: string;
      readonly catalogVersion: "1";
      readonly factorDecimal: string;
      readonly labelKey: string;
    };
    readonly purchasePriceDecimal: string;
    readonly purchaseCurrency: string;
    readonly purchaseDate: string;
    readonly physicalForm: "COIN" | "BAR" | "JEWELRY" | null;
    readonly notes: string | null;
  };
  readonly rateSnapshots: readonly AddRateSnapshot[];
}

const IDS = {
  action: "018f0c7a-1234-7abc-8def-000000000001",
  holding: "018f0c7a-1234-7abc-8def-000000000002",
  user: "018f0c7a-1234-7abc-8def-000000000003",
  state: "018f0c7a-1234-7abc-8def-000000000004",
  evidence: "018f0c7a-1234-7abc-8def-000000000005",
  event: "018f0c7a-1234-7abc-8def-000000000006",
  metalRate: "018f0c7a-1234-7abc-8def-000000000007",
  currencyRate: "018f0c7a-1234-7abc-8def-000000000008",
  foreignUser: "018f0c7a-1234-7abc-8def-000000000099",
} as const;

let mockCurrentUserId = IDS.user;

jest.mock("../../services/user-data-access", () => {
  const { Q } = jest.requireActual<typeof import("@nozbe/watermelondb")>(
    "@nozbe/watermelondb"
  );
  return {
    getCurrentUserDataScope: jest.fn(() =>
      Promise.resolve({
        userId: mockCurrentUserId,
        queryOwned: (
          collection: { query: (...clauses: unknown[]) => unknown },
          ...clauses: unknown[]
        ) =>
          collection.query(Q.where("user_id", mockCurrentUserId), ...clauses),
        assertOwned: <T extends { userId: string }>(record: T): T => {
          if (record.userId !== mockCurrentUserId)
            throw new Error("ownership_failed");
          return record;
        },
      })
    ),
    assertExpectedCurrentUser: jest.fn(
      (expectedUserId: string): Promise<void> => {
        if (expectedUserId !== mockCurrentUserId)
          throw new Error("auth_scope_changed");
        return Promise.resolve();
      }
    ),
  };
});

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown => {
  return jest.requireActual(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  );
});

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
  const modelModules = [
    "Asset",
    "AssetMetal",
    "FinancialActionGroup",
    "MetalActionEvidence",
    "MetalHoldingState",
    "MetalLifecycleEvent",
    "MetalRateReference",
  ].map(
    (name) =>
      jest.requireActual<Record<string, typeof Model>>(
        `../../../../packages/db/src/models/${name}`
      )[name]
  );
  const adapter = new SQLiteAdapter({ schema });
  const database = new WatermelonDatabase({
    adapter,
    modelClasses: modelModules,
  });

  return {
    database,
    __adapter: adapter,
    __modelClasses: modelModules,
  };
});

const {
  database,
  __adapter: adapter,
  __modelClasses: modelClasses,
} = jest.requireMock<TestDatabaseModule>("@monyvi/db");

const sha256Provider: Sha256Provider = {
  digestUtf8: (canonicalText: string): Promise<string> =>
    Promise.resolve(
      createHash("sha256").update(canonicalText, "utf8").digest("hex")
    ),
};

function loadCommandModule(): AddMetalHoldingCommandModule {
  return jest.requireActual(
    "../../services/add-metal-holding-command-service"
  ) as AddMetalHoldingCommandModule;
}

function rateSnapshots(): readonly AddRateSnapshot[] {
  return [
    {
      referenceId: IDS.metalRate,
      role: "acquisition_metal",
      kind: "metal",
      instrumentCode: "metal:GOLD",
      valueDecimal: "75.25",
      unit: "usd_per_pure_gram",
      orientation: "quote_per_base",
      providerObservedAt: "2026-08-31T10:15:30.123Z",
      source: "provider-a",
      quality: "valid",
      capturedFreshness: "fresh",
      capturedAt: "2026-08-31T10:16:00.123Z",
    },
    {
      referenceId: IDS.currencyRate,
      role: "acquisition_purchase_currency",
      kind: "currency",
      instrumentCode: "currency:EGP",
      valueDecimal: "0.0205",
      unit: "usd_per_currency_unit",
      orientation: "quote_per_base",
      providerObservedAt: "2026-08-31T10:15:30.123Z",
      source: "provider-a",
      quality: "valid",
      capturedFreshness: "fresh",
      capturedAt: "2026-08-31T10:16:00.123Z",
    },
  ];
}

function input(
  overrides: Partial<AddMetalHoldingCommandInput> = {}
): AddMetalHoldingCommandInput {
  return {
    actionId: IDS.action,
    holdingId: IDS.holding,
    holdingStateId: IDS.state,
    actionEvidenceId: IDS.evidence,
    lifecycleEventId: IDS.event,
    userId: IDS.user,
    occurredAt: "2026-09-01T10:15:30.123Z",
    cairoTodayDate: "2026-09-01",
    holding: {
      name: "Wedding coin",
      metal: "GOLD",
      weightGramsDecimal: "10.125",
      purity: {
        code: "gold-999",
        catalogVersion: "1",
        factorDecimal: "0.999",
        labelKey: "purity_gold_999",
      },
      purchasePriceDecimal: "47800",
      purchaseCurrency: "EGP",
      purchaseDate: "2024-03-14",
      physicalForm: "COIN",
      notes: "هدية 🎁",
    },
    rateSnapshots: rateSnapshots(),
    ...overrides,
  };
}

function createEnvelope(
  command: AddMetalHoldingCommandInput
): FinancialActionEnvelopeV1 {
  return canonicalizeFinancialActionEnvelope(
    {
      actionId: command.actionId,
      accountGuards: [],
      domain: "metals",
      domainReferenceId: command.holdingId,
      envelopeVersion: "monyvi.financial-action/v1",
      kind: "add",
      occurredAt: command.occurredAt,
      payloadVersion: "metals.add/v1",
      userId: command.userId,
      payload: {
        holdingId: command.holdingId,
        expectedHoldingRevision: null,
        predecessorEventId: null,
        reversesEventId: null,
        metalType: command.holding.metal,
        metadata: {
          name: command.holding.name,
          notes: command.holding.notes,
        },
        materialFacts: {
          physicalForm: command.holding.physicalForm,
          weightGramsDecimal: command.holding.weightGramsDecimal,
          purityCode: command.holding.purity.code,
          purityFactorDecimal: command.holding.purity.factorDecimal,
          purityCatalogVersion: command.holding.purity.catalogVersion,
          purchasePriceDecimal: command.holding.purchasePriceDecimal,
          purchaseCurrency: command.holding.purchaseCurrency,
          purchaseDate: command.holding.purchaseDate,
        },
        rateSnapshots: command.rateSnapshots,
      },
    },
    DEFAULT_FINANCIAL_ACTION_REGISTRY,
    { cairoTodayDate: command.cairoTodayDate }
  );
}

function userScope() {
  const { Q } = jest.requireActual<typeof import("@nozbe/watermelondb")>(
    "@nozbe/watermelondb"
  );
  return Promise.resolve({
    userId: mockCurrentUserId,
    queryOwned: (
      collection: { query: (...clauses: unknown[]) => unknown },
      ...clauses: unknown[]
    ) => collection.query(Q.where("user_id", mockCurrentUserId), ...clauses),
    assertOwned: <T extends { userId: string }>(record: T): T => {
      if (record.userId !== mockCurrentUserId)
        throw new Error("ownership_failed");
      return record;
    },
  });
}

function createService(db: Database = database) {
  const repository = createFinancialActionFoundationRepository({
    database: db,
    getCurrentUserDataScope: userScope,
    assertExpectedCurrentUser: (expectedUserId: string): Promise<void> => {
      if (expectedUserId !== mockCurrentUserId)
        throw new Error("auth_scope_changed");
      return Promise.resolve();
    },
    registry: DEFAULT_FINANCIAL_ACTION_REGISTRY,
  });
  return loadCommandModule().createAddMetalHoldingCommandService({
    database: db,
    commitFinancialActionGroupLocally:
      repository.commitFinancialActionGroupLocally,
    createEnvelope,
    hashProvider: sha256Provider,
  });
}

async function openFreshDatabase(): Promise<Database> {
  const clonedAdapter = await adapter.testClone();
  const { Database: WatermelonDatabase } = jest.requireActual<
    typeof import("@nozbe/watermelondb")
  >("@nozbe/watermelondb");
  return new WatermelonDatabase({ adapter: clonedAdapter, modelClasses });
}

async function fetchAll<T extends Model>(
  db: Database,
  table: string
): Promise<T[]> {
  return db.get<T>(table).query().fetch();
}

describe("Add metal holding command SQLite atomicity", () => {
  beforeEach(async () => {
    await adapter.initializingPromise;
    mockCurrentUserId = IDS.user;
    await database.write(async (): Promise<void> => {
      await database.unsafeResetDatabase();
    });
    jest.restoreAllMocks();
  });

  it("commits one complete exact local action group and survives database re-instantiation", async () => {
    await expect(createService().add(input())).resolves.toEqual({
      kind: "committed",
      holdingId: IDS.holding,
    });

    const reopened = await openFreshDatabase();
    const [root] = await fetchAll<FinancialActionGroup>(
      reopened,
      "financial_action_groups"
    );
    const [asset] = await fetchAll<Asset>(reopened, "assets");
    const [metal] = await fetchAll<AssetMetal>(reopened, "asset_metals");
    const [state] = await fetchAll<MetalHoldingState>(
      reopened,
      "metal_holding_states"
    );
    const [evidence] = await fetchAll<MetalActionEvidence>(
      reopened,
      "metal_action_evidence"
    );
    const [event] = await fetchAll<MetalLifecycleEvent>(
      reopened,
      "metal_lifecycle_events"
    );
    const references = await fetchAll<MetalRateReference>(
      reopened,
      "metal_rate_references"
    );

    expect(root).toMatchObject({
      actionId: IDS.action,
      domain: "metals",
      domainReferenceId: IDS.holding,
      kind: "add",
      state: "local_complete",
      userId: IDS.user,
    });
    expect(asset).toMatchObject({
      id: IDS.holding,
      acquisitionActionId: IDS.action,
      name: "Wedding coin",
      purchasePriceDecimal: "47800",
      purchaseCurrency: "EGP",
      userId: IDS.user,
    });
    expect(metal).toMatchObject({
      assetId: IDS.holding,
      metalType: "GOLD",
      weightGramsDecimal: "10.125",
      purityCode: "gold-999",
      purityCatalogVersion: "1",
      purityFactorDecimal: "0.999",
      itemForm: "COIN",
    });
    expect(state).toMatchObject({
      id: IDS.state,
      holdingId: IDS.holding,
      status: "active",
      financialRevision: "0",
      effectiveActionId: IDS.action,
      effectiveEventId: IDS.event,
      isVisible: true,
      reconciliationState: "sync_pending",
      userId: IDS.user,
    });
    expect(evidence).toMatchObject({
      id: IDS.evidence,
      actionId: IDS.action,
      holdingId: IDS.holding,
      kind: "add",
      expectedHoldingRevision: null,
      canonicalHoldingRevision: "0",
      userId: IDS.user,
    });
    expect(event).toMatchObject({
      id: IDS.event,
      actionId: IDS.action,
      holdingId: IDS.holding,
      kind: "created",
      isEffective: true,
      isHistoryVisible: true,
      userId: IDS.user,
    });
    expect(references).toHaveLength(2);
    expect(references.map((reference) => reference.id).sort()).toEqual(
      [IDS.currencyRate, IDS.metalRate].sort()
    );
  });

  it("replays one stable action without creating duplicate domain rows", async () => {
    const service = createService();
    await service.add(input());

    await expect(service.add(input())).resolves.toEqual({
      kind: "replay",
      holdingId: IDS.holding,
    });
    await expect(
      service.add(
        input({
          holding: { ...input().holding, name: "Changed payload" },
        })
      )
    ).rejects.toThrow("action_id_payload_mismatch");

    const reopened = await openFreshDatabase();
    for (const table of [
      "financial_action_groups",
      "assets",
      "asset_metals",
      "metal_holding_states",
      "metal_action_evidence",
      "metal_lifecycle_events",
    ]) {
      expect(await fetchAll(reopened, table)).toHaveLength(1);
    }
    expect(await fetchAll(reopened, "metal_rate_references")).toHaveLength(2);
  });

  it("rolls back every linked row when the SQLite batch fails", async () => {
    jest
      .spyOn(database.adapter, "batch")
      .mockRejectedValueOnce(new Error("write_failed"));

    await expect(createService().add(input())).rejects.toThrow("write_failed");

    const reopened = await openFreshDatabase();
    for (const table of [
      "financial_action_groups",
      "assets",
      "asset_metals",
      "metal_holding_states",
      "metal_action_evidence",
      "metal_lifecycle_events",
      "metal_rate_references",
    ]) {
      expect(await fetchAll(reopened, table)).toHaveLength(0);
    }
  });

  it("rejects a foreign owner before writing", async () => {
    await expect(
      createService().add(input({ userId: IDS.foreignUser }))
    ).rejects.toThrow("financial_action_auth_scope_changed");
    expect(
      await fetchAll(await openFreshDatabase(), "financial_action_groups")
    ).toHaveLength(0);
  });

  it("preserves complete facts without rate references and does not invent acquisition evidence", async () => {
    await createService().add(input({ rateSnapshots: [] }));
    const reopened = await openFreshDatabase();
    const [asset] = await fetchAll<Asset>(reopened, "assets");
    const [state] = await fetchAll<MetalHoldingState>(
      reopened,
      "metal_holding_states"
    );

    expect(asset).toMatchObject({
      id: IDS.holding,
      acquisitionActionId: null,
      purchasePriceDecimal: "47800",
    });
    expect(state).toMatchObject({
      reconciliationState: "sync_pending",
      status: "active",
    });
    expect(await fetchAll(reopened, "metal_rate_references")).toHaveLength(0);
  });
});
