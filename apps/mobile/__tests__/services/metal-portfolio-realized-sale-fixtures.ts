import type {
  MetalPortfolioAssetMetalSnapshot,
  MetalPortfolioAssetSnapshot,
  MetalPortfolioHoldingInput,
  MetalPortfolioLifecycleEventSnapshot,
  ShapeMetalPortfolioHoldingsInput,
} from "@/services/metal-portfolio-read-model-service";
import type { LiveRatesTrustReadModel } from "@/services/live-rates-trust-read-model-service";
import type {
  MetalSellGroupSnapshot,
  MetalSellRateReferenceSnapshot,
} from "@/services/metal-realized-sale-read-model-service";
import type { MetalsIsoCurrencyCode } from "@monyvi/logic";

export const USER_ID = "018f0c7a-1234-7abc-8def-000000000021";
export const SOLD_HOLDING_ID = "018f0c7a-1234-7abc-8def-000000000022";
export const ADD_ACTION_ID = "018f0c7a-1234-7abc-8def-000000000023";
export const SELL_ACTION_ID = "018f0c7a-1234-7abc-8def-000000000024";

export function soldPayload(
  overrides: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    expectedHoldingRevision: "1",
    feeMinorUnits: "50000",
    grossProceedsMinorUnits: "3600000",
    holdingId: SOLD_HOLDING_ID,
    metalType: "GOLD",
    netProceedsMinorUnits: "3550000",
    notes: "Manual QA whole-holding sale without account credit",
    predecessorEventId: ADD_ACTION_ID,
    purchaseCurrency: "EGP",
    rateSnapshots: [],
    reversesEventId: null,
    saleCurrency: "EGP",
    saleDate: "2026-08-22",
    ...overrides,
  };
}

function soldEnvelope(
  payload: Record<string, unknown>,
  overrides: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    accountGuards: [],
    actionId: SELL_ACTION_ID,
    domain: "metals",
    domainReferenceId: SOLD_HOLDING_ID,
    envelopeVersion: "monyvi.financial-action/v1",
    kind: "sell",
    occurredAt: "2026-08-22T12:00:00.000Z",
    payload,
    payloadVersion: "metals.sell/v2",
    userId: USER_ID,
    ...overrides,
  };
}

export function soldGroup(
  payload: Record<string, unknown>,
  envelopeOverrides: Readonly<Record<string, unknown>> = {},
  groupOverrides: Partial<MetalSellGroupSnapshot> = {}
): MetalSellGroupSnapshot {
  return {
    actionId: SELL_ACTION_ID,
    deleted: false,
    domain: "metals",
    domainReferenceId: SOLD_HOLDING_ID,
    kind: "sell",
    outcomeJson: null,
    payloadJson: JSON.stringify(soldEnvelope(payload, envelopeOverrides)),
    rejectionCode: null,
    serverOutcome: null,
    state: "local_complete",
    userId: USER_ID,
    ...groupOverrides,
  };
}

export function soldEvent(
  payload: Record<string, unknown>,
  overrides: Partial<MetalPortfolioLifecycleEventSnapshot> = {}
): MetalPortfolioLifecycleEventSnapshot {
  return {
    actionId: SELL_ACTION_ID,
    deleted: false,
    holdingId: SOLD_HOLDING_ID,
    id: SELL_ACTION_ID,
    isEffective: true,
    kind: "sell",
    occurredAt: new Date("2026-08-22T12:00:00.000Z"),
    payloadJson: JSON.stringify(payload),
    userId: USER_ID,
    ...overrides,
  };
}

export function soldHoldingAsset(
  overrides: Partial<MetalPortfolioAssetSnapshot> = {}
): MetalPortfolioAssetSnapshot {
  return {
    acquisitionActionId: null,
    createdAt: new Date("2024-01-01T10:00:00.000Z"),
    id: SOLD_HOLDING_ID,
    name: "QA Sold Gold Coin",
    purchaseCurrency: "EGP",
    purchaseDate: new Date("2024-01-01T00:00:00.000Z"),
    purchasePriceDecimal: "30000",
    userId: USER_ID,
    ...overrides,
  };
}

function soldHoldingMetal(): MetalPortfolioAssetMetalSnapshot {
  return {
    assetId: SOLD_HOLDING_ID,
    deleted: false,
    itemForm: "COIN",
    metalType: "GOLD",
    purityCatalogVersion: "1",
    purityCode: "gold-500",
    purityFactorDecimal: "0.5",
    weightGramsDecimal: "10",
  };
}

