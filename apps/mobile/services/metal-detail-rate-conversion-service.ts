import type { CurrencyType } from "@monyvi/db";
import {
  isSupportedMetalsIsoCurrencyCode,
  parseCanonicalDecimal,
  serializeDecimal,
  validateAndNormalizeRateReference,
  type NormalizedRateReference,
  type RateReferenceExpectation,
} from "@monyvi/logic";

import {
  hasTrustedCurrentRate,
  readCurrentCurrencyRateDecimal,
} from "./metal-detail-read-model-shaping";
import type { LiveRatesTrustValue } from "./live-rates-trust-read-model-service";
import type { BuildMetalDetailReadModelInput } from "./metal-detail-read-model-service";

// Shared service-layer helpers for exact display-currency conversion and
// immutable reference shaping. No model writes or UI responsibilities.
export function convertDetailValueForDisplay(
  valueDecimal: string,
  input: BuildMetalDetailReadModelInput
): { readonly currency: CurrencyType; readonly valueDecimal: string } | null {
  const purchaseCurrency = input.asset.purchaseCurrency;
  if (
    purchaseCurrency === null ||
    !isSupportedMetalsIsoCurrencyCode(purchaseCurrency)
  ) {
    return null;
  }
  const preferredCurrency = input.preferredCurrency ?? purchaseCurrency;
  if (!isSupportedMetalsIsoCurrencyCode(preferredCurrency)) return null;
  if (preferredCurrency === purchaseCurrency) {
    return { currency: preferredCurrency, valueDecimal };
  }

  const purchaseRateDecimal = readCurrentCurrencyRateDecimal(
    input.currentRates,
    purchaseCurrency
  );
  const preferredRateDecimal = readCurrentCurrencyRateDecimal(
    input.currentRates,
    preferredCurrency
  );
  if (purchaseRateDecimal === null || preferredRateDecimal === null)
    return null;

  try {
    return {
      currency: preferredCurrency,
      valueDecimal: serializeDecimal(
        parseCanonicalDecimal(valueDecimal)
          .times(purchaseRateDecimal)
          .dividedBy(preferredRateDecimal)
      ),
    };
  } catch {
    return null;
  }
}

export function buildCurrentReference(
  value: LiveRatesTrustValue | undefined,
  expectation: RateReferenceExpectation
): NormalizedRateReference | null {
  if (expectation.instrumentCode === "currency:USD") {
    return Object.freeze({
      capturedAt: 0,
      capturedFreshness: "unknown",
      instrumentCode: "currency:USD",
      kind: "currency",
      normalizedUsdPerBaseDecimal: "1",
      orientation: "quote_per_base",
      providerObservedAt: null,
      quality: "valid",
      role: expectation.role,
      source: null,
      unit: "usd_per_currency_unit",
      valueDecimal: "1",
    });
  }
  if (
    !hasTrustedCurrentRate(value) ||
    value.capturedAt === undefined ||
    value.capturedAt === null ||
    value.quality !== "valid"
  ) {
    return null;
  }
  const isMetal = expectation.instrumentCode.startsWith("metal:");
  const normalized = validateAndNormalizeRateReference(
    {
      capturedAt: value.capturedAt.getTime(),
      instrumentCode: expectation.instrumentCode,
      kind: isMetal ? "metal" : "currency",
      orientation: "quote_per_base",
      providerObservedAt: value.providerObservedAt?.getTime() ?? null,
      quality: value.quality,
      role: expectation.role,
      source: value.source ?? null,
      unit: isMetal ? "usd_per_pure_gram" : "usd_per_currency_unit",
      valueDecimal: value.valueDecimal,
    },
    expectation
  );
  return normalized.available ? normalized.value : null;
}
