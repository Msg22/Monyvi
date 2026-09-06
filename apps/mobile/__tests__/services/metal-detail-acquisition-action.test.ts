jest.mock("@monyvi/db", () => ({ database: { get: jest.fn() } }));
jest.mock("@/services/user-data-access", () => ({
  getCurrentUserDataScope: jest.fn(),
  queryOwned: jest.fn(),
}));

import {
  buildMetalDetailReadModel,
  type BuildMetalDetailReadModelInput,
} from "@/services/metal-detail-read-model-service";
import { toDetailAssetInput } from "@/services/metal-detail-read-model-shaping";

function reference(role: string): Record<string, unknown> {
  const isMetal = role.includes("metal");
  return {
    actionId: "action-add",
    capturedAt: 1_000,
    capturedFreshness: "fresh",
    instrumentCode: isMetal ? "metal:GOLD" : "currency:USD",
    kind: isMetal ? "metal" : "currency",
    orientation: "quote_per_base",
    providerObservedAt: 900,
    quality: "valid",
    role,
    source: "fixture",
    unit: isMetal ? "usd_per_pure_gram" : "usd_per_currency_unit",
    valueDecimal: isMetal ? "10" : "1",
  };
}

function detailInput(): BuildMetalDetailReadModelInput {
  return {
    asset: {
      acquisitionActionId: "action-add",
      id: "holding-1",
      name: "Gold coin",
      purchaseCurrency: "USD",
      purchaseDate: new Date("2026-08-01T00:00:00.000Z"),
      purchasePriceDecimal: "1000",
      userId: "user-1",
    },
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
            state: "fresh",
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
        state: "fresh",
        valueDecimal: "12",
      },
      silver: { ageMs: null, providerObservedAt: null, state: "missing" },
    },
    holdingState: {
      effectiveActionId: "action-metadata-correction",
      effectiveEventId: "corrected",
      holdingId: "holding-1",
      isVisible: true,
      reconciliationState: "accepted",
      status: "active",
      userId: "user-1",
    },
    lifecycleEvents: [
      {
        actionId: "action-add",
        actionState: "accepted",
        id: "created",
        isEffective: true,
        kind: "add",
        occurredAt: new Date("2026-08-01T00:00:00.000Z"),
        predecessorEventId: null,
      },
      {
        actionId: "action-metadata-correction",
        actionState: "accepted",
        id: "corrected",
        isEffective: true,
        kind: "correct",
        occurredAt: new Date("2026-08-02T00:00:00.000Z"),
        predecessorEventId: "created",
      },
    ],
    metal: {
      itemForm: "coin",
      metalType: "GOLD",
      purityCatalogVersion: "1",
      purityCode: "gold-9999",
      purityFactorDecimal: "0.9999",
      weightGramsDecimal: "10",
    },
    preferredCurrency: "USD",
    rateReferences: [
      reference("acquisition_metal"),
      reference("acquisition_purchase_currency"),
    ],
    userId: "user-1",
  };
}

describe("metal detail acquisition-action binding", () => {
  it("retains acquisition attribution after a metadata-only correction", () => {
    expect(buildMetalDetailReadModel(detailInput())).toMatchObject({
      currentValueDecimal: "119.988",
      totalGainDecimal: "-880.012",
    });
  });

  it("uses exact USD identity for current detail value without fabricating a USD observation", () => {
    const input = detailInput();
    const model = buildMetalDetailReadModel({
      ...input,
      currentRates: {
        ...input.currentRates!,
        currencies: new Map(),
      },
    });

    expect(model).toMatchObject({
      attribution: null,
      currentValueDecimal: "119.988",
      currentValueObservedAt: new Date("2026-08-25T10:00:00.000Z"),
      currentValueRateStatus: {
        ageMs: 1_000,
        providerObservedAt: new Date("2026-08-25T10:00:00.000Z"),
        quality: "valid",
        source: "fixture",
        state: "fresh",
      },
      totalGainDecimal: null,
    });
  });

  it("uses exact USD identity when converting detail attribution for display", () => {
    const input = detailInput();
    const currentRates = input.currentRates!;
    const egpRate = {
      ...currentRates.currencies.get("USD")!,
      valueDecimal: "0.02",
    };
    const rateReferences = input.rateReferences.map((reference) => {
      const value = reference as Readonly<Record<string, unknown>>;
      return value.role === "acquisition_purchase_currency"
        ? { ...value, instrumentCode: "currency:EGP", valueDecimal: "0.02" }
        : value;
    });
    const model = buildMetalDetailReadModel({
      ...input,
      asset: {
        ...input.asset,
        purchaseCurrency: "EGP",
        purchasePriceDecimal: "50000",
      },
      currentRates: {
        ...currentRates,
        currencies: new Map([["EGP", egpRate]]),
      },
      rateReferences,
    });

    expect(model).toMatchObject({
      currentValueCurrency: "USD",
      currentValueDecimal: "119.988",
      totalGainDecimal: "-880.012",
    });
    expect(model?.attribution?.breakdown.available).toBe(true);
  });

  it("keeps unknown-freshness current references usable when provider time is unavailable", () => {
    const input = detailInput();
    const currentRates = input.currentRates!;
    const currencyRate = currentRates.currencies.get("USD")!;
    const model = buildMetalDetailReadModel({
      ...input,
      currentRates: {
        ...currentRates,
        currencies: new Map([
          [
            "USD",
            {
              ...currencyRate,
              ageMs: null,
              providerObservedAt: null,
              state: "unknown" as const,
            },
          ],
        ]),
        gold: {
          ...currentRates.gold,
          ageMs: null,
          providerObservedAt: null,
          state: "unknown",
        },
      },
    });

    expect(model).toMatchObject({
      currentValueDecimal: "119.988",
      currentValueObservedAt: null,
      currentValueRateStatus: {
        ageMs: null,
        providerObservedAt: null,
        state: "unknown",
      },
      totalGainDecimal: "-880.012",
    });
    expect(model?.attribution?.breakdown.available).toBe(true);
  });

  it("carries the persisted acquisition action into the detail input", () => {
    const shaped = toDetailAssetInput({
      acquisitionActionId: "action-add",
      id: "holding-1",
      name: "Gold coin",
      purchaseCurrency: "USD",
      purchaseDate: null,
      purchasePriceDecimal: "1000",
      userId: "user-1",
    });

    expect(shaped.acquisitionActionId).toBe("action-add");
  });
});
