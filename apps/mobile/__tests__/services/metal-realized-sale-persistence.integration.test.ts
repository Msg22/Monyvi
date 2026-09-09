import { createHash } from "node:crypto";

import { Database, type Model } from "@nozbe/watermelondb";
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import {
  type FinancialActionValidationInput,
  type Sha256Provider,
} from "@monyvi/logic";
import { schema } from "../../../../packages/db/src/schema";
import { Asset } from "../../../../packages/db/src/models/Asset";
import { AssetMetal } from "../../../../packages/db/src/models/AssetMetal";
import { FinancialActionGroup } from "../../../../packages/db/src/models/FinancialActionGroup";
import { MetalActionEvidence } from "../../../../packages/db/src/models/MetalActionEvidence";
import { MetalHoldingState } from "../../../../packages/db/src/models/MetalHoldingState";
import { MetalLifecycleEvent } from "../../../../packages/db/src/models/MetalLifecycleEvent";
import { MetalRateReference } from "../../../../packages/db/src/models/MetalRateReference";
import { type CreateMetalFinancialActionEnvelopeInput } from "../../services/metal-financial-action-adapter";
import {
  createMetalFinancialActionRepository,
  createWatermelonMetalFinancialActionRepositoryDependencies,
} from "../../services/metal-financial-action-repository";
import { createMetalHoldingCommandService } from "../../services/metal-holding-command-service";
import { shapeMetalPortfolioHoldings } from "../../services/metal-portfolio-read-model-service";
import type { LiveRatesTrustReadModel } from "../../services/live-rates-trust-read-model-service";

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown =>
  jest.requireActual(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);
jest.mock("../../services/supabase", () => ({
  getCurrentUserId: jest.fn(),
  supabase: {},
}));

const USER_ID = "018f0c7a-1234-7abc-8def-000000000003";
const HOLDING_ID = "018f0c7a-1234-7abc-8def-000000000004";
const ADD_ACTION_ID = "018f0c7a-1234-7abc-8def-000000000010";
const SELL_ACTION_ID = "018f0c7a-1234-7abc-8def-000000000011";
const VALIDATION_INPUT: FinancialActionValidationInput = {
  cairoTodayDate: "2026-09-01",
};
const MODEL_CLASSES: Array<typeof Model> = [
  Asset,
  AssetMetal,
  FinancialActionGroup,
  MetalActionEvidence,
  MetalHoldingState,
  MetalLifecycleEvent,
  MetalRateReference,
];
const sha256Provider: Sha256Provider = {
  digestUtf8: (canonicalText: string): Promise<string> =>
    Promise.resolve(createHash("sha256").update(canonicalText).digest("hex")),
};

const EMPTY_RATES: LiveRatesTrustReadModel = {
  gold: { state: "missing", ageMs: null, providerObservedAt: null },
  silver: { state: "missing", ageMs: null, providerObservedAt: null },
  currencies: new Map(),
};

function addInput(): CreateMetalFinancialActionEnvelopeInput {
  return {
    actionId: ADD_ACTION_ID,
    userId: USER_ID,
    holdingId: HOLDING_ID,
    kind: "add",
    expectedHoldingRevision: null,
    occurredAt: "2026-08-30T10:00:00.000Z",
    validationInput: VALIDATION_INPUT,
    domainPayload: {
      expectedHoldingRevision: null,
      holdingId: HOLDING_ID,
      materialFacts: {
        physicalForm: "COIN",
        purchaseCurrency: "EGP",
        purchaseDate: "2026-08-20",
        purchasePriceDecimal: "30000",
        purityCatalogVersion: "1",
        purityCode: "gold-9999",
        purityFactorDecimal: "0.9999",
        weightGramsDecimal: "15",
      },
      metalType: "GOLD",
      metadata: { name: "QA Sold Gold Coin", notes: null },
      predecessorEventId: null,
      rateSnapshots: [],
      reversesEventId: null,
    },
  };
}

