import { createHash } from "node:crypto";

import {
  DEFAULT_FINANCIAL_ACTION_REGISTRY,
  type FinancialActionDefinition,
} from "../action-registry";
import {
  FINANCIAL_ACTION_ERROR_CODES,
  hashFinancialActionEnvelope,
  serializeFinancialActionEnvelope,
} from "../action-contracts";

const IDS = {
  action: "018f0c7a-1234-7abc-8def-000000000001",
  holding: "018f0c7a-1234-7abc-8def-000000000002",
  user: "018f0c7a-1234-7abc-8def-000000000003",
  predecessor: "018f0c7a-1234-7abc-8def-000000000004",
  reversal: "018f0c7a-1234-7abc-8def-000000000005",
  acquisitionMetal: "018f0c7a-1234-7abc-8def-000000000006",
  acquisitionCurrency: "018f0c7a-1234-7abc-8def-000000000007",
  terminalMetal: "018f0c7a-1234-7abc-8def-000000000008",
  terminalPurchaseCurrency: "018f0c7a-1234-7abc-8def-000000000009",
  terminalProceedsCurrency: "018f0c7a-1234-7abc-8def-000000000010",
} as const;

const VALIDATION_INPUT = { cairoTodayDate: "2026-09-01" } as const;

function acquisitionSnapshots(): ReadonlyArray<Record<string, string | null>> {
  return [
    {
      referenceId: IDS.acquisitionMetal,
      role: "acquisition_metal",
      kind: "metal",
      instrumentCode: "metal:GOLD",
      valueDecimal: "3510.5",
      unit: "usd_per_pure_gram",
      orientation: "quote_per_base",
      providerObservedAt: "2026-08-30T10:15:30.123Z",
      source: "provider-a",
      quality: "valid",
      capturedFreshness: "fresh",
      capturedAt: "2026-08-30T10:16:00.123Z",
    },
    {
      referenceId: IDS.acquisitionCurrency,
      role: "acquisition_purchase_currency",
      kind: "currency",
      instrumentCode: "currency:EGP",
      valueDecimal: "0.02",
      unit: "usd_per_currency_unit",
      orientation: "quote_per_base",
      providerObservedAt: "2026-08-30T10:15:30.123Z",
      source: "provider-a",
      quality: "valid",
      capturedFreshness: "fresh",
      capturedAt: "2026-08-30T10:16:00.123Z",
    },
  ];
}

function terminalSnapshots(
  purchaseCurrency = "EGP",
  proceedsCurrency = "EGP"
): ReadonlyArray<Record<string, string | null>> {
  return [
    {
      referenceId: IDS.terminalMetal,
      role: "terminal_metal",
      kind: "metal",
      instrumentCode: "metal:GOLD",
      valueDecimal: "3600",
      unit: "usd_per_pure_gram",
      orientation: "quote_per_base",
      providerObservedAt: "2026-08-31T10:15:30.123Z",
      source: "provider-a",
      quality: "valid",
      capturedFreshness: "fresh",
      capturedAt: "2026-08-31T10:16:00.123Z",
    },
    {
      referenceId: IDS.terminalPurchaseCurrency,
      role: "terminal_purchase_currency",
      kind: "currency",
      instrumentCode: `currency:${purchaseCurrency}`,
      valueDecimal: purchaseCurrency === "USD" ? "1" : "0.02",
      unit: "usd_per_currency_unit",
      orientation: "quote_per_base",
      providerObservedAt: "2026-08-31T10:15:30.123Z",
      source: "provider-a",
      quality: "valid",
      capturedFreshness: "fresh",
      capturedAt: "2026-08-31T10:16:00.123Z",
    },
    {
      referenceId: IDS.terminalProceedsCurrency,
      role: "terminal_proceeds_currency",
      kind: "currency",
      instrumentCode: `currency:${proceedsCurrency}`,
      valueDecimal: proceedsCurrency === "USD" ? "1" : "0.02",
      unit: "usd_per_currency_unit",
      orientation: "quote_per_base",
      providerObservedAt: "2026-08-31T10:15:30.123Z",
      source: "provider-a",
      quality: "valid",
      capturedFreshness: "fresh",
      capturedAt: "2026-08-31T10:16:00.123Z",
    },
  ];
}

function materialFacts(): Record<string, string | null> {
  return {
    physicalForm: "JEWELRY",
    weightGramsDecimal: "10.25",
    purityCode: "gold-9999",
    purityFactorDecimal: "0.9999",
    purityCatalogVersion: "1",
    purchasePriceDecimal: "150000",
    purchaseCurrency: "EGP",
    purchaseDate: "2026-08-30",
  };
}

