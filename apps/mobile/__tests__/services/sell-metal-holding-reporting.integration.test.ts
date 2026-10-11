import { shapeMetalTerminalFacts } from "../../services/metal-terminal-read-model-service";
import { buildMetalTerminalDisplayFacts } from "../../services/metal-terminal-display-service";
import type { LiveRatesTrustReadModel } from "../../services/live-rates-trust-read-model-service";
import {
  acquisitionRateRows,
  soldEvent,
  soldGroup,
  soldPayload,
  ADD_ACTION_ID,
  SELL_ACTION_ID,
  SOLD_HOLDING_ID,
  USER_ID,
} from "./metal-portfolio-realized-sale-fixtures";

function terminalSnapshots(): ReadonlyArray<Readonly<Record<string, unknown>>> {
  const provenance = {
    capturedAt: "2026-10-11T12:00:00.000Z",
    capturedFreshness: "fresh",
    providerObservedAt: "2026-10-11T11:59:00.000Z",
    quality: "valid",
    source: "provider",
  };
  return [
    {
      ...provenance,
      referenceId: "018f0c7a-1234-7abc-8def-000000000031",
      role: "terminal_metal",
      kind: "metal",
      instrumentCode: "metal:GOLD",
      valueDecimal: "100",
      unit: "usd_per_pure_gram",
      orientation: "quote_per_base",
    },
    {
      ...provenance,
      referenceId: "018f0c7a-1234-7abc-8def-000000000032",
      role: "terminal_purchase_currency",
      kind: "currency",
      instrumentCode: "currency:EGP",
      valueDecimal: "50",
      unit: "currency_units_per_usd",
      orientation: "base_per_quote",
    },
    {
      ...provenance,
      referenceId: "018f0c7a-1234-7abc-8def-000000000033",
      role: "terminal_proceeds_currency",
      kind: "currency",
      instrumentCode: "currency:EGP",
      valueDecimal: "50",
      unit: "currency_units_per_usd",
      orientation: "base_per_quote",
    },
  ];
}

describe("New same-currency Sell evidence through existing terminal reporting", () => {
  it("retains FR050 historical factors/rates and applies FR051 preferred FX only to display", (): void => {
    const payload = soldPayload({
      expectedHoldingRevision: "0",
      predecessorEventId: null,
      saleDate: "2026-10-11",
      grossProceedsMinorUnits: "12000",
      feeMinorUnits: "500",
      netProceedsMinorUnits: "11500",
      rateSnapshots: terminalSnapshots(),
    });
    const facts = shapeMetalTerminalFacts({
      userId: USER_ID,
      latestAllowedCalendarDate: "2026-10-11",
      asset: {
        id: SOLD_HOLDING_ID,
        userId: USER_ID,
        acquisitionActionId: ADD_ACTION_ID,
        purchaseCurrency: "EGP",
        purchasePriceDecimal: "100",
      },
      metal: {
        metalType: "GOLD",
        purityFactorDecimal: "0.999",
        weightGramsDecimal: "10",
      },
      holdingState: {
        holdingId: SOLD_HOLDING_ID,
        userId: USER_ID,
        effectiveActionId: SELL_ACTION_ID,
        effectiveEventId: SELL_ACTION_ID,
        isVisible: true,
        reconciliationState: "sync_pending",
        status: "sold",
      },
      event: soldEvent(payload),
      group: soldGroup(payload),
      rateReferences: acquisitionRateRows(),
    });
    expect(facts).toMatchObject({
      kind: "sold",
      netProceedsDecimal: "115",
      proceedsCurrency: "EGP",
      realizedResultCurrency: "EGP",
      realizedResultDecimal: "15",
      canonicalAttribution: {
        breakdown: {
          available: true,
          value: {
            components: {
              metalMovementDecimal: "24975",
              currencyMovementDecimal: "0",
              purchaseCostDecimal: "24875",
              saleDifferenceDecimal: "-49830",
              feeDecimal: "-5",
            },
          },
        },
      },
    });
    const rate = {
      capturedAt: new Date("2026-10-11T13:00:00.000Z"),
      providerObservedAt: new Date("2026-10-11T12:59:00.000Z"),
      state: "fresh" as const,
      ageMs: 60000,
      quality: "valid",
      source: "display-provider",
      valueDecimal: "0.02",
    };
    const currentRates: LiveRatesTrustReadModel = {
      gold: rate,
      silver: rate,
      currencies: new Map([["EGP", rate]]),
    };
    const before = JSON.stringify(facts);
    expect(
      buildMetalTerminalDisplayFacts(facts, currentRates, "USD")
    ).toMatchObject({
      realizedResultCurrency: "USD",
      realizedResultDecimal: "0.3",
      netProceedsDecimal: "115",
      proceedsCurrency: "EGP",
      displayAttribution: {
        combinedDecimal: "0.30",
        displayedComponentSumDecimal: "0.30",
      },
      displayRateTrust: [{ currency: "EGP", source: "display-provider" }],
    });
    expect(
      buildMetalTerminalDisplayFacts(facts, undefined, "USD")
    ).toMatchObject({
      realizedResultDecimal: null,
      netProceedsDecimal: "115",
      proceedsCurrency: "EGP",
    });
    expect(
      buildMetalTerminalDisplayFacts(facts, undefined, "EGP")
    ).toMatchObject({ realizedResultDecimal: "15" });
    expect(JSON.stringify(facts)).toBe(before);
  });
});
