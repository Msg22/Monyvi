import type { CurrencyType } from "@monyvi/db";
import {
  convertAttributionForDisplay,
  isSupportedMetalsIsoCurrencyCode,
  resolveMetalsCurrencyMinorUnits,
  validateAndNormalizeRateReference,
  type ExactRateReference,
  type MetalsIsoCurrencyCode,
  type RoundedAttribution,
} from "@monyvi/logic";
import type { LiveRatesTrustReadModel } from "./live-rates-trust-read-model-service";
import type {
  MetalSoldTerminalFacts,
  MetalDisplayRateTrust,
  MetalTerminalFacts,
} from "./metal-terminal-read-model-service";
import { convertSoldAmountForPreferredDisplay } from "./metal-portfolio-sale-result-service";

export function buildMetalDetailTerminalFacts(
  input: {
    readonly terminalFacts?: MetalTerminalFacts | null;
    readonly currentRates?: LiveRatesTrustReadModel;
    readonly preferredCurrency?: CurrencyType;
  },
  status: "active" | "sold" | "disposed"
): MetalTerminalFacts | null {
  return buildMetalTerminalDisplayFacts(
    input.terminalFacts?.kind === status ? input.terminalFacts : null,
    input.currentRates,
    input.preferredCurrency
  );
}

export function buildMetalTerminalDisplayFacts(
  facts: MetalTerminalFacts | null,
  currentRates: LiveRatesTrustReadModel | undefined,
  preferredCurrency: CurrencyType | undefined
): MetalTerminalFacts | null {
  if (facts === null || facts.kind !== "sold") return facts;
  const currency = preferredCurrency ?? facts.realizedResultCurrency;
  if (
    currency === null ||
    !isSupportedMetalsIsoCurrencyCode(currency) ||
    facts.realizedResultCurrency === null ||
    facts.realizedResultDecimal === null
  ) {
    return {
      ...facts,
      displayAttribution: null,
      displayRateTrust: [],
      realizedResultCurrency: null,
      realizedResultDecimal: null,
    };
  }
  const amountCurrency = facts.realizedResultCurrency;
  const convert = (amountDecimal: string): string | null => {
    if (currency === amountCurrency) return amountDecimal;
    if (
      toDisplayReference(
        amountCurrency,
        "display_purchase_currency",
        currentRates
      ) === null ||
      toDisplayReference(
        currency,
        "display_preferred_currency",
        currentRates
      ) === null
    )
      return null;
    return currentRates === undefined
      ? null
      : convertSoldAmountForPreferredDisplay({
          amountCurrency,
          amountDecimal,
          currentRates,
          preferredCurrency: currency,
        });
  };
  const result = convert(facts.realizedResultDecimal);
  return {
    ...facts,
    realizedResultCurrency: result === null ? null : currency,
    realizedResultDecimal: result,
    displayRateTrust:
      result === null || currency === amountCurrency
        ? []
        : [amountCurrency, currency].flatMap(
            (consumedCurrency): MetalDisplayRateTrust[] => {
              const rate = currentRates?.currencies.get(consumedCurrency);
              return consumedCurrency === "USD" || rate === undefined
                ? []
                : [
                    {
                      currency: consumedCurrency,
                      state: rate.state,
                      providerObservedAt: rate.providerObservedAt,
                      ageMs: rate.ageMs,
                      source: rate.source ?? null,
                      quality: rate.quality ?? null,
                    },
                  ];
            }
          ),
    displayAttribution:
      result === null
        ? null
        : buildDisplayBreakdown(facts, currency, currentRates),
  };
}

function buildDisplayBreakdown(
  facts: MetalSoldTerminalFacts,
  currency: MetalsIsoCurrencyCode,
  currentRates: LiveRatesTrustReadModel | undefined
): RoundedAttribution | null {
  const breakdown = facts.canonicalAttribution?.breakdown;
  const decimalPlaces = resolveMetalsCurrencyMinorUnits(`currency:${currency}`);
  if (
    breakdown === undefined ||
    !breakdown.available ||
    decimalPlaces === null ||
    facts.realizedResultCurrency === null ||
    facts.realizedResultDecimal === null
  )
    return null;
  const result = convertAttributionForDisplay({
    canonicalCurrencyInstrumentCode: `currency:${facts.realizedResultCurrency}`,
    preferredCurrencyInstrumentCode: `currency:${currency}`,
    attribution: {
      available: true,
      value: {
        combinedDecimal: facts.realizedResultDecimal,
        components: breakdown.value.components,
      },
    },
    canonicalCurrencyAtDisplayRate: toDisplayReference(
      facts.realizedResultCurrency,
      "display_purchase_currency",
      currentRates
    ),
    preferredCurrencyAtDisplayRate: toDisplayReference(
      currency,
      "display_preferred_currency",
      currentRates
    ),
    decimalPlaces,
  });
  return result.available ? result.value : null;
}

function toDisplayReference(
  currency: MetalsIsoCurrencyCode,
  role: "display_purchase_currency" | "display_preferred_currency",
  rates: LiveRatesTrustReadModel | undefined
): ExactRateReference | null {
  const rate = rates?.currencies.get(currency);
  if (
    currency !== "USD" &&
    (rate === undefined ||
      rate.state === "missing" ||
      rate.state === "invalid" ||
      rate.capturedAt === null ||
      rate.capturedAt === undefined)
  )
    return null;
  const instrumentCode = `currency:${currency}` as const;
  const result = validateAndNormalizeRateReference(
    {
      capturedAt: rate?.capturedAt?.getTime() ?? 0,
      capturedFreshness: rate?.state ?? "unknown",
      instrumentCode,
      kind: "currency",
      orientation: "quote_per_base",
      providerObservedAt: rate?.providerObservedAt?.getTime() ?? null,
      quality: currency === "USD" ? "valid" : rate?.quality,
      role,
      source: rate?.source ?? null,
      unit: "usd_per_currency_unit",
      valueDecimal: currency === "USD" ? "1" : rate?.valueDecimal,
    },
    { role, instrumentCode }
  );
  return result.available ? result.value : null;
}
