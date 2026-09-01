const mockAssetsCollection = { table: "assets" };
const mockHoldingStatesCollection = { table: "metal_holding_states" };
const mockLifecycleEventsCollection = { table: "metal_lifecycle_events" };
const mockAssetsQuery = { kind: "assets-query" };
const mockHoldingStatesQuery = { kind: "holding-states-query" };
const mockLifecycleEventsQuery = { kind: "lifecycle-events-query" };
const mockQueryOwned = jest.fn();

interface QueryCondition {
  readonly kind: "take" | "where" | "sortBy";
  readonly column?: string;
  readonly value: unknown;
}

jest.mock("@monyvi/db", () => ({
  database: {
    get: (table: string): unknown => {
      if (table === "assets") return mockAssetsCollection;
      if (table === "metal_holding_states") return mockHoldingStatesCollection;
      if (table === "metal_lifecycle_events")
        return mockLifecycleEventsCollection;
      throw new Error(`Unexpected table: ${table}`);
    },
  },
}));

jest.mock("@nozbe/watermelondb", () => ({
  Q: {
    desc: "desc",
    sortBy: (column: string, value: unknown): QueryCondition => ({
      kind: "sortBy",
      column,
      value,
    }),
    take: (value: number): QueryCondition => ({ kind: "take", value }),
    where: (column: string, value: unknown): QueryCondition => ({
      kind: "where",
      column,
      value,
    }),
  },
}));

jest.mock("@/services/user-data-access", () => ({
  queryChildrenOfOwnedParents: jest.fn(),
  queryOwned: (...args: readonly unknown[]): unknown => mockQueryOwned(...args),
}));

import {
  buildMetalPortfolioReadModel,
  observePortfolioAssets,
  observePortfolioHoldingStates,
  observePortfolioRecentHistory,
  selectPortfolioHoldings,
} from "@/services/metal-portfolio-read-model-service";

interface TestPortfolioHolding {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly metalType: "GOLD" | "SILVER";
  readonly status: "active" | "sold" | "disposed";
  readonly isEffective: boolean;
  readonly isVisible: boolean;
  readonly currentValueDecimal: string | null;
  readonly currentPerformanceDecimal: string | null;
  readonly soldResultDecimal: string | null;
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
    status: "active",
    isEffective: true,
    isVisible: true,
    currentValueDecimal: "162317.87",
    currentPerformanceDecimal: "11039.67",
    soldResultDecimal: null,
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
      currentValueDecimal: "19108.30",
      currentPerformanceDecimal: "1284.15",
    }),
    buildHolding({
      id: "gold-sold",
      status: "sold",
      currentValueDecimal: "170000",
      currentPerformanceDecimal: null,
      soldResultDecimal: "18221.80",
      occurredAt: new Date("2026-08-31T10:00:00.000Z"),
    }),
    buildHolding({
      id: "foreign",
      userId: "user-2",
      currentValueDecimal: "999999",
    }),
    buildHolding({ id: "ineffective", isEffective: false }),
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryOwned.mockImplementation((collection: unknown): unknown => {
      if (collection === mockAssetsCollection) return mockAssetsQuery;
      if (collection === mockHoldingStatesCollection) {
        return mockHoldingStatesQuery;
      }
      if (collection === mockLifecycleEventsCollection) {
        return mockLifecycleEventsQuery;
      }
      throw new Error("Unexpected collection");
    });
  });

  it("builds user-scoped bounded queries for metal assets, holding states, and recent History", () => {
    expect(observePortfolioAssets("user-1")).toBe(mockAssetsQuery);
    expect(observePortfolioHoldingStates("user-1")).toBe(
      mockHoldingStatesQuery
    );
    expect(observePortfolioRecentHistory("user-1")).toBe(
      mockLifecycleEventsQuery
    );

    expect(mockQueryOwned).toHaveBeenCalledWith(
      mockAssetsCollection,
      "user-1",
      { kind: "where", column: "type", value: "METAL" },
      { kind: "where", column: "deleted", value: false }
    );
    expect(mockQueryOwned).toHaveBeenCalledWith(
      mockHoldingStatesCollection,
      "user-1",
      { kind: "where", column: "deleted", value: false }
    );
    expect(mockQueryOwned).toHaveBeenCalledWith(
      mockLifecycleEventsCollection,
      "user-1",
      { kind: "where", column: "deleted", value: false },
      { kind: "where", column: "is_effective", value: true },
      { kind: "where", column: "is_history_visible", value: true },
      { kind: "sortBy", column: "occurred_at", value: "desc" },
      { kind: "take", value: 3 }
    );
  });

  it("defaults to All and limits active values/allocation to current-user effective visible active holdings", () => {
    const model = buildMetalPortfolioReadModel({
      userId: "user-1",
      filter: "ALL",
      holdings,
      rateStatus: { state: "fresh", ageMs: 1000 },
    });

    expect(model.filter).toBe("ALL");
    expect(model.activeTotalDecimal).toBe("181426.17");
    expect(model.allocation).toEqual({ gold: "89.5", silver: "10.5" });
    expect(model.holdings.map((holding) => holding.id)).toEqual([
      "gold-active",
      "silver-active",
    ]);
    expect(model.currentPerformanceDecimal).toBe("12323.82");
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
    expect(model.activeTotalDecimal).toBe("181426.17");
  });

  it("surfaces only effective visible Sold/Disposed records in recent History and preserves trustworthy sold result", () => {
    const model = buildMetalPortfolioReadModel({
      userId: "user-1",
      filter: "ALL",
      holdings,
      rateStatus: { state: "fresh", ageMs: 1000 },
    });

    expect(model.recentHistory).toEqual([
      expect.objectContaining({ id: "gold-sold", status: "sold" }),
    ]);
    expect(model.soldResultDecimal).toBe("18221.8");
  });

  it("keeps active holdings visible but makes rate-dependent values unavailable when current rates are missing", () => {
    const model = buildMetalPortfolioReadModel({
      userId: "user-1",
      filter: "ALL",
      holdings: [
        buildHolding({
          currentValueDecimal: null,
          currentPerformanceDecimal: null,
        }),
        buildHolding({
          id: "silver-active",
          metalType: "SILVER",
          currentValueDecimal: null,
          currentPerformanceDecimal: null,
        }),
      ],
      rateStatus: { state: "missing", ageMs: null },
    });

    expect(model.holdings).toHaveLength(2);
    expect(model.activeTotalDecimal).toBeNull();
    expect(model.currentPerformanceDecimal).toBeNull();
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

  it("uses exact decimal arithmetic for active portfolio totals", () => {
    const model = buildMetalPortfolioReadModel({
      userId: "user-1",
      filter: "ALL",
      holdings: [
        buildHolding({ currentValueDecimal: "0.1" }),
        buildHolding({
          id: "silver-active",
          metalType: "SILVER",
          currentValueDecimal: "0.2",
        }),
      ],
      rateStatus: { state: "fresh", ageMs: 1000 },
    });

    expect(model.activeTotalDecimal).toBe("0.3");
  });
});
