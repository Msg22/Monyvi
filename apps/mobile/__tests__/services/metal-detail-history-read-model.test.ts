interface QueryCondition {
  readonly column?: string;
  readonly kind: "take" | "where" | "sortBy";
  readonly value?: unknown;
}

const mockAssetsCollection = { table: "assets" };
const mockAssetMetalsCollection = { table: "asset_metals" };
const mockActionEvidenceCollection = { table: "metal_action_evidence" };
const mockHoldingStatesCollection = { table: "metal_holding_states" };
const mockLifecycleEventsCollection = { table: "metal_lifecycle_events" };
const mockRateReferencesCollection = { table: "metal_rate_references" };
const mockQueryOwned = jest.fn();
const mockQueryChildren = jest.fn();
const mockGetCurrentUserDataScope = jest.fn();
const mockScopeQueryOwned = jest.fn();
const mockScopeQueryChildrenOfOwnedParent = jest.fn();
const mockScopeQueryChildrenOfOwnedParents = jest.fn();

jest.mock("@monyvi/db", () => ({
  database: {
    get: (table: string): unknown => {
      const collections: Readonly<Record<string, unknown>> = {
        assets: mockAssetsCollection,
        asset_metals: mockAssetMetalsCollection,
        metal_action_evidence: mockActionEvidenceCollection,
        metal_holding_states: mockHoldingStatesCollection,
        metal_lifecycle_events: mockLifecycleEventsCollection,
        metal_rate_references: mockRateReferencesCollection,
      };
      const collection = collections[table];
      if (collection === undefined)
        throw new Error(`Unexpected table: ${table}`);
      return collection;
    },
  },
}));

