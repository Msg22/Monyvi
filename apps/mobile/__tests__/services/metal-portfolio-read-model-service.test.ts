import {
  buildMetalPortfolioReadModel,
  selectPortfolioHoldings,
} from "@/services/metal-portfolio-read-model-service";

interface TestPortfolioHolding {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly metalType: "GOLD" | "SILVER";
  readonly status: "ACTIVE" | "SOLD" | "DISPOSED";
  readonly isEffective: boolean;
  readonly isVisible: boolean;
  readonly currentValue: number | null;
  readonly currentPerformance: number | null;
  readonly soldResult: number | null;
  readonly occurredAt: Date;
}

function buildHolding(
  overrides: Partial<TestPortfolioHolding> = {}
): TestPortfolioHolding {
  return {
    id: "gold-active",
    userId: "user-1",
    name: "Wedding coin",
    metalType: "GOLD",
    status: "ACTIVE",
    isEffective: true,
    isVisible: true,
    currentValue: 162317.87,
    currentPerformance: 11039.67,
    soldResult: null,
    occurredAt: new Date("2026-08-20T10:00:00.000Z"),
    ...overrides,
  };
}

describe("metal portfolio read model", () => {
  const holdings = [
    buildHolding(),
    buildHolding({
      id: "silver-active",
      name: "Silver bars",
      metalType: "SILVER",
      currentValue: 19108.3,
      currentPerformance: 1284.15,
    }),
    buildHolding({
      id: "gold-sold",
      status: "SOLD",
      currentValue: 170000,
      currentPerformance: null,
      soldResult: 18221.8,
      occurredAt: new Date("2026-08-31T10:00:00.000Z"),
    }),
    buildHolding({
      id: "foreign",
      userId: "user-2",
      currentValue: 999999,
    }),
    buildHolding({ id: "ineffective", isEffective: false }),
  ];

  it("defaults to All and limits active values/allocation to current-user effective visible active holdings", () => {
    const model = buildMetalPortfolioReadModel({
      userId: "user-1",
      filter: "ALL",
      holdings,
      rateStatus: { state: "fresh", ageMs: 1000 },
    });

    expect(model.filter).toBe("ALL");
    expect(model.activeTotal).toBe(181426.17);
    expect(model.allocation).toEqual({ gold: 89.5, silver: 10.5 });
    expect(model.holdings.map((holding) => holding.id)).toEqual([
      "gold-active",
      "silver-active",
    ]);
    expect(model.currentPerformance).toBe(12323.82);
  });

  it("filters All holdings to Gold or Silver without changing active totals", () => {
    const model = buildMetalPortfolioReadModel({
      userId: "user-1",
      filter: "ALL",
      holdings,
      rateStatus: { state: "fresh", ageMs: 1000 },
    });

    expect(
      selectPortfolioHoldings(model, "GOLD").map((holding) => holding.id)
    ).toEqual(["gold-active"]);
    expect(
      selectPortfolioHoldings(model, "SILVER").map((holding) => holding.id)
    ).toEqual(["silver-active"]);
    expect(model.activeTotal).toBe(181426.17);
  });

  it("surfaces only effective visible Sold/Disposed records in recent History and preserves trustworthy sold result", () => {
    const model = buildMetalPortfolioReadModel({
      userId: "user-1",
      filter: "ALL",
      holdings,
      rateStatus: { state: "fresh", ageMs: 1000 },
    });

    expect(model.recentHistory).toEqual([
      expect.objectContaining({ id: "gold-sold", status: "SOLD" }),
    ]);
    expect(model.soldResult).toBe(18221.8);
  });

  it("keeps active holdings visible but makes rate-dependent values unavailable when current rates are missing", () => {
    const model = buildMetalPortfolioReadModel({
      userId: "user-1",
      filter: "ALL",
      holdings: [
        buildHolding({ currentValue: null, currentPerformance: null }),
        buildHolding({
          id: "silver-active",
          metalType: "SILVER",
          currentValue: null,
          currentPerformance: null,
        }),
      ],
      rateStatus: { state: "missing", ageMs: null },
    });

    expect(model.holdings).toHaveLength(2);
    expect(model.activeTotal).toBeNull();
    expect(model.currentPerformance).toBeNull();
    expect(model.allocation).toEqual({ gold: null, silver: null });
    expect(model.rateStatus).toEqual({ state: "missing", ageMs: null });
  });

  it("reports a filter-empty state separately from a portfolio-empty state", () => {
    const model = buildMetalPortfolioReadModel({
      userId: "user-1",
      filter: "SILVER",
      holdings: [buildHolding()],
      rateStatus: { state: "stale", ageMs: 90000000 },
    });

    expect(model.listState).toBe("FILTER_EMPTY");
    expect(model.hasTerminalHistory).toBe(false);
  });
});
