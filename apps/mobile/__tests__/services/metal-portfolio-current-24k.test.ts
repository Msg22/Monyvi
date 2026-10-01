jest.mock("@monyvi/db", () => ({
  database: { get: jest.fn() },
}));
jest.mock("@/services/user-data-access", () => ({
  queryChildrenOfOwnedParents: jest.fn(),
  queryOwned: jest.fn(),
}));

import {
  shapeMetalPortfolioHoldings,
  type MetalPortfolioAssetSnapshot,
  type ShapeMetalPortfolioHoldingsInput,
} from "@/services/metal-portfolio-read-model-service";
import type { LiveRatesTrustReadModel } from "@/services/live-rates-trust-read-model-service";

const RATE_OBSERVED_AT = new Date("2026-09-01T11:59:59.000Z");

function buildCurrentRates(): LiveRatesTrustReadModel {
  return {
    gold: {
      state: "fresh",
      ageMs: 1_000,
      providerObservedAt: RATE_OBSERVED_AT,
      valueDecimal: "100",
    },
    silver: {
      state: "fresh",
      ageMs: 1_000,
      providerObservedAt: RATE_OBSERVED_AT,
      valueDecimal: "2",
    },
    currencies: new Map([
      [
        "EGP",
        {
          state: "fresh",
          ageMs: 1_000,
          providerObservedAt: RATE_OBSERVED_AT,
          valueDecimal: "0.02",
        },
      ],
      [
        "USD",
        {
          state: "fresh",
          ageMs: 1_000,
          providerObservedAt: RATE_OBSERVED_AT,
          valueDecimal: "1",
        },
      ],
    ]),
  };
}

function buildRawAssetSnapshot(
  overrides: Partial<MetalPortfolioAssetSnapshot> = {}
): MetalPortfolioAssetSnapshot {
  return {
    acquisitionActionId: null,
    id: "holding-1",
    userId: "user-1",
    name: "Exact gold",
    createdAt: new Date("2024-01-01T10:00:00.000Z"),
    purchaseDate: new Date("2024-01-01T00:00:00.000Z"),
    purchaseCurrency: "EGP",
    purchasePriceDecimal: "20000",
    ...overrides,
  };
}

function shapeInput(): ShapeMetalPortfolioHoldingsInput {
  return {
    actionGroups: [],
    assetMetals: [
      {
        assetId: "holding-1",
        deleted: false,
        itemForm: "COIN",
        metalType: "GOLD",
        purityCatalogVersion: "1",
        purityCode: "gold-500",
        purityFactorDecimal: "0.5",
        weightGramsDecimal: "10",
      },
    ],
    assets: [buildRawAssetSnapshot()],
    currentRates: buildCurrentRates(),
    holdingStates: [
      {
        deleted: false,
        effectiveEventId: "event-1",
        holdingId: "holding-1",
        isVisible: true,
        reconciliationState: "accepted",
        status: "active",
        userId: "user-1",
      },
    ],
    lifecycleEvents: [
      {
        actionId: "add-action-1",
        deleted: false,
        holdingId: "holding-1",
        id: "event-1",
        isEffective: true,
        kind: "add",
        occurredAt: new Date("2026-08-20T10:00:00.000Z"),
        payloadJson: "{}",
        userId: "user-1",
      },
    ],
    preferredCurrency: "EGP",
    rateReferences: [],
    userId: "user-1",
  };
}

describe("metal portfolio current 24K basis", () => {
  it("uses the quoted 24K basis for a gold-999 holding current value without rewriting purity metadata", () => {
    const input = shapeInput();
    const [holding] = shapeMetalPortfolioHoldings({
      ...input,
      assetMetals: [
        {
          ...input.assetMetals[0],
          purityCode: "gold-999",
          purityFactorDecimal: "0.999",
          weightGramsDecimal: "10",
        },
      ],
    });

    expect(holding).toMatchObject({
      purityCode: "gold-999",
      purityFactorDecimal: "0.999",
      currentValueDecimal: "50000",
      currentPerformanceDecimal: "30000",
    });
  });
});
