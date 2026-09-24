import type { Database, Model } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import type {
  Asset,
  AssetMetal,
  MarketRate,
  MarketRateObservation,
  MetalHoldingState,
  MetalLifecycleEvent,
  MetalRateReference,
} from "@monyvi/db";
import { CURRENT_MARKET_INSTRUMENT_CODES } from "@monyvi/logic";

import {
  loadEditableMetalHolding,
  saveEditedMetalHolding,
} from "../../services/edit-metal-holding-facade-service";
import { formatMetalLocalCalendarDate } from "../../services/metal-financial-action-repository";

interface TestDatabaseModule {
  readonly database: Database;
  readonly __adapter: SQLiteAdapter;
}

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown => {
  return jest.requireActual(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  );
});

const IDS = {
  user: "018f0c7a-1234-7abc-8def-000000000101",
  holding: "018f0c7a-1234-7abc-8def-000000000110",
  predecessorEvent: "018f0c7a-1234-7abc-8def-000000000111",
  editAction: "018f0c7a-1234-7abc-8def-000000000112",
  editEvidence: "018f0c7a-1234-7abc-8def-000000000113",
  editEvent: "018f0c7a-1234-7abc-8def-000000000114",
  editMetalRateRef: "018f0c7a-1234-7abc-8def-000000000115",
  editCurrencyRateRef: "018f0c7a-1234-7abc-8def-000000000116",
  genuineAction: "018f0c7a-1234-7abc-8def-000000000122",
  genuineEvidence: "018f0c7a-1234-7abc-8def-000000000123",
  genuineEvent: "018f0c7a-1234-7abc-8def-000000000124",
  genuineMetalRateRef: "018f0c7a-1234-7abc-8def-000000000125",
  genuineCurrencyRateRef: "018f0c7a-1234-7abc-8def-000000000126",
} as const;

let mockCurrentUserId = IDS.user;

jest.mock("../../services/user-data-access", () => {
  const { Q: WatermelonQuery } = jest.requireActual<
    typeof import("@nozbe/watermelondb")
  >("@nozbe/watermelondb");
  return {
    getCurrentUserDataScope: jest.fn(() =>
      Promise.resolve({
        userId: mockCurrentUserId,
        findOwned: async (
          collection: { find: (id: string) => Promise<{ userId: string }> },
          id: string
        ) => {
          const record = await collection.find(id);
          if (record.userId !== mockCurrentUserId)
            throw new Error("not_owned");
          return record;
        },
        queryOwned: (
          collection: { query: (...clauses: unknown[]) => unknown },
          ...clauses: unknown[]
        ) =>
          collection.query(
            WatermelonQuery.where("user_id", mockCurrentUserId),
            ...clauses
          ),
        queryChildrenOfOwnedParent: (
          collection: { query: (...clauses: unknown[]) => unknown },
          parent: { id: string; userId: string },
          foreignKeyColumn: string,
          ...extraClauses: unknown[]
        ) => {
          if (parent.userId !== mockCurrentUserId)
            throw new Error("not_owned");
          return collection.query(
            WatermelonQuery.where(foreignKeyColumn, parent.id),
            ...extraClauses
          );
        },
        assertOwned: <T extends { userId: string }>(record: T): T => {
          if (record.userId !== mockCurrentUserId)
            throw new Error("ownership_failed");
          return record;
        },
      })
    ),
    assertExpectedCurrentUser: jest.fn(() => Promise.resolve()),
    findOwnedById: jest.fn(
      async (
        collection: { find: (id: string) => Promise<{ userId: string }> },
        id: string,
        expectedUserId: string
      ) => {
        const record = await collection.find(id);
        if (record.userId !== expectedUserId) throw new Error("not_owned");
        return record;
      }
    ),
    queryChildrenOfOwnedParent: jest.fn(
      (
        childrenCollection: { query: (...clauses: unknown[]) => unknown },
        parent: { id: string; userId: string },
        expectedUserId: string,
        foreignKeyColumn: string,
        ...extraClauses: unknown[]
      ) => {
        if (parent.userId !== expectedUserId) throw new Error("not_owned");
        return childrenCollection.query(
          WatermelonQuery.where(foreignKeyColumn, parent.id),
          ...extraClauses
        );
      }
    ),
  };
});

jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: (
    _algorithm: unknown,
    canonicalText: string
  ): Promise<string> => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require("node:crypto") as typeof import("node:crypto");
    return Promise.resolve(
      crypto.createHash("sha256").update(canonicalText, "utf8").digest("hex")
    );
  },
  randomUUID: (): string => "018f0c7a-1234-7abc-8def-000000000199",
}));

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
    "MarketRate",
    "MarketRateObservation",
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
  };
});

const { database, __adapter: adapter } =
  jest.requireMock<TestDatabaseModule>("@monyvi/db");

async function resetDatabase(): Promise<void> {
  await adapter.initializingPromise;
  await database.write(
    async (): Promise<void> => database.unsafeResetDatabase()
  );
}

async function seedLegacyHoldingWithNullCatalogVersion(
  withMarketRates = true
): Promise<void> {
  const now = new Date("2026-09-01T10:00:00.000Z");
  await database.write(async () => {
    const assets = database.get<Asset>("assets");
    const metals = database.get<AssetMetal>("asset_metals");
    const states = database.get<MetalHoldingState>("metal_holding_states");
    const events = database.get<MetalLifecycleEvent>("metal_lifecycle_events");

    await assets.create((record) => {
      record._raw.id = IDS.holding;
      record.userId = IDS.user;
      record.name = "Legacy Gold Coin";
      record.type = "METAL";
      record.currency = "EGP";
      record.purchaseCurrency = "EGP";
      record.purchaseDate = new Date("2026-08-01T00:00:00.000Z");
      record.purchasePrice = 0;
      record.purchasePriceDecimal = null;
      record.deleted = false;
      record.updatedAt = now;
    });

    await metals.create((record) => {
      record._raw.id = "018f0c7a-1234-7abc-8def-000000000121";
      record.assetId = IDS.holding;
      record.metalType = "GOLD";
      record.weightGrams = 0;
      record.weightGramsDecimal = null;
      record.purityCode = null;
      record.purityCatalogVersion = null;
      record.purityFraction = 0;
      record.purityFactorDecimal = null;
      record.itemForm = "COIN";
      record.deleted = false;
      record.updatedAt = now;
    });

    await states.create((record) => {
      record._raw.id = "018f0c7a-1234-7abc-8def-000000000122";
      record.holdingId = IDS.holding;
      record.userId = IDS.user;
      record.financialRevision = "0";
      record.effectiveActionId = "018f0c7a-1234-7abc-8def-000000000123";
      record.effectiveEventId = IDS.predecessorEvent;
      record.reconciliationState = "sync_pending";
      record.status = "active";
      record.isVisible = true;
      record.deleted = false;
      record.updatedAt = now;
    });

    await events.create((record) => {
      record._raw.id = IDS.predecessorEvent;
      record.holdingId = IDS.holding;
      record.userId = IDS.user;
      record.actionId = "018f0c7a-1234-7abc-8def-000000000123";
      record.kind = "created";
      record.isEffective = true;
      record.isHistoryVisible = true;
      record.predecessorEventId = null;
      record.reversesEventId = null;
      record.payloadJson = JSON.stringify({
        holdingId: IDS.holding,
        metalType: "GOLD",
      });
      record.occurredAt = now;
      record.deleted = false;
      record.updatedAt = now;
    });

    if (withMarketRates) {
      const marketRates = database.get<MarketRate>("market_rates");
      const observations = database.get<MarketRateObservation>(
        "market_rate_observations"
      );
      const providerObserved = new Date(Date.now() - 3600000);
      const batchId = "018f0c7a-1234-7abc-8def-000000000130";
      const capturedAt = new Date();
      await marketRates.create((record) => {
        record._raw.id = batchId;
        Object.assign(record._raw, { created_at: capturedAt.getTime() });
      });
      for (const [index, code] of CURRENT_MARKET_INSTRUMENT_CODES.entries()) {
        await observations.create((record) => {
          record._raw.id = `018f0c7a-1234-7abc-8def-${String(index + 140).padStart(12, "0")}`;
          Object.assign(record._raw, { created_at: capturedAt.getTime() });
          record.batchId = batchId;
          record.instrumentCode = code;
          record.orientation = "quote_per_base";
          record.providerObservedAt = providerObserved;
          record.quality = "valid";
          record.source = "fixture";
          record.unit = code.startsWith("metal:")
            ? "usd_per_pure_gram"
            : "usd_per_currency_unit";
          record.valueDecimal =
            code === "currency:EGP"
              ? "0.02"
              : code === "currency:USD"
                ? "1"
                : "100";
        });
      }
    }
  });
}

