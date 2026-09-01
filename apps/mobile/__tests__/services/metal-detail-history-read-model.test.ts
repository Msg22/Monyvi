interface QueryCondition {
  readonly column?: string;
  readonly kind: "take" | "where" | "sortBy";
  readonly value?: unknown;
}

const mockAssetsCollection = { table: "assets" };
const mockHoldingStatesCollection = { table: "metal_holding_states" };
const mockLifecycleEventsCollection = { table: "metal_lifecycle_events" };
const mockRateReferencesCollection = { table: "metal_rate_references" };
const mockQueryOwned = jest.fn();
const mockQueryChildren = jest.fn();

jest.mock("@monyvi/db", () => ({
  database: {
    get: (table: string): unknown => {
      const collections: Readonly<Record<string, unknown>> = {
        assets: mockAssetsCollection,
        metal_holding_states: mockHoldingStatesCollection,
        metal_lifecycle_events: mockLifecycleEventsCollection,
        metal_rate_references: mockRateReferencesCollection,
      };
      const collection = collections[table];
      if (collection === undefined) throw new Error(`Unexpected table: ${table}`);
      return collection;
    },
  },
}));

jest.mock("@nozbe/watermelondb", () => ({
  Q: {
    desc: "desc",
    sortBy: (column: string, value: unknown): QueryCondition => ({
      column,
      kind: "sortBy",
      value,
    }),
    take: (value: number): QueryCondition => ({ kind: "take", value }),
    where: (column: string, value: unknown): QueryCondition => ({
      column,
      kind: "where",
      value,
    }),
  },
}));

jest.mock("@/services/user-data-access", () => ({
  queryChildrenOfOwnedParents: (...args: readonly unknown[]): unknown =>
    mockQueryChildren(...args),
  queryOwned: (...args: readonly unknown[]): unknown => mockQueryOwned(...args),
}));

import {
  buildMetalDetailReadModel,
  observeMetalDetailEvents,
  observeMetalDetailHolding,
  observeMetalDetailRateReferences,
} from "@/services/metal-detail-read-model-service";
import {
  buildMetalHistoryReadModel,
  observeMetalHistoryHoldingStates,
  observeMetalHistoryEvents,
} from "@/services/metal-history-read-model-service";

interface EventInput {
  readonly actionState?: "accepted" | "rejected" | "unknown";
  readonly id: string;
  readonly isEffective?: boolean;
  readonly isHistoryVisible?: boolean;
  readonly kind: "add" | "correct" | "sell" | "dispose" | "delete" | "undo";
  readonly occurredAt: Date;
  readonly predecessorEventId: string | null;
  readonly reversesEventId?: string | null;
}

function event(overrides: Partial<EventInput> = {}): EventInput {
  return {
    actionState: "accepted",
    id: "created",
    isEffective: true,
    isHistoryVisible: true,
    kind: "add",
    occurredAt: new Date("2026-08-20T10:00:00.000Z"),
    predecessorEventId: null,
    reversesEventId: null,
    ...overrides,
  };
}

function rate(role: string, valueDecimal: string): Record<string, unknown> {
  const isMetal = role.includes("metal");
  return {
    capturedAt: 1_000,
    capturedFreshness: "fresh",
    instrumentCode: isMetal ? "metal:GOLD" : "currency:USD",
    kind: isMetal ? "metal" : "currency",
    orientation: "quote_per_base",
    providerObservedAt: 1_000,
    quality: "valid",
    role,
    source: "fixture",
    unit: isMetal ? "usd_per_pure_gram" : "usd_per_currency_unit",
    valueDecimal,
  };
}

function detailInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    asset: {
      id: "holding-1",
      name: "Gold coin",
      purchaseCurrency: "USD",
      purchasePriceDecimal: "1000",
      userId: "user-1",
    },
    holdingState: {
      holdingId: "holding-1",
      isVisible: true,
      reconciliationState: "accepted",
      status: "active",
      userId: "user-1",
    },
    lifecycleEvents: [event()],
    metal: {
      itemForm: "coin",
      metalType: "GOLD",
      purityCatalogVersion: "1",
      purityCode: "gold-9999",
      purityFactorDecimal: "1",
      weightGramsDecimal: "10",
    },
    rateReferences: [
      rate("acquisition_metal", "10"),
      rate("acquisition_purchase_currency", "1"),
      rate("current_metal", "12"),
      rate("current_purchase_currency", "1"),
    ],
    userId: "user-1",
    ...overrides,
  };
}

