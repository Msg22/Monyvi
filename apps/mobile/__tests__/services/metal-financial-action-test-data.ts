import { createHash } from "node:crypto";

import type {
  FinancialActionValidationInput,
  Sha256Provider,
} from "@monyvi/logic";
import type {
  CreateMetalFinancialActionEnvelopeInput,
  MetalActionKind,
} from "../../services/metal-financial-action-adapter";

export const USER_ID = "018f0c7a-1234-7abc-8def-000000000003";
export const FOREIGN_USER_ID = "018f0c7a-1234-7abc-8def-000000000099";
export const HOLDING_ID = "018f0c7a-1234-7abc-8def-000000000004";

export const VALIDATION_INPUT: FinancialActionValidationInput = {
  cairoTodayDate: "2026-09-01",
};

export const sha256Provider: Sha256Provider = {
  digestUtf8: (value: string): Promise<string> =>
    Promise.resolve(createHash("sha256").update(value).digest("hex")),
};

export function actionId(index: number): string {
  return "018f0c7a-1234-7abc-8def-" + String(index).padStart(12, "0");
}

export function materialFacts(
  purchasePriceDecimal = "150000"
): Record<string, unknown> {
  return {
    physicalForm: "JEWELRY",
    purchaseCurrency: "EGP",
    purchaseDate: "2026-08-30",
    purchasePriceDecimal,
    purityCatalogVersion: "1",
    purityCode: "gold-9999",
    purityFactorDecimal: "0.9999",
    weightGramsDecimal: "10.25",
  };
}

export function rateSnapshot(
  referenceId: string,
  role:
    | "acquisition_metal"
    | "acquisition_purchase_currency"
    | "terminal_metal"
    | "terminal_purchase_currency"
    | "terminal_proceeds_currency"
): Record<string, unknown> {
  const isMetal = role.endsWith("_metal");
  return {
    capturedAt: "2026-08-31T10:16:00.123Z",
    capturedFreshness: "fresh",
    instrumentCode: isMetal ? "metal:GOLD" : "currency:EGP",
    kind: isMetal ? "metal" : "currency",
    orientation: "quote_per_base",
    providerObservedAt: "2026-08-31T10:15:30.123Z",
    quality: "valid",
    referenceId,
    role,
    source: "provider-a",
    unit: isMetal ? "usd_per_pure_gram" : "usd_per_currency_unit",
    valueDecimal: isMetal ? "3510.5" : "0.02",
  };
}

function payloadFor(
  kind: MetalActionKind,
  expectedHoldingRevision: string | null,
  predecessorEventId: string | null,
  reversesEventId: string | null = null
): Readonly<Record<string, unknown>> {
  if (kind === "add") {
    return {
      expectedHoldingRevision: null,
      holdingId: HOLDING_ID,
      materialFacts: materialFacts(),
      metalType: "GOLD",
      metadata: { name: "Savings gold", notes: null },
      predecessorEventId: null,
      rateSnapshots: [
        rateSnapshot(actionId(101), "acquisition_metal"),
        rateSnapshot(actionId(102), "acquisition_purchase_currency"),
      ],
      reversesEventId: null,
    };
  }
  if (kind === "correct") {
    return {
      expectedHoldingRevision,
      holdingId: HOLDING_ID,
      materialCorrection: {
        after: materialFacts("151000"),
        before: materialFacts(),
        rateSnapshots: [
          rateSnapshot(actionId(103), "acquisition_metal"),
          rateSnapshot(actionId(104), "acquisition_purchase_currency"),
        ],
        reason: "Receipt correction",
      },
      metadataChange: null,
      predecessorEventId,
      reversesEventId: null,
    };
  }
  if (kind === "sell") {
    return {
      expectedHoldingRevision,
      feeMinorUnits: "80000",
      grossProceedsMinorUnits: "16500000",
      holdingId: HOLDING_ID,
      metalType: "GOLD",
      netProceedsMinorUnits: "16420000",
      notes: null,
      predecessorEventId,
      purchaseCurrency: "EGP",
      rateSnapshots: [
        rateSnapshot(actionId(105), "terminal_metal"),
        rateSnapshot(actionId(106), "terminal_purchase_currency"),
        rateSnapshot(actionId(107), "terminal_proceeds_currency"),
      ],
      reversesEventId: null,
      saleCurrency: "EGP",
      saleDate: "2026-08-31",
    };
  }
  if (kind === "dispose") {
    return {
      disposalDate: "2026-08-31",
      expectedHoldingRevision,
      holdingId: HOLDING_ID,
      notes: null,
      predecessorEventId,
      reason: "given_away",
      reversesEventId: null,
    };
  }
  return {
    expectedHoldingRevision,
    holdingId: HOLDING_ID,
    predecessorEventId,
    reversesEventId: kind === "undo" ? reversesEventId : null,
  };
}

export function commandInput(
  kind: MetalActionKind,
  id: string,
  expectedHoldingRevision: string | null,
  predecessorEventId: string | null,
  reversesEventId: string | null = null,
  userId = USER_ID
): CreateMetalFinancialActionEnvelopeInput {
  return {
    actionId: id,
    userId,
    holdingId: HOLDING_ID,
    kind,
    expectedHoldingRevision,
    occurredAt: "2026-08-31T10:15:30.123Z",
    domainPayload: payloadFor(
      kind,
      expectedHoldingRevision,
      predecessorEventId,
      reversesEventId
    ),
    validationInput: VALIDATION_INPUT,
  };
}