export function soldInput(
  overrides: Partial<ShapeMetalPortfolioHoldingsInput> = {}
): ShapeMetalPortfolioHoldingsInput {
  const payload = soldPayload();
  return {
    actionGroups: [soldGroup(payload)],
    assetMetals: [soldHoldingMetal()],
    assets: [soldHoldingAsset()],
    currentRates: buildCurrentRates(),
    holdingStates: [
      {
        deleted: false,
        effectiveEventId: SELL_ACTION_ID,
        holdingId: SOLD_HOLDING_ID,
        isVisible: true,
        reconciliationState: "accepted",
        status: "sold",
        userId: USER_ID,
      },
    ],
    lifecycleEvents: [soldEvent(payload)],
    preferredCurrency: "EGP",
    rateReferences: [],
    userId: USER_ID,
    ...overrides,
  };
}

function terminalSnapshot(
  role: string,
  instrumentCode: string,
  kind: string,
  unit: string,
  valueDecimal: string,
  referenceId: string
): Record<string, unknown> {
  return {
    capturedAt: "2026-08-22T11:59:00.000Z",
    capturedFreshness: "fresh",
    instrumentCode,
    kind,
    orientation: "quote_per_base",
    providerObservedAt: "2026-08-22T11:58:00.000Z",
    quality: "valid",
    referenceId,
    role,
    source: "provider-a",
    unit,
    valueDecimal,
  };
}

export function crossCurrencyPayload(
  purchaseCurrency: MetalsIsoCurrencyCode,
  saleCurrency: MetalsIsoCurrencyCode,
  overrides: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> {
  const fxRate = (currency: MetalsIsoCurrencyCode): string =>
    currency === "USD" ? "1" : "0.02";
  return soldPayload({
    feeMinorUnits: "0",
    grossProceedsMinorUnits: "600000",
    netProceedsMinorUnits: "600000",
    purchaseCurrency,
    saleCurrency,
    rateSnapshots: [
      terminalSnapshot(
        "terminal_metal",
        "metal:GOLD",
        "metal",
        "usd_per_pure_gram",
        "52",
        "018f0c7a-1234-7abc-8def-000000000121"
      ),
      terminalSnapshot(
        "terminal_purchase_currency",
        `currency:${purchaseCurrency}`,
        "currency",
        "usd_per_currency_unit",
        fxRate(purchaseCurrency),
        "018f0c7a-1234-7abc-8def-000000000122"
      ),
      terminalSnapshot(
        "terminal_proceeds_currency",
        `currency:${saleCurrency}`,
        "currency",
        "usd_per_currency_unit",
        fxRate(saleCurrency),
        "018f0c7a-1234-7abc-8def-000000000123"
      ),
    ],
    ...overrides,
  });
}

function rateReference(
  role: string,
  instrumentCode: string,
  kind: string,
  unit: string,
  valueDecimal: string,
  overrides: Partial<MetalSellRateReferenceSnapshot> = {}
): MetalSellRateReferenceSnapshot {
  return {
    actionId: SELL_ACTION_ID,
    capturedAt: new Date("2026-08-22T11:59:00.000Z"),
    capturedFreshness: "fresh",
    deleted: false,
    holdingId: SOLD_HOLDING_ID,
    instrumentCode,
    kind,
    orientation: "quote_per_base",
    providerObservedAt: new Date("2026-08-22T11:58:00.000Z"),
    quality: "valid",
    role,
    source: "provider-a",
    unit,
    userId: USER_ID,
    valueDecimal,
    ...overrides,
  };
}

export function acquisitionRateRows(): MetalSellRateReferenceSnapshot[] {
  return [
    rateReference(
      "acquisition_metal",
      "metal:GOLD",
      "metal",
      "usd_per_pure_gram",
      "50",
      { actionId: ADD_ACTION_ID }
    ),
    rateReference(
      "acquisition_purchase_currency",
      "currency:EGP",
      "currency",
      "usd_per_currency_unit",
      "0.02",
      { actionId: ADD_ACTION_ID }
    ),
  ];
}

export function buildHolding(
  overrides: Partial<MetalPortfolioHoldingInput> = {}
): MetalPortfolioHoldingInput {
  return {
    id: "gold-active",
    userId: USER_ID,
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

export function buildCurrentRates(): LiveRatesTrustReadModel {
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
