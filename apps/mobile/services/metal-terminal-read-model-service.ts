import {
  isSupportedMetalsIsoCurrencyCode,
  type MetalsIsoCurrencyCode,
  type SupportedMetal,
  type RealizedAttribution,
  type RoundedAttribution,
} from "@monyvi/logic";

import {
  shapeMetalDisposedEvidence,
  type MetalDisposalReason,
  type MetalDisposalTreatment,
  type MetalDisposeEventSnapshot,
  type MetalDisposeGroupSnapshot,
} from "@/services/metal-disposed-evidence-service";
import {
  shapeMetalRealizedSaleEvidence,
  toMetalSellEventSnapshot,
  type MetalRealizedSaleOutcome,
  type MetalRealizedSaleUnavailableReason,
  type MetalSellGroupSnapshot,
  type MetalSellRateReferenceSnapshot,
} from "@/services/metal-realized-sale-read-model-service";
import { toPortfolioSaleHolding } from "@/services/metal-portfolio-sale-result-service";
import type { LiveRatesTrustValue } from "./live-rates-trust-read-model-service";

export interface MetalDisplayRateTrust {
  readonly currency: MetalsIsoCurrencyCode;
  readonly state: LiveRatesTrustValue["state"];
  readonly providerObservedAt: Date | null;
}

export interface MetalSoldTerminalFacts {
  readonly canonicalAttribution?: RealizedAttribution;
  readonly displayAttribution?: RoundedAttribution | null;
  readonly displayRateTrust?: readonly MetalDisplayRateTrust[];
  readonly actionId: string;
  readonly feeDecimal: string;
  readonly grossProceedsDecimal: string;
  readonly kind: "sold";
  readonly netProceedsDecimal: string;
  readonly notes: string | null;
  readonly proceedsCurrency: MetalsIsoCurrencyCode;
  readonly realizedResultCurrency: MetalsIsoCurrencyCode | null;
  readonly realizedResultDecimal: string | null;
  readonly realizedResultUnavailableReason: MetalRealizedSaleUnavailableReason | null;
  readonly terminalDate: string;
}

export interface MetalDisposedTerminalFacts {
  readonly actionId: string;
  readonly kind: "disposed";
  readonly notes: string | null;
  readonly reason: MetalDisposalReason;
  readonly terminalDate: string;
  readonly treatment: MetalDisposalTreatment;
}

export type MetalTerminalFacts =
  | MetalSoldTerminalFacts
  | MetalDisposedTerminalFacts;

interface MetalTerminalAssetInput {
  readonly acquisitionActionId: string | null;
  readonly id: string;
  readonly purchaseCurrency: string | null;
  readonly purchasePriceDecimal: string | null;
  readonly userId: string;
}

interface MetalTerminalEventInput {
  readonly actionId?: string | null;
  readonly deleted: boolean;
  readonly holdingId: string;
  readonly id: string;
  readonly isEffective: boolean;
  readonly kind?: string;
  readonly payloadJson?: string;
  readonly userId: string;
}

interface MetalTerminalGroupInput
  extends MetalSellGroupSnapshot, MetalDisposeGroupSnapshot {}

interface MetalTerminalHoldingStateInput {
  readonly effectiveActionId: string | null;
  readonly effectiveEventId: string | null;
  readonly holdingId: string;
  readonly isVisible: boolean;
  readonly reconciliationState: string;
  readonly status: string;
  readonly userId: string;
}

interface MetalTerminalMaterialInput {
  readonly metalType: SupportedMetal;
  readonly purityFactorDecimal: string | null;
  readonly weightGramsDecimal: string | null;
}

export interface ShapeMetalTerminalFactsInput {
  readonly asset: MetalTerminalAssetInput;
  readonly event: MetalTerminalEventInput | null;
  readonly group: MetalTerminalGroupInput | null;
  readonly holdingState: MetalTerminalHoldingStateInput;
  readonly latestAllowedCalendarDate?: string;
  readonly metal: MetalTerminalMaterialInput;
  readonly rateReferences: readonly MetalSellRateReferenceSnapshot[];
  readonly userId: string;
}