function payloadFor(
  kind: string,
  payloadVersion: string
): Record<string, unknown> {
  switch (`${kind}/${payloadVersion}`) {
    case "add/metals.add/v1":
      return {
        holdingId: IDS.holding,
        expectedHoldingRevision: null,
        predecessorEventId: null,
        reversesEventId: null,
        metalType: "GOLD",
        metadata: { name: "ذهب الادخار", notes: "premium included" },
        materialFacts: materialFacts(),
        rateSnapshots: acquisitionSnapshots(),
      };
    case "correct/metals.correct/v1":
      return {
        holdingId: IDS.holding,
        expectedHoldingRevision: "7",
        predecessorEventId: IDS.predecessor,
        reversesEventId: null,
        metadataChange: {
          before: { name: "ذهب الادخار", notes: null },
          after: { name: "ذهب الادخار", notes: "corrected receipt" },
        },
        materialCorrection: {
          before: materialFacts(),
          after: { ...materialFacts(), purchasePriceDecimal: "151000" },
          reason: "Receipt correction",
          rateSnapshots: acquisitionSnapshots(),
        },
      };
    case "sell/metals.sell/v2":
      return {
        holdingId: IDS.holding,
        expectedHoldingRevision: "7",
        predecessorEventId: IDS.predecessor,
        reversesEventId: null,
        metalType: "GOLD",
        saleDate: "2026-08-31",
        purchaseCurrency: "EGP",
        saleCurrency: "EGP",
        grossProceedsMinorUnits: "16500000",
        feeMinorUnits: "80000",
        netProceedsMinorUnits: "16420000",
        notes: "sold to dealer",
        rateSnapshots: terminalSnapshots(),
      };
    case "dispose/metals.dispose/v1":
      return {
        holdingId: IDS.holding,
        expectedHoldingRevision: "7",
        predecessorEventId: IDS.predecessor,
        reversesEventId: null,
        disposalDate: "2026-08-31",
        reason: "lost_or_stolen",
        notes: "reported missing",
      };
    case "delete/metals.delete/v1":
      return {
        holdingId: IDS.holding,
        expectedHoldingRevision: "7",
        predecessorEventId: IDS.predecessor,
        reversesEventId: null,
      };
    case "undo/metals.undo/v1":
      return {
        holdingId: IDS.holding,
        expectedHoldingRevision: "8",
        predecessorEventId: IDS.predecessor,
        reversesEventId: IDS.reversal,
      };
    default:
      throw new Error(`Unsupported fixture ${kind}/${payloadVersion}`);
  }
}

function definition(
  kind: string,
  payloadVersion: string
): FinancialActionDefinition {
  return DEFAULT_FINANCIAL_ACTION_REGISTRY.resolve(
    "metals",
    kind,
    payloadVersion
  );
}

function envelope(
  kind: string,
  payloadVersion: string
): Record<string, unknown> {
  return {
    accountGuards: [],
    actionId: IDS.action,
    domain: "metals",
    domainReferenceId: IDS.holding,
    envelopeVersion: "monyvi.financial-action/v1",
    kind,
    occurredAt: "2026-09-01T12:15:30.123Z",
    payload: payloadFor(kind, payloadVersion),
    payloadVersion,
    userId: IDS.user,
  };
}

