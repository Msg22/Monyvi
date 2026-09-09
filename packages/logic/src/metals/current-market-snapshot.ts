import { SUPPORTED_CURRENCIES } from "../utils/currency-data";
import {
  isSupportedMetalsIsoCurrencyCode,
  type CurrencyInstrumentCode,
  type MetalInstrumentCode,
  type MetalsIsoCurrencyCode,
} from "./rate-reference";
import {
  parseCanonicalDecimal,
  serializeDecimal,
  type ExactDecimalValue,
} from "./decimal";
import type { Availability } from "./valuation";

export type CurrentMarketInstrument =
  | MetalInstrumentCode
  | CurrencyInstrumentCode;

export interface CurrentMarketSnapshotObservationInput {
  readonly instrumentCode: string;
  readonly valueDecimal: string | null;
  readonly unit: string | null;
  readonly orientation: string | null;
  readonly providerObservedAt: string | number | Date | null;
  readonly source: string | null;
  readonly quality: string | null;
  readonly capturedAt: string | number | Date | null;
}

export interface CurrentMarketRate {
  readonly instrumentCode: CurrentMarketInstrument;
  readonly valueDecimal: string;
  readonly normalizedUsdPerBaseDecimal: string;
  readonly unit: "usd_per_pure_gram" | "usd_per_currency_unit";
  readonly orientation: "quote_per_base";
  readonly providerObservedAt: Date | null;
  readonly source: string;
  readonly quality: "valid";
}

export type CurrentMarketSnapshotValidation =
  | {
      readonly available: true;
      readonly rates: ReadonlyMap<CurrentMarketInstrument, CurrentMarketRate>;
    }
  | { readonly available: false; readonly reasons: readonly string[] };

export interface ConvertCurrentAmountInput {
  readonly amountDecimal: string;
  readonly fromCurrency: MetalsIsoCurrencyCode;
  readonly toCurrency: MetalsIsoCurrencyCode;
  readonly rates: ReadonlyMap<CurrentMarketInstrument, CurrentMarketRate>;
}

const POSITIVE_PLAIN_DECIMAL = /^(?=.*[1-9])(?:0|[1-9]\d*)(?:\.\d+)?$/;
const CANONICAL_SIGNED_DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

const REQUIRED_CURRENCY_INSTRUMENT_CODES: readonly CurrencyInstrumentCode[] =
  SUPPORTED_CURRENCIES.flatMap(({ code }): CurrencyInstrumentCode[] =>
    isSupportedMetalsIsoCurrencyCode(code) ? [`currency:${code}`] : []
  );

const REQUIRED_INSTRUMENT_CODES: readonly CurrentMarketInstrument[] = [
  "metal:GOLD",
  "metal:SILVER",
  ...REQUIRED_CURRENCY_INSTRUMENT_CODES,
];

const REQUIRED_INSTRUMENT_CODE_SET: ReadonlySet<string> = new Set(
  REQUIRED_INSTRUMENT_CODES
);

export function validateCurrentMarketSnapshot(
  observations: readonly CurrentMarketSnapshotObservationInput[]
): CurrentMarketSnapshotValidation {
  const reasons: string[] = [];
  const seen = new Map<string, CurrentMarketSnapshotObservationInput>();

  for (const observation of observations) {
    if (!REQUIRED_INSTRUMENT_CODE_SET.has(observation.instrumentCode)) {
      reasons.push(`unexpected_instrument:${observation.instrumentCode}`);
      continue;
    }
    if (seen.has(observation.instrumentCode)) {
      reasons.push(`duplicate_instrument:${observation.instrumentCode}`);
      continue;
    }
    seen.set(observation.instrumentCode, observation);
  }

  for (const instrumentCode of REQUIRED_INSTRUMENT_CODES) {
    if (!seen.has(instrumentCode)) {
      reasons.push(`missing_instrument:${instrumentCode}`);
    }
  }

  const rates = new Map<CurrentMarketInstrument, CurrentMarketRate>();
  for (const [instrumentCode, observation] of seen) {
    if (!isCurrentMarketInstrumentCode(instrumentCode)) {
      continue;
    }
    const instrument = instrumentCode;
    const invalid = invalidationReasons(instrument, observation);
    if (invalid.length > 0) {
      reasons.push(...invalid);
      continue;
    }
    const rate = buildRate(instrument, observation);
    if (rate === null) {
      reasons.push(`invalid_observation:${instrument}`);
      continue;
    }
    rates.set(instrument, rate);
  }

  if (reasons.length > 0) {
    return { available: false, reasons };
  }
  return { available: true, rates };
}

export function getMetalUsdPerPureGramDecimal(
  rates: ReadonlyMap<CurrentMarketInstrument, CurrentMarketRate>,
  metal: "GOLD" | "SILVER"
): string | null {
  const instrument: MetalInstrumentCode = `metal:${metal}`;
  return rates.get(instrument)?.valueDecimal ?? null;
}

