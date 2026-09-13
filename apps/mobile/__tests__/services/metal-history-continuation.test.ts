jest.mock("@monyvi/db", () => ({ database: { get: jest.fn() } }));
jest.mock("@/services/user-data-access", () => ({
  getCurrentUserDataScope: jest.fn(),
  queryChildrenOfOwnedParents: jest.fn(),
  queryOwned: jest.fn(),
}));

import {
  buildMetalHistoryReadModel,
  type MetalHistoryHoldingInput,
} from "@/services/metal-history-read-model-service";

function soldHolding(index: number): MetalHistoryHoldingInput {
  const id = `holding-${index.toString().padStart(3, "0")}`;
  const createdEventId = `created-${index}`;
  return {
    asset: {
      acquisitionActionId: null,
      id,
      name: `${id} holding`,
      purchaseCurrency: null,
      purchaseDate: null,
      purchasePriceDecimal: null,
      userId: "user-1",
    },
    holdingState: {
      holdingId: id,
      isVisible: true,
      reconciliationState: "accepted",
      status: "sold",
      userId: "user-1",
    },
    lifecycleEvents: [
      {
        actionState: "accepted",
        id: createdEventId,
        isEffective: true,
        isHistoryVisible: true,
        kind: "add",
        occurredAt: new Date("2026-01-01T00:00:00.000Z"),
        predecessorEventId: null,
      },
      {
        actionState: "accepted",
        id: `sold-${index}`,
        isEffective: true,
        isHistoryVisible: true,
        kind: "sell",
        occurredAt: new Date(Date.UTC(2026, 0, 2, 0, index, 0, 0)),
        predecessorEventId: createdEventId,
      },
    ],
    metal: {
      itemForm: "coin",
      metalType: "GOLD",
      purityCatalogVersion: "1",
      purityCode: "gold-875",
      purityFactorDecimal: "0.875",
      weightGramsDecimal: "10",
    },
  };
}

describe("permanent metal History continuation", () => {
  it("continues past one hundred validated holdings", () => {
    const holdings = Array.from({ length: 125 }, (_, index) =>
      soldHolding(index)
    );
    const firstPages = buildMetalHistoryReadModel({
      filter: "all",
      holdings,
      pageSize: 100,
      userId: "user-1",
    });
    const continued = buildMetalHistoryReadModel({
      filter: "all",
      holdings,
      pageSize: 125,
      userId: "user-1",
    });

    expect(firstPages.counts).toEqual({ all: 125, disposed: 0, sold: 125 });
    expect(firstPages.items).toHaveLength(100);
    expect(firstPages.hasMore).toBe(true);
    expect(continued.items).toHaveLength(125);
    expect(continued.hasMore).toBe(false);
  });
});