describe("approved Metals financial action payload registry", () => {
  const tuples = [
    ["add", "metals.add/v1"],
    ["correct", "metals.correct/v1"],
    ["sell", "metals.sell/v2"],
    ["dispose", "metals.dispose/v1"],
    ["delete", "metals.delete/v1"],
    ["undo", "metals.undo/v1"],
  ] as const;

  it("registers exactly the six approved Metals tuples", () => {
    expect(DEFAULT_FINANCIAL_ACTION_REGISTRY.definitions).toHaveLength(6);
    expect(
      DEFAULT_FINANCIAL_ACTION_REGISTRY.definitions.map((entry) => [
        entry.domain,
        entry.kind,
        entry.payloadVersion,
      ])
    ).toEqual(tuples.map(([kind, version]) => ["metals", kind, version]));
  });

  it.each(tuples)("accepts the complete %s payload", (kind, payloadVersion) => {
    expect(
      definition(kind, payloadVersion).validatePayload(
        payloadFor(kind, payloadVersion),
        VALIDATION_INPUT
      )
    ).toEqual(payloadFor(kind, payloadVersion));
  });

  it("rejects unknown tuples and every unapproved payload key", () => {
    expect(() =>
      DEFAULT_FINANCIAL_ACTION_REGISTRY.resolve(
        "metals",
        "sell",
        "metals.sell/v1"
      )
    ).toThrow("financial_action_unknown_definition");

    expect(() =>
      definition("add", "metals.add/v1").validatePayload(
        { ...payloadFor("add", "metals.add/v1"), clientSnapshot: {} },
        VALIDATION_INPUT
      )
    ).toThrow("financial_action_invalid_payload");

    expect(() =>
      definition("correct", "metals.correct/v1").validatePayload(
        {
          ...payloadFor("correct", "metals.correct/v1"),
          materialCorrection: {
            ...(payloadFor("correct", "metals.correct/v1")
              .materialCorrection as Record<string, unknown>),
            after: { ...materialFacts(), inventedLegacyRate: "0" },
          },
        },
        VALIDATION_INPUT
      )
    ).toThrow("financial_action_invalid_payload");
  });

  it("enforces canonical facts, required revision semantics, and deterministic Cairo dates", () => {
    const add = payloadFor("add", "metals.add/v1");
    const sell = payloadFor("sell", "metals.sell/v2");

    const invalidPayloads = [
      { ...add, expectedHoldingRevision: "0" },
      { ...sell, expectedHoldingRevision: "01" },
      { ...sell, grossProceedsMinorUnits: "16500000.0" },
      {
        ...sell,
        grossProceedsMinorUnits: "0",
        feeMinorUnits: "0",
        netProceedsMinorUnits: "0",
      },
      { ...sell, feeMinorUnits: "16500001" },
      { ...sell, netProceedsMinorUnits: "16420001" },
      { ...add, metalType: "PLATINUM" },
      {
        ...add,
        materialFacts: { ...materialFacts(), physicalForm: "RING" },
      },
      {
        ...add,
        materialFacts: { ...materialFacts(), purchaseCurrency: "BTC" },
      },
      {
        ...add,
        materialFacts: { ...materialFacts(), purchasePriceDecimal: "1.001" },
      },
      {
        ...add,
        materialFacts: { ...materialFacts(), purchaseDate: "2026-09-02" },
      },
      { ...add, metadata: { name: "x".repeat(257), notes: null } },
      { ...add, metadata: { name: "Gold", notes: "🙂".repeat(1025) } },
    ];

    invalidPayloads.forEach((payload) => {
      expect(() =>
        definition("add", "metals.add/v1").validatePayload(
          payload,
          VALIDATION_INPUT
        )
      ).toThrow(FINANCIAL_ACTION_ERROR_CODES.INVALID_PAYLOAD);
    });

    expect(() =>
      definition("sell", "metals.sell/v2").validatePayload(
        sell,
        VALIDATION_INPUT
      )
    ).not.toThrow();

    const kwdAdd = {
      ...add,
      materialFacts: {
        ...materialFacts(),
        purchaseCurrency: "KWD",
        purchasePriceDecimal: "1.001",
      },
      rateSnapshots: acquisitionSnapshots().map((snapshot) =>
        snapshot.kind === "currency"
          ? { ...snapshot, instrumentCode: "currency:KWD" }
          : snapshot
      ),
    };
    expect(() =>
      definition("add", "metals.add/v1").validatePayload(
        kwdAdd,
        VALIDATION_INPUT
      )
    ).not.toThrow();
  });

  it("validates terminal purchase and proceeds currencies independently", () => {
    const crossCurrencySale = {
      ...payloadFor("sell", "metals.sell/v2"),
      purchaseCurrency: "EGP",
      saleCurrency: "USD",
      rateSnapshots: terminalSnapshots("EGP", "USD"),
    };

    expect(() =>
      definition("sell", "metals.sell/v2").validatePayload(
        crossCurrencySale,
        VALIDATION_INPUT
      )
    ).not.toThrow();
  });

  it("accepts nullable legacy before facts only for a complete correction replacement", async () => {
    const correct = payloadFor("correct", "metals.correct/v1");
    const legacyBefore = {
      physicalForm: null,
      purchaseCurrency: null,
      purchaseDate: "2026-08-30",
      purchasePriceDecimal: null,
      purityCatalogVersion: null,
      purityCode: null,
      purityFactorDecimal: null,
      weightGramsDecimal: null,
    };
    const payload = {
      ...correct,
      expectedHoldingRevision: "0",
      predecessorEventId: null,
      materialCorrection: {
        ...(correct.materialCorrection as Record<string, unknown>),
        before: legacyBefore,
      },
    };

    expect(() =>
      definition("correct", "metals.correct/v1").validatePayload(
        payload,
        VALIDATION_INPUT
      )
    ).not.toThrow();

    const canonical = await hashFinancialActionEnvelope(
      { ...envelope("correct", "metals.correct/v1"), payload },
      {
        digestUtf8: (value: string): Promise<string> =>
          Promise.resolve(createHash("sha256").update(value).digest("hex")),
      },
      DEFAULT_FINANCIAL_ACTION_REGISTRY,
      VALIDATION_INPUT
    );
    expect(canonical.canonicalText).toContain(
      '"before":{"physicalForm":null,"purchaseCurrency":null'
    );
  });

  it("accepts only the six stable Dispose reason codes", () => {
    const dispose = payloadFor("dispose", "metals.dispose/v1");
    const approvedReasons = [
      "lost_or_stolen",
      "destroyed_or_damaged",
      "given_away",
      "donated",
      "other_write_off",
      "other_external_transfer",
    ] as const;

    for (const reason of approvedReasons) {
      expect(() =>
        definition("dispose", "metals.dispose/v1").validatePayload(
          { ...dispose, reason },
          VALIDATION_INPUT
        )
      ).not.toThrow();
    }
    for (const reason of ["lost", "gift", "other", ""] as const) {
      expect(() =>
        definition("dispose", "metals.dispose/v1").validatePayload(
          { ...dispose, reason },
          VALIDATION_INPUT
        )
      ).toThrow(FINANCIAL_ACTION_ERROR_CODES.INVALID_PAYLOAD);
    }
  });

  it("requires complete role-specific immutable rate snapshots when a rate is supplied", () => {
    const add = payloadFor("add", "metals.add/v1");
    expect(() =>
      definition("add", "metals.add/v1").validatePayload(
        { ...add, rateSnapshots: [acquisitionSnapshots()[0]] },
        VALIDATION_INPUT
      )
    ).toThrow(FINANCIAL_ACTION_ERROR_CODES.INVALID_PAYLOAD);

    expect(() =>
      definition("sell", "metals.sell/v2").validatePayload(
        {
          ...payloadFor("sell", "metals.sell/v2"),
          rateSnapshots: terminalSnapshots().map((snapshot, index) =>
            index === 0 ? { ...snapshot, capturedAt: "not-a-utc-ms" } : snapshot
          ),
        },
        VALIDATION_INPUT
      )
    ).toThrow(FINANCIAL_ACTION_ERROR_CODES.INVALID_PAYLOAD);

    const invalidFreshnessSnapshots = [
      { providerObservedAt: null, capturedFreshness: "fresh" },
      {
        providerObservedAt: "2026-09-01T10:16:00.124Z",
        capturedFreshness: "fresh",
      },
      {
        providerObservedAt: "2026-08-30T10:15:59.999Z",
        capturedFreshness: "fresh",
      },
    ];
    invalidFreshnessSnapshots.forEach((replacement) => {
      expect(() =>
        definition("sell", "metals.sell/v2").validatePayload(
          {
            ...payloadFor("sell", "metals.sell/v2"),
            rateSnapshots: terminalSnapshots().map((snapshot, index) =>
              index === 0 ? { ...snapshot, ...replacement } : snapshot
            ),
          },
          VALIDATION_INPUT
        )
      ).toThrow(FINANCIAL_ACTION_ERROR_CODES.INVALID_PAYLOAD);
    });
  });

  it("allows Silver while keeping material corrections and terminal snapshots type-consistent", () => {
    const silverSale = {
      ...payloadFor("sell", "metals.sell/v2"),
      metalType: "SILVER",
      rateSnapshots: terminalSnapshots().map((snapshot) =>
        snapshot.kind === "metal"
          ? { ...snapshot, instrumentCode: "metal:SILVER" }
          : snapshot
      ),
    };
    expect(() =>
      definition("sell", "metals.sell/v2").validatePayload(
        silverSale,
        VALIDATION_INPUT
      )
    ).not.toThrow();

    expect(() =>
      definition("correct", "metals.correct/v1").validatePayload(
        {
          ...payloadFor("correct", "metals.correct/v1"),
          materialCorrection: {
            ...(payloadFor("correct", "metals.correct/v1")
              .materialCorrection as Record<string, unknown>),
            after: {
              ...materialFacts(),
              purityCode: "silver-9999",
              purityFactorDecimal: "0.9999",
            },
          },
        },
        VALIDATION_INPUT
      )
    ).toThrow(FINANCIAL_ACTION_ERROR_CODES.INVALID_PAYLOAD);
  });

  it("keeps the canonical serialization and SHA-256 stable for the approved Arabic add vector", async () => {
    const value = envelope("add", "metals.add/v1");
    const canonicalText = serializeFinancialActionEnvelope(
      value,
      DEFAULT_FINANCIAL_ACTION_REGISTRY,
      VALIDATION_INPUT
    );
    const result = await hashFinancialActionEnvelope(
      value,
      {
        digestUtf8: (text) =>
          Promise.resolve(
            createHash("sha256").update(text, "utf8").digest("hex")
          ),
      },
      DEFAULT_FINANCIAL_ACTION_REGISTRY,
      VALIDATION_INPUT
    );

    expect(canonicalText).toBe(result.canonicalText);
    expect(result.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(canonicalText).toContain('"physicalForm":"JEWELRY"');
    expect(canonicalText).toContain("ذهب الادخار");
  });
});
