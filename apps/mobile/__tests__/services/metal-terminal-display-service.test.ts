import { buildMetalTerminalDisplayFacts } from "@/services/metal-terminal-display-service";
import type {
  LiveRatesTrustReadModel,
  LiveRatesTrustValue,
} from "@/services/live-rates-trust-read-model-service";
import type { MetalSoldTerminalFacts } from "@/services/metal-terminal-read-model-service";

const rate: LiveRatesTrustValue = {
  state: "fresh",
  ageMs: 0,
  capturedAt: new Date("2026-09-01"),
  providerObservedAt: new Date("2026-09-01"),
  quality: "valid",
  source: "test",
  valueDecimal: "0.02",
};
const rates: LiveRatesTrustReadModel = {
  gold: rate,
  silver: rate,
  currencies: new Map([["EGP", rate]]),
};
const facts: MetalSoldTerminalFacts = {
  actionId: "sale",
  kind: "sold",
  feeDecimal: "500",
  grossProceedsDecimal: "36000",
  netProceedsDecimal: "35500",
  notes: null,
  proceedsCurrency: "EGP",
  terminalDate: "2026-08-22",
  realizedResultCurrency: "EGP",
  realizedResultDecimal: "5500",
  realizedResultUnavailableReason: null,
  canonicalAttribution: {
    combinedDecimal: "5500",
    canonicalGrossProceedsDecimal: "36000",
    canonicalFeesDecimal: "500",
    netProceedsDecimal: "35500",
    consumedRateReferences: [],
    breakdown: {
      available: true,
      value: {
        rateReferences: [],
        components: {
          metalMovementDecimal: "3000",
          currencyMovementDecimal: "1000",
          purchaseCostDecimal: "500",
          saleDifferenceDecimal: "1500",
          feeDecimal: "-500",
        },
      },
    },
  },
};

describe("terminal preferred-currency display", () => {
  it("converts combined result and all five components from the same FX snapshot, preserving recorded proceeds and canonical evidence", () => {
    const before = JSON.stringify(facts);
    const result = buildMetalTerminalDisplayFacts(facts, rates, "USD");
    expect(result).toMatchObject({
      realizedResultCurrency: "USD",
      realizedResultDecimal: "110",
      proceedsCurrency: "EGP",
      netProceedsDecimal: "35500",
      displayAttribution: {
        combinedDecimal: "110.00",
        displayedComponentSumDecimal: "110.00",
        roundingDifferenceMinorUnits: "0",
        displayedComponents: {
          metalMovementDecimal: "60.00",
          currencyMovementDecimal: "20.00",
          purchaseCostDecimal: "10.00",
          saleDifferenceDecimal: "30.00",
          feeDecimal: "-10.00",
        },
      },
    });
    expect(JSON.stringify(facts)).toBe(before);
  });

  it("reports final FX rounding differences rather than altering canonical components", () => {
    const fractionalRates: LiveRatesTrustReadModel = {
      ...rates,
      currencies: new Map([["EGP", { ...rate, valueDecimal: "0.020003" }]]),
    };
    expect(
      buildMetalTerminalDisplayFacts(facts, fractionalRates, "USD")
    ).toMatchObject({
      realizedResultDecimal: "110.0165",
      netProceedsDecimal: "35500",
      proceedsCurrency: "EGP",
      displayAttribution: {
        combinedDecimal: "110.02",
        displayedComponentSumDecimal: "110.01",
        roundingDifferenceMinorUnits: "1",
        requiresRoundingExplanation: true,
      },
    });
  });

  it("marks only converted result unavailable when display FX is missing", () => {
    expect(
      buildMetalTerminalDisplayFacts(facts, undefined, "USD")
    ).toMatchObject({
      netProceedsDecimal: "35500",
      realizedResultDecimal: null,
      displayAttribution: null,
    });
  });

  it("keeps same-currency result available without current rates", () => {
    expect(
      buildMetalTerminalDisplayFacts(facts, undefined, "EGP")
    ).toMatchObject({
      realizedResultDecimal: "5500",
      realizedResultCurrency: "EGP",
    });
  });

  it("preserves a converted combined result when historical breakdown is unavailable", () => {
    expect(
      buildMetalTerminalDisplayFacts(
        { ...facts, canonicalAttribution: undefined },
        rates,
        "USD"
      )
    ).toMatchObject({ realizedResultDecimal: "110", displayAttribution: null });
  });

  it.each(["0", "-1", "NaN"])(
    "rejects invalid display FX %s without inventing profit or loss",
    (valueDecimal) => {
      const invalidRates: LiveRatesTrustReadModel = {
        ...rates,
        currencies: new Map([["EGP", { ...rate, valueDecimal }]]),
      };
      expect(
        buildMetalTerminalDisplayFacts(facts, invalidRates, "USD")
      ).toMatchObject({
        netProceedsDecimal: "35500",
        realizedResultDecimal: null,
        displayAttribution: null,
      });
    }
  );
});
