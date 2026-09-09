import { shapeMetalPortfolioHoldingFacts } from "@/hooks/shape-metal-portfolio-holding-facts";
import type { LiveRatesTrustReadModel } from "@/services/live-rates-trust-read-model-service";
import type { ShapeMetalPortfolioHoldingsInput } from "@/services/metal-portfolio-read-model-service";

const missingRates: LiveRatesTrustReadModel = {
  gold: { state: "missing", ageMs: null, providerObservedAt: null },
  silver: { state: "missing", ageMs: null, providerObservedAt: null },
  currencies: new Map(),
};

function inputForStatus(status: "active" | "sold"): ShapeMetalPortfolioHoldingsInput {
  return {
    assets: [
      {
        createdAt: new Date("2026-08-01T10:00:00.000Z"),
        id: "holding-1",
        name: "QA gold",
        purchaseCurrency: "EGP",
        purchaseDate: new Date("2026-08-01T00:00:00.000Z"),
        purchasePriceDecimal: "1000",
        userId: "user-1",
      },
    ],
    assetMetals: [
      {
        assetId: "holding-1",
        deleted: false,
        itemForm: "bar",
        metalType: "GOLD",
        purityCatalogVersion: "1",
        purityCode: "gold-999",
        purityFactorDecimal: "0.999",
        weightGramsDecimal: "10",
      },
    ],
    currentRates: missingRates,
    holdingStates: [
      {
        deleted: false,
        effectiveEventId: "event-pending",
        holdingId: "holding-1",
        isVisible: true,
        reconciliationState: "accepted",
        status,
        userId: "user-1",
      },
    ],
    lifecycleEvents: [],
    preferredCurrency: "EGP",
    userId: "user-1",
  };
}

describe("shapeMetalPortfolioHoldingFacts", () => {
  it("renders accepted active facts before the lifecycle-event observation arrives", () => {
    const [holding] = shapeMetalPortfolioHoldingFacts(inputForStatus("active"));

    expect(holding).toMatchObject({
      id: "holding-1",
      isEffective: true,
      status: "active",
    });
  });

  it("does not manufacture terminal effectiveness without the exact lifecycle event", () => {
    const [holding] = shapeMetalPortfolioHoldingFacts(inputForStatus("sold"));

    expect(holding).toMatchObject({
      id: "holding-1",
      isEffective: false,
      status: "sold",
    });
  });
});
