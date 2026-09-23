import { createHash } from "node:crypto";

import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import type {
  Asset,
  AssetMetal,
  FinancialActionGroup,
  MarketRate,
  MarketRateObservation,
  MetalHoldingState,
  MetalLifecycleEvent,
  MetalRateReference,
} from "@monyvi/db";

import {
  addMetalHoldingFromForm,
  type AddMetalHoldingFormSubmission,
} from "../../services/add-metal-holding-facade-service";
import {
  saveEditedMetalHolding,
  type EditMetalHoldingSubmission,
} from "../../services/edit-metal-holding-facade-service";
import { CURRENT_MARKET_INSTRUMENT_CODES } from "@monyvi/logic";
import { createFinancialActionGroup } from "../../services/financial-action-foundation-repository";
import { createMetalFinancialActionEnvelope } from "../../services/metal-financial-action-adapter";
import { formatMetalLocalCalendarDate } from "../../services/metal-financial-action-repository";
import {
  getCurrentUserDataScope,
  type CurrentUserDataScope,
} from "../../services/user-data-access";

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
  user: "018f0c7a-1234-7abc-8def-000000000001",
  addHolding: "018f0c7a-1234-7abc-8def-000000000002",
  addAction: "018f0c7a-1234-7abc-8def-000000000003",
  addState: "018f0c7a-1234-7abc-8def-000000000004",
  addEvidence: "018f0c7a-1234-7abc-8def-000000000005",
  addEvent: "018f0c7a-1234-7abc-8def-000000000006",
  addMetalRateRef: "018f0c7a-1234-7abc-8def-000000000007",
  addCurrencyRateRef: "018f0c7a-1234-7abc-8def-000000000008",

  editHolding: "018f0c7a-1234-7abc-8def-000000000010",
  editPredecessorEvent: "018f0c7a-1234-7abc-8def-000000000011",
  editAction: "018f0c7a-1234-7abc-8def-000000000012",
  editEvidence: "018f0c7a-1234-7abc-8def-000000000013",
  editEvent: "018f0c7a-1234-7abc-8def-000000000014",
  editMetalRateRef: "018f0c7a-1234-7abc-8def-000000000015",
  editCurrencyRateRef: "018f0c7a-1234-7abc-8def-000000000016",
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
          Q.where(foreignKeyColumn, parent.id),
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
  randomUUID: (): string => "018f0c7a-1234-7abc-8def-000000000099",
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

function validAddSubmission(
  overrides: Partial<AddMetalHoldingFormSubmission> = {}
): AddMetalHoldingFormSubmission {
  const today = formatMetalLocalCalendarDate(new Date());
  return {
    cairoTodayDate: today,
    staleRateAcknowledged: false,
    ids: {
      actionId: IDS.addAction,
      holdingId: IDS.addHolding,
      holdingStateId: IDS.addState,
      actionEvidenceId: IDS.addEvidence,
      lifecycleEventId: IDS.addEvent,
      metalRateReferenceId: IDS.addMetalRateRef,
      currencyRateReferenceId: IDS.addCurrencyRateRef,
    },
    holding: {
      name: "Gold Sovereign",
      metal: "GOLD",
      weightGramsDecimal: "8",
      purity: {
        code: "gold-999",
        catalogVersion: "1",
        factorDecimal: "0.999",
        labelKey: "gold_24k",
      },
      purchasePriceDecimal: "32000",
      purchaseCurrency: "EGP",
      purchaseDate: today,
      physicalForm: "COIN",
      notes: "Birthday gift",
    },
    ...overrides,
  };
}

