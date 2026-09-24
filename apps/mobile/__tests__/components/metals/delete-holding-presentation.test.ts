import type { MetalDetailReadModel } from "@/services/metal-detail-read-model-service";

import {
  getDeleteHoldingSheetCopy,
  getDeleteHoldingSheetHolding,
} from "@/components/metals/delete-holding-presentation";

type TranslateOptions = Record<string, string | number>;

const METALS_COPY: Record<string, string> = {
  "actions.delete": "Delete holding",
  "delete.consequence":
    "Only delete a holding added by mistake. It will be removed from your portfolio and History. Sell and No Longer are separate actions.",
  "delete.confirm_accessibility": "Delete holding {{holdingName}}",
  "delete.failure": "We couldn't delete this holding. Try again.",
  "delete.offline": "Saved locally first",
  "delete.pending": "Deleting holding…",
  "delete.performance": "Since purchase",
  "detail.current_value": "Current value",
  "detail.retry": "Try again",
  "detail.since_purchase": "{{amount}} since purchase",
  "detail.value_unavailable": "Value unavailable",
  "form.coin": "Coin",
  "form.unknown": "Other form",
  "metal.gold": "Gold",
  "metal.silver": "Silver",
  "portfolio.performance_unavailable":
    "Since-purchase result unavailable. Purchase cost is not available.",
  "purity_gold_999": "24K · 999",
  weight_unit: "g",
};

const COMMON_COPY: Record<string, string> = {
  cancel: "Cancel",
};

function translate(
  dictionary: Record<string, string>
): (key: string, options?: TranslateOptions) => string {
  return (key: string, options?: TranslateOptions): string => {
    const template = dictionary[key] ?? key;
    if (!options) return template;
    return Object.entries(options).reduce(
      (text, [name, value]) => text.replace(`{{${name}}}`, String(value)),
      template
    );
  };
}

const tMetals = translate(METALS_COPY);
const tCommon = translate(COMMON_COPY);

function activeModel(
  overrides: Partial<MetalDetailReadModel> = {}
): MetalDetailReadModel {
  return {
    attribution: null,
    currentValueCurrency: "EGP",
    currentValueDecimal: "162317.87",
    currentValueObservedAt: new Date(2026, 7, 25, 10, 30),
    currentValueRateStatus: null,
    id: "holding-gold-coin",
    isActiveOwnership: true,
    isFinancialActionLocked: false,
    itemForm: "coin",
    metalType: "GOLD",
    name: "Wedding coin",
    notes: null,
    purchaseCurrency: "EGP",
    purchaseDate: new Date("2024-03-14T00:00:00.000Z"),
    purchasePriceDecimal: "151278.20",
    purityCatalogVersion: "1",
    purityCode: "gold-999",
    purityFactorDecimal: "0.999",
    reconciliationState: "accepted",
    renderKey: "gold:coin",
    requiresCompleteMaterialCorrection: false,
    status: "active",
    terminalFacts: null,
    timeline: [],
    totalGainDecimal: "11039.67",
    unavailableExactFacts: [],
    weightGramsDecimal: "31.125",
    ...overrides,
  };
}

describe("delete holding sheet facts", () => {
  it("shapes the approved Screen 14 identity, purity, weight, and value facts", () => {
    const holding = getDeleteHoldingSheetHolding(activeModel(), tMetals);

    expect(holding).toEqual({
      name: "Wedding coin",
      description: "Gold · 24K · 999 · Coin",
      weightLabel: "31.125 g",
      currentValueLabel: "EGP 162,317.87",
      performanceLabel: "+ EGP 11,039.67 since purchase",
    });
  });

  it("returns null when the holding model is unavailable", () => {
    expect(getDeleteHoldingSheetHolding(null, tMetals)).toBeNull();
  });

  it("marks an unresolvable purity without inventing a catalog label", () => {
    const holding = getDeleteHoldingSheetHolding(
      activeModel({ purityCatalogVersion: "2" }),
      tMetals
    );

    expect(holding?.description).toBe("Gold · — · Coin");
  });

  it("names an unrecorded physical form instead of hiding the fact", () => {
    const holding = getDeleteHoldingSheetHolding(
      activeModel({ itemForm: null }),
      tMetals
    );

    expect(holding?.description).toBe("Gold · 24K · 999 · Other form");
  });

  it("keeps the confirmation usable when weight, value, or performance are unavailable", () => {
    const holding = getDeleteHoldingSheetHolding(
      activeModel({
        currentValueDecimal: null,
        totalGainDecimal: null,
        weightGramsDecimal: null,
      }),
      tMetals
    );

    expect(holding).toEqual({
      name: "Wedding coin",
      description: "Gold · 24K · 999 · Coin",
      weightLabel: "Value unavailable",
      currentValueLabel: "—",
      performanceLabel:
        "Since-purchase result unavailable. Purchase cost is not available.",
    });
  });
});

describe("delete holding sheet copy", () => {
  it("uses the destructive Screen 14 copy with the holding-specific confirm name", () => {
    const copy = getDeleteHoldingSheetCopy(tMetals, tCommon, "Wedding coin");

    expect(copy).toEqual({
      title: "Delete holding",
      consequence:
        "Only delete a holding added by mistake. It will be removed from your portfolio and History. Sell and No Longer are separate actions.",
      currentValue: "Current value",
      performance: "Since purchase",
      confirm: "Delete holding",
      pending: "Deleting holding…",
      cancel: "Cancel",
      retry: "Try again",
      offline: "Saved locally first",
      failure: "We couldn't delete this holding. Try again.",
      accessibilityLabel: "Delete holding Wedding coin",
    });
  });
});
