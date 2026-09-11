jest.mock("@monyvi/db", () => ({
  database: { get: jest.fn() },
}));
jest.mock("@/services/user-data-access", () => ({
  queryChildrenOfOwnedParents: jest.fn(),
  queryOwned: jest.fn(),
}));

import {
  buildMetalPortfolioReadModel,
  shapeMetalPortfolioHoldings,
} from "@/services/metal-portfolio-read-model-service";

import {
  ADD_ACTION_ID,
  SELL_ACTION_ID,
  SOLD_HOLDING_ID,
  USER_ID,
  acquisitionRateRows,
  buildCurrentRates,
  buildHolding,
  crossCurrencyPayload,
  soldEvent,
  soldGroup,
  soldHoldingAsset,
  soldInput,
  soldPayload,
} from "./metal-portfolio-realized-sale-fixtures";

describe("metal portfolio realized sale results", () => {
  it("feeds the manual-QA same-currency sold evidence into the sold row", () => {
    const [holding] = shapeMetalPortfolioHoldings(soldInput());

    expect(holding).toMatchObject({
      id: SOLD_HOLDING_ID,
      status: "sold",
      soldResultCurrency: "EGP",
      soldResultDecimal: "5500",
      soldNetProceedsCurrency: "EGP",
      soldNetProceedsDecimal: "35500",
    });
    if (holding?.soldEvidence === null || holding?.soldEvidence === undefined) {
      throw new Error("Expected sold evidence on the shaped row");
    }
    if (!holding.soldEvidence.available) {
      throw new Error("Expected sold evidence to be available");
    }
    expect(holding.soldEvidence.value.breakdownAvailable).toBe(false);
  });

  it("keeps the sold result available when current market rates are missing", () => {
    const [holding] = shapeMetalPortfolioHoldings(
      soldInput({
        currentRates: {
          gold: { state: "missing", ageMs: null, providerObservedAt: null },
          silver: { state: "missing", ageMs: null, providerObservedAt: null },
          currencies: new Map(),
        },
      })
    );

    expect(holding?.soldResultDecimal).toBe("5500");
    expect(holding?.currentValueDecimal).toBeNull();
  });

  it("converts a cross-currency sold result through current display FX", () => {
    const payload = crossCurrencyPayload("USD", "USD", {
      holdingId: SOLD_HOLDING_ID,
    });
    const [holding] = shapeMetalPortfolioHoldings(
      soldInput({
        actionGroups: [soldGroup(payload)],
        assets: [
          soldHoldingAsset({
            purchaseCurrency: "USD",
            purchasePriceDecimal: "5000",
          }),
        ],
        lifecycleEvents: [soldEvent(payload)],
        preferredCurrency: "EGP",
      })
    );

    expect(holding).toMatchObject({
      soldResultCurrency: "EGP",
      soldResultDecimal: "50000",
      soldNetProceedsCurrency: "EGP",
      soldNetProceedsDecimal: "300000",
    });
  });

  it("fails the sold display closed when display FX is unavailable", () => {
    const payload = crossCurrencyPayload("USD", "USD", {
      holdingId: SOLD_HOLDING_ID,
    });
    const currencies = new Map(buildCurrentRates().currencies);
    currencies.delete("EGP");
    const [holding] = shapeMetalPortfolioHoldings(
      soldInput({
        actionGroups: [soldGroup(payload)],
        assets: [
          soldHoldingAsset({
            purchaseCurrency: "USD",
            purchasePriceDecimal: "5000",
          }),
        ],
        currentRates: { ...buildCurrentRates(), currencies },
        lifecycleEvents: [soldEvent(payload)],
        preferredCurrency: "EGP",
      })
    );

    expect(holding?.soldResultCurrency).toBeNull();
    expect(holding?.soldResultDecimal).toBeNull();
    if (holding?.soldEvidence === null || holding?.soldEvidence === undefined) {
      throw new Error("Expected sold evidence on the shaped row");
    }
    expect(holding.soldEvidence.available).toBe(true);

    const model = buildMetalPortfolioReadModel({
      filter: "ALL",
      holdings: [holding],
      rateStatus: { state: "missing", ageMs: null },
      userId: USER_ID,
    });
    expect(model.soldResultDecimal).toBeNull();
    expect(model.soldResultUnavailable).toBe(true);
  });

  it("publishes the detailed realized breakdown when acquisition references exist", () => {
    const payload = crossCurrencyPayload("EGP", "EGP");
    const [holding] = shapeMetalPortfolioHoldings(
      soldInput({
        actionGroups: [soldGroup(payload)],
        assets: [soldHoldingAsset({ acquisitionActionId: ADD_ACTION_ID })],
        lifecycleEvents: [soldEvent(payload)],
        rateReferences: acquisitionRateRows(),
      })
    );

    if (
      holding?.soldEvidence === null ||
      holding?.soldEvidence === undefined ||
      !holding.soldEvidence.available
    ) {
      throw new Error("Expected a trustworthy sold result");
    }
    expect(holding.soldEvidence.value.breakdownAvailable).toBe(true);
  });

  it("aggregates lifetime sold results across multiple effective sales", () => {
    const model = buildMetalPortfolioReadModel({
      filter: "ALL",
      holdings: [
        buildHolding({
          id: "sold-profit",
          status: "sold",
          soldResultDecimal: "5500",
        }),
        buildHolding({
          id: "sold-loss",
          status: "sold",
          soldResultDecimal: "-2500",
        }),
      ],
      rateStatus: { state: "fresh", ageMs: 1000 },
      userId: USER_ID,
    });

    expect(model.soldResultDecimal).toBe("3000");
    expect(model.hasSoldHoldings).toBe(true);
    expect(model.soldResultUnavailable).toBe(false);
  });

  it.each([
    [
      "a sold event that is no longer the current head",
      () =>
        soldInput({
          holdingStates: [
            {
              deleted: false,
              effectiveEventId: "undo-event",
              holdingId: SOLD_HOLDING_ID,
              isVisible: true,
              reconciliationState: "accepted",
              status: "sold",
              userId: USER_ID,
            },
          ],
        }),
    ],
    [
      "a reconciliation-incomplete sold holding",
      () =>
        soldInput({
          holdingStates: [
            {
              deleted: false,
              effectiveEventId: SELL_ACTION_ID,
              holdingId: SOLD_HOLDING_ID,
              isVisible: true,
              reconciliationState: "reconciliation_incomplete",
              status: "sold",
              userId: USER_ID,
            },
          ],
        }),
    ],
    [
      "a hidden sold holding",
      () =>
        soldInput({
          holdingStates: [
            {
              deleted: false,
              effectiveEventId: SELL_ACTION_ID,
              holdingId: SOLD_HOLDING_ID,
              isVisible: false,
              reconciliationState: "accepted",
              status: "sold",
              userId: USER_ID,
            },
          ],
        }),
    ],
    [
      "a legacy metals.sell/v1 envelope",
      () => {
        const payload = soldPayload();
        return soldInput({
          actionGroups: [
            soldGroup(payload, { payloadVersion: "metals.sell/v1" }),
          ],
        });
      },
    ],
    [
      "a sale group bound to a foreign user",
      () => {
        const payload = soldPayload();
        return soldInput({
          actionGroups: [
            soldGroup(
              payload,
              {},
              {
                userId: "018f0c7a-1234-7abc-8def-000000000025",
              }
            ),
          ],
        });
      },
    ],
    [
      "a sold event with a malformed envelope",
      () =>
        soldInput({
          actionGroups: [
            {
              actionId: SELL_ACTION_ID,
              deleted: false,
              domain: "metals",
              domainReferenceId: SOLD_HOLDING_ID,
              kind: "sell",
              payloadJson: "{not-json",
              outcomeJson: null,
              rejectionCode: null,
              serverOutcome: null,
              state: "local_complete",
              userId: USER_ID,
            },
          ],
        }),
    ],
  ] as const)(
    "handles unavailable evidence for %s without inventing a result",
    (_label, build) => {
      const [holding] = shapeMetalPortfolioHoldings(build());

      expect(holding?.soldResultDecimal).toBeNull();
      if (
        holding?.soldEvidence === null ||
        holding?.soldEvidence === undefined
      ) {
        throw new Error("Expected an unavailable sold outcome");
      }
      expect(holding.soldEvidence.available).toBe(false);

      const model = buildMetalPortfolioReadModel({
        filter: "ALL",
        holdings: [
          holding,
          buildHolding({
            id: "sold-ok",
            status: "sold",
            soldResultDecimal: "5500",
          }),
        ],
        rateStatus: { state: "fresh", ageMs: 1000 },
        userId: USER_ID,
      });
      const isExcluded =
        _label === "a sold event that is no longer the current head" ||
        _label === "a reconciliation-incomplete sold holding" ||
        _label === "a hidden sold holding";
      expect(model.soldResultDecimal).toBe(isExcluded ? "5500" : null);
      expect(model.soldResultUnavailable).toBe(!isExcluded);
    }
  );

  it("excludes reversed and disposed holdings from the lifetime total", () => {
    const model = buildMetalPortfolioReadModel({
      filter: "ALL",
      holdings: [
        buildHolding({
          id: "sold-1",
          status: "sold",
          soldResultDecimal: "5500",
        }),
        buildHolding({ id: "reversed", status: "active" }),
        buildHolding({
          id: "disposed",
          status: "disposed",
          soldResultDecimal: null,
        }),
      ],
      rateStatus: { state: "fresh", ageMs: 1000 },
      userId: USER_ID,
    });

    expect(model.soldResultDecimal).toBe("5500");
    expect(model.hasSoldHoldings).toBe(true);
    expect(model.soldResultUnavailable).toBe(false);
  });

  it("reports no lifetime total when there are no sold holdings", () => {
    const model = buildMetalPortfolioReadModel({
      filter: "ALL",
      holdings: [buildHolding()],
      rateStatus: { state: "fresh", ageMs: 1000 },
      userId: USER_ID,
    });

    expect(model.soldResultDecimal).toBeNull();
    expect(model.hasSoldHoldings).toBe(false);
    expect(model.soldResultUnavailable).toBe(false);
  });
});