export function shapeMetalTerminalFacts(
  input: ShapeMetalTerminalFactsInput
): MetalTerminalFacts | null {
  if (input.holdingState.status === "sold") return shapeSoldFacts(input);
  if (input.holdingState.status === "disposed") {
    return shapeDisposedFacts(input);
  }
  return null;
}

function shapeSoldFacts(
  input: ShapeMetalTerminalFactsInput
): MetalSoldTerminalFacts | null {
  const purchaseCurrency = normalizeCurrency(input.asset.purchaseCurrency);
  const outcome = shapeMetalRealizedSaleEvidence({
    acquisitionReferences: input.rateReferences,
    event: toMetalSellEventSnapshot(input.event ?? undefined),
    group: input.group,
    holding: toPortfolioSaleHolding(
      input.asset,
      input.metal.metalType,
      input.holdingState,
      {
        purityFactorDecimal: input.metal.purityFactorDecimal,
        purchaseCurrency,
        purchasePriceDecimal: input.asset.purchasePriceDecimal,
        weightGramsDecimal: input.metal.weightGramsDecimal,
      },
      "sold"
    ),
    latestAllowedCalendarDate: input.latestAllowedCalendarDate,
    userId: input.userId,
  });
  return toSoldTerminalFacts(outcome);
}

function toSoldTerminalFacts(
  outcome: MetalRealizedSaleOutcome
): MetalSoldTerminalFacts | null {
  if (outcome.available) {
    return Object.freeze({
      actionId: outcome.value.actionId,
      canonicalAttribution: outcome.value.attribution,
      feeDecimal: outcome.value.feeDecimal,
      grossProceedsDecimal: outcome.value.grossProceedsDecimal,
      kind: "sold",
      netProceedsDecimal: outcome.value.netProceedsDecimal,
      notes: outcome.value.notes,
      proceedsCurrency: outcome.value.proceedsCurrency,
      realizedResultCurrency: outcome.value.purchaseCurrency,
      realizedResultDecimal: outcome.value.combinedDecimal,
      realizedResultUnavailableReason: null,
      terminalDate: outcome.value.saleDate,
    });
  }
  if (outcome.facts === undefined) return null;
  return Object.freeze({
    actionId: outcome.facts.actionId,
    feeDecimal: outcome.facts.feeDecimal,
    grossProceedsDecimal: outcome.facts.grossProceedsDecimal,
    kind: "sold",
    netProceedsDecimal: outcome.facts.netProceedsDecimal,
    notes: outcome.facts.notes,
    proceedsCurrency: outcome.facts.proceedsCurrency,
    realizedResultCurrency: null,
    realizedResultDecimal: null,
    realizedResultUnavailableReason: outcome.reason,
    terminalDate: outcome.facts.saleDate,
  });
}

function shapeDisposedFacts(
  input: ShapeMetalTerminalFactsInput
): MetalDisposedTerminalFacts | null {
  const outcome = shapeMetalDisposedEvidence({
    event: toDisposeEventSnapshot(input.event),
    group: input.group,
    holding: input.holdingState,
    latestAllowedCalendarDate: input.latestAllowedCalendarDate,
    userId: input.userId,
  });
  if (!outcome.available) return null;
  return Object.freeze({
    actionId: outcome.value.actionId,
    kind: "disposed",
    notes: outcome.value.notes,
    reason: outcome.value.reason,
    terminalDate: outcome.value.disposalDate,
    treatment: outcome.value.treatment,
  });
}

function toDisposeEventSnapshot(
  event: MetalTerminalEventInput | null
): MetalDisposeEventSnapshot | null {
  if (
    event === null ||
    typeof event.actionId !== "string" ||
    event.kind === undefined ||
    event.payloadJson === undefined
  ) {
    return null;
  }
  return {
    actionId: event.actionId,
    deleted: event.deleted,
    holdingId: event.holdingId,
    id: event.id,
    isEffective: event.isEffective,
    kind: event.kind,
    payloadJson: event.payloadJson,
    userId: event.userId,
  };
}

function normalizeCurrency(value: string | null): MetalsIsoCurrencyCode | null {
  return value !== null && isSupportedMetalsIsoCurrencyCode(value)
    ? value
    : null;
}
