import Decimal from "decimal.js";
import { LosslessNumber, parse } from "lossless-json";

import {
  SUPPORTED_FIAT_CURRENCY_CODES,
  TRUSTED_PRODUCER_SOURCE,
  normalizeDecimalToken,
} from "./market-rate-snapshot-contract.ts";

export type HistoricalMetalRateContractErrorCode =
  | "date_unavailable"
  | "invalid_provider_shape"
  | "invalid_rate";

export class HistoricalMetalRateContractError extends Error {
  public constructor(
    public readonly code: HistoricalMetalRateContractErrorCode,
    message?: string
  ) {
    super(message ?? code);
    this.name = "HistoricalMetalRateContractError";
  }
}

export interface HistoricalDailyRateRecordPayload {
  readonly contractVersion: 1;
  readonly providerKey: string;
  readonly rateDate: string;
  readonly resolution: "daily";
  readonly goldUsdPerTroyOunceDecimal: string;
  readonly silverUsdPerTroyOunceDecimal: string;
  readonly goldUsdPerPureGramDecimal: string;
  readonly silverUsdPerPureGramDecimal: string;
  readonly currenciesUsdPerUnit: Readonly<Record<string, string>>;
  readonly providerResponseTimestamp: string | null;
  readonly fetchedAt: string;
  readonly responseDigest: string;
  readonly source: string;
  readonly quality: "valid";
}

export interface BuildHistoricalDailyRateRecordInput {
  readonly rawResponseText: string;
  readonly requestedDate: string;
  readonly fetchedAt: string;
  readonly responseDigest: string;
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i;
const POSITIVE_PLAIN_DECIMAL = /^(?=.*[1-9])(?:0|[1-9]\d*)(?:\.\d+)?$/;
const TROY_OUNCE_GRAMS_DECIMAL = "31.1034768";
const HistoricalDecimal = Decimal.clone({
  precision: 50,
  rounding: Decimal.ROUND_HALF_EVEN,
});

export function buildHistoricalDailyRateRecord(
  input: BuildHistoricalDailyRateRecordInput
): HistoricalDailyRateRecordPayload {
  if (
    !isExactCalendarDate(input.requestedDate) ||
    !isTimestamp(input.fetchedAt) ||
    !SHA256_HEX_PATTERN.test(input.responseDigest)
  ) {
    throw new HistoricalMetalRateContractError("invalid_provider_shape");
  }

  const document = requireRecord(parseProviderJson(input.rawResponseText));
  if (
    document["status"] !== "success" ||
    document["currency"] !== "USD" ||
    document["unit"] !== "toz" ||
    document["start_date"] !== input.requestedDate ||
    document["end_date"] !== input.requestedDate
  ) {
    throw new HistoricalMetalRateContractError("invalid_provider_shape");
  }

  const rates = requireRecord(document["rates"]);
  const rateKeys = Object.keys(rates);
  if (
    rateKeys.length !== 1 ||
    rateKeys[0] !== input.requestedDate ||
    !(input.requestedDate in rates)
  ) {
    throw new HistoricalMetalRateContractError("date_unavailable");
  }

  const dated = requireRecord(rates[input.requestedDate]);
  if (dated["date"] !== input.requestedDate) {
    throw new HistoricalMetalRateContractError("date_unavailable");
  }

  const metals = requireRecord(dated["metals"]);
  const currencies = requireRecord(dated["currencies"]);
  const goldPerTroyOunce = extractPositiveRate(metals["gold"]);
  const silverPerTroyOunce = extractPositiveRate(metals["silver"]);
  const currencyRates: Record<string, string> = {};

  for (const code of SUPPORTED_FIAT_CURRENCY_CODES) {
    if (!(code in currencies)) continue;
    currencyRates[code] = extractPositiveRate(currencies[code]);
  }
  if (currencyRates["USD"] === undefined) {
    throw new HistoricalMetalRateContractError("invalid_provider_shape");
  }
  if (!new HistoricalDecimal(currencyRates["USD"]).minus(1).isZero()) {
    throw new HistoricalMetalRateContractError("invalid_rate");
  }
  currencyRates["USD"] = "1";

  const providerResponseTimestamp = normalizeOptionalTimestamp(
    document["timestamp"]
  );

  return Object.freeze({
    contractVersion: 1,
    providerKey: TRUSTED_PRODUCER_SOURCE,
    rateDate: input.requestedDate,
    resolution: "daily",
    goldUsdPerTroyOunceDecimal: goldPerTroyOunce,
    silverUsdPerTroyOunceDecimal: silverPerTroyOunce,
    goldUsdPerPureGramDecimal: toUsdPerPureGram(goldPerTroyOunce),
    silverUsdPerPureGramDecimal: toUsdPerPureGram(silverPerTroyOunce),
    currenciesUsdPerUnit: Object.freeze(currencyRates),
    providerResponseTimestamp,
    fetchedAt: input.fetchedAt,
    responseDigest: input.responseDigest.toLowerCase(),
    source: TRUSTED_PRODUCER_SOURCE,
    quality: "valid",
  });
}

function toUsdPerPureGram(valueDecimal: string): string {
  const result = new HistoricalDecimal(valueDecimal).dividedBy(
    TROY_OUNCE_GRAMS_DECIMAL
  );
  const plain = result.toSignificantDigits(50).toFixed();
  if (!POSITIVE_PLAIN_DECIMAL.test(plain)) {
    throw new HistoricalMetalRateContractError("invalid_rate");
  }
  return plain;
}

function extractPositiveRate(value: unknown): string {
  if (!(value instanceof LosslessNumber)) {
    throw new HistoricalMetalRateContractError("invalid_rate");
  }
  let normalized: string;
  try {
    normalized = normalizeDecimalToken(String(value));
  } catch {
    throw new HistoricalMetalRateContractError("invalid_rate");
  }
  if (!POSITIVE_PLAIN_DECIMAL.test(normalized)) {
    throw new HistoricalMetalRateContractError("invalid_rate");
  }
  return normalized;
}

function parseProviderJson(text: string): unknown {
  try {
    return parse(text);
  } catch {
    throw new HistoricalMetalRateContractError("invalid_provider_shape");
  }
}

function normalizeOptionalTimestamp(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !isTimestamp(value)) {
    throw new HistoricalMetalRateContractError("invalid_provider_shape");
  }
  return value;
}

function isTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function isExactCalendarDate(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) return false;
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HistoricalMetalRateContractError("invalid_provider_shape");
  }
  return value as Record<string, unknown>;
}