describe("PR332 legacy null purityCatalogVersion edit classification", () => {
  beforeEach(async () => {
    mockCurrentUserId = IDS.user;
    await resetDatabase();
  });

  it("metadata-only edit of legacy holding preserves null catalog version without material correction or rates", async (): Promise<void> => {
    await seedLegacyHoldingWithNullCatalogVersion(true);
    const original = await loadEditableMetalHolding(IDS.holding);

    expect(original.persistedMaterialFacts.purityCatalogVersion).toBeNull();
    expect(original.facts.purityCatalogVersion).toBe("1");

    const today = formatMetalLocalCalendarDate(new Date());
    await saveEditedMetalHolding({
      ids: {
        actionId: IDS.editAction,
        actionEvidenceId: IDS.editEvidence,
        lifecycleEventId: IDS.editEvent,
        metalRateReferenceId: IDS.editMetalRateRef,
        currencyRateReferenceId: IDS.editCurrencyRateRef,
      },
      original,
      current: {
        ...original.facts,
        name: "Renamed Legacy Coin",
      },
      correctionReason: null,
      cairoTodayDate: today,
      staleRateAcknowledged: false,
    });

    const metal = (
      await database.get<AssetMetal>("asset_metals").query().fetch()
    )[0];
    expect(metal.purityCatalogVersion).toBeNull();
    expect(metal.purityCode).toBeNull();
    expect(metal.purityFactorDecimal).toBeNull();
    expect(metal.weightGramsDecimal).toBeNull();

    const state = (
      await database.get<MetalHoldingState>("metal_holding_states").query().fetch()
    )[0];
    expect(state.financialRevision).toBe("0");

    const events = await database
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .query()
      .fetch();
    expect(events).toHaveLength(1);

    const rateRefs = await database
      .get<MetalRateReference>("metal_rate_references")
      .query()
      .fetch();
    expect(rateRefs).toHaveLength(0);
  });

  it("genuine material edit of legacy holding still creates a correction", async (): Promise<void> => {
    await seedLegacyHoldingWithNullCatalogVersion(true);
    const original = await loadEditableMetalHolding(IDS.holding);
    const today = formatMetalLocalCalendarDate(new Date());

    await saveEditedMetalHolding({
      ids: {
        actionId: IDS.genuineAction,
        actionEvidenceId: IDS.genuineEvidence,
        lifecycleEventId: IDS.genuineEvent,
        metalRateReferenceId: IDS.genuineMetalRateRef,
        currencyRateReferenceId: IDS.genuineCurrencyRateRef,
      },
      original,
      current: {
        ...original.facts,
        weightGramsDecimal: "8",
        purityCode: "gold-999",
        purityCatalogVersion: "1",
        purityFactorDecimal: "0.999",
        purchasePriceDecimal: "26000",
        purchaseCurrency: "EGP",
        purchaseDate: today,
        physicalForm: "COIN",
      },
      correctionReason: "Adding missing receipt facts",
      cairoTodayDate: today,
      staleRateAcknowledged: false,
    });

    const events = await database
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .query()
      .fetch();
    expect(events).toHaveLength(2);

    const state = (
      await database.get<MetalHoldingState>("metal_holding_states").query().fetch()
    )[0];
    expect(state.financialRevision).not.toBe("0");
  });
});
