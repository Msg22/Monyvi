import type { CurrencyType } from "@monyvi/db";
import {
  calculateCurrentQuotedPurityGramPriceDecimal,
  FEATURED_PURITY_CODES,
  getPurityEntry,
  parseCanonicalDecimal,
  roundDecimal,
  serializeDecimal,
  type SupportedMetal,
} from "@monyvi/logic";

import {
  summarizeLiveRatesTrust,
  type LiveRatesTrustReadModel,
} from "@/services/live-rates-trust-read-model-service";

export interface MetalPortfolioPurityPriceTile {
  readonly id: string;
  readonly metal: SupportedMetal;
  readonly purityCode: string;
  readonly pricePerGramDecimal: string | null;
  readonly state: "fresh" | "stale" | "unknown" | "missing";
  readonly providerObservedAt?: Date | null;
}

/**
 * Builds the exactly four canonical purity price tiles (Gold 24K, 21K, 18K,
 * Silver 999) using live rate snapshots and canonical purity factors.
 */
export function buildFeaturedPurityPriceTiles(
  currentRates: LiveRatesTrustReadModel | undefined,
  preferredCurrency: CurrencyType | undefined
): readonly MetalPortfolioPurityPriceTile[] {
  if (!currentRates || !preferredCurrency) {
    return FEATURED_PURITY_CODES.map((def) => ({
      id: def.purityCode,
      metal: def.metal,
      purityCode: def.purityCode,
      pricePerGramDecimal: null,
      state: "missing",
      providerObservedAt: null,
    }));
  }

  const currencyTrust =
    preferredCurrency === "USD"
      ? {
          state: "fresh" as const,
          ageMs: 0,
          providerObservedAt: null,
          valueDecimal: "1",
        }
      : (currentRates.currencies.get(preferredCurrency) ?? {
          state: "missing" as const,
          ageMs: null,
          providerObservedAt: null,
        });
  const currencyRateDecimal =
    preferredCurrency === "USD" ? "1" : (currencyTrust.valueDecimal ?? null);

  return FEATURED_PURITY_CODES.map((def) => {
    const purityEntry = getPurityEntry(def.metal, def.purityCode);
    const metalTrust =
      def.metal === "GOLD" ? currentRates.gold : currentRates.silver;
    const metalRateDecimal = metalTrust.valueDecimal ?? null;

    const compositeState = summarizeLiveRatesTrust([metalTrust, currencyTrust]);

    let pricePerGramDecimal: string | null = null;
    if (metalRateDecimal !== null && currencyRateDecimal !== null) {
      pricePerGramDecimal = calculateCurrentQuotedPurityGramPriceDecimal({
        metal: def.metal,
        purityCode: def.purityCode,
        purityFactorDecimal: purityEntry.factorDecimal,
        metalUsdPerPureGramDecimal: metalRateDecimal,
        currencyUsdPerUnitDecimal: currencyRateDecimal,
      });
    }

    const state: MetalPortfolioPurityPriceTile["state"] =
      compositeState === "invalid" ? "missing" : compositeState;

    return {
      id: def.purityCode,
      metal: def.metal,
      purityCode: def.purityCode,
      pricePerGramDecimal: state === "missing" ? null : pricePerGramDecimal,
      state,
      providerObservedAt: metalTrust.providerObservedAt ?? null,
    };
  });
}

/**
 * Calculates proportional metal allocation percentage rounded to 1 decimal place.
 * Returns null if amounts are null or total is zero.
 */
export function calculateDisplayedShare(
  amountDecimal: string | null,
  totalDecimal: string | null
): string | null {
  if (amountDecimal === null || totalDecimal === null) {
    return null;
  }

  const total = parseCanonicalDecimal(totalDecimal);
  if (total.isZero()) {
    return null;
  }

  const share = parseCanonicalDecimal(amountDecimal)
    .times("100")
    .dividedBy(total);
  return serializeDecimal(parseCanonicalDecimal(roundDecimal(share, 1)));
}