jest.mock("@nozbe/watermelondb", () => ({
  Q: {
    desc: "desc",
    oneOf: (values: readonly unknown[]): unknown => ({ oneOf: values }),
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
  getCurrentUserDataScope: (...args: readonly unknown[]): unknown =>
    mockGetCurrentUserDataScope(...args),
  queryChildrenOfOwnedParents: (...args: readonly unknown[]): unknown =>
    mockQueryChildren(...args),
  queryOwned: (...args: readonly unknown[]): unknown => mockQueryOwned(...args),
}));

import {
  buildMetalDetailReadModel,
  observeMetalDetailEvents,
  observeMetalDetailHolding,
  observeMetalDetailRateReferences,
  readMetalDetailReadModel,
  type BuildMetalDetailReadModelInput,
} from "@/services/metal-detail-read-model-service";
import {
  buildMetalHistoryReadModel,
  observeMetalHistoryHoldingStates,
  observeMetalHistoryEvents,
  readMetalHistoryReadModel,
  type MetalHistoryHoldingInput,
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

function detailInput(
  overrides: Partial<BuildMetalDetailReadModelInput> = {}
): BuildMetalDetailReadModelInput {
  return {
    asset: {
      id: "holding-1",
      name: "Gold coin",
      purchaseCurrency: "USD",
      purchaseDate: new Date("2026-08-01T00:00:00.000Z"),
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

function historyHolding(
  id: string,
  lifecycleEvents: readonly EventInput[],
  userId: string = "user-1"
): MetalHistoryHoldingInput {
  return {
    asset: {
      id,
      name: `${id} holding`,
      purchaseCurrency: null,
      purchaseDate: null,
      purchasePriceDecimal: null,
      userId,
    },
    holdingState: {
      holdingId: id,
      isVisible: true,
      reconciliationState: "accepted",
      status: "active",
      userId,
    },
    lifecycleEvents,
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

let mockOwnedRows: Readonly<Record<string, readonly unknown[]>> = {};
let mockChildRows: Readonly<Record<string, readonly unknown[]>> = {};

function fetchedRows(rows: readonly unknown[]): {
  readonly fetch: () => Promise<readonly unknown[]>;
} {
  return { fetch: (): Promise<readonly unknown[]> => Promise.resolve(rows) };
}

function lifecycleRow(
  overrides: Readonly<Record<string, unknown>> = {}
): Readonly<Record<string, unknown>> {
  return {
    actionId: "action-add",
    deleted: false,
    holdingId: "holding-1",
    id: "created",
    isEffective: true,
    isHistoryVisible: true,
    kind: "add",
    occurredAt: new Date("2026-08-20T10:00:00.000Z"),
    payloadJson: '{"opaque":true}',
    predecessorEventId: null,
    reversesEventId: null,
    userId: "user-1",
    ...overrides,
  };
}

function evidenceRow(
  overrides: Readonly<Record<string, unknown>> = {}
): Readonly<Record<string, unknown>> {
  return {
    actionId: "action-add",
    deleted: false,
    holdingId: "holding-1",
    kind: "add",
    userId: "user-1",
    ...overrides,
  };
}

describe("metal detail and History read models", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryOwned.mockImplementation((collection: unknown): unknown => ({
      collection,
    }));
    mockQueryChildren.mockImplementation((collection: unknown): unknown => ({
      collection,
    }));
    mockOwnedRows = {};
    mockChildRows = {};
    mockScopeQueryOwned.mockImplementation(
      (collection: { readonly table: string }): unknown =>
        fetchedRows(mockOwnedRows[collection.table] ?? [])
    );
    mockScopeQueryChildrenOfOwnedParent.mockImplementation(
      (collection: { readonly table: string }): unknown =>
        fetchedRows(mockChildRows[collection.table] ?? [])
    );
    mockScopeQueryChildrenOfOwnedParents.mockImplementation(
      (collection: { readonly table: string }): unknown =>
        fetchedRows(mockChildRows[collection.table] ?? [])
    );
    mockGetCurrentUserDataScope.mockResolvedValue({
      queryChildrenOfOwnedParent: mockScopeQueryChildrenOfOwnedParent,
      queryChildrenOfOwnedParents: mockScopeQueryChildrenOfOwnedParents,
      queryOwned: mockScopeQueryOwned,
      userId: "user-1",
    });
  });

  it("creates bounded user-scoped detail and History queries", () => {
    observeMetalDetailHolding("user-1", "holding-1");
    observeMetalDetailEvents("user-1", "holding-1", 25);
    observeMetalDetailRateReferences("user-1", "holding-1", 25);
    observeMetalHistoryHoldingStates("user-1", "sold");
    observeMetalHistoryEvents({
      holdings: [{ id: "holding-1", userId: "user-1" }],
      pageSize: 25,
      userId: "user-1",
    });

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

  it("opens a migration-backed legacy Active holding without inventing a lifecycle event", () => {
    const model = buildMetalDetailReadModel(
      detailInput({
        holdingState: {
          ...detailInput().holdingState,
          effectiveActionId: null,
          effectiveEventId: null,
        },
        lifecycleEvents: [],
      })
    );

    expect(model).toMatchObject({
      id: "holding-1",
      isActiveOwnership: true,
      status: "active",
    });
    expect(model?.timeline).toEqual([]);
  });

  it("keeps trusted current valuation for a migration-backed active holding", () => {
    const model = buildMetalDetailReadModel(
      detailInput({
        currentRates: {
          currencies: new Map([
            [
              "EGP",
              {
                ageMs: 1_000,
                providerObservedAt: new Date("2026-08-20T10:00:00.000Z"),
                state: "fresh",
                valueDecimal: "0.02",
              },
            ],
          ]),
          gold: {
            ageMs: 1_000,
            providerObservedAt: new Date("2026-08-20T10:00:00.000Z"),
            state: "fresh",
            valueDecimal: "75.17476",
          },
          silver: {
            ageMs: 1_000,
            providerObservedAt: new Date("2026-08-20T10:00:00.000Z"),
            state: "fresh",
            valueDecimal: "0.95",
          },
        },
        holdingState: {
          ...detailInput().holdingState,
          effectiveActionId: null,
          effectiveEventId: null,
        },
        lifecycleEvents: [],
        preferredCurrency: "EGP",
        rateReferences: [],
      })
    );

    expect(model).toMatchObject({
      currentValueCurrency: "EGP",
      currentValueDecimal: "37587.38",
      currentValueObservedAt: new Date("2026-08-20T10:00:00.000Z"),
      totalGainDecimal: null,
      unavailableExactFacts: [],
    });
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
    const model = buildMetalDetailReadModel(
      detailInput({ lifecycleEvents: [event(), sold, undo] })
    );

    expect(model).toMatchObject({ isActiveOwnership: true, status: "active" });
    expect(model?.timeline.map((item) => item.id)).toEqual([
      "undo",
      "sold",
      "created",
    ]);
  });

  it("preserves a holding with missing exact facts while nulling only dependent values", () => {
    const model = buildMetalDetailReadModel(
      detailInput({
        asset: {
          id: "holding-1",
          name: "Legacy",
          purchaseCurrency: "USD",
          purchaseDate: null,
          purchasePriceDecimal: null,
          userId: "user-1",
        },
        metal: {
          itemForm: null,
          metalType: "GOLD",
          purityCatalogVersion: null,
          purityCode: null,
          purityFactorDecimal: null,
          weightGramsDecimal: null,
        },
      })
    );

    expect(model).toMatchObject({
      currentValueDecimal: null,
      requiresCompleteMaterialCorrection: true,
      totalGainDecimal: null,
      unavailableExactFacts: ["weight", "purity", "purchase_cost"],
    });
  });

  it("keeps terminal holdings out of active ownership and filters only current effective terminal History", () => {
    const sold = event({
      id: "sold",
      kind: "sell",
      occurredAt: new Date("2026-08-21T10:00:00.000Z"),
      predecessorEventId: "created",
    });
    const reversed = event({
      id: "undo",
      kind: "undo",
      occurredAt: new Date("2026-08-22T10:00:00.000Z"),
      predecessorEventId: "sold",
      reversesEventId: "sold",
    });
    const terminal = buildMetalDetailReadModel(
      detailInput({
        lifecycleEvents: [event(), sold],
        holdingState: {
          holdingId: "holding-1",
          isVisible: true,
          reconciliationState: "accepted",
          status: "sold",
          userId: "user-1",
        },
      })
    );
    expect(terminal).toMatchObject({
      currentValueDecimal: null,
      isActiveOwnership: false,
      status: "sold",
    });

    const historyHoldings = [
      historyHolding("sold", [
        event({ id: "sold-created" }),
        event({
          id: "sold-terminal",
          kind: "sell",
          predecessorEventId: "sold-created",
          occurredAt: new Date("2026-08-23T00:00:00.000Z"),
        }),
      ]),
      historyHolding("reversed", [
        event({ id: "reversed-created" }),
        sold,
        reversed,
      ]),
      historyHolding(
        "foreign",
        [
          event({ id: "foreign-created" }),
          event({
            id: "foreign-terminal",
            kind: "dispose",
            predecessorEventId: "foreign-created",
          }),
        ],
        "user-2"
      ),
    ];
    const history = buildMetalHistoryReadModel({
      filter: "all",
      holdings: historyHoldings,
      userId: "user-1",
    });
    expect(history.items.map((item) => item.holdingId)).toEqual(["sold"]);
    expect(
      buildMetalHistoryReadModel({
        filter: "disposed",
        holdings: historyHoldings,
        userId: "user-1",
      }).items
    ).toEqual([]);
  });

  it("reads a complete current-user detail model without exposing table joins to hooks", async () => {
    mockOwnedRows = {
      assets: [
        {
          deleted: false,
          id: "holding-1",
          name: "Gold coin",
          purchaseCurrency: "USD",
          purchaseDate: new Date("2026-08-01T00:00:00.000Z"),
          purchasePriceDecimal: "1000",
          type: "METAL",
          userId: "user-1",
        },
      ],
      metal_action_evidence: [evidenceRow()],
      metal_holding_states: [
        {
          deleted: false,
          effectiveActionId: "action-add",
          effectiveEventId: "created",
          holdingId: "holding-1",
          isVisible: true,
          reconciliationState: "accepted",
          status: "active",
          userId: "user-1",
        },
      ],
      metal_lifecycle_events: [lifecycleRow()],
      metal_rate_references: [],
    };
    mockChildRows = {
      asset_metals: [
        {
          assetId: "holding-1",
          deleted: false,
          itemForm: "COIN",
          metalType: "GOLD",
          purityCatalogVersion: "1",
          purityCode: "gold-9999",
          purityFactorDecimal: "0.9999",
          weightGramsDecimal: "10",
        },
      ],
    };

    const model = await readMetalDetailReadModel({
      holdingId: "holding-1",
      userId: "user-1",
    });

    expect(model).toMatchObject({
      id: "holding-1",
      itemForm: "coin",
      metalType: "GOLD",
      name: "Gold coin",
      purchaseCurrency: "USD",
      purchasePriceDecimal: "1000",
      purityCatalogVersion: "1",
      purityCode: "gold-9999",
      purityFactorDecimal: "0.9999",
      renderKey: "gold:coin",
      status: "active",
      weightGramsDecimal: "10",
    });
    expect(model?.purchaseDate?.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(mockScopeQueryChildrenOfOwnedParent).toHaveBeenCalledWith(
      mockAssetMetalsCollection,
      expect.objectContaining({ id: "holding-1", userId: "user-1" }),
      "asset_id",
      expect.anything(),
      expect.anything()
    );
  });

  it("reads bounded History with owned identity and neutral unsupported-form keys", async () => {
    const soldAt = new Date("2026-08-23T00:00:00.000Z");
    const disposedAt = new Date("2026-08-22T00:00:00.000Z");
    mockOwnedRows = {
      assets: [
        {
          deleted: false,
          id: "sold-gold",
          name: "Wedding coin",
          purchaseCurrency: "EGP",
          purchaseDate: null,
          purchasePriceDecimal: "50000",
          type: "METAL",
          userId: "user-1",
        },
        {
          deleted: false,
          id: "disposed-silver",
          name: "Old silver",
          purchaseCurrency: null,
          purchaseDate: null,
          purchasePriceDecimal: null,
          type: "METAL",
          userId: "user-1",
        },
      ],
      metal_action_evidence: [
        evidenceRow({ actionId: "gold-add", holdingId: "sold-gold" }),
        evidenceRow({
          actionId: "gold-sell",
          holdingId: "sold-gold",
          kind: "sell",
        }),
        evidenceRow({
          actionId: "silver-add",
          holdingId: "disposed-silver",
        }),
        evidenceRow({
          actionId: "silver-dispose",
          holdingId: "disposed-silver",
          kind: "dispose",
        }),
      ],
      metal_holding_states: [
        {
          deleted: false,
          holdingId: "sold-gold",
          isVisible: true,
          reconciliationState: "accepted",
          status: "sold",
          userId: "user-1",
        },
        {
          deleted: false,
          holdingId: "disposed-silver",
          isVisible: true,
          reconciliationState: "accepted",
          status: "disposed",
          userId: "user-1",
        },
      ],
      metal_lifecycle_events: [
        lifecycleRow({
          actionId: "gold-add",
          holdingId: "sold-gold",
          id: "gold-created",
        }),
        lifecycleRow({
          actionId: "gold-sell",
          holdingId: "sold-gold",
          id: "gold-sold",
          kind: "sell",
          occurredAt: soldAt,
          predecessorEventId: "gold-created",
        }),
        lifecycleRow({
          actionId: "silver-add",
          holdingId: "disposed-silver",
          id: "silver-created",
        }),
        lifecycleRow({
          actionId: "silver-dispose",
          holdingId: "disposed-silver",
          id: "silver-disposed",
          kind: "dispose",
          occurredAt: disposedAt,
          predecessorEventId: "silver-created",
        }),
      ],
    };
    mockChildRows = {
      asset_metals: [
        {
          assetId: "sold-gold",
          deleted: false,
          itemForm: "coin",
          metalType: "GOLD",
          purityCatalogVersion: "1",
          purityCode: "gold-875",
          purityFactorDecimal: "0.875",
          weightGramsDecimal: "8",
        },
        {
          assetId: "disposed-silver",
          deleted: false,
          itemForm: "amulet",
          metalType: "SILVER",
          purityCatalogVersion: "1",
          purityCode: "silver-925",
          purityFactorDecimal: "0.925",
          weightGramsDecimal: "15",
        },
      ],
    };

    const model = await readMetalHistoryReadModel({
      filter: "all",
      pageSize: 25,
      userId: "user-1",
    });

    expect(model.items).toEqual([
      expect.objectContaining({
        holdingId: "sold-gold",
        itemForm: "coin",
        metalType: "GOLD",
        name: "Wedding coin",
        purityCatalogVersion: "1",
        purityCode: "gold-875",
        purityFactorDecimal: "0.875",
        renderKey: "gold:coin",
        status: "sold",
      }),
      expect.objectContaining({
        holdingId: "disposed-silver",
        itemForm: null,
        metalType: "SILVER",
        name: "Old silver",
        purityCatalogVersion: "1",
        purityCode: "silver-925",
        purityFactorDecimal: "0.925",
        renderKey: null,
        status: "disposed",
      }),
    ]);
    expect(mockScopeQueryOwned).toHaveBeenCalledWith(
      mockHoldingStatesCollection,
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
  });

  it("rejects a stale requested user before any detail or History read", async () => {
    await expect(
      readMetalDetailReadModel({
        holdingId: "holding-1",
        userId: "user-2",
      })
    ).rejects.toThrow("AUTH_SCOPE_CHANGED");
    await expect(
      readMetalHistoryReadModel({ filter: "all", userId: "user-2" })
    ).rejects.toThrow("AUTH_SCOPE_CHANGED");

    expect(mockScopeQueryOwned).not.toHaveBeenCalled();
    expect(mockScopeQueryChildrenOfOwnedParent).not.toHaveBeenCalled();
    expect(mockScopeQueryChildrenOfOwnedParents).not.toHaveBeenCalled();
  });

  it("returns unavailable models instead of inventing missing joined records", async () => {
    mockOwnedRows = {
      assets: [
        {
          deleted: false,
          id: "holding-1",
          name: "Incomplete holding",
          purchaseCurrency: null,
          purchaseDate: null,
          purchasePriceDecimal: null,
          type: "METAL",
          userId: "user-1",
        },
      ],
      metal_action_evidence: [],
      metal_holding_states: [],
      metal_lifecycle_events: [],
      metal_rate_references: [],
    };
    mockChildRows = { asset_metals: [] };

    await expect(
      readMetalDetailReadModel({
        holdingId: "holding-1",
        userId: "user-1",
      })
    ).resolves.toBeNull();
    await expect(
      readMetalHistoryReadModel({ filter: "all", userId: "user-1" })
    ).resolves.toEqual({ filter: "all", items: [] });

    mockOwnedRows = {
      assets: [],
      metal_holding_states: [
        {
          deleted: false,
          holdingId: "missing-parent",
          isVisible: true,
          reconciliationState: "accepted",
          status: "sold",
          userId: "user-1",
        },
      ],
    };
    await expect(
      readMetalHistoryReadModel({ filter: "all", userId: "user-1" })
    ).resolves.toEqual({ filter: "all", items: [] });
  });
});
