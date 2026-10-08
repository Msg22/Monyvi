import { createHash } from "node:crypto";
import { Q, type Database } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import type {
  Asset,
  AssetMetal,
  FinancialActionGroup,
  MarketRate,
  MarketRateObservation,
  MetalHoldingState,
  MetalLifecycleEvent,
} from "@monyvi/db";
import {
  DEFAULT_FINANCIAL_ACTION_REGISTRY,
  canonicalizeFinancialActionEnvelope,
  type FinancialActionEnvelopeV1,
  type RegisteredActionPayload,
  type Sha256Provider,
} from "@monyvi/logic";

import type { DisposeMetalHoldingCommandInput } from "../../services/dispose-metal-holding-command-service";

interface TestDatabaseModule {
  readonly database: Database;
  readonly __adapter: SQLiteAdapter;
}

interface DisposeReadModelModule {
  readonly loadDisposableMetalHolding: (holdingId: string) => Promise<{
    readonly holdingId: string;
    readonly name: string;
    readonly userId: string;
    readonly status: "active" | "sold" | "disposed";
    readonly expectedFinancialRevision: string;
    readonly predecessorEventId: string | null;
    readonly purchaseDate: string;
  }>;
  readonly loadDisposeTerminalRateSnapshots: (
    holdingId: string,
    disposalDate: string,
    options?: { readonly nowMs?: number }
  ) => Promise<
    readonly {
      readonly role: "terminal_metal" | "terminal_purchase_currency";
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
    }[]
  >;
}

const IDS = {
  user: "018f0c7a-1234-7abc-8def-000000000003",
  foreignUser: "018f0c7a-1234-7abc-8def-000000000099",
  holding: "018f0c7a-1234-7abc-8def-000000000002",
  state: "018f0c7a-1234-7abc-8def-000000000004",
  createdAction: "018f0c7a-1234-7abc-8def-000000000005",
  createdEvent: "018f0c7a-1234-7abc-8def-000000000006",
  disposeAction: "018f0c7a-1234-7abc-8def-000000000010",
  disposeEvidence: "018f0c7a-1234-7abc-8def-000000000011",
  disposeEvent: "018f0c7a-1234-7abc-8def-000000000012",
  batchToday: "batch-today-000000000000000000000001",
  batchOld: "batch-old-000000000000000000000002",
} as const;

