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
  shapeMetalPortfolioHoldings,
  type ShapeMetalPortfolioHoldingsInput,
} from "@/services/metal-portfolio-read-model-service";
import type { LiveRatesTrustReadModel } from "@/services/live-rates-trust-read-model-service";

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
  readonly physicalForm: string | null;
  readonly purchaseCurrency: string | null;
  readonly purchaseDate: Date | null;
  readonly purchasePriceDecimal: string | null;
  readonly purityCatalogVersion: string | null;
  readonly purityCode: string | null;
  readonly purityFactorDecimal: string | null;
  readonly weightGramsDecimal: string | null;
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
    physicalForm: "COIN",
    purchaseCurrency: "EGP",
    purchaseDate: new Date("2024-03-14T00:00:00.000Z"),
    purchasePriceDecimal: "151278.2",
    purityCatalogVersion: "1",
    purityCode: "gold-999",
    purityFactorDecimal: "0.999",
    weightGramsDecimal: "31.125",
    ...overrides,
  };
}

function buildCurrentRates(): LiveRatesTrustReadModel {
  return {
    gold: {
      state: "fresh",
      ageMs: 1_000,
      providerObservedAt: new Date("2026-09-01T11:59:59.000Z"),
      valueDecimal: "100",
    },
    silver: {
      state: "fresh",
      ageMs: 1_000,
      providerObservedAt: new Date("2026-09-01T11:59:59.000Z"),
      valueDecimal: "2",
    },
    currencies: new Map([
      [
        "EGP",
        {
          state: "fresh",
          ageMs: 1_000,
          providerObservedAt: new Date("2026-09-01T11:59:59.000Z"),
          valueDecimal: "0.02",
        },
      ],
      [
        "USD",
        {
          state: "fresh",
          ageMs: 1_000,
          providerObservedAt: new Date("2026-09-01T11:59:59.000Z"),
          valueDecimal: "1",
        },
      ],
    ]),
  };
}

function shapeInput(): ShapeMetalPortfolioHoldingsInput {
  return {
    userId: "user-1",
    preferredCurrency: "EGP" as const,
    currentRates: buildCurrentRates(),
    assets: [
      {
        id: "holding-1",
        userId: "user-1",
        name: "Exact gold",
        createdAt: new Date("2024-01-01T10:00:00.000Z"),
        purchaseDate: new Date("2024-01-01T00:00:00.000Z"),
        purchaseCurrency: "EGP",
        purchasePriceDecimal: "20000",
      },
    ],
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
        deleted: false,
        holdingId: "holding-1",
        id: "event-1",
        isEffective: true,
        occurredAt: new Date("2026-08-20T10:00:00.000Z"),
        userId: "user-1",
      },
    ],
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

  it("shapes exact persisted holding facts and calculates preferred-currency card values", () => {
    const [holding] = shapeMetalPortfolioHoldings(shapeInput());

    expect(holding).toMatchObject({
      id: "holding-1",
      physicalForm: "COIN",
      purchaseCurrency: "EGP",
      purchasePriceDecimal: "20000",
      purityCatalogVersion: "1",
      purityCode: "gold-500",
      purityFactorDecimal: "0.5",
      weightGramsDecimal: "10",
      currentValueDecimal: "25000",
      currentPerformanceDecimal: "5000",
    });
    expect(holding?.purchaseDate?.toISOString()).toBe(
      "2024-01-01T00:00:00.000Z"
    );
  });

  it("keeps holdings visible but never falls back to compatibility weight or purity", () => {
    const input = shapeInput();
    const legacyOnlyMetal = {
      ...input.assetMetals[0],
      purityFactorDecimal: null,
      weightGramsDecimal: null,
      purityFraction: 0.5,
      weightGrams: 10,
    };

    const [holding] = shapeMetalPortfolioHoldings({
      ...input,
      assetMetals: [legacyOnlyMetal],
    });

    expect(holding).toMatchObject({
      weightGramsDecimal: null,
      purityFactorDecimal: null,
      currentValueDecimal: null,
      currentPerformanceDecimal: null,
    });
  });

  it("keeps current value available while purchase evidence or date is unavailable", () => {
    const input = shapeInput();

    const [holding] = shapeMetalPortfolioHoldings({
      ...input,
      assets: [
        {
          ...input.assets[0],
          purchaseDate: new Date("invalid"),
          purchaseCurrency: null,
          purchasePriceDecimal: null,
        },
      ],
    });

    expect(holding).toMatchObject({
      purchaseDate: null,
      purchaseCurrency: null,
      purchasePriceDecimal: null,
      currentValueDecimal: "25000",
      currentPerformanceDecimal: null,
    });
  });

  it("converts purchase cost exactly before calculating cross-currency performance", () => {
    const input = shapeInput();

    const [holding] = shapeMetalPortfolioHoldings({
      ...input,
      assets: [
        {
          ...input.assets[0],
          purchaseCurrency: "USD",
          purchasePriceDecimal: "400",
        },
      ],
    });

    expect(holding).toMatchObject({
      currentValueDecimal: "25000",
      currentPerformanceDecimal: "5000",
    });
  });

  it("keeps current value but fails performance closed when purchase FX is unavailable", () => {
    const input = shapeInput();
    const currencies = new Map(input.currentRates.currencies);
    currencies.delete("USD");

    const [holding] = shapeMetalPortfolioHoldings({
      ...input,
      assets: [
        {
          ...input.assets[0],
          purchaseCurrency: "USD",
          purchasePriceDecimal: "400",
        },
      ],
      currentRates: { ...input.currentRates, currencies },
    });

    expect(holding).toMatchObject({
      currentValueDecimal: "25000",
      currentPerformanceDecimal: null,
    });
  });

  it("fails catalog-mismatched purity and dependent values closed", () => {
    const input = shapeInput();

    const [holding] = shapeMetalPortfolioHoldings({
      ...input,
      assetMetals: [
        {
          ...input.assetMetals[0],
          purityFactorDecimal: "0.5001",
        },
      ],
    });

    expect(holding).toMatchObject({
      purityCatalogVersion: null,
      purityCode: null,
      purityFactorDecimal: null,
      currentValueDecimal: null,
      currentPerformanceDecimal: null,
    });
  });

  it("fails both rate-dependent values closed when exact current observations are unavailable", () => {
    const input = shapeInput();
    const currentRates = buildCurrentRates();

    const [holding] = shapeMetalPortfolioHoldings({
      ...input,
      currentRates: {
        ...currentRates,
        gold: {
          ...currentRates.gold,
          state: "invalid",
          valueDecimal: null,
        },
      },
    });

    expect(holding).toMatchObject({
      currentValueDecimal: null,
      currentPerformanceDecimal: null,
    });
  });

  it("excludes foreign and structurally unlinked rows before shaping", () => {
    const input = shapeInput();

    const holdings = shapeMetalPortfolioHoldings({
      ...input,
      assets: [
        ...input.assets,
        {
          ...input.assets[0],
          id: "foreign-holding",
          userId: "user-2",
        },
      ],
      assetMetals: [
        ...input.assetMetals,
        { ...input.assetMetals[0], assetId: "foreign-holding" },
      ],
      holdingStates: [
        ...input.holdingStates,
        {
          ...input.holdingStates[0],
          holdingId: "foreign-holding",
          userId: "user-2",
        },
      ],
    });

    expect(holdings.map((holding) => holding.id)).toEqual(["holding-1"]);
  });
});
