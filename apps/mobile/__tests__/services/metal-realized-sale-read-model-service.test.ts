import {
  shapeMetalRealizedSaleEvidence,
  type MetalRealizedSaleEvidenceInput,
  type MetalSellGroupSnapshot,
  type MetalSellEventSnapshot,
  type MetalSellHoldingSnapshot,
  type MetalSellRateReferenceSnapshot,
} from "@/services/metal-realized-sale-read-model-service";

const USER_ID = "018f0c7a-1234-7abc-8def-000000000001";
const HOLDING_ID = "018f0c7a-1234-7abc-8def-000000000002";
const ADD_ACTION_ID = "018f0c7a-1234-7abc-8def-000000000003";
const SELL_ACTION_ID = "018f0c7a-1234-7abc-8def-000000000004";

function salePayload(
  overrides: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    expectedHoldingRevision: "1",
    feeMinorUnits: "50000",
    grossProceedsMinorUnits: "3600000",
    holdingId: HOLDING_ID,
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

function saleEnvelope(
  payload: Record<string, unknown>,
  overrides: Readonly<Record<string, unknown>> = {}
): string {
  return JSON.stringify({
    accountGuards: [],
    actionId: SELL_ACTION_ID,
    domain: "metals",
    domainReferenceId: HOLDING_ID,
    envelopeVersion: "monyvi.financial-action/v1",
    kind: "sell",
    occurredAt: "2026-08-22T12:00:00.000Z",
    payload,
    payloadVersion: "metals.sell/v2",
    userId: USER_ID,
    ...overrides,
  });
}

function saleGroup(
  payload: Record<string, unknown>,
  overrides: Partial<MetalSellGroupSnapshot> = {}
): MetalSellGroupSnapshot {
  const envelope = JSON.parse(saleEnvelope(payload)) as Record<string, unknown>;
  return {
    actionId: SELL_ACTION_ID,
    deleted: false,
    domain: "metals",
    domainReferenceId: HOLDING_ID,
    kind: "sell",
    outcomeJson: null,
    payloadJson: JSON.stringify(envelope),
    rejectionCode: null,
    serverOutcome: null,
    state: "local_complete",
    userId: USER_ID,
    ...overrides,
  };
}

function saleEvent(
  payload: Record<string, unknown>,
  overrides: Partial<MetalSellEventSnapshot> = {}
): MetalSellEventSnapshot {
  return {
    actionId: SELL_ACTION_ID,
    deleted: false,
    holdingId: HOLDING_ID,
    id: SELL_ACTION_ID,
    isEffective: true,
    kind: "sell",
    payloadJson: JSON.stringify(payload),
    userId: USER_ID,
    ...overrides,
  };
}

function saleHolding(
  overrides: Partial<MetalSellHoldingSnapshot> = {}
): MetalSellHoldingSnapshot {
  return {
    acquisitionActionId: null,
    effectiveEventId: SELL_ACTION_ID,
    holdingId: HOLDING_ID,
    isVisible: true,
    metalType: "GOLD",
    purityFactorDecimal: "0.9999",
    purchaseCurrency: "EGP",
    purchasePriceDecimal: "30000",
    reconciliationState: "accepted",
    status: "sold",
    userId: USER_ID,
    weightGramsDecimal: "15",
    ...overrides,
  };
}

function terminalSnapshot(
  overrides: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    capturedAt: "2026-08-22T11:59:00.000Z",
    capturedFreshness: "fresh",
    instrumentCode: "currency:EGP",
    kind: "currency",
    orientation: "quote_per_base",
    providerObservedAt: "2026-08-22T11:58:00.000Z",
    quality: "valid",
    referenceId: "018f0c7a-1234-7abc-8def-000000000101",
    role: "terminal_purchase_currency",
    source: "provider-a",
    unit: "usd_per_currency_unit",
    valueDecimal: "0.02",
    ...overrides,
  };
}

function rateReference(
  overrides: Partial<MetalSellRateReferenceSnapshot> = {}
): MetalSellRateReferenceSnapshot {
  return {
    actionId: ADD_ACTION_ID,
    capturedAt: new Date("2026-01-01T09:00:00.000Z"),
    capturedFreshness: "fresh",
    deleted: false,
    holdingId: HOLDING_ID,
    instrumentCode: "metal:GOLD",
    kind: "metal",
    orientation: "quote_per_base",
    providerObservedAt: new Date("2026-01-01T09:00:00.000Z"),
    quality: "valid",
    role: "acquisition_metal",
    source: "provider-a",
    unit: "usd_per_pure_gram",
    userId: USER_ID,
    valueDecimal: "40",
    ...overrides,
  };
}

