import {
  calculateHistoricalPurityGramPriceDecimal,
  type PurchaseDateHistoricalRatePair,
  type RawObservedRateReference,
  type SupportedMetal,
} from "@monyvi/logic";

import {
  resolvePurchaseDateHistoricalRate,
  type PurchaseDateHistoricalRateDependencies,
  type PurchaseDateHistoricalRateResolution,
} from "./metal-purchase-date-reference-service";

export interface HistoricalMetalDetailInput {
  readonly purchaseDate: string;
  readonly metal: SupportedMetal;
  readonly purityCode: string;
  readonly purityFactorDecimal: string;
  readonly purchaseCurrency: string;
  readonly acquisitionMetalReference?: RawObservedRateReference;
  readonly acquisitionCurrencyReference?: RawObservedRateReference;
  readonly allowNetwork?: boolean;
  readonly expectedUserId?: string;
  readonly signal?: AbortSignal;
}

export type HistoricalMetalDetailReference =
  | {
      readonly status: "available";
      readonly rateDate: string;
      readonly purchaseCurrency: string;
      readonly selectedPurityPerGramDecimal: string;
      readonly origin: PurchaseDateHistoricalRatePair["origin"];
    }
  | {
      readonly status: "unavailable";
      readonly reason:
        | "cache_miss"
        | "date_unavailable"
        | "invalid_context"
        | "purchase_currency_unavailable"
        | "invalid_purity";
    }
  | {
      readonly status: "fetch_failed";
      readonly error: Error;
    };

export async function readHistoricalMetalDetailReference(
  input: HistoricalMetalDetailInput,
  dependencies?: PurchaseDateHistoricalRateDependencies
): Promise<HistoricalMetalDetailReference> {
  const resolution = await resolvePurchaseDateHistoricalRate(
    {
      purchaseDate: input.purchaseDate,
      metal: input.metal,
      purchaseCurrency: input.purchaseCurrency,
      actionMetalReference: input.acquisitionMetalReference,
      actionCurrencyReference: input.acquisitionCurrencyReference,
      allowNetwork: input.allowNetwork,
      expectedUserId: input.expectedUserId,
      signal: input.signal,
    },
    dependencies
  );

  return toDetailReference(input, resolution);
}

function toDetailReference(
  input: HistoricalMetalDetailInput,
  resolution: PurchaseDateHistoricalRateResolution
): HistoricalMetalDetailReference {
  if (resolution.status === "fetch_failed") {
    return resolution;
  }
  if (resolution.status === "unavailable") {
    return resolution;
  }

  const pricePerGram = calculateHistoricalPurityGramPriceDecimal({
    purityCode: input.purityCode,
    purityFactorDecimal: input.purityFactorDecimal,
    pair: resolution.value,
  });
  if (pricePerGram === null) {
    return { status: "unavailable", reason: "invalid_purity" };
  }

  return {
    status: "available",
    rateDate: resolution.value.rateDate,
    purchaseCurrency: resolution.value.purchaseCurrency,
    selectedPurityPerGramDecimal: pricePerGram,
    origin: resolution.value.origin,
  };
}
