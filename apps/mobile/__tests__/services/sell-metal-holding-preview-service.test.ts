import {
  buildSellMetalHoldingPreview,
  type SellMetalHoldingPreviewInput,
} from "../../services/sell-metal-holding-preview-service";

const INPUT: SellMetalHoldingPreviewInput = {
  metalType: "GOLD",
  pureGramsDecimal: "9.99",
  purchaseCostDecimal: "100",
  purchaseCurrency: "EGP",
  saleCurrency: "EGP",
  grossProceedsDecimal: "120",
  feeDecimal: "5",
  purchaseDate: "2026-01-01",
  saleDate: "2026-10-11",
  latestAllowedCalendarDate: "2026-10-11",
  acquisitionMetalRate: null,
  acquisitionCurrencyRate: null,
  saleMetalRate: null,
  purchaseCurrencyAtSaleRate: null,
  proceedsCurrencyAtSaleRate: null,
  hasAcknowledgedRateRisk: false,
  notes: "",
};

describe("Sell immutable fact preview", () => {
  it("records same-currency sale without missing rate dependencies", (): void => {
    expect(buildSellMetalHoldingPreview(INPUT)).toMatchObject({
      canSubmit: true,
      netProceedsDecimal: "115",
      realizedProfitLossDecimal: "15",
      requiresRateAcknowledgment: false,
    });
  });
  it("rejects cross-currency sale", (): void => {
    expect(
      buildSellMetalHoldingPreview({ ...INPUT, saleCurrency: "USD" })
    ).toMatchObject({
      canSubmit: false,
      realizedProfitLossDecimal: null,
      requiresRateAcknowledgment: false,
      affectedRateRoles: [],
      validationErrors: { saleCurrency: "metal_sale_currency_mismatch" },
    });
  });
  it("never fabricates zero purchase cost for migrated holdings", (): void => {
    expect(
      buildSellMetalHoldingPreview({ ...INPUT, purchaseCostDecimal: null })
    ).toMatchObject({
      canSubmit: true,
      realizedProfitLossDecimal: null,
      reportingUnavailableReason: "purchase_cost_unavailable",
    });
  });
  it.each(["2026-02-30", "2026-13-01", "2026-10-12", "2025-12-31"])(
    "rejects calendar-invalid or out-of-range date %s",
    (saleDate): void => {
      expect(
        buildSellMetalHoldingPreview({ ...INPUT, saleDate }).canSubmit
      ).toBe(false);
    }
  );
  it.each(["0", "-1", "1e3", "1.234", "12x", " 12"])(
    "preserves invalid gross input %s for field validation",
    (grossProceedsDecimal): void => {
      const result = buildSellMetalHoldingPreview({
        ...INPUT,
        grossProceedsDecimal,
      });
      expect(result.canSubmit).toBe(false);
      expect(result.validationErrors.grossProceedsDecimal).toBeDefined();
    }
  );
  it.each(["-1", "121", "0.001", "bad"])(
    "rejects invalid same-currency fee %s",
    (feeDecimal): void => {
      expect(
        buildSellMetalHoldingPreview({ ...INPUT, feeDecimal }).validationErrors
          .feeDecimal
      ).toBeDefined();
    }
  );
  it("accepts full gross fee, yielding exact zero net and loss", (): void => {
    expect(
      buildSellMetalHoldingPreview({ ...INPUT, feeDecimal: "120" })
    ).toMatchObject({
      canSubmit: true,
      netProceedsMinorUnits: "0",
      realizedProfitLossDecimal: "-100",
    });
  });
  it("rejects unsupported currency and oversized Unicode notes", (): void => {
    expect(
      buildSellMetalHoldingPreview({ ...INPUT, saleCurrency: "BTC" }).canSubmit
    ).toBe(false);
    expect(
      buildSellMetalHoldingPreview({ ...INPUT, notes: "ع".repeat(2049) })
        .validationErrors.notes
    ).toBeDefined();
  });
});