function inputOf(
  payload: Record<string, unknown>,
  overrides: Partial<MetalRealizedSaleEvidenceInput> = {}
): MetalRealizedSaleEvidenceInput {
  return {
    event: saleEvent(payload),
    group: saleGroup(payload),
    holding: saleHolding(),
    acquisitionReferences: [],
    latestAllowedCalendarDate: "2026-09-01",
    userId: USER_ID,
    ...overrides,
  };
}

describe("metal realized sale evidence shaper", () => {
  it("publishes the manual-QA same-currency fixture as an exact EGP 5,500 profit", () => {
    const outcome = shapeMetalRealizedSaleEvidence(inputOf(salePayload()));

    expect(outcome).toMatchObject({
      available: true,
      value: {
        actionId: SELL_ACTION_ID,
        holdingId: HOLDING_ID,
        combinedDecimal: "5500",
        grossProceedsDecimal: "36000",
        feeDecimal: "500",
        netProceedsDecimal: "35500",
        purchaseCurrency: "EGP",
        proceedsCurrency: "EGP",
        breakdownAvailable: false,
      },
    });
  });

  it("accepts a past and current-day sale date against the trusted boundary", () => {
    expect(
      shapeMetalRealizedSaleEvidence(
        inputOf(salePayload({ saleDate: "2026-08-01" }))
      )
    ).toMatchObject({ available: true });
    expect(
      shapeMetalRealizedSaleEvidence(
        inputOf(salePayload({ saleDate: "2026-09-01" }))
      )
    ).toMatchObject({ available: true });
  });

  it("rejects a sale date later than the trusted boundary instead of self-validating", () => {
    // The boundary is supplied independently of the payload; a future sale date
    // must not validate against its own value.
    const outcome = shapeMetalRealizedSaleEvidence(
      inputOf(salePayload({ saleDate: "2026-09-02" }))
    );

    expect(outcome).toEqual({
      available: false,
      reason: "unsupported_sale_evidence",
    });
  });

  it("publishes a same-currency sale with no fee as positive profit", () => {
    const outcome = shapeMetalRealizedSaleEvidence(
      inputOf(
        salePayload({ feeMinorUnits: "0", netProceedsMinorUnits: "3600000" })
      )
    );

    expect(outcome).toMatchObject({
      available: true,
      value: { combinedDecimal: "6000", netProceedsDecimal: "36000" },
    });
  });

  it("publishes a same-currency loss", () => {
    const outcome = shapeMetalRealizedSaleEvidence(
      inputOf(
        salePayload({
          feeMinorUnits: "100000",
          grossProceedsMinorUnits: "2000000",
          netProceedsMinorUnits: "1900000",
        })
      )
    );

    expect(outcome).toMatchObject({
      available: true,
      value: { combinedDecimal: "-11000", netProceedsDecimal: "19000" },
    });
  });

  it("publishes an exact zero result without inventing facts", () => {
    const outcome = shapeMetalRealizedSaleEvidence(
      inputOf(
        salePayload({
          grossProceedsMinorUnits: "3050000",
          netProceedsMinorUnits: "3000000",
        })
      )
    );

    expect(outcome).toMatchObject({
      available: true,
      value: { combinedDecimal: "0" },
    });
  });

  it("converts minor units at the currency-approved scale for a three-decimal currency", () => {
    const outcome = shapeMetalRealizedSaleEvidence(
      inputOf(
        salePayload({
          feeMinorUnits: "500",
          grossProceedsMinorUnits: "36000500",
          holdingId: HOLDING_ID,
          netProceedsMinorUnits: "36000000",
          purchaseCurrency: "KWD",
          saleCurrency: "KWD",
        }),
        { holding: saleHolding({ purchaseCurrency: "KWD" }) }
      )
    );

    expect(outcome).toMatchObject({
      available: true,
      value: {
        combinedDecimal: "6000",
        feeDecimal: "0.5",
        grossProceedsDecimal: "36000.5",
        netProceedsDecimal: "36000",
      },
    });
  });

  it("requires complete immutable terminal FX evidence for cross-currency results", () => {
    const complete = shapeMetalRealizedSaleEvidence(
      inputOf(
        salePayload({
          feeMinorUnits: "0",
          grossProceedsMinorUnits: "10000",
          netProceedsMinorUnits: "10000",
          rateSnapshots: [
            terminalSnapshot({
              instrumentCode: "metal:GOLD",
              kind: "metal",
              referenceId: "018f0c7a-1234-7abc-8def-000000000102",
              role: "terminal_metal",
              unit: "usd_per_pure_gram",
              valueDecimal: "50",
            }),
            terminalSnapshot(),
            terminalSnapshot({
              instrumentCode: "currency:USD",
              referenceId: "018f0c7a-1234-7abc-8def-000000000103",
              role: "terminal_proceeds_currency",
              valueDecimal: "1",
            }),
          ],
          saleCurrency: "USD",
        })
      )
    );
    expect(complete).toMatchObject({
      available: true,
      value: { combinedDecimal: "-25000", netProceedsDecimal: "100" },
    });

    const missingProceeds = shapeMetalRealizedSaleEvidence(
      inputOf(
        salePayload({
          feeMinorUnits: "0",
          grossProceedsMinorUnits: "10000",
          netProceedsMinorUnits: "10000",
          rateSnapshots: [terminalSnapshot()],
          saleCurrency: "USD",
        })
      )
    );
    expect(missingProceeds).toMatchObject({ available: false });
  });

  it("adds the detailed breakdown only when acquisition references resolve to the acquisition action", () => {
    const outcome = shapeMetalRealizedSaleEvidence(
      inputOf(
        salePayload({
          feeMinorUnits: "0",
          grossProceedsMinorUnits: "3600000",
          netProceedsMinorUnits: "3600000",
          rateSnapshots: [
            terminalSnapshot({
              instrumentCode: "metal:GOLD",
              kind: "metal",
              referenceId: "018f0c7a-1234-7abc-8def-000000000102",
              role: "terminal_metal",
              unit: "usd_per_pure_gram",
              valueDecimal: "50",
            }),
            terminalSnapshot(),
            terminalSnapshot({
              referenceId: "018f0c7a-1234-7abc-8def-000000000103",
              role: "terminal_proceeds_currency",
            }),
          ],
        }),
        {
          holding: saleHolding({ acquisitionActionId: ADD_ACTION_ID }),
          acquisitionReferences: [
            rateReference(),
            rateReference({
              instrumentCode: "currency:EGP",
              kind: "currency",
              role: "acquisition_purchase_currency",
              unit: "usd_per_currency_unit",
              valueDecimal: "0.02",
            }),
          ],
        }
      )
    );

    expect(outcome).toMatchObject({
      available: true,
      value: { breakdownAvailable: true, combinedDecimal: "6000" },
    });
    if (!outcome.available || !outcome.value.attribution.breakdown.available) {
      throw new Error("Expected a detailed realized breakdown");
    }
    const components = outcome.value.attribution.breakdown.value.components;
    expect(components.purchaseCostDecimal).toEqual(expect.any(String));
    expect(components.feeDecimal).toBe("0");
  });

  it.each([
    [
      "duplicate terminal purchase FX snapshots",
      [
        terminalSnapshot(),
        terminalSnapshot({
          referenceId: "018f0c7a-1234-7abc-8def-000000000104",
        }),
      ],
    ],
    [
      "wrong-role terminal snapshots",
      [
        terminalSnapshot({ role: "acquisition_purchase_currency" }),
        terminalSnapshot({
          instrumentCode: "currency:USD",
          referenceId: "018f0c7a-1234-7abc-8def-000000000103",
          role: "terminal_proceeds_currency",
          valueDecimal: "1",
        }),
      ],
    ],
  ] as const)(
    "fails a cross-currency result closed for %s",
    (_label, rateSnapshots) => {
      const outcome = shapeMetalRealizedSaleEvidence(
        inputOf(
          salePayload({
            feeMinorUnits: "0",
            grossProceedsMinorUnits: "10000",
            netProceedsMinorUnits: "10000",
            rateSnapshots,
            saleCurrency: "USD",
          })
        )
      );

      expect(outcome.available).toBe(false);
    }
  );

  it("ignores acquisition references bound to a different action for the breakdown", () => {
    const outcome = shapeMetalRealizedSaleEvidence(
      inputOf(salePayload(), {
        holding: saleHolding({ acquisitionActionId: ADD_ACTION_ID }),
        acquisitionReferences: [
          rateReference({ actionId: "018f0c7a-1234-7abc-8def-000000000005" }),
          rateReference({
            actionId: "018f0c7a-1234-7abc-8def-000000000005",
            instrumentCode: "currency:EGP",
            kind: "currency",
            role: "acquisition_purchase_currency",
            unit: "usd_per_currency_unit",
            valueDecimal: "0.02",
          }),
        ],
      })
    );

    expect(outcome).toMatchObject({
      available: true,
      value: { breakdownAvailable: false, combinedDecimal: "5500" },
    });
    if (!outcome.available) {
      throw new Error("Expected a trustworthy combined result");
    }
    expect(outcome.value.breakdownReasons).toEqual(
      expect.arrayContaining([
        "acquisition_metal_rate_unavailable",
        "acquisition_currency_rate_unavailable",
      ])
    );
  });

  it.each([
    ["non-integer gross minor units", { grossProceedsMinorUnits: "36000.50" }],
    ["negative fee minor units", { feeMinorUnits: "-50000" }],
    ["leading-zero minor units", { netProceedsMinorUnits: "03550000" }],
    ["non-numeric minor units", { grossProceedsMinorUnits: "3600000a" }],
  ] as const)("rejects %s as malformed evidence", (_label, overrides) => {
    const outcome = shapeMetalRealizedSaleEvidence(
      inputOf(salePayload(overrides))
    );

    expect(outcome).toMatchObject({
      available: false,
      reason: "malformed_sale_amounts",
    });
  });

  it("rejects a fee above gross proceeds", () => {
    const outcome = shapeMetalRealizedSaleEvidence(
      inputOf(
        salePayload({
          feeMinorUnits: "3600001",
          grossProceedsMinorUnits: "3600000",
          netProceedsMinorUnits: "0",
        })
      )
    );

    expect(outcome).toMatchObject({
      available: false,
      reason: "inconsistent_sale_proceeds",
    });
  });

  it("rejects inconsistent net proceeds", () => {
    const outcome = shapeMetalRealizedSaleEvidence(
      inputOf(salePayload({ netProceedsMinorUnits: "3550001" }))
    );

    expect(outcome).toMatchObject({
      available: false,
      reason: "inconsistent_sale_proceeds",
    });
  });

  it("rejects zero gross proceeds as an invalid sale", () => {
    const outcome = shapeMetalRealizedSaleEvidence(
      inputOf(
        salePayload({
          grossProceedsMinorUnits: "0",
          netProceedsMinorUnits: "0",
        })
      )
    );

    expect(outcome).toMatchObject({ available: false });
  });

  it("reports an unsupported sale currency without inventing a result", () => {
    const outcome = shapeMetalRealizedSaleEvidence(
      inputOf(salePayload({ saleCurrency: "BTC" }))
    );

    expect(outcome).toMatchObject({ available: false });
  });

  it("reports a missing purchase cost as unavailable, never as zero", () => {
    const outcome = shapeMetalRealizedSaleEvidence(
      inputOf(salePayload(), {
        holding: saleHolding({ purchasePriceDecimal: null }),
      })
    );

    expect(outcome).toMatchObject({
      available: false,
      reason: "purchase_cost_unavailable",
    });
  });

  it("rejects evidence bound to a different holding, metal type, or purchase currency", () => {
    expect(
      shapeMetalRealizedSaleEvidence(
        inputOf(
          salePayload({ holdingId: "018f0c7a-1234-7abc-8def-000000000006" })
        )
      )
    ).toMatchObject({ available: false, reason: "invalid_sale_evidence" });
    expect(
      shapeMetalRealizedSaleEvidence(
        inputOf(salePayload({ metalType: "SILVER" }))
      )
    ).toMatchObject({ available: false, reason: "invalid_sale_evidence" });
    expect(
      shapeMetalRealizedSaleEvidence(
        inputOf(salePayload({ purchaseCurrency: "USD" }))
      )
    ).toMatchObject({ available: false, reason: "invalid_sale_evidence" });
  });

  it("rejects unsupported payload shapes and legacy v1 domain payloads", () => {
    expect(
      shapeMetalRealizedSaleEvidence(
        inputOf({
          feeMinorUnits: "50000",
          grossProceedsDecimal: "36000",
          holdingId: HOLDING_ID,
          includeAccountCredit: false,
          netProceedsMinorUnits: "3550000",
          notes: "legacy",
          rateReferenceIds: [],
        })
      )
    ).toMatchObject({ available: false, reason: "unsupported_sale_evidence" });

    expect(
      shapeMetalRealizedSaleEvidence(
        inputOf(salePayload({ unexpectedField: true }))
      )
    ).toMatchObject({ available: false, reason: "unsupported_sale_evidence" });
  });

  it.each([
    [
      "a pending local group",
      {
        outcomeJson: null,
        rejectionCode: null,
        serverOutcome: null,
        state: "pending_local",
      },
    ],
    [
      "a rejected and compensating group",
      {
        outcomeJson: JSON.stringify({ reason: "rejected" }),
        rejectionCode: "sale_rejected",
        serverOutcome: "rejected",
        state: "rejected_compensating",
      },
    ],
    [
      "a group with invalid state evidence",
      {
        outcomeJson: JSON.stringify({ result: "accepted" }),
        rejectionCode: null,
        serverOutcome: "accepted",
        state: "local_complete",
      },
    ],
  ] as const)("excludes %s", (_label, groupOverrides) => {
    const payload = salePayload();
    const outcome = shapeMetalRealizedSaleEvidence(
      inputOf(payload, { group: saleGroup(payload, groupOverrides) })
    );

    expect(outcome).toEqual({ available: false, reason: "excluded_sale" });
  });

  it.each([
    [
      "foreign sale event user",
      (input: MetalRealizedSaleEvidenceInput) => ({
        ...input,
        event:
          input.event === null
            ? null
            : {
                ...input.event,
                userId: "018f0c7a-1234-7abc-8def-000000000007",
              },
      }),
    ],
    [
      "foreign action group user",
      (input: MetalRealizedSaleEvidenceInput) => ({
        ...input,
        group:
          input.group === null
            ? null
            : {
                ...input.group,
                userId: "018f0c7a-1234-7abc-8def-000000000007",
              },
      }),
    ],
    [
      "foreign holding state user",
      (input: MetalRealizedSaleEvidenceInput) => ({
        ...input,
        holding: {
          ...input.holding,
          userId: "018f0c7a-1234-7abc-8def-000000000007",
        },
      }),
    ],
    [
      "hidden holding",
      (input: MetalRealizedSaleEvidenceInput) => ({
        ...input,
        holding: { ...input.holding, isVisible: false },
      }),
    ],
    [
      "reconciliation-incomplete holding state",
      (input: MetalRealizedSaleEvidenceInput) => ({
        ...input,
        holding: {
          ...input.holding,
          reconciliationState: "reconciliation_incomplete",
        },
      }),
    ],
    [
      "ineffective sale event",
      (input: MetalRealizedSaleEvidenceInput) => ({
        ...input,
        event:
          input.event === null ? null : { ...input.event, isEffective: false },
      }),
    ],
    [
      "deleted sale event",
      (input: MetalRealizedSaleEvidenceInput) => ({
        ...input,
        event: input.event === null ? null : { ...input.event, deleted: true },
      }),
    ],
    [
      "reversed sale is no longer the current head",
      (input: MetalRealizedSaleEvidenceInput) => ({
        ...input,
        holding: {
          ...input.holding,
          effectiveEventId: "event-undo",
          status: "active",
        },
      }),
    ],
    [
      "sale event is not the current effective head",
      (input: MetalRealizedSaleEvidenceInput) => ({
        ...input,
        holding: { ...input.holding, effectiveEventId: "event-other" },
      }),
    ],
    [
      "disposed holding",
      (input: MetalRealizedSaleEvidenceInput) => ({
        ...input,
        holding: { ...input.holding, status: "disposed" },
      }),
    ],
    [
      "active holding",
      (input: MetalRealizedSaleEvidenceInput) => ({
        ...input,
        holding: { ...input.holding, status: "active" },
      }),
    ],
    [
      "missing sale event",
      (input: MetalRealizedSaleEvidenceInput) => ({
        ...input,
        event: null,
      }),
    ],
    [
      "missing action group",
      (input: MetalRealizedSaleEvidenceInput) => ({
        ...input,
        group: null,
      }),
    ],
  ] as const)(
    "excludes %s from lifetime realized results",
    (_label, mutate) => {
      const outcome = shapeMetalRealizedSaleEvidence(
        mutate(inputOf(salePayload()))
      );

      expect(outcome.available).toBe(false);
    }
  );

  it("requires the envelope to bind the same action and canonical payload", () => {
    const outcome = shapeMetalRealizedSaleEvidence(
      inputOf(salePayload(), {
        group: saleGroup(salePayload({ grossProceedsMinorUnits: "1000" })),
      })
    );

    expect(outcome).toMatchObject({ available: false });
  });

  it("converts huge minor units with exact decimal strings, never binary floats", () => {
    const outcome = shapeMetalRealizedSaleEvidence(
      inputOf(
        salePayload({
          feeMinorUnits: "0",
          grossProceedsMinorUnits: "9007199254740993",
          netProceedsMinorUnits: "9007199254740993",
          purchaseCurrency: "USD",
          saleCurrency: "USD",
        }),
        {
          holding: saleHolding({
            purchaseCurrency: "USD",
            purchasePriceDecimal: "1",
          }),
        }
      )
    );

    expect(outcome).toMatchObject({
      available: true,
      value: {
        combinedDecimal: "90071992547408.93",
        netProceedsDecimal: "90071992547409.93",
      },
    });
  });
});
