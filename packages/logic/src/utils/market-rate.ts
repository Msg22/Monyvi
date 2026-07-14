import type { CurrencyType, MarketRate } from "@monyvi/db";

type NonUsdCurrency = Exclude<CurrencyType, "USD">;
type CurrencyRateField = Extract<keyof MarketRate, `${string}Usd`>;

export const CURRENCY_RATE_FIELD_BY_CURRENCY = {
  EGP: "egpUsd",
  SAR: "sarUsd",
  AED: "aedUsd",
  KWD: "kwdUsd",
  QAR: "qarUsd",
  BHD: "bhdUsd",
  OMR: "omrUsd",
  JOD: "jodUsd",
  IQD: "iqdUsd",
  LYD: "lydUsd",
  TND: "tndUsd",
  MAD: "madUsd",
  DZD: "dzdUsd",
  EUR: "eurUsd",
  GBP: "gbpUsd",
  JPY: "jpyUsd",
  CHF: "chfUsd",
  CNY: "cnyUsd",
  INR: "inrUsd",
  KRW: "krwUsd",
  KPW: "kpwUsd",
  SGD: "sgdUsd",
  HKD: "hkdUsd",
  MYR: "myrUsd",
  AUD: "audUsd",
  NZD: "nzdUsd",
  CAD: "cadUsd",
  SEK: "sekUsd",
  NOK: "nokUsd",
  DKK: "dkkUsd",
  ISK: "iskUsd",
  TRY: "tryUsd",
  RUB: "rubUsd",
  ZAR: "zarUsd",
  BTC: "btcUsd",
} as const satisfies Record<NonUsdCurrency, CurrencyRateField>;

const METAL_RATE_MODEL_FIELDS = [
  "goldUsdPerGram",
  "silverUsdPerGram",
  "platinumUsdPerGram",
  "palladiumUsdPerGram",
] as const;

export const MARKET_RATE_MODEL_VALUE_FIELDS = [
  ...Object.values(CURRENCY_RATE_FIELD_BY_CURRENCY),
  ...METAL_RATE_MODEL_FIELDS,
] as const;

function camelCaseToSnakeCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export const MARKET_RATE_VALUE_COLUMNS: readonly string[] = [
  ...MARKET_RATE_MODEL_VALUE_FIELDS.map(camelCaseToSnakeCase),
];

export class InvalidMarketRateError extends Error {
  constructor(currency: CurrencyType, value: unknown) {
    super(`Invalid USD market rate for ${currency}`);
    this.name = "InvalidMarketRateError";
    this.currency = currency;
    this.value = value;
  }

  readonly currency: CurrencyType;
  readonly value: unknown;
}

export function getCurrencyUsdValue(
  rates: MarketRate,
  currency: CurrencyType
): number {
  if (currency === "USD") {
    return 1;
  }

  const field = CURRENCY_RATE_FIELD_BY_CURRENCY[currency];
  const value = rates[field];

  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new InvalidMarketRateError(currency, value);
  }

  return value;
}

export function getCurrencyRate(
  rates: MarketRate,
  fromCurrency: CurrencyType,
  toCurrency: CurrencyType
): number {
  if (fromCurrency === toCurrency) {
    return 1;
  }

  const fromUsd = getCurrencyUsdValue(rates, fromCurrency);
  const toUsd = getCurrencyUsdValue(rates, toCurrency);
  return fromUsd / toUsd;
}

export function assertValidMarketRateRecord(
  record: Readonly<Record<string, unknown>>
): void {
  for (const column of MARKET_RATE_VALUE_COLUMNS) {
    const value = record[column];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw new Error(`INVALID_MARKET_RATE:${column}`);
    }
  }
}

export function assertValidMarketRateModel(rates: MarketRate): void {
  for (const field of MARKET_RATE_MODEL_VALUE_FIELDS) {
    const value = rates[field];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw new Error(`INVALID_MARKET_RATE:${field}`);
    }
  }
}