async function seedHoldingForEdit(
  options: {
    withMarketRates?: boolean;
    staleMarketRates?: boolean;
  } = {}
): Promise<void> {
  const now = new Date("2026-09-01T10:00:00.000Z");
  await database.write(async () => {
    const assets = database.get<Asset>("assets");
    const metals = database.get<AssetMetal>("asset_metals");
    const states = database.get<MetalHoldingState>("metal_holding_states");
    const events = database.get<MetalLifecycleEvent>("metal_lifecycle_events");

    await assets.create((record) => {
      record._raw.id = IDS.editHolding;
      record.userId = IDS.user;
      record.name = "Initial Gold Coin";
      record.type = "METAL";
      record.currency = "EGP";
      record.purchaseCurrency = "EGP";
      record.purchaseDate = new Date("2026-08-01T00:00:00.000Z");
      record.purchasePrice = 25000;
      record.purchasePriceDecimal = "25000";
      record.deleted = false;
      record.updatedAt = now;
    });

    await metals.create((record) => {
      record._raw.id = "018f0c7a-1234-7abc-8def-000000000021";
      record.assetId = IDS.editHolding;
      record.metalType = "GOLD";
      record.weightGrams = 8;
      record.weightGramsDecimal = "8";
      record.purityCode = "gold-999";
      record.purityCatalogVersion = "1";
      record.purityFraction = 0.999;
      record.purityFactorDecimal = "0.999";
      record.itemForm = "COIN";
      record.deleted = false;
      record.updatedAt = now;
    });

    await states.create((record) => {
      record._raw.id = "018f0c7a-1234-7abc-8def-000000000022";
      record.holdingId = IDS.editHolding;
      record.userId = IDS.user;
      record.financialRevision = "0";
      record.effectiveActionId = "018f0c7a-1234-7abc-8def-000000000023";
      record.effectiveEventId = IDS.editPredecessorEvent;
      record.reconciliationState = "sync_pending";
      record.status = "active";
      record.deleted = false;
      record.updatedAt = now;
    });

    await events.create((record) => {
      record._raw.id = IDS.editPredecessorEvent;
      record.holdingId = IDS.editHolding;
      record.userId = IDS.user;
      record.actionId = "018f0c7a-1234-7abc-8def-000000000023";
      record.kind = "created";
      record.isEffective = true;
      record.isHistoryVisible = true;
      record.predecessorEventId = null;
      record.reversesEventId = null;
      record.payloadJson = JSON.stringify({
        holdingId: IDS.editHolding,
        metalType: "GOLD",
      });
      record.occurredAt = now;
      record.deleted = false;
      record.updatedAt = now;
    });

    if (options.withMarketRates) {
      const marketRates = database.get<MarketRate>("market_rates");
      const observations = database.get<MarketRateObservation>(
        "market_rate_observations"
      );
      const providerObserved = new Date(
        Date.now() - (options.staleMarketRates ? 2 * 86400000 : 3600000)
      );
      const batchId = "018f0c7a-1234-7abc-8def-000000000030";
      const capturedAt = new Date();
      await marketRates.create((record) => {
        record._raw.id = batchId;
        Object.assign(record._raw, { created_at: capturedAt.getTime() });
      });
      for (const [index, code] of CURRENT_MARKET_INSTRUMENT_CODES.entries()) {
        await observations.create((record) => {
          record._raw.id = `018f0c7a-1234-7abc-8def-${String(index + 40).padStart(12, "0")}`;
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

function validEditSubmission(
  overrides: Partial<EditMetalHoldingSubmission> = {}
): EditMetalHoldingSubmission {
  const today = formatMetalLocalCalendarDate(new Date());
  return {
    cairoTodayDate: today,
    staleRateAcknowledged: false,
    correctionReason: "Correcting wrong purchase price",
    ids: {
      actionId: IDS.editAction,
      actionEvidenceId: IDS.editEvidence,
      lifecycleEventId: IDS.editEvent,
      metalRateReferenceId: IDS.editMetalRateRef,
      currencyRateReferenceId: IDS.editCurrencyRateRef,
    },
    original: {
      holdingId: IDS.editHolding,
      financialRevision: "0",
      predecessorEventId: IDS.editPredecessorEvent,
      status: "active",
      hasCompleteMaterialFacts: true,
      facts: {
        name: "Initial Gold Coin",
        notes: null,
        metal: "GOLD",
        weightGramsDecimal: "8",
        purityCode: "gold-999",
        purityCatalogVersion: "1",
        purityFactorDecimal: "0.999",
        purchasePriceDecimal: "25000",
        purchaseCurrency: "EGP",
        purchaseDate: "2026-08-01",
        physicalForm: "COIN",
      },
      persistedMaterialFacts: {
        weightGramsDecimal: "8",
        purityCode: "gold-999",
        purityCatalogVersion: "1",
        purityFactorDecimal: "0.999",
        purchasePriceDecimal: "25000",
        purchaseCurrency: "EGP",
        purchaseDate: "2026-08-01",
        physicalForm: "COIN",
      },
    },
    current: {
      name: "Initial Gold Coin",
      notes: null,
      metal: "GOLD",
      weightGramsDecimal: "8",
      purityCode: "gold-999",
      purityCatalogVersion: "1",
      purityFactorDecimal: "0.999",
      purchasePriceDecimal: "26000", // material change
      purchaseCurrency: "EGP",
      purchaseDate: "2026-08-01",
      physicalForm: "COIN",
    },
    ...overrides,
  };
}

describe("Metal holding facades replay contract and rate provenance", () => {
  beforeEach(async () => {
    mockCurrentUserId = IDS.user;
    await resetDatabase();
  });

  describe("addMetalHoldingFromForm foundation replay contract (FR-077/080)", () => {
    it("throws action_id_payload_mismatch when existing action group has different payload", async () => {
      const submission1 = validAddSubmission();
      await addMetalHoldingFromForm(submission1);

      // Replay with same actionId but modified name/weight
      const submission2 = validAddSubmission({
        holding: {
          ...submission1.holding,
          name: "Different Holding Name",
        },
      });

      await expect(addMetalHoldingFromForm(submission2)).rejects.toThrow(
        "action_id_payload_mismatch"
      );
    });

    it("commits a pending_local action group instead of prematurely returning", async () => {
      const submission = validAddSubmission();
      const envelope = createMetalFinancialActionEnvelope({
        actionId: submission.ids.actionId,
        userId: IDS.user,
        holdingId: submission.ids.holdingId,
        kind: "add",
        expectedHoldingRevision: null,
        occurredAt: new Date().toISOString(),
        validationInput: {
          latestAllowedCalendarDate: submission.cairoTodayDate,
        },
        domainPayload: {
          holdingId: submission.ids.holdingId,
          expectedHoldingRevision: null,
          predecessorEventId: null,
          reversesEventId: null,
          metalType: submission.holding.metal,
          metadata: {
            name: submission.holding.name,
            notes: submission.holding.notes,
          },
          materialFacts: {
            physicalForm: submission.holding.physicalForm,
            weightGramsDecimal: submission.holding.weightGramsDecimal,
            purityCode: submission.holding.purity.code,
            purityFactorDecimal: submission.holding.purity.factorDecimal,
            purityCatalogVersion: submission.holding.purity.catalogVersion,
            purchasePriceDecimal: submission.holding.purchasePriceDecimal,
            purchaseCurrency: submission.holding.purchaseCurrency,
            purchaseDate: submission.holding.purchaseDate,
          },
          rateSnapshots: [],
        },
      });
      await createFinancialActionGroup({
        envelope,
        hashProvider: {
          digestUtf8: (value: string): Promise<string> =>
            Promise.resolve(
              createHash("sha256").update(value, "utf8").digest("hex")
            ),
        },
        validationInput: {
          latestAllowedCalendarDate: submission.cairoTodayDate,
        },
      });
      const group = (
        await database
          .get<FinancialActionGroup>("financial_action_groups")
          .query(Q.where("action_id", IDS.addAction))
          .fetch()
      )[0];
      expect(group.state).toBe("pending_local");

      await addMetalHoldingFromForm(submission);
      expect(group.state).toBe("local_complete");
      await expect(
        addMetalHoldingFromForm(submission)
      ).resolves.toBeUndefined();
      const assets = await database.get<Asset>("assets").query().fetch();
      expect(assets).toHaveLength(1);
    });

    it("requires acknowledgment when Add captures stale selected rates", async () => {
      await seedHoldingForEdit({
        withMarketRates: true,
        staleMarketRates: true,
      });
      const submission = validAddSubmission();
      await expect(addMetalHoldingFromForm(submission)).rejects.toThrow(
        "stale_rate_acknowledgment_required"
      );
      await expect(
        addMetalHoldingFromForm({ ...submission, staleRateAcknowledged: true })
      ).resolves.toBeUndefined();
      const references = await database
        .get<MetalRateReference>("metal_rate_references")
        .query(Q.where("action_id", IDS.addAction))
        .fetch();
      expect(references).toHaveLength(2);

      await expect(
        addMetalHoldingFromForm(submission)
      ).resolves.toBeUndefined();
      await expect(
        addMetalHoldingFromForm({
          ...submission,
          holding: { ...submission.holding, name: "Changed after commit" },
        })
      ).rejects.toThrow("action_id_payload_mismatch");
      expect(
        await database
          .get<MetalLifecycleEvent>("metal_lifecycle_events")
          .query(Q.where("action_id", IDS.addAction))
          .fetch()
      ).toHaveLength(1);
      expect(
        await database
          .get<MetalRateReference>("metal_rate_references")
          .query(Q.where("action_id", IDS.addAction))
          .fetch()
      ).toHaveLength(2);
    });
  });

  describe("saveEditedMetalHolding foundation replay contract (FR-077/080)", () => {
    it("throws action_id_payload_mismatch when existing action group has different payload", async () => {
      await seedHoldingForEdit();
      const submission1 = validEditSubmission();
      await saveEditedMetalHolding(submission1);

      // Replay with same actionId but different correctionReason or current price
      const submission2 = validEditSubmission({
        correctionReason: "A completely different reason",
      });

      await expect(saveEditedMetalHolding(submission2)).rejects.toThrow(
        "action_id_payload_mismatch"
      );
    });

    it("replays idempotently when payload matches", async () => {
      await seedHoldingForEdit();
      const submission = validEditSubmission();
      await saveEditedMetalHolding(submission);

      await expect(saveEditedMetalHolding(submission)).resolves.toBeUndefined();
      const events = await database
        .get<MetalLifecycleEvent>("metal_lifecycle_events")
        .query()
        .fetch();
      expect(events).toHaveLength(2); // Initial created + 1 corrected (not duplicated)
    });
  });

  describe("saveEditedMetalHolding rate provenance persistence (FR-073/075)", () => {
    it("captures and persists available rate snapshots instead of passing empty rateSnapshots", async () => {
      await seedHoldingForEdit({ withMarketRates: true });
      const today = formatMetalLocalCalendarDate(new Date());
      const submission = validEditSubmission({
        current: {
          ...validEditSubmission().current,
          purchaseDate: today,
        },
      });
      await saveEditedMetalHolding(submission);

      const rateRefs = await database
        .get<MetalRateReference>("metal_rate_references")
        .query()
        .fetch();

      // Must have persisted rate references for the consumed metal and currency rates!
      expect(rateRefs.length).toBeGreaterThan(0);
      const metalRef = rateRefs.find((ref) => ref.role === "acquisition_metal");
      expect(metalRef).toBeDefined();
      expect(metalRef?.instrumentCode).toBe("metal:GOLD");
      expect(metalRef?.quality).toBe("valid");

      const asset = await database.get<Asset>("assets").find(IDS.editHolding);
      expect(asset.acquisitionActionId).toBe(IDS.editAction);
    });

    it("requires acknowledgment if selected rates turn stale before saving", async () => {
      await seedHoldingForEdit({
        withMarketRates: true,
        staleMarketRates: true,
      });
      const today = formatMetalLocalCalendarDate(new Date());
      const submission = validEditSubmission({
        current: {
          ...validEditSubmission().current,
          purchaseDate: today,
        },
      });
      await expect(saveEditedMetalHolding(submission)).rejects.toThrow(
        "stale_rate_acknowledgment_required"
      );
      expect(
        await database
          .get<FinancialActionGroup>("financial_action_groups")
          .query()
          .fetch()
      ).toHaveLength(0);

      await expect(
        saveEditedMetalHolding({ ...submission, staleRateAcknowledged: true })
      ).resolves.toBeUndefined();
      const references = await database
        .get<MetalRateReference>("metal_rate_references")
        .query()
        .fetch();
      expect(references).toHaveLength(2);
      expect(
        references.every((reference) => reference.capturedFreshness === "stale")
      ).toBe(true);

      await expect(saveEditedMetalHolding(submission)).resolves.toBeUndefined();
      await expect(
        saveEditedMetalHolding({
          ...submission,
          correctionReason: "Changed after commit",
        })
      ).rejects.toThrow("action_id_payload_mismatch");
      expect(
        await database
          .get<MetalLifecycleEvent>("metal_lifecycle_events")
          .query(Q.where("action_id", IDS.editAction))
          .fetch()
      ).toHaveLength(1);
      expect(
        await database
          .get<MetalRateReference>("metal_rate_references")
          .query()
          .fetch()
      ).toHaveLength(2);
    });

    it("does not capture rate snapshots when purchase date is in the past", async () => {
      await seedHoldingForEdit({ withMarketRates: true });
      const pastSubmission = validEditSubmission({
        current: {
          ...validEditSubmission().current,
          purchaseDate: "2020-01-01",
        },
      });
      await saveEditedMetalHolding(pastSubmission);
      const rateRefs = await database
        .get<MetalRateReference>("metal_rate_references")
        .query()
        .fetch();
      expect(rateRefs).toHaveLength(0);
    });
  });

  describe("addMetalHoldingFromForm user scope binding (FR-077)", () => {
    it("binds submission to initiating user and throws user_scope_changed if scope changes", async () => {
      const submission = validAddSubmission();
      let callCount = 0;
      jest.mocked(getCurrentUserDataScope).mockImplementation(() => {
        callCount++;
        const userId = callCount <= 2 ? IDS.user : "another-user-id";
        return Promise.resolve({
          userId,
          queryOwned: (
            collection: { query: (...clauses: unknown[]) => unknown },
            ...clauses: unknown[]
          ) => collection.query(Q.where("user_id", userId), ...clauses),
          assertOwned: <T extends { userId: string }>(record: T): T => record,
        } as unknown as CurrentUserDataScope);
      });

      await expect(addMetalHoldingFromForm(submission)).rejects.toThrow(
        "user_scope_changed"
      );
    });
  });
});
