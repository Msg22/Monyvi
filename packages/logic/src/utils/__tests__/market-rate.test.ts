import type { CurrencyType, MarketRate } from "@monyvi/db";

import {
  CURRENCY_RATE_FIELD_BY_CURRENCY,
  InvalidMarketRateError,
  MARKET_RATE_MODEL_VALUE_FIELDS,
  MARKET_RATE_VALUE_COLUMNS,
  assertValidMarketRateRecord,
  assertValidMarketRateModel,
  getCurrencyRate,
  getCurrencyUsdValue,
} from "../market-rate";

const SUPPORTED_NON_USD_CURRENCIES: ReadonlyArray<
  Exclude<CurrencyType, "USD">
> = [
  "EGP",
  "SAR",
  "AED",
  "KWD",
  "QAR",
  "BHD",
  "OMR",
  "JOD",
  "IQD",
  "LYD",
  "TND",
  "MAD",
  "DZD",
  "EUR",
  "GBP",
  "JPY",
  "CHF",
  "CNY",
  "INR",
  "KRW",
  "KPW",
  "SGD",
  "HKD",
  "MYR",
  "AUD",
  "NZD",
  "CAD",
  "SEK",
  "NOK",
  "DKK",
  "ISK",
  "TRY",
  "RUB",
  "ZAR",
  "BTC",
];

function createRates(overrides: Partial<MarketRate> = {}): MarketRate {
  const rates: Partial<MarketRate> = {
    egpUsd: 1 / 50,
    eurUsd: 1.1,
    ...overrides,
  };
  return rates as MarketRate;
}

describe("market-rate calculations", () => {
  function createCompleteRates(): MarketRate {
    const values: Partial<MarketRate> = Object.fromEntries(
      MARKET_RATE_MODEL_VALUE_FIELDS.map((field) => [field, 1])
    );
    return values as MarketRate;
  }

  it("maps every supported non-USD currency to exactly one persisted field", () => {
    expect(Object.keys(CURRENCY_RATE_FIELD_BY_CURRENCY).sort()).toEqual(
      [...SUPPORTED_NON_USD_CURRENCIES].sort()
    );
  });

  it("uses an implicit positive USD value", () => {
    expect(getCurrencyUsdValue(createRates(), "USD")).toBe(1);
  });

  it("returns an identity rate for the same currency", () => {
    expect(getCurrencyRate(createRates(), "USD", "USD")).toBe(1);
  });

  it("converts through the USD values stored on the rate record", () => {
    const rates = createRates();

    expect(getCurrencyRate(rates, "USD", "EGP")).toBeCloseTo(50);
    expect(getCurrencyRate(rates, "EGP", "EUR")).toBeCloseTo(1 / 50 / 1.1);
  });

  it.each([
    ["overflow", Number.MAX_VALUE, Number.MIN_VALUE],
    ["underflow", Number.MIN_VALUE, Number.MAX_VALUE],
  ])("rejects a derived exchange-rate %s", (_label, fromUsd, toUsd) => {
    const rates = createRates({ egpUsd: fromUsd, eurUsd: toUsd });

    expect(() => getCurrencyRate(rates, "EGP", "EUR")).toThrow(
      InvalidMarketRateError
    );
  });

  it.each([
    ["missing", undefined],
    ["zero", 0],
    ["negative", -0.5],
    ["NaN", Number.NaN],
    ["positive infinity", Number.POSITIVE_INFINITY],
  ])("throws for a %s persisted rate", (_label, invalidValue) => {
    const rates = createRates({ egpUsd: invalidValue as number });

    expect(() => getCurrencyUsdValue(rates, "EGP")).toThrow(
      InvalidMarketRateError
    );
  });

  it("accepts a complete positive finite cached model", () => {
    expect(() =>
      assertValidMarketRateModel(createCompleteRates())
    ).not.toThrow();
  });

  it("accepts a complete positive finite sync record", () => {
    const record = Object.fromEntries(
      MARKET_RATE_VALUE_COLUMNS.map((column) => [column, 1])
    );

    expect(() => assertValidMarketRateRecord(record)).not.toThrow();
  });

  it("rejects an invalid sync record", () => {
    const record = Object.fromEntries(
      MARKET_RATE_VALUE_COLUMNS.map((column) => [column, 1])
    );
    const invalidRecord = { ...record, egp_usd: 0 };

    expect(() => assertValidMarketRateRecord(invalidRecord)).toThrow(
      "INVALID_MARKET_RATE:egp_usd"
    );
  });

  it("rejects a cached model with an invalid metal value", () => {
    const completeRates = createCompleteRates();
    const invalidRatesPartial: Partial<MarketRate> = {
      ...completeRates,
      goldUsdPerGram: 0,
    };
    const invalidRates = invalidRatesPartial as MarketRate;

    expect(() => assertValidMarketRateModel(invalidRates)).toThrow(
      "INVALID_MARKET_RATE:goldUsdPerGram"
    );
  });
});
