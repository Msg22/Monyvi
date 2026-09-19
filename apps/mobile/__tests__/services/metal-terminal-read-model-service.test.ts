import {
  shapeMetalTerminalFacts,
  type ShapeMetalTerminalFactsInput,
} from "@/services/metal-terminal-read-model-service";

const USER_ID = "018f0c7a-1234-7abc-8def-000000000001";
const HOLDING_ID = "018f0c7a-1234-7abc-8def-000000000002";
const ADD_ACTION_ID = "018f0c7a-1234-7abc-8def-000000000003";
const TERMINAL_ACTION_ID = "018f0c7a-1234-7abc-8def-000000000004";
const TERMINAL_EVENT_ID = "018f0c7a-1234-7abc-8def-000000000005";

function envelope(
  kind: "sell" | "dispose",
  payload: Readonly<Record<string, unknown>>,
  payloadVersion: "metals.sell/v2" | "metals.dispose/v1"
): string {
  return JSON.stringify({
    accountGuards: [],
    actionId: TERMINAL_ACTION_ID,
    domain: "metals",
    domainReferenceId: HOLDING_ID,
    envelopeVersion: "monyvi.financial-action/v1",
    kind,
    occurredAt: "2026-08-24T12:00:00.000Z",
    payload,
    payloadVersion,
    userId: USER_ID,
  });
}

function baseInput(
  kind: "sell" | "dispose",
  payload: Readonly<Record<string, unknown>>,
  payloadVersion: "metals.sell/v2" | "metals.dispose/v1"
): ShapeMetalTerminalFactsInput {
  return {
    asset: {
      acquisitionActionId: ADD_ACTION_ID,
      id: HOLDING_ID,
      purchaseCurrency: "EGP",
      purchasePriceDecimal: "30000",
      userId: USER_ID,
    },
    event: {
      actionId: TERMINAL_ACTION_ID,
      deleted: false,
      holdingId: HOLDING_ID,
      id: TERMINAL_EVENT_ID,
      isEffective: true,
      kind,
      payloadJson: JSON.stringify(payload),
      userId: USER_ID,
    },
    group: {
      actionId: TERMINAL_ACTION_ID,
      deleted: false,
      domain: "metals",
      domainReferenceId: HOLDING_ID,
      kind,
      outcomeJson: null,
      payloadJson: envelope(kind, payload, payloadVersion),
      rejectionCode: null,
      serverOutcome: null,
      state: "local_complete",
      userId: USER_ID,
    },
    holdingState: {
      effectiveActionId: TERMINAL_ACTION_ID,
      effectiveEventId: TERMINAL_EVENT_ID,
      holdingId: HOLDING_ID,
      isVisible: true,
      reconciliationState: "accepted",
      status: kind === "sell" ? "sold" : "disposed",
      userId: USER_ID,
    },
    latestAllowedCalendarDate: "2026-09-01",
    metal: {
      metalType: "GOLD",
      purityFactorDecimal: "0.9999",
      weightGramsDecimal: "15",
    },
    rateReferences: [],
    userId: USER_ID,
  };
}

function salePayload(
  overrides: Readonly<Record<string, unknown>> = {}
): Readonly<Record<string, unknown>> {
  return {
    expectedHoldingRevision: "1",
    feeMinorUnits: "50000",
    grossProceedsMinorUnits: "3600000",
    holdingId: HOLDING_ID,
    metalType: "GOLD",
    netProceedsMinorUnits: "3550000",
    notes: "Manual QA sale",
    predecessorEventId: ADD_ACTION_ID,
    purchaseCurrency: "EGP",
    rateSnapshots: [],
    reversesEventId: null,
    saleCurrency: "EGP",
    saleDate: "2026-08-22",
    ...overrides,
  };
}

function disposalPayload(
  overrides: Readonly<Record<string, unknown>> = {}
): Readonly<Record<string, unknown>> {
  return {
    disposalDate: "2026-08-24",
    expectedHoldingRevision: "1",
    holdingId: HOLDING_ID,
    notes: "Given to my sister",
    predecessorEventId: ADD_ACTION_ID,
    reason: "given_away",
    reversesEventId: null,
    ...overrides,
  };
}

describe("metal terminal read-model evidence", () => {
  it("shapes exact sold proceeds and realized result from one immutable action", () => {
    const facts = shapeMetalTerminalFacts(
      baseInput("sell", salePayload(), "metals.sell/v2")
    );

    expect(facts).toMatchObject({
      actionId: TERMINAL_ACTION_ID,
      canonicalAttribution: {
        combinedDecimal: "5500",
        breakdown: { available: false },
      },
      feeDecimal: "500",
      grossProceedsDecimal: "36000",
      kind: "sold",
      netProceedsDecimal: "35500",
      notes: "Manual QA sale",
      proceedsCurrency: "EGP",
      realizedResultCurrency: "EGP",
      realizedResultDecimal: "5500",
      realizedResultUnavailableReason: null,
      terminalDate: "2026-08-22",
    });
  });

  it("keeps trustworthy sale amounts when only realized attribution is unavailable", () => {
    const facts = shapeMetalTerminalFacts({
      ...baseInput("sell", salePayload(), "metals.sell/v2"),
      asset: {
        ...baseInput("sell", salePayload(), "metals.sell/v2").asset,
        purchasePriceDecimal: null,
      },
    });

    expect(facts).toMatchObject({
      kind: "sold",
      netProceedsDecimal: "35500",
      realizedResultCurrency: null,
      realizedResultDecimal: null,
      realizedResultUnavailableReason: "purchase_cost_unavailable",
    });
  });

  it("shapes disposal reason, treatment, date, and note without sale facts", () => {
    const facts = shapeMetalTerminalFacts(
      baseInput("dispose", disposalPayload(), "metals.dispose/v1")
    );

    expect(facts).toEqual({
      actionId: TERMINAL_ACTION_ID,
      kind: "disposed",
      notes: "Given to my sister",
      reason: "given_away",
      terminalDate: "2026-08-24",
      treatment: "external_transfer",
    });
  });

  it("fails closed when terminal evidence does not match the holding state", () => {
    const input = baseInput("dispose", disposalPayload(), "metals.dispose/v1");

    expect(
      shapeMetalTerminalFacts({
        ...input,
        holdingState: { ...input.holdingState, effectiveActionId: "other" },
      })
    ).toBeNull();
  });
});
