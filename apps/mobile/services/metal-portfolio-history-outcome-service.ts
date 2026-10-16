import type { CurrencyType } from "@monyvi/db";
import {
  hasCanonicalDecimalPrecision,
  isSupportedMetalsIsoCurrencyCode,
  parseCanonicalDecimal,
  type MetalsIsoCurrencyCode,
} from "@monyvi/logic";

import {
  shapeMetalDisposedEvidence,
  type MetalDisposeEventSnapshot,
  type MetalDisposeGroupSnapshot,
  type MetalDisposeHoldingSnapshot,
  type MetalDisposalTreatment,
} from "./metal-disposed-evidence-service";
import { convertSoldAmountForPreferredDisplay } from "./metal-portfolio-sale-result-service";
import type { LiveRatesTrustReadModel } from "./live-rates-trust-read-model-service";
import type { MetalRealizedSaleOutcome } from "./metal-realized-sale-read-model-service";

export type MetalRecentHistoryOutcome = "gain" | "loss" | "neutral";

export interface ShapeSoldDisplayAmountsInput {
  readonly currentRates: LiveRatesTrustReadModel;
  readonly preferredCurrency: CurrencyType;
  readonly soldEvidence: MetalRealizedSaleOutcome | null;
}

export interface SoldDisplayAmounts {
  readonly soldDisplayCurrency: MetalsIsoCurrencyCode | null;
  readonly soldNetProceedsDecimal: string | null;
  readonly soldResultDecimal: string | null;
}

export function shapeSoldDisplayAmounts(
  input: ShapeSoldDisplayAmountsInput
): SoldDisplayAmounts {
  const soldValue =
    input.soldEvidence !== null && input.soldEvidence.available
      ? input.soldEvidence.value
      : null;
  const soldNetProceedsDecimal =
    soldValue === null
      ? null
      : convertSoldAmountForPreferredDisplay({
          amountCurrency: soldValue.proceedsCurrency,
          amountDecimal: soldValue.netProceedsDecimal,
          currentRates: input.currentRates,
          preferredCurrency: input.preferredCurrency,
        });
  const soldResultDecimal =
    soldValue === null
      ? null
      : convertSoldAmountForPreferredDisplay({
          amountCurrency: soldValue.purchaseCurrency,
          amountDecimal: soldValue.combinedDecimal,
          currentRates: input.currentRates,
          preferredCurrency: input.preferredCurrency,
        });
  const soldDisplayCurrency = isSupportedMetalsIsoCurrencyCode(
    input.preferredCurrency
  )
    ? input.preferredCurrency
    : null;
  return {
    soldDisplayCurrency,
    soldNetProceedsDecimal,
    soldResultDecimal,
  };
}

export interface ShapeMetalHistoryOutcomeInput {
  readonly event: MetalDisposeEventSnapshot | null;
  readonly group: MetalDisposeGroupSnapshot | null;
  readonly holding: MetalDisposeHoldingSnapshot;
  readonly latestAllowedCalendarDate?: string;
  readonly soldResultDecimal: string | null;
  readonly status: "active" | "sold" | "disposed";
  readonly userId: string;
}

/**
 * Service-level classification of recorded terminal outcomes. Exact decimal
 * strings are never coerced to JavaScript numbers for sign comparison.
 */
export function classifyMetalRecentHistoryOutcome(
  status: "active" | "sold" | "disposed",
  soldResultDecimal: string | null,
  disposalTreatment: MetalDisposalTreatment | null
): MetalRecentHistoryOutcome {
  if (status === "disposed") {
    return disposalTreatment === "write_off" ? "loss" : "neutral";
  }
  if (
    status !== "sold" ||
    soldResultDecimal === null ||
    !hasCanonicalDecimalPrecision(soldResultDecimal)
  ) {
    return "neutral";
  }
  try {
    const result = parseCanonicalDecimal(soldResultDecimal);
    if (result.greaterThan("0")) return "gain";
    if (!result.greaterThanOrEqualTo("0")) return "loss";
    return "neutral";
  } catch {
    return "neutral";
  }
}

export function shapeMetalHistoryOutcome(
  input: ShapeMetalHistoryOutcomeInput
): MetalRecentHistoryOutcome {
  if (input.status !== "disposed") {
    return classifyMetalRecentHistoryOutcome(
      input.status,
      input.soldResultDecimal,
      null
    );
  }
  // A disposal outcome comes only from accepted, matching immutable
  // lifecycle + group evidence. Do not infer a write-off from market prices,
  // current ownership, or missing/unsupported payloads.
  const disposalEvidence = shapeMetalDisposedEvidence({
    event: input.event,
    group: input.group,
    holding: input.holding,
    latestAllowedCalendarDate: input.latestAllowedCalendarDate,
    userId: input.userId,
  });
  const disposalTreatment = disposalEvidence.available
    ? disposalEvidence.value.treatment
    : null;
  return classifyMetalRecentHistoryOutcome(
    input.status,
    input.soldResultDecimal,
    disposalTreatment
  );
}
