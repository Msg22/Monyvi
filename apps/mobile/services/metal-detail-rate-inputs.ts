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

export function getCurrentValueRates(
  input: CurrentValueRatesInput
): readonly LiveRatesTrustValue[] {
  if (
    input.currentRates === undefined ||
    input.preferredCurrency === undefined ||
    !isSupportedMetalsIsoCurrencyCode(input.preferredCurrency)
  )
    return [];

  const metal =
    input.metal.metalType === "GOLD"
      ? input.currentRates.gold
      : input.currentRates.silver;
  if (input.preferredCurrency === "USD") return [metal];
  const currency = input.currentRates.currencies.get(input.preferredCurrency);
  return currency === undefined ? [] : [metal, currency];
}

export function buildCurrentRateInputs(
  input: CurrentValueRatesInput,
  hasDisplayedPerformance: boolean
): readonly MetalDetailRateInputStatus[] {
  const currentValueIds = [
    `metal:${input.metal.metalType}`,
    ...(input.preferredCurrency === "USD"
      ? []
      : [`currency:${input.preferredCurrency}`]),
  ];
  const purchaseCurrency = input.asset.purchaseCurrency;
  const purchaseRate =
    hasDisplayedPerformance &&
    purchaseCurrency !== null &&
    purchaseCurrency !== "USD" &&
    purchaseCurrency !== input.preferredCurrency &&
    isSupportedMetalsIsoCurrencyCode(purchaseCurrency)
      ? input.currentRates?.currencies.get(purchaseCurrency)
      : undefined;
  const rates = [
    ...getCurrentValueRates(input),
    ...(purchaseRate === undefined ? [] : [purchaseRate]),
  ];
  const ids = [
    ...currentValueIds,
    ...(purchaseRate === undefined ? [] : [`currency:${purchaseCurrency}`]),
  ];
  return rates.map((rate, index) => ({
    id: ids[index] ?? "unknown",
    ageMs: rate.ageMs,
    providerObservedAt: rate.providerObservedAt,
    quality: rate.quality ?? null,
    source: rate.source ?? null,
    state: rate.state,
  }));
}
