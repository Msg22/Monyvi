import type {
  FinancialActionEnvelopeV1,
  FinancialActionValidationInput,
} from "../../../../packages/logic/src/financial-actions";
import type {
  CreateMetalFinancialActionEnvelopeInput,
  MetalActionKind,
} from "../../services/metal-financial-action-adapter";

export const METALS_ACTION_IDS = {
  action: "018f0c7a-1234-7abc-8def-000000000001",
  domainReference: "018f0c7a-1234-7abc-8def-000000000002",
  user: "018f0c7a-1234-7abc-8def-000000000003",
  holding: "018f0c7a-1234-7abc-8def-000000000004",
  predecessor: "018f0c7a-1234-7abc-8def-000000000005",
  reversal: "018f0c7a-1234-7abc-8def-000000000006",
} as const;

export const METALS_VALIDATION_INPUT: FinancialActionValidationInput = {
  cairoTodayDate: "2026-08-31",
};

const metadata = { name: "Gold coin", notes: "ذهب" };
const materialFacts = {
  physicalForm: "COIN",
  purchaseCurrency: "EGP",
  purchaseDate: "2026-08-30",
  purchasePriceDecimal: "30000",
  purityCatalogVersion: "1",
  purityCode: "gold-999",
  purityFactorDecimal: "0.999",
  weightGramsDecimal: "10.5",
} as const;

export function createApprovedMetalsEnvelope(
  kind: MetalActionKind
): FinancialActionEnvelopeV1 {
  const base = {
    accountGuards: [],
    actionId: METALS_ACTION_IDS.action,
    domain: "metals" as const,
    domainReferenceId: METALS_ACTION_IDS.holding,
    envelopeVersion: "monyvi.financial-action/v1" as const,
    occurredAt: "2026-08-31T10:15:30.123Z",
    userId: METALS_ACTION_IDS.user,
  };

  switch (kind) {
    case "add":
      return {
        ...base,
        kind,
        payloadVersion: "metals.add/v1",
        payload: {
          expectedHoldingRevision: null,
          holdingId: METALS_ACTION_IDS.holding,
          materialFacts,
          metalType: "GOLD",
          metadata,
          predecessorEventId: null,
          rateSnapshots: [],
          reversesEventId: null,
        },
      };
    case "correct":
      return {
        ...base,
        kind,
        payloadVersion: "metals.correct/v1",
        payload: {
          expectedHoldingRevision: "0",
          holdingId: METALS_ACTION_IDS.holding,
          materialCorrection: null,
          metadataChange: {
            before: metadata,
            after: { name: "Gold coin corrected", notes: "ذهب" },
          },
          predecessorEventId: METALS_ACTION_IDS.predecessor,
          reversesEventId: null,
        },
      };
    case "sell":
      return {
        ...base,
        kind,
        payloadVersion: "metals.sell/v2",
        payload: {
          expectedHoldingRevision: "0",
          feeMinorUnits: "80000",
          grossProceedsMinorUnits: "3550000",
          holdingId: METALS_ACTION_IDS.holding,
          metalType: "GOLD",
          netProceedsMinorUnits: "3470000",
          notes: "ذهب",
          predecessorEventId: METALS_ACTION_IDS.predecessor,
          rateSnapshots: [],
          reversesEventId: null,
          saleCurrency: "EGP",
          saleDate: "2026-08-31",
        },
      };
    case "dispose":
      return {
        ...base,
        kind,
        payloadVersion: "metals.dispose/v1",
        payload: {
          disposalDate: "2026-08-31",
          expectedHoldingRevision: "0",
          holdingId: METALS_ACTION_IDS.holding,
          notes: null,
          predecessorEventId: METALS_ACTION_IDS.predecessor,
          reason: "Gifted to family",
          reversesEventId: null,
        },
      };
    case "delete":
      return {
        ...base,
        kind,
        payloadVersion: "metals.delete/v1",
        payload: {
          expectedHoldingRevision: "0",
          holdingId: METALS_ACTION_IDS.holding,
          predecessorEventId: METALS_ACTION_IDS.predecessor,
          reversesEventId: null,
        },
      };
    case "undo":
      return {
        ...base,
        kind,
        payloadVersion: "metals.undo/v1",
        payload: {
          expectedHoldingRevision: "0",
          holdingId: METALS_ACTION_IDS.holding,
          predecessorEventId: METALS_ACTION_IDS.predecessor,
          reversesEventId: METALS_ACTION_IDS.reversal,
        },
      };
  }
}

export function createMetalAdapterInput(
  kind: MetalActionKind
): CreateMetalFinancialActionEnvelopeInput {
  const envelope = createApprovedMetalsEnvelope(kind);
  const payload = envelope.payload as Readonly<Record<string, unknown>>;
  const holdingId = payload.holdingId;
  if (typeof holdingId !== "string") throw new Error("invalid_test_holding_id");
  const expectedHoldingRevision = payload.expectedHoldingRevision;
  if (
    expectedHoldingRevision !== null &&
    typeof expectedHoldingRevision !== "string"
  ) {
    throw new Error("invalid_test_expected_revision");
  }
  return {
    actionId: envelope.actionId,
    userId: envelope.userId,
    holdingId,
    kind,
    expectedHoldingRevision,
    occurredAt: envelope.occurredAt,
    domainPayload: payload,
    validationInput: METALS_VALIDATION_INPUT,
  };
}
