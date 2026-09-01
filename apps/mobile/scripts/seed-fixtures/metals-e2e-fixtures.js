const FIXED_NOW = "2026-08-31T10:15:30.123Z";
const STALE_RATE_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const METALS_PROFILE_NAMES = Object.freeze([
  "metals-fresh-local-en-light",
  "metals-stale-restart-ar-dark",
  "metals-unknown-conflict-en-dark",
  "metals-missing-local-ar-light",
]);

function buildMetalsCleanupRows() {
  return ({ deterministicUuid, userId }) => ({
    marketRateObservations: METALS_PROFILE_NAMES.map((name) => ({
      id: deterministicUuid(`e2e-${name}`, userId, "metals:rate"),
    })),
  });
}

function buildMetalsRows(scenario) {
  return ({ currentTimestamp, deterministicUuid, seedScope, userId }) => {
    const holdingId = deterministicUuid(seedScope, userId, "metals:holding");
    const stateId = deterministicUuid(
      seedScope,
      userId,
      "metals:holding-state"
    );
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
          id: stateId,
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
      marketRateObservations:
        scenario.rateState === "missing"
          ? []
          : [
              {
                id: deterministicUuid(seedScope, userId, "metals:rate"),
                batch_id: deterministicUuid(
                  seedScope,
                  userId,
                  "metals:rate-batch"
                ),
                instrument_code: "metal:GOLD",
                value_decimal: "75.25",
                unit: "usd_per_pure_gram",
                orientation: "quote_per_base",
                provider_observed_at:
                  scenario.rateState === "stale"
                    ? new Date(
                        Date.parse(currentTimestamp) - STALE_RATE_AGE_MS
                      ).toISOString()
                    : scenario.rateState === "unknown"
                      ? null
                      : currentTimestamp,
                source: "e2e_fixture",
                quality: "valid",
                created_at: currentTimestamp,
              },
            ],
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
});

module.exports = { METALS_E2E_FIXTURES, METALS_PROFILE_NAMES };