jest.mock("../../services/user-data-access", () => {
  const { Q: scopedQ } = jest.requireActual<
    typeof import("@nozbe/watermelondb")
  >("@nozbe/watermelondb");
  return {
    getCurrentUserDataScope: jest.fn(),
    assertExpectedCurrentUser: jest.fn(() => Promise.resolve()),
    queryOwned: (
      collection: { query: (...args: never[]) => never },
      userId: string,
      ...clauses: never[]
    ): never =>
      (collection.query as (...args: never[]) => never)(
        scopedQ.where("user_id", userId) as never,
        ...clauses
      ),
    queryChildrenOfOwnedParent: (
      collection: { query: (...args: never[]) => never },
      parentRecord: { id: string; userId: string },
      userId: string,
      foreignKey: string,
      ...clauses: never[]
    ): never => {
      if (parentRecord.userId !== userId) throw new Error("ownership_failed");
      return (collection.query as (...args: never[]) => never)(
        scopedQ.where(foreignKey, parentRecord.id) as never,
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
    "MarketRate",
    "MarketRateObservation",
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

function loadReadModel(): DisposeReadModelModule {
  return jest.requireActual<DisposeReadModelModule>(
    "../../services/dispose-metal-holding-read-model-service"
  );
}

function testScope(userId: string = IDS.user): unknown {
  return {
    userId,
    queryOwned: (
      collection: { query: (...args: unknown[]) => unknown },
      ...clauses: unknown[]
    ): unknown =>
      (collection.query as (...args: unknown[]) => unknown)(
        Q.where("user_id", userId),
        ...clauses
      ),
    assertOwned: <T extends { userId: string }>(record: T): T => {
      if (record.userId !== userId) throw new Error("ownership_failed");
      return record;
    },
    queryChildrenOfOwnedParent: (
      collection: { query: (...args: unknown[]) => unknown },
      parentRecord: { id: string },
      foreignKey: string,
      ...clauses: unknown[]
    ): unknown =>
      (collection.query as (...args: unknown[]) => unknown)(
        Q.where(foreignKey, parentRecord.id),
        ...clauses
      ),
  };
}

async function seedHolding(
  status: "active" | "sold" | "disposed" = "active",
  options: {
    readonly isVisible?: boolean;
    readonly reconciliationState?: string;
    readonly purchaseCurrency?: string;
  } = {}
): Promise<void> {
  await database.write(async (): Promise<void> => {
    await database.get<Asset>("assets").create((record): void => {
      record._raw.id = IDS.holding;
      record.acquisitionActionId = IDS.createdAction;
      record.currency = "EGP";
      record.deleted = false;
      record.isLiquid = true;
      record.name = "Wedding coin";
      record.notes = null;
      record.purchaseCurrency = options.purchaseCurrency ?? "EGP";
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
        record.isVisible = options.isVisible ?? true;
        record.reconciliationState = options.reconciliationState ?? "accepted";
        record.status = status;
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

async function seedRateBatch(options: {
  readonly batchId: string;
  readonly capturedAt: string;
  readonly metalObservedAt: string | null;
  readonly currencyObservedAt: string | null;
  readonly metalInstrument?: string;
  readonly metalValue?: string;
  readonly currencyValue?: string;
  readonly currencyInstrument?: string;
  readonly source?: string;
  readonly duplicateMetalValue?: string;
  readonly observationCreatedAt?: string;
}): Promise<void> {
  const captured = new Date(options.capturedAt);
  const observationCreatedAt = options.observationCreatedAt
    ? new Date(options.observationCreatedAt)
    : captured;
  const source = options.source ?? "test-provider";
  await database.write(async (): Promise<void> => {
    await database.get<MarketRate>("market_rates").create((record): void => {
      record._raw.id = options.batchId;
      Object.assign(record._raw, { created_at: captured.getTime() });
    });
    await database
      .get<MarketRateObservation>("market_rate_observations")
      .create((record): void => {
        record.batchId = options.batchId;
        Object.assign(record._raw, {
          created_at: observationCreatedAt.getTime(),
        });
        record.instrumentCode = options.metalInstrument ?? "metal:GOLD";
        record.orientation = "quote_per_base";
        if (options.metalObservedAt === null) {
          Object.assign(record._raw, { provider_observed_at: null });
        } else {
          record.providerObservedAt = new Date(options.metalObservedAt);
        }
        record.quality = "valid";
        record.source = source;
        record.unit = "usd_per_pure_gram";
        record.valueDecimal = options.metalValue ?? "3600";
      });
    if (options.duplicateMetalValue !== undefined) {
      const duplicateMetalValue: string = options.duplicateMetalValue;
      await database
        .get<MarketRateObservation>("market_rate_observations")
        .create((record): void => {
          record.batchId = options.batchId;
          Object.assign(record._raw, {
            created_at: observationCreatedAt.getTime(),
          });
          record.instrumentCode = options.metalInstrument ?? "metal:GOLD";
          record.orientation = "quote_per_base";
          record.providerObservedAt = new Date(
            options.metalObservedAt ?? options.capturedAt
          );
          record.quality = "valid";
          record.source = source;
          record.unit = "usd_per_pure_gram";
          record.valueDecimal = duplicateMetalValue;
        });
    }
    await database
      .get<MarketRateObservation>("market_rate_observations")
      .create((record): void => {
        record.batchId = options.batchId;
        Object.assign(record._raw, {
          created_at: observationCreatedAt.getTime(),
        });
        record.instrumentCode = options.currencyInstrument ?? "currency:EGP";
        record.orientation = "quote_per_base";
        if (options.currencyObservedAt === null) {
          Object.assign(record._raw, { provider_observed_at: null });
        } else {
          record.providerObservedAt = new Date(options.currencyObservedAt);
        }
        record.quality = "valid";
        record.source = source;
        record.unit = "usd_per_currency_unit";
        record.valueDecimal = options.currencyValue ?? "0.02";
      });
  });
}

const FIXED_NOW_MS = new Date("2026-09-05T12:00:00.000Z").getTime();

beforeEach(async (): Promise<void> => {
  await adapter.initializingPromise;
  await database.write(
    async (): Promise<void> => database.unsafeResetDatabase()
  );
  jest.restoreAllMocks();
  const { getCurrentUserDataScope } = jest.requireMock<{
    getCurrentUserDataScope: jest.Mock;
  }>("../../services/user-data-access");
  getCurrentUserDataScope.mockImplementation(() =>
    Promise.resolve(testScope())
  );
});

describe("Dispose read-model holding loader", () => {
  it("loads the exact owned holding revision, predecessor, and purchase date", async (): Promise<void> => {
    await seedHolding();
    await expect(
      loadReadModel().loadDisposableMetalHolding(IDS.holding)
    ).resolves.toEqual({
      holdingId: IDS.holding,
      name: "Wedding coin",
      userId: IDS.user,
      status: "active",
      expectedFinancialRevision: "0",
      predecessorEventId: IDS.createdEvent,
      purchaseDate: "2024-03-14",
    });
  });

  it.each(["sold", "disposed"] as const)(
    "fails closed for %s holdings",
    async (status): Promise<void> => {
      await seedHolding(status);
      await expect(
        loadReadModel().loadDisposableMetalHolding(IDS.holding)
      ).rejects.toThrow("metal_holding_not_active");
    }
  );

  it("fails closed for foreign rows without leaking their facts", async (): Promise<void> => {
    await seedHolding();
    const { getCurrentUserDataScope } = jest.requireMock<{
      getCurrentUserDataScope: jest.Mock;
    }>("../../services/user-data-access");
    getCurrentUserDataScope.mockImplementation(() =>
      Promise.resolve(testScope(IDS.foreignUser))
    );
    await expect(
      loadReadModel().loadDisposableMetalHolding(IDS.holding)
    ).rejects.toThrow("metal_holding_not_found");
  });

  it.each([
    { isVisible: false, reconciliationState: "accepted" },
    { isVisible: true, reconciliationState: "reconciliation_incomplete" },
    { isVisible: true, reconciliationState: "pending_local" },
  ])(
    "fails closed for a non-effective projection %o",
    async (projection): Promise<void> => {
      await seedHolding("active", projection);
      await expect(
        loadReadModel().loadDisposableMetalHolding(IDS.holding)
      ).rejects.toThrow("metal_dispose_effective_active_holding_required");
    }
  );
});

describe("Dispose terminal pair loader", () => {
  it("returns the latest complete pair for today with actual capture and provider dates", async (): Promise<void> => {
    await seedHolding();
    await seedRateBatch({
      batchId: IDS.batchOld,
      capturedAt: "2026-09-03T10:00:10.000Z",
      metalObservedAt: "2026-09-03T10:00:00.000Z",
      currencyObservedAt: "2026-09-03T10:00:00.000Z",
      metalValue: "3500",
      currencyValue: "0.021",
    });
    await seedRateBatch({
      batchId: IDS.batchToday,
      capturedAt: "2026-09-05T10:00:10.000Z",
      metalObservedAt: "2026-09-05T10:00:00.000Z",
      currencyObservedAt: "2026-09-05T10:00:00.000Z",
    });
    const drafts = await loadReadModel().loadDisposeTerminalRateSnapshots(
      IDS.holding,
      "2026-09-05",
      { nowMs: FIXED_NOW_MS }
    );
    expect(drafts).toHaveLength(2);
    expect(drafts.map((draft) => draft.role).sort()).toEqual([
      "terminal_metal",
      "terminal_purchase_currency",
    ]);
    const metal = drafts.find((draft) => draft.role === "terminal_metal");
    expect(metal).toMatchObject({
      kind: "metal",
      instrumentCode: "metal:GOLD",
      valueDecimal: "3600",
      unit: "usd_per_pure_gram",
      orientation: "quote_per_base",
      providerObservedAt: "2026-09-05T10:00:00.000Z",
      quality: "valid",
      capturedFreshness: "fresh",
      capturedAt: "2026-09-05T10:00:10.000Z",
    });
  });

  it("never relabels later observations as a backdated historical pair", async (): Promise<void> => {
    await seedHolding();
    await seedRateBatch({
      batchId: IDS.batchOld,
      capturedAt: "2026-09-01T10:00:10.000Z",
      metalObservedAt: "2026-09-01T10:00:00.000Z",
      currencyObservedAt: "2026-09-01T10:00:00.000Z",
      metalValue: "3500",
      currencyValue: "0.021",
    });
    await seedRateBatch({
      batchId: IDS.batchToday,
      capturedAt: "2026-09-05T10:00:10.000Z",
      metalObservedAt: "2026-09-05T10:00:00.000Z",
      currencyObservedAt: "2026-09-05T10:00:00.000Z",
    });
    const drafts = await loadReadModel().loadDisposeTerminalRateSnapshots(
      IDS.holding,
      "2026-09-02",
      { nowMs: FIXED_NOW_MS }
    );
    expect(drafts).toHaveLength(2);
    expect(
      drafts.find((draft) => draft.role === "terminal_metal")
    ).toMatchObject({
      valueDecimal: "3500",
      providerObservedAt: "2026-09-01T10:00:00.000Z",
    });
  });

  it("omits the pair for a historical date when provider dates are unknown", async (): Promise<void> => {
    await seedHolding();
    await seedRateBatch({
      batchId: IDS.batchToday,
      capturedAt: "2026-09-05T10:00:10.000Z",
      metalObservedAt: null,
      currencyObservedAt: null,
    });
    await expect(
      loadReadModel().loadDisposeTerminalRateSnapshots(
        IDS.holding,
        "2026-09-02",
        {
          nowMs: FIXED_NOW_MS,
        }
      )
    ).resolves.toEqual([]);
  });

  it("returns an empty pair when the metal or currency leg is missing", async (): Promise<void> => {
    await seedHolding();
    await seedRateBatch({
      batchId: IDS.batchToday,
      capturedAt: "2026-09-05T10:00:10.000Z",
      metalObservedAt: "2026-09-05T10:00:00.000Z",
      currencyObservedAt: "2026-09-05T10:00:00.000Z",
      metalInstrument: "metal:SILVER",
    });
    await expect(
      loadReadModel().loadDisposeTerminalRateSnapshots(
        IDS.holding,
        "2026-09-05",
        {
          nowMs: FIXED_NOW_MS,
        }
      )
    ).resolves.toEqual([]);
  });

  it("uses the exact USD identity without a stored currency observation", async (): Promise<void> => {
    await seedHolding("active", { purchaseCurrency: "USD" });
    await database.write(async (): Promise<void> => {
      await database.get<MarketRate>("market_rates").create((record): void => {
        record._raw.id = IDS.batchToday;
        Object.assign(record._raw, {
          created_at: new Date("2026-09-05T10:00:10.000Z").getTime(),
        });
      });
      await database
        .get<MarketRateObservation>("market_rate_observations")
        .create((record): void => {
          record.batchId = IDS.batchToday;
          Object.assign(record._raw, {
            created_at: new Date("2026-09-05T10:00:10.000Z").getTime(),
          });
          record.instrumentCode = "metal:GOLD";
          record.orientation = "quote_per_base";
          record.providerObservedAt = new Date("2026-09-05T10:00:00.000Z");
          record.quality = "valid";
          record.source = "test-provider";
          record.unit = "usd_per_pure_gram";
          record.valueDecimal = "3600";
        });
    });
    const drafts = await loadReadModel().loadDisposeTerminalRateSnapshots(
      IDS.holding,
      "2026-09-05",
      { nowMs: FIXED_NOW_MS }
    );
    expect(drafts).toHaveLength(2);
    expect(
      drafts.find((draft) => draft.role === "terminal_purchase_currency")
    ).toMatchObject({
      kind: "currency",
      instrumentCode: "currency:USD",
      valueDecimal: "1",
      unit: "usd_per_currency_unit",
      orientation: "quote_per_base",
      providerObservedAt: null,
      quality: "valid",
      capturedFreshness: "unknown",
    });
  });

  it("surfaces a rate-store failure so retry blocks submission", async (): Promise<void> => {
    await seedHolding();
    const originalGet = database.get.bind(database);
    const failingGet = jest.spyOn(database, "get").mockImplementation(((
      table: string
    ) => {
      if (table === "market_rates" || table === "market_rate_observations") {
        throw new Error("disk_full");
      }
      return originalGet(table as "assets");
    }) as typeof database.get);
    await expect(
      loadReadModel().loadDisposeTerminalRateSnapshots(
        IDS.holding,
        "2026-09-05",
        {
          nowMs: FIXED_NOW_MS,
        }
      )
    ).rejects.toThrow("rate_store_unavailable");
    failingGet.mockRestore();
  });
});

describe("Dispose terminal pair ambiguity and fixture precedence", () => {
  it("skips an ambiguous batch with duplicate evidence for one leg", async (): Promise<void> => {
    await seedHolding();
    await seedRateBatch({
      batchId: IDS.batchOld,
      capturedAt: "2026-09-03T10:00:10.000Z",
      metalObservedAt: "2026-09-03T10:00:00.000Z",
      currencyObservedAt: "2026-09-03T10:00:00.000Z",
      metalValue: "3500",
      currencyValue: "0.021",
    });
    await seedRateBatch({
      batchId: IDS.batchToday,
      capturedAt: "2026-09-05T10:00:10.000Z",
      metalObservedAt: "2026-09-05T10:00:00.000Z",
      currencyObservedAt: "2026-09-05T10:00:00.000Z",
      duplicateMetalValue: "9999",
    });
    const drafts = await loadReadModel().loadDisposeTerminalRateSnapshots(
      IDS.holding,
      "2026-09-05",
      { nowMs: FIXED_NOW_MS }
    );
    expect(drafts).toHaveLength(2);
    expect(
      drafts.find((draft) => draft.role === "terminal_metal")
    ).toMatchObject({
      valueDecimal: "3500",
      providerObservedAt: "2026-09-03T10:00:00.000Z",
    });
  });

  it("prefers real provider evidence over a newer manual fixture batch", async (): Promise<void> => {
    await seedHolding();
    await seedRateBatch({
      batchId: IDS.batchOld,
      capturedAt: "2026-09-04T10:00:10.000Z",
      metalObservedAt: "2026-09-04T10:00:00.000Z",
      currencyObservedAt: "2026-09-04T10:00:00.000Z",
      metalValue: "3550",
      currencyValue: "0.0205",
    });
    await seedRateBatch({
      batchId: IDS.batchToday,
      capturedAt: "2026-09-05T10:00:10.000Z",
      metalObservedAt: "2026-09-05T10:00:00.000Z",
      currencyObservedAt: "2026-09-05T10:00:00.000Z",
      metalValue: "3600",
      source: "manual_qa_fixture:test",
    });
    const drafts = await loadReadModel().loadDisposeTerminalRateSnapshots(
      IDS.holding,
      "2026-09-05",
      { nowMs: FIXED_NOW_MS }
    );
    expect(drafts).toHaveLength(2);
    expect(
      drafts.find((draft) => draft.role === "terminal_metal")
    ).toMatchObject({
      valueDecimal: "3550",
      source: "test-provider",
    });
  });

  it("uses a fixture pair only when no provider pair exists", async (): Promise<void> => {
    await seedHolding();
    await seedRateBatch({
      batchId: IDS.batchToday,
      capturedAt: "2026-09-05T10:00:10.000Z",
      metalObservedAt: "2026-09-05T10:00:00.000Z",
      currencyObservedAt: "2026-09-05T10:00:00.000Z",
      metalValue: "3600",
      source: "manual_qa_fixture:test",
    });
    const drafts = await loadReadModel().loadDisposeTerminalRateSnapshots(
      IDS.holding,
      "2026-09-05",
      { nowMs: FIXED_NOW_MS }
    );
    expect(drafts).toHaveLength(2);
    expect(
      drafts.find((draft) => draft.role === "terminal_metal")
    ).toMatchObject({ valueDecimal: "3600" });
  });

  it("skips a batch whose observations carry a different capture time", async (): Promise<void> => {
    await seedHolding();
    await seedRateBatch({
      batchId: IDS.batchOld,
      capturedAt: "2026-09-03T10:00:10.000Z",
      metalObservedAt: "2026-09-03T10:00:00.000Z",
      currencyObservedAt: "2026-09-03T10:00:00.000Z",
      metalValue: "3500",
      currencyValue: "0.021",
    });
    await seedRateBatch({
      batchId: IDS.batchToday,
      capturedAt: "2026-09-05T10:00:10.000Z",
      metalObservedAt: "2026-09-05T10:00:00.000Z",
      currencyObservedAt: "2026-09-05T10:00:00.000Z",
      observationCreatedAt: "2026-09-04T10:00:10.000Z",
    });
    const drafts = await loadReadModel().loadDisposeTerminalRateSnapshots(
      IDS.holding,
      "2026-09-05",
      { nowMs: FIXED_NOW_MS }
    );
    expect(
      drafts.find((draft) => draft.role === "terminal_metal")
    ).toMatchObject({ valueDecimal: "3500" });
  });
});

describe("Dispose production loader-to-command integration", () => {
  it("commits exactly the loaded pair through the real command service", async (): Promise<void> => {
    const { getCurrentUserDataScope } = jest.requireMock<{
      getCurrentUserDataScope: jest.Mock;
    }>("../../services/user-data-access");
    getCurrentUserDataScope.mockImplementation(() =>
      Promise.resolve(testScope())
    );
    await seedHolding();
    await seedRateBatch({
      batchId: IDS.batchToday,
      capturedAt: "2026-09-05T10:00:10.000Z",
      metalObservedAt: "2026-09-05T10:00:00.000Z",
      currencyObservedAt: "2026-09-05T10:00:00.000Z",
    });
    const readModel = loadReadModel();
    const holding = await readModel.loadDisposableMetalHolding(IDS.holding);
    const drafts = await readModel.loadDisposeTerminalRateSnapshots(
      IDS.holding,
      "2026-09-05",
      { nowMs: FIXED_NOW_MS }
    );
    expect(drafts).toHaveLength(2);
    const { createDisposeMetalHoldingCommandService } = jest.requireActual<{
      createDisposeMetalHoldingCommandService: (dependencies: unknown) => {
        dispose: (
          input: DisposeMetalHoldingCommandInput
        ) => Promise<{ readonly kind: string; readonly holdingId: string }>;
      };
    }>("../../services/dispose-metal-holding-command-service");
    const { createFinancialActionFoundationRepository } = jest.requireActual<
      typeof import("../../services/financial-action-foundation-repository")
    >("../../services/financial-action-foundation-repository");
    const repository = createFinancialActionFoundationRepository({
      database,
      getCurrentUserDataScope: () => Promise.resolve(testScope() as never),
      assertExpectedCurrentUser: (): Promise<void> => Promise.resolve(),
      registry: DEFAULT_FINANCIAL_ACTION_REGISTRY,
    });
    const service = createDisposeMetalHoldingCommandService({
      database,
      getCurrentUserDataScope: () => Promise.resolve(testScope() as never),
      commitFinancialActionGroupLocally:
        repository.commitFinancialActionGroupLocally,
      createEnvelope: (
        input: DisposeMetalHoldingCommandInput,
        payload: RegisteredActionPayload
      ): FinancialActionEnvelopeV1 =>
        canonicalizeFinancialActionEnvelope(
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
          { latestAllowedCalendarDate: input.latestAllowedCalendarDate }
        ),
      hashProvider: sha256Provider,
    });
    const rateSnapshots = drafts.map((draft, index) => ({
      ...draft,
      referenceId: [
        "118f0c7a-1234-7abc-8def-000000000021",
        "118f0c7a-1234-7abc-8def-000000000022",
      ][index] as string,
    }));
    await expect(
      service.dispose({
        actionId: IDS.disposeAction,
        actionEvidenceId: IDS.disposeEvidence,
        lifecycleEventId: IDS.disposeEvent,
        predecessorEventId: holding.predecessorEventId,
        holdingId: holding.holdingId,
        userId: holding.userId,
        occurredAt: "2026-09-05T10:15:30.123Z",
        latestAllowedCalendarDate: "2026-09-05",
        expectedFinancialRevision: holding.expectedFinancialRevision,
        disposalDate: "2026-09-05",
        category: "donated",
        otherTreatment: null,
        notes: null,
        rateSnapshots,
      })
    ).resolves.toEqual({ kind: "committed", holdingId: IDS.holding });
  });
});