export function getCurrencyUsdPerUnitDecimal(
  rates: ReadonlyMap<CurrentMarketInstrument, CurrentMarketRate>,
  currency: MetalsIsoCurrencyCode
): string | null {
  if (currency === "USD") {
    return "1";
  }
  const instrument: CurrencyInstrumentCode = `currency:${currency}`;
  return rates.get(instrument)?.valueDecimal ?? null;
}

export function convertCurrentAmountExact(
  input: ConvertCurrentAmountInput
): Availability<string, "missing_rate" | "invalid_amount"> {
  const { amountDecimal, fromCurrency, toCurrency, rates } = input;

  if (!CANONICAL_SIGNED_DECIMAL.test(amountDecimal)) {
    return { available: false, reason: "invalid_amount" };
  }

  const fromUsd = getCurrencyUsdPerUnitDecimal(rates, fromCurrency);
  const toUsd = getCurrencyUsdPerUnitDecimal(rates, toCurrency);
  if (fromUsd === null || toUsd === null) {
    return { available: false, reason: "missing_rate" };
  }

  const amount: ExactDecimalValue = parseCanonicalDecimal(amountDecimal);
  const converted = amount.times(fromUsd).dividedBy(toUsd);

  return { available: true, value: serializeDecimal(converted) };
}

function buildRate(
  instrumentCode: CurrentMarketInstrument,
  observation: CurrentMarketSnapshotObservationInput
): CurrentMarketRate | null {
  const isMetal = instrumentCode.startsWith("metal:");
  if (
    typeof observation.valueDecimal !== "string" ||
    typeof observation.source !== "string" ||
    observation.source.trim().length === 0
  ) {
    return null;
  }

  return Object.freeze({
    instrumentCode,
    valueDecimal: observation.valueDecimal,
    normalizedUsdPerBaseDecimal: observation.valueDecimal,
    unit: isMetal ? "usd_per_pure_gram" : "usd_per_currency_unit",
    orientation: "quote_per_base",
    providerObservedAt: normalizeProviderObservedAt(
      observation.providerObservedAt,
      observation.capturedAt
    ),
    source: observation.source.trim(),
    quality: "valid",
  });
}

function invalidationReasons(
  instrumentCode: CurrentMarketInstrument,
  observation: CurrentMarketSnapshotObservationInput
): string[] {
  const reasons: string[] = [];
  const isMetal = instrumentCode.startsWith("metal:");

  if (!isValidValueForInstrument(instrumentCode, observation.valueDecimal)) {
    reasons.push(`invalid_value:${instrumentCode}`);
  }

  const expectedUnit = isMetal ? "usd_per_pure_gram" : "usd_per_currency_unit";
  if (
    observation.unit !== expectedUnit ||
    observation.orientation !== "quote_per_base"
  ) {
    reasons.push(`invalid_unit:${instrumentCode}`);
  }

  if (observation.quality !== "valid") {
    reasons.push(`invalid_quality:${instrumentCode}`);
  }

  if (
    typeof observation.source !== "string" ||
    observation.source.trim().length === 0
  ) {
    reasons.push(`invalid_source:${instrumentCode}`);
  }

  return reasons;
}

function isValidValueForInstrument(
  instrumentCode: CurrentMarketInstrument,
  valueDecimal: string | null
): boolean {
  if (typeof valueDecimal !== "string") {
    return false;
  }
  if (instrumentCode === "currency:USD") {
    return valueDecimal === "1";
  }
  return POSITIVE_PLAIN_DECIMAL.test(valueDecimal);
}

function normalizeProviderObservedAt(
  providerObservedAt: string | number | Date | null,
  capturedAt: string | number | Date | null
): Date | null {
  if (providerObservedAt === null) {
    return null;
  }

  const observed = toDate(providerObservedAt);
  if (observed === null) {
    return null;
  }

  const ceiling = capturedAt === null ? null : toDate(capturedAt);
  if (ceiling !== null && observed.getTime() > ceiling.getTime()) {
    return null;
  }

  return observed;
}

function toDate(value: string | number | Date): Date | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? new Date(value) : null;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

export const CURRENT_MARKET_INSTRUMENT_CODES = REQUIRED_INSTRUMENT_CODES;

export function isCurrentMarketInstrumentCode(
  code: unknown
): code is CurrentMarketInstrument {
  return typeof code === "string" && REQUIRED_INSTRUMENT_CODE_SET.has(code);
}

export function isSupportedCurrentCurrencyInstrumentCode(
  code: unknown
): code is CurrencyInstrumentCode {
  return (
    typeof code === "string" &&
    code.startsWith("currency:") &&
    isSupportedMetalsIsoCurrencyCode(code.slice("currency:".length))
  );
}
