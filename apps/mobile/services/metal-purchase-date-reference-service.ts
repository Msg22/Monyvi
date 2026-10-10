import {
  isExactCalendarDate,
  isSupportedMetalsIsoCurrencyCode,
  qualifyTimestampedAcquisitionRatePair,
  selectHistoricalDailyRatePair,
  type PurchaseDateHistoricalRatePair,
  type RawObservedRateReference,
  type SupportedMetal,
} from "@monyvi/logic";

import {
  fetchHistoricalDailyRate,
  METAL_HISTORICAL_RATE_FETCH_ERROR_CODES,
  MetalHistoricalRateFetchError,
} from "./metal-historical-rate-fetch-service";
import {
  readHistoricalDailyRateCache,
  saveHistoricalDailyRateCache,
} from "./metal-historical-rate-cache-service";

export type PurchaseDateHistoricalRateUnavailableReason =
  | "cache_miss"
  | "date_unavailable"
  | "invalid_context"
  | "purchase_currency_unavailable";

export type PurchaseDateHistoricalRateResolution =
  | {
      readonly status: "available";
      readonly value: PurchaseDateHistoricalRatePair;
      readonly source: "action" | "cache" | "network";
    }
  | {
      readonly status: "unavailable";
      readonly reason: PurchaseDateHistoricalRateUnavailableReason;
    }
  | {
      readonly status: "fetch_failed";
      readonly error: Error;
    };

export interface ResolvePurchaseDateHistoricalRateInput {
  readonly purchaseDate: string;
  readonly metal: SupportedMetal;
  readonly purchaseCurrency: string;
  readonly actionMetalReference?: RawObservedRateReference;
  readonly actionCurrencyReference?: RawObservedRateReference;
  readonly allowNetwork?: boolean;
}

export interface PurchaseDateHistoricalRateDependencies {
  readonly readCache: typeof readHistoricalDailyRateCache;
  readonly saveCache: typeof saveHistoricalDailyRateCache;
  readonly fetchDaily: typeof fetchHistoricalDailyRate;
}

const DEFAULT_DEPENDENCIES: PurchaseDateHistoricalRateDependencies = {
  readCache: readHistoricalDailyRateCache,
  saveCache: saveHistoricalDailyRateCache,
  fetchDaily: fetchHistoricalDailyRate,
};

export async function resolvePurchaseDateHistoricalRate(
  input: ResolvePurchaseDateHistoricalRateInput,
  dependencies: PurchaseDateHistoricalRateDependencies = DEFAULT_DEPENDENCIES
): Promise<PurchaseDateHistoricalRateResolution> {
  if (
    !isExactCalendarDate(input.purchaseDate) ||
    !isSupportedMetalsIsoCurrencyCode(input.purchaseCurrency)
  ) {
    return { status: "unavailable", reason: "invalid_context" };
  }

  if (
    input.actionMetalReference !== undefined &&
    input.actionCurrencyReference !== undefined
  ) {
    const actionPair = qualifyTimestampedAcquisitionRatePair({
      purchaseDate: input.purchaseDate,
      metal: input.metal,
      purchaseCurrency: input.purchaseCurrency,
      metalReference: input.actionMetalReference,
      currencyReference: input.actionCurrencyReference,
    });
    if (actionPair !== null) {
      return { status: "available", value: actionPair, source: "action" };
    }
  }

  let cached;
  try {
    cached = await dependencies.readCache(input.purchaseDate);
  } catch (error: unknown) {
    return {
      status: "fetch_failed",
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }

  if (cached !== null) {
    const cachedPair = selectHistoricalDailyRatePair({
      record: cached,
      purchaseDate: input.purchaseDate,
      metal: input.metal,
      purchaseCurrency: input.purchaseCurrency,
    });
    if (cachedPair !== null) {
      return { status: "available", value: cachedPair, source: "cache" };
    }
  }

  if (input.allowNetwork === false) {
    return {
      status: "unavailable",
      reason:
        cached === null ? "cache_miss" : "purchase_currency_unavailable",
    };
  }

  try {
    const fetched = await dependencies.fetchDaily(input.purchaseDate);
    await dependencies.saveCache(fetched);
    const fetchedPair = selectHistoricalDailyRatePair({
      record: fetched,
      purchaseDate: input.purchaseDate,
      metal: input.metal,
      purchaseCurrency: input.purchaseCurrency,
    });
    return fetchedPair === null
      ? {
          status: "unavailable",
          reason: "purchase_currency_unavailable",
        }
      : { status: "available", value: fetchedPair, source: "network" };
  } catch (error: unknown) {
    if (
      error instanceof MetalHistoricalRateFetchError &&
      error.code === METAL_HISTORICAL_RATE_FETCH_ERROR_CODES.DATE_UNAVAILABLE
    ) {
      return { status: "unavailable", reason: "date_unavailable" };
    }
    return {
      status: "fetch_failed",
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
