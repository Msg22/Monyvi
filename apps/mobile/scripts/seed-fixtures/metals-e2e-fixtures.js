const FIXED_NOW = "2026-08-31T10:15:30.123Z";
const STALE_RATE_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const STALE_BOUNDARY_AGE_MS = 24 * 60 * 60 * 1000 + 1;
const RATE_OBSERVATIONS = Object.freeze([
  Object.freeze({
    instrumentCode: "metal:GOLD",
    label: "gold",
    orientation: "quote_per_base",
    unit: "usd_per_pure_gram",
    valueDecimal: "75.25",
  }),
  Object.freeze({
    instrumentCode: "metal:SILVER",
    label: "silver",
    orientation: "quote_per_base",
    unit: "usd_per_pure_gram",
    valueDecimal: "0.95",
  }),
  Object.freeze({
    instrumentCode: "currency:EGP",
    label: "display-egp",
    orientation: "quote_per_base",
    unit: "usd_per_currency_unit",
    valueDecimal: "0.02",
  }),
]);
const METALS_PROFILE_NAMES = Object.freeze([
  "metals-fresh-local-en-light",
  "metals-stale-restart-ar-dark",
  "metals-stale-boundary-local-en-light",
  "metals-unknown-conflict-en-dark",
  "metals-offline-cached-local-en-light",
  "metals-refresh-failure-cached-local-en-light",
  "metals-missing-local-ar-light",
  "metals-invalid-local-en-light",
]);

function buildMetalsCleanupRows() {
  return ({ deterministicUuid, userId }) => ({
    marketRates: METALS_PROFILE_NAMES.map((name) => ({
      id: deterministicUuid(`e2e-${name}`, userId, "metals:market-rate"),
    })),
    marketRateObservations: METALS_PROFILE_NAMES.flatMap((name) =>
      RATE_OBSERVATIONS.map(({ label }) => ({
        id: deterministicUuid(`e2e-${name}`, userId, `metals:rate:${label}`),
      }))
    ),
  });
}

function buildMetalsRows(scenario) {
  return ({
    currentTimestamp,
    deterministicUuid,
    marketRateTemplate,
    seedScope,
    userId,
  }) => {
    const holdingId = deterministicUuid(seedScope, userId, "metals:holding");
    const providerObservedAt =
      scenario.rateState === "unknown"
        ? null
        : scenario.rateState === "stale"
          ? new Date(
              Date.parse(currentTimestamp) -
                (scenario.isStaleBoundary
                  ? STALE_BOUNDARY_AGE_MS
                  : STALE_RATE_AGE_MS)
            ).toISOString()
          : currentTimestamp;
    const isMissing = scenario.rateState === "missing";
    return {
      assets: [
        {
          id: holdingId,
          user_id: userId,
          type: "METAL",
          name: "E2E Gold Bar",
          purchase_price: 100000,
          purchase_price_decimal: "100000",
          currency: "EGP",
          purchase_currency: "EGP",
          purchase_date: "2026-08-01",
          acquisition_action_id: null,
          notes: null,
          is_liquid: true,
          deleted: false,
          created_at: FIXED_NOW,
          updated_at: currentTimestamp,
        },
      ],
      assetMetals: [
        {
          id: deterministicUuid(seedScope, userId, "metals:details"),
          asset_id: holdingId,
          metal_type: "GOLD",
          weight_grams: 10,
          weight_grams_decimal: "10",
          purity_fraction: 0.999,
          purity_code: "gold-999",
          purity_factor_decimal: "0.999",
          purity_catalog_version: "1",
          item_form: "bar",
          deleted: false,
          created_at: FIXED_NOW,
          updated_at: currentTimestamp,
        },
      ],
      metalHoldingStates: [
        {
          id: holdingId,
          user_id: userId,
          holding_id: holdingId,
          status: "active",
          financial_revision: "0",
          effective_event_id: null,
          effective_action_id: null,
          is_visible: true,
          reconciliation_state:
            scenario.persistenceState === "conflict"
              ? "reconciliation_incomplete"
              : "accepted",
          deleted: false,
          created_at: FIXED_NOW,
          updated_at: currentTimestamp,
        },
      ],
      marketRates: isMissing
        ? []
        : [
            {
              ...marketRateTemplate,
              id: deterministicUuid(seedScope, userId, "metals:market-rate"),
              gold_usd_per_gram: 75.25,
              timestamp_currency: providerObservedAt,
              timestamp_metal: providerObservedAt,
            },
          ],
      marketRateObservations: isMissing
        ? []
        : RATE_OBSERVATIONS.map((rate) => ({
            id: deterministicUuid(
              seedScope,
              userId,
              `metals:rate:${rate.label}`
            ),
            batch_id: deterministicUuid(seedScope, userId, "metals:rate-batch"),
            instrument_code: rate.instrumentCode,
            value_decimal: rate.valueDecimal,
            unit: rate.unit,
            orientation: rate.orientation,
            provider_observed_at: providerObservedAt,
            source: "e2e_fixture",
            quality:
              scenario.rateState === "invalid" && rate.label === "gold"
                ? "invalid"
                : "valid",
            created_at: currentTimestamp,
          })),
    };
  };
}

