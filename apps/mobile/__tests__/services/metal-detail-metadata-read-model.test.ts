jest.mock("@/services/metal-terminal-read-model-service", () =>
  jest.requireActual<typeof import("./terminal-facts-fixture")>(
    "./terminal-facts-fixture"
  )
);

interface QueryCondition {
  readonly column?: string;
  readonly kind: "take" | "where" | "sortBy";
  readonly value?: unknown;
}

const mockAssetsCollection = { table: "assets" };
const mockAssetMetalsCollection = { table: "asset_metals" };
const mockActionEvidenceCollection = { table: "metal_action_evidence" };
const mockFinancialActionGroupsCollection = {
  table: "financial_action_groups",
};
const mockHoldingStatesCollection = { table: "metal_holding_states" };
const mockLifecycleEventsCollection = { table: "metal_lifecycle_events" };
const mockRateReferencesCollection = { table: "metal_rate_references" };
const mockQueryOwned = jest.fn();
const mockQueryChildren = jest.fn();
const mockGetCurrentUserDataScope = jest.fn();

jest.mock("@monyvi/db", () => ({
  database: {
    get: (table: string): unknown => {
      const collections: Readonly<Record<string, unknown>> = {
        assets: mockAssetsCollection,
        asset_metals: mockAssetMetalsCollection,
        financial_action_groups: mockFinancialActionGroupsCollection,
        metal_action_evidence: mockActionEvidenceCollection,
        metal_holding_states: mockHoldingStatesCollection,
        metal_lifecycle_events: mockLifecycleEventsCollection,
        metal_rate_references: mockRateReferencesCollection,
        metal_metadata_edit_outcomes: { table: "metal_metadata_edit_outcomes" },
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
  USER_DATA_ACCESS_ERROR_CODES: {
    AUTH_SCOPE_CHANGED: "AUTH_SCOPE_CHANGED",
    USER_REQUIRED: "USER_REQUIRED",
  },
  getCurrentUserDataScope: (...args: readonly unknown[]): unknown =>
    mockGetCurrentUserDataScope(...args),
  queryChildrenOfOwnedParents: (...args: readonly unknown[]): unknown =>
    mockQueryChildren(...args),
  queryOwned: (...args: readonly unknown[]): unknown => mockQueryOwned(...args),
}));

import {
  buildMetalDetailReadModel,
  type BuildMetalDetailReadModelInput,
  type MetalDetailLifecycleEventInput,
} from "@/services/metal-detail-read-model-service";

function event(
  overrides: Partial<MetalDetailLifecycleEventInput> = {}
): MetalDetailLifecycleEventInput {
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

function rate(
  role: string,
  valueDecimal: string,
  actionId: string = "action-add"
): Record<string, unknown> {
  const isMetal = role.includes("metal");
  return {
    actionId,
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
      acquisitionActionId: "action-add",
      id: "holding-1",
      name: "Gold coin",
      notes: null,
      purchaseCurrency: "USD",
      purchaseDate: new Date("2026-08-01T00:00:00.000Z"),
      purchasePriceDecimal: "1000",
      userId: "user-1",
    },
    holdingState: {
      effectiveActionId: "action-add",
      effectiveEventId: "created",
      holdingId: "holding-1",
      isVisible: true,
      reconciliationState: "accepted",
      status: "active",
      userId: "user-1",
    },
    lifecycleEvents: [event()],
    currentRates: {
      currencies: new Map([
        [
          "USD",
          {
            ageMs: 1_000,
            capturedAt: new Date("2026-08-25T10:00:01.000Z"),
            providerObservedAt: new Date("2026-08-25T10:00:00.000Z"),
            quality: "valid",
            source: "fixture",
            state: "fresh" as const,
            valueDecimal: "1",
          },
        ],
      ]),
      gold: {
        ageMs: 1_000,
        capturedAt: new Date("2026-08-25T10:00:01.000Z"),
        providerObservedAt: new Date("2026-08-25T10:00:00.000Z"),
        quality: "valid",
        source: "fixture",
        state: "fresh" as const,
        valueDecimal: "12",
      },
      silver: {
        ageMs: null,
        providerObservedAt: null,
        state: "missing" as const,
      },
    },
    metal: {
      itemForm: "coin",
      metalType: "GOLD",
      purityCatalogVersion: "1",
      purityCode: "gold-9999",
      purityFactorDecimal: "0.9999",
      weightGramsDecimal: "10",
    },
    rateReferences: [
      rate("acquisition_metal", "10"),
      rate("acquisition_purchase_currency", "1"),
      rate("current_metal", "12"),
      rate("current_purchase_currency", "1"),
    ],
    preferredCurrency: "USD",
    userId: "user-1",
    ...overrides,
  };
}

describe("metal detail metadata read model", () => {
  it("adds persisted metadata history without changing valuation or material evidence", () => {
    const original = buildMetalDetailReadModel(detailInput());
    const next = buildMetalDetailReadModel(
      detailInput({
        metadataHistory: [
          {
            id: "edit-1",
            linkedActionId: null,
            occurredAt: new Date("2026-10-10T12:00:00.000Z"),
            changes: [
              { field: "notes", before: "Exact saved note", after: null },
            ],
          },
        ],
      })
    );
    expect(next?.timeline[0]).toMatchObject({
      kind: "metadata",
      correctionChanges: [
        { field: "notes", before: "Exact saved note", after: null },
      ],
    });
    expect(next?.currentValueDecimal).toBe(original?.currentValueDecimal);
    expect(next?.attribution).toEqual(original?.attribution);
  });
});
