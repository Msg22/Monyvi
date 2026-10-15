import type {
  BuildMetalDetailReadModelInput,
  MetalDetailLifecycleEventInput,
} from "../../services/metal-detail-read-model-service";

export function event(
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

export function detailInput(
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
