// Keep aligned with private.market_rate_snapshot_required_instruments_v1().
const MARKET_RATE_OBSERVATION_DEFINITIONS = Object.freeze([
  Object.freeze({
    field: "gold_usd_per_gram",
    instrumentCode: "metal:GOLD",
    label: "gold",
    unit: "usd_per_pure_gram",
  }),
  Object.freeze({
    field: "silver_usd_per_gram",
    instrumentCode: "metal:SILVER",
    label: "silver",
    unit: "usd_per_pure_gram",
  }),
  ...[
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
    "USD",
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
  ].map((currencyCode) =>
    Object.freeze({
      field:
        currencyCode === "USD" ? null : `${currencyCode.toLowerCase()}_usd`,
      instrumentCode: `currency:${currencyCode}`,
      label: `display-${currencyCode.toLowerCase()}`,
      unit: "usd_per_currency_unit",
      valueDecimal: currencyCode === "USD" ? "1" : null,
    })
  ),
]);

function buildMarketRateObservations({
  createdAt,
  deterministicUuid,
  marketRate,
  observationIdKey,
  providerObservedAt,
  seedScope,
  source,
  userId,
}) {
  return MARKET_RATE_OBSERVATION_DEFINITIONS.flatMap((definition) => {
    const value =
      definition.valueDecimal ??
      (definition.field == null ? null : marketRate[definition.field]);
    if (value == null) return [];

    return [
      {
        id: deterministicUuid(seedScope, userId, observationIdKey(definition)),
        batch_id: marketRate.id,
        instrument_code: definition.instrumentCode,
        value_decimal: String(value),
        unit: definition.unit,
        orientation: "quote_per_base",
        provider_observed_at: providerObservedAt,
        source,
        quality: "valid",
        created_at: createdAt,
      },
    ];
  });
}

module.exports = {
  MARKET_RATE_OBSERVATION_DEFINITIONS,
  buildMarketRateObservations,
};