describe("metal detail and History read models", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryOwned.mockImplementation((collection: unknown): unknown => ({ collection }));
    mockQueryChildren.mockImplementation((collection: unknown): unknown => ({ collection }));
  });

  it("creates bounded user-scoped detail and History queries", () => {
    observeMetalDetailHolding("user-1", "holding-1");
    observeMetalDetailEvents("user-1", "holding-1", 25);
    observeMetalDetailRateReferences("user-1", "holding-1", 25);
    observeMetalHistoryHoldingStates("user-1", "sold");
    observeMetalHistoryEvents({ holdings: [{ id: "holding-1", userId: "user-1" }], pageSize: 25, userId: "user-1" });

    expect(mockQueryOwned).toHaveBeenCalledWith(
      mockAssetsCollection,
      "user-1",
      { column: "id", kind: "where", value: "holding-1" },
      { column: "deleted", kind: "where", value: false }
    );
    expect(mockQueryOwned).toHaveBeenCalledWith(
      mockLifecycleEventsCollection,
      "user-1",
      { column: "holding_id", kind: "where", value: "holding-1" },
      { column: "deleted", kind: "where", value: false },
      { column: "occurred_at", kind: "sortBy", value: "desc" },
      { kind: "take", value: 26 }
    );
    expect(mockQueryChildren).toHaveBeenCalledWith(
      mockLifecycleEventsCollection,
      [{ id: "holding-1", userId: "user-1" }],
      "user-1",
      "holding_id",
      { column: "deleted", kind: "where", value: false },
      { column: "is_history_visible", kind: "where", value: true },
      { column: "occurred_at", kind: "sortBy", value: "desc" },
      { kind: "take", value: 26 }
    );
  });

  it("derives Active detail from accepted lifecycle facts and exact attribution", () => {
    const model = buildMetalDetailReadModel(detailInput());

    expect(model).toMatchObject({
      currentValueDecimal: "120",
      isActiveOwnership: true,
      status: "active",
      totalGainDecimal: "-880",
    });
    expect(model?.attribution?.breakdown.available).toBe(true);
    expect(model?.timeline.map((item) => item.id)).toEqual(["created"]);
  });

  it("keeps a reversed terminal event in detail chronology but restores active ownership", () => {
    const sold = event({
      id: "sold",
      kind: "sell",
      occurredAt: new Date("2026-08-21T10:00:00.000Z"),
      predecessorEventId: "created",
    });
    const undo = event({
      id: "undo",
      kind: "undo",
      occurredAt: new Date("2026-08-21T10:00:00.000Z"),
      predecessorEventId: "sold",
      reversesEventId: "sold",
    });
    const model = buildMetalDetailReadModel(detailInput({ lifecycleEvents: [event(), sold, undo] }));

    expect(model).toMatchObject({ isActiveOwnership: true, status: "active" });
    expect(model?.timeline.map((item) => item.id)).toEqual(["undo", "sold", "created"]);
  });

  it("preserves a holding with missing exact facts while nulling only dependent values", () => {
    const model = buildMetalDetailReadModel(detailInput({
      asset: { id: "holding-1", name: "Legacy", purchaseCurrency: "USD", purchasePriceDecimal: null, userId: "user-1" },
      metal: { itemForm: null, metalType: "GOLD", purityCatalogVersion: null, purityCode: null, purityFactorDecimal: null, weightGramsDecimal: null },
    }));

    expect(model).toMatchObject({
      currentValueDecimal: null,
      requiresCompleteMaterialCorrection: true,
      totalGainDecimal: null,
      unavailableExactFacts: ["weight", "purity", "purchase_cost"],
    });
  });

  it("keeps terminal holdings out of active ownership and filters only current effective terminal History", () => {
    const sold = event({ id: "sold", kind: "sell", occurredAt: new Date("2026-08-21T10:00:00.000Z"), predecessorEventId: "created" });
    const reversed = event({ id: "undo", kind: "undo", occurredAt: new Date("2026-08-22T10:00:00.000Z"), predecessorEventId: "sold", reversesEventId: "sold" });
    const terminal = buildMetalDetailReadModel(detailInput({ lifecycleEvents: [event(), sold], holdingState: { holdingId: "holding-1", isVisible: true, reconciliationState: "accepted", status: "sold", userId: "user-1" } }));
    expect(terminal).toMatchObject({ currentValueDecimal: null, isActiveOwnership: false, status: "sold" });

    const history = buildMetalHistoryReadModel({
      filter: "all",
      holdings: [
        { id: "sold", lifecycleEvents: [event({ id: "sold-created" }), event({ id: "sold-terminal", kind: "sell", predecessorEventId: "sold-created", occurredAt: new Date("2026-08-23T00:00:00.000Z") })], userId: "user-1" },
        { id: "reversed", lifecycleEvents: [event({ id: "reversed-created" }), sold, reversed], userId: "user-1" },
        { id: "foreign", lifecycleEvents: [event({ id: "foreign-created" }), event({ id: "foreign-terminal", kind: "dispose", predecessorEventId: "foreign-created" })], userId: "user-2" },
      ],
      userId: "user-1",
    });
    expect(history.items.map((item) => item.holdingId)).toEqual(["sold"]);
    expect(buildMetalHistoryReadModel({ ...history, filter: "disposed" }).items).toEqual([]);
  });
});