function createMetalsProfile(name, scenario) {
  return Object.freeze({
    seedScope: `e2e-${name}`,
    userFullName: "Monyvi E2E",
    authLabel: "E2E",
    includeLocalMarketRate: false,
    locale: scenario.locale,
    theme: scenario.theme,
    textScale: scenario.textScale,
    rateState: scenario.rateState,
    cacheState:
      scenario.cacheState ??
      (scenario.rateState === "missing" ? "empty" : "seeded"),
    connectivityState: scenario.connectivityState ?? "online",
    refreshFailureMode: scenario.refreshFailureMode ?? null,
    persistenceState: scenario.persistenceState,
    accountEligibility: scenario.accountEligibility,
    baseAccountCurrency:
      scenario.accountEligibility === "ineligible" ? "USD" : "EGP",
    controls: Object.freeze({ reset: true, inspect: true }),
    buildExtraRows: buildMetalsRows(scenario),
    buildCleanupRows: buildMetalsCleanupRows(),
  });
}

const METALS_E2E_FIXTURES = Object.freeze({
  "metals-fresh-local-en-light": createMetalsProfile(
    "metals-fresh-local-en-light",
    {
      locale: "en",
      theme: "light",
      textScale: 1,
      rateState: "fresh",
      persistenceState: "local",
      accountEligibility: "eligible",
    }
  ),
  "metals-stale-restart-ar-dark": createMetalsProfile(
    "metals-stale-restart-ar-dark",
    {
      locale: "ar",
      theme: "dark",
      textScale: 2,
      rateState: "stale",
      persistenceState: "restart",
      accountEligibility: "eligible",
    }
  ),
  "metals-stale-boundary-local-en-light": createMetalsProfile(
    "metals-stale-boundary-local-en-light",
    {
      locale: "en",
      theme: "light",
      textScale: 1,
      rateState: "stale",
      isStaleBoundary: true,
      persistenceState: "local",
      accountEligibility: "eligible",
    }
  ),
  "metals-unknown-conflict-en-dark": createMetalsProfile(
    "metals-unknown-conflict-en-dark",
    {
      locale: "en",
      theme: "dark",
      textScale: 1,
      rateState: "unknown",
      persistenceState: "conflict",
      accountEligibility: "eligible",
    }
  ),
  "metals-offline-cached-local-en-light": createMetalsProfile(
    "metals-offline-cached-local-en-light",
    {
      locale: "en",
      theme: "light",
      textScale: 1,
      rateState: "fresh",
      persistenceState: "local",
      accountEligibility: "eligible",
      cacheState: "seeded",
      connectivityState: "offline_after_cache",
    }
  ),
  "metals-refresh-failure-cached-local-en-light": createMetalsProfile(
    "metals-refresh-failure-cached-local-en-light",
    {
      locale: "en",
      theme: "light",
      textScale: 1,
      rateState: "fresh",
      persistenceState: "local",
      accountEligibility: "eligible",
      cacheState: "seeded",
      refreshFailureMode: "once",
    }
  ),
  "metals-missing-local-ar-light": createMetalsProfile(
    "metals-missing-local-ar-light",
    {
      locale: "ar",
      theme: "light",
      textScale: 2,
      rateState: "missing",
      persistenceState: "local",
      accountEligibility: "ineligible",
    }
  ),
  "metals-invalid-local-en-light": createMetalsProfile(
    "metals-invalid-local-en-light",
    {
      locale: "en",
      theme: "light",
      textScale: 1,
      rateState: "invalid",
      persistenceState: "local",
      accountEligibility: "eligible",
    }
  ),
});

module.exports = { METALS_E2E_FIXTURES, METALS_PROFILE_NAMES };