function sellInput(): CreateMetalFinancialActionEnvelopeInput {
  return {
    actionId: SELL_ACTION_ID,
    userId: USER_ID,
    holdingId: HOLDING_ID,
    kind: "sell",
    expectedHoldingRevision: "0",
    occurredAt: "2026-09-01T10:00:00.000Z",
    validationInput: VALIDATION_INPUT,
    domainPayload: {
      expectedHoldingRevision: "0",
      feeMinorUnits: "50000",
      grossProceedsMinorUnits: "3600000",
      holdingId: HOLDING_ID,
      metalType: "GOLD",
      netProceedsMinorUnits: "3550000",
      notes: "Manual QA whole-holding sale without account credit",
      predecessorEventId: ADD_ACTION_ID,
      purchaseCurrency: "EGP",
      rateSnapshots: [],
      reversesEventId: null,
      saleCurrency: "EGP",
      saleDate: "2026-09-01",
    },
  };
}

async function createCommittedDatabase(): Promise<Database> {
  const adapter = new SQLiteAdapter({ schema });
  await adapter.initializingPromise;
  const database = new Database({ adapter, modelClasses: MODEL_CLASSES });
  const repository = createMetalFinancialActionRepository(
    createWatermelonMetalFinancialActionRepositoryDependencies({
      database,
      getCurrentUserId: () => Promise.resolve(USER_ID),
    })
  );
  const service = createMetalHoldingCommandService({
    repository,
    hashProvider: sha256Provider,
  });
  for (const input of [addInput(), sellInput()]) {
    await expect(service.execute(input)).resolves.toMatchObject({
      actionId: input.actionId,
      kind: "committed",
    });
  }
  return database;
}

async function readPortfolioFrom(
  database: Database
): Promise<ReturnType<typeof shapeMetalPortfolioHoldings>> {
  const assets = await database.get<Asset>("assets").query().fetch();
  const assetMetals = await database
    .get<AssetMetal>("asset_metals")
    .query()
    .fetch();
  const holdingStates = await database
    .get<MetalHoldingState>("metal_holding_states")
    .query()
    .fetch();
  const lifecycleEvents = await database
    .get<MetalLifecycleEvent>("metal_lifecycle_events")
    .query()
    .fetch();
  const actionGroups = await database
    .get<FinancialActionGroup>("financial_action_groups")
    .query()
    .fetch();
  const rateReferences = await database
    .get<MetalRateReference>("metal_rate_references")
    .query()
    .fetch();

  return shapeMetalPortfolioHoldings({
    actionGroups,
    assetMetals,
    assets,
    currentRates: EMPTY_RATES,
    holdingStates,
    lifecycleEvents,
    preferredCurrency: "EGP",
    rateReferences,
    userId: USER_ID,
  });
}

describe("realized metal sale persisted evidence", () => {
  it("rebuilds a trustworthy sold result from persisted WatermelonDB rows", async () => {
    const database = await createCommittedDatabase();
    const holdings = await readPortfolioFrom(database);

    expect(holdings).toHaveLength(1);
    const [sold] = holdings;
    expect(sold).toMatchObject({
      id: HOLDING_ID,
      status: "sold",
      soldResultCurrency: "EGP",
      soldResultDecimal: "5500",
      soldNetProceedsCurrency: "EGP",
      soldNetProceedsDecimal: "35500",
    });
    if (sold?.soldEvidence === null || sold?.soldEvidence === undefined) {
      throw new Error("Expected persisted sale evidence to be shaped");
    }
    expect(sold.soldEvidence.available).toBe(true);
    if (!sold.soldEvidence.available) {
      throw new Error(
        `Expected trustworthy persisted sale result, got ${sold.soldEvidence.reason}`
      );
    }
    expect(sold.soldEvidence.value.breakdownAvailable).toBe(false);
  });
});
