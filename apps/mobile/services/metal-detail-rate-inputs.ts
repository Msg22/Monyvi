import type { CurrencyType } from "@monyvi/db";
import {
  isSupportedMetalsIsoCurrencyCode,
  type SupportedMetal,
} from "@monyvi/logic";

import type {
  LiveRatesTrustReadModel,
  LiveRatesTrustState,
  LiveRatesTrustValue,
} from "./live-rates-trust-read-model-service";

export interface MetalDetailRateInputStatus {
  readonly id: string;
  readonly ageMs: number | null;
  readonly providerObservedAt: Date | null;
  readonly quality: string | null;
  readonly source: string | null;
  readonly state: LiveRatesTrustState;
}

interface CurrentValueRatesInput {
  readonly asset: { readonly purchaseCurrency: string | null };
  readonly currentRates?: LiveRatesTrustReadModel;
  readonly metal: { readonly metalType: SupportedMetal };
  readonly preferredCurrency?: CurrencyType;
}

interface IdentifiedRate {
  readonly id: string;
  readonly rate: LiveRatesTrustValue;
}

export function getCurrentValueRates(
  input: CurrentValueRatesInput
): readonly LiveRatesTrustValue[] {
  return getCurrentValueRatePairs(input).map(({ rate }) => rate);
}

export function buildCurrentRateInputs(
  input: CurrentValueRatesInput,
  hasDisplayedPerformance: boolean
): readonly MetalDetailRateInputStatus[] {
  const pairs = [...getCurrentValueRatePairs(input)];

  if (hasDisplayedPerformance) {
    for (const pair of getDisplayedPerformanceRatePairs(input)) {
      if (!pairs.some((candidate) => candidate.id === pair.id)) {
        pairs.push(pair);
      }
    }
  }

  return pairs.map(({ id, rate }) => ({
    id,
    ageMs: rate.ageMs,
    providerObservedAt: rate.providerObservedAt,
    quality: rate.quality ?? null,
    source: rate.source ?? null,
    state: rate.state,
  }));
}

function getCurrentValueRatePairs(
  input: CurrentValueRatesInput
): readonly IdentifiedRate[] {
  if (
    input.currentRates === undefined ||
    input.preferredCurrency === undefined ||
    !isSupportedMetalsIsoCurrencyCode(input.preferredCurrency)
  ) {
    return [];
  }

  const metal = getMetalRatePair(input);
  if (input.preferredCurrency === "USD") return [metal];

  const currency = input.currentRates.currencies.get(input.preferredCurrency);
  if (currency === undefined) return [];

  return [
    metal,
    {
      id: `currency:${input.preferredCurrency}`,
      rate: currency,
    },
  ];
}

function getDisplayedPerformanceRatePairs(
  input: CurrentValueRatesInput
): readonly IdentifiedRate[] {
  if (input.currentRates === undefined) return [];

  const purchaseCurrency = input.asset.purchaseCurrency;
  if (
    purchaseCurrency === null ||
    !isSupportedMetalsIsoCurrencyCode(purchaseCurrency)
  ) {
    return [];
  }

  const effectiveCurrency = input.preferredCurrency ?? purchaseCurrency;
  if (!isSupportedMetalsIsoCurrencyCode(effectiveCurrency)) return [];

  const pairs: IdentifiedRate[] = [getMetalRatePair(input)];

  if (purchaseCurrency !== "USD") {
    const purchaseRate = input.currentRates.currencies.get(purchaseCurrency);
    if (purchaseRate !== undefined) {
      pairs.push({
        id: `currency:${purchaseCurrency}`,
        rate: purchaseRate,
      });
    }
  }

  if (effectiveCurrency !== "USD" && effectiveCurrency !== purchaseCurrency) {
    const effectiveRate = input.currentRates.currencies.get(effectiveCurrency);
    if (effectiveRate !== undefined) {
      pairs.push({
        id: `currency:${effectiveCurrency}`,
        rate: effectiveRate,
      });
    }
  }

  return pairs;
}

function getMetalRatePair(input: {
  readonly currentRates: LiveRatesTrustReadModel;
  readonly metal: { readonly metalType: SupportedMetal };
}): IdentifiedRate {
  return {
    id: `metal:${input.metal.metalType}`,
    rate:
      input.metal.metalType === "GOLD"
        ? input.currentRates.gold
        : input.currentRates.silver,
  };
}
