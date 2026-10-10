import {
  HISTORICAL_RATE_CALENDAR_TIME_ZONE,
  calculateHistoricalPurchaseEstimateDecimal,
  calculateHistoricalPurityGramPriceDecimal,
  calendarDateForTimestamp,
  normalizeHistoricalMetalTroyOunceToPureGramDecimal,
  parseHistoricalDailyRateRecord,
  qualifyTimestampedAcquisitionRatePair,
  selectHistoricalDailyRatePair,
  type HistoricalDailyRateRecord,
} from "../historical-rate";

const CAPTURED_AT = Date.parse("2026-10-10T12:00:00.000Z");

function actionReference(
  role: "acquisition_metal" | "acquisition_purchase_currency",
  instrumentCode: "metal:GOLD" | "metal:SILVER" | "currency:EGP" | "currency:USD",
  valueDecimal: string,
  providerObservedAt: string,
  source: string = "metals.dev"
): Readonly<Record<string, unknown>> {
  const isMetal = role === "acquisition_metal";
  return {
    role,
    kind: isMetal ? "metal" : "currency",
    instrumentCode,
    valueDecimal,
    unit: isMetal ? "usd_per_pure_gram" : "usd_per_currency_unit",
    orientation: "quote_per_base",
    providerObservedAt: Date.parse(providerObservedAt),
    source,
    quality: "valid",
    capturedAt: CAPTURED_AT,
    capturedFreshness: "fresh",
  };
}

function dailyRecord(
  overrides: Partial<HistoricalDailyRateRecord> = {}
): HistoricalDailyRateRecord {
  const goldToz = "1932.1234567890123456789";
  const silverToz = "23.4567890123456789";
  return {
    contractVersion: 1,
    providerKey: "metals.dev",
    rateDate: "2026-10-10",
    resolution: "daily",
    goldUsdPerTroyOunceDecimal: goldToz,
    silverUsdPerTroyOunceDecimal: silverToz,
    goldUsdPerPureGramDecimal:
      normalizeHistoricalMetalTroyOunceToPureGramDecimal(goldToz) ?? "",
    silverUsdPerPureGramDecimal:
      normalizeHistoricalMetalTroyOunceToPureGramDecimal(silverToz) ?? "",
    currenciesUsdPerUnit: { USD: "1", EGP: "0.02", EUR: "1.1" },
    providerResponseTimestamp: null,
    fetchedAt: "2026-10-10T15:00:00.000Z",
    responseDigest:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    source: "metals.dev",
    quality: "valid",
    ...overrides,
  };
}

describe("historical metal rate contract", () => {
  it("maps provider timestamps to the approved Africa/Cairo purchase calendar", () => {
    expect(HISTORICAL_RATE_CALENDAR_TIME_ZONE).toBe("Africa/Cairo");
    expect(
      calendarDateForTimestamp(Date.parse("2026-10-09T21:30:00.000Z"))
    ).toBe("2026-10-10");
    expect(
      calendarDateForTimestamp(Date.parse("2026-10-10T21:30:00.000Z"))
    ).toBe("2026-10-11");
  });

  it("qualifies only a complete same-Cairo-day Add-time action pair", () => {
    const pair = qualifyTimestampedAcquisitionRatePair({
      purchaseDate: "2026-10-10",
      metal: "GOLD",
      purchaseCurrency: "EGP",
      metalReference: actionReference(
        "acquisition_metal",
        "metal:GOLD",
        "62.12",
        "2026-10-10T08:00:00.000Z"
      ),
      currencyReference: actionReference(
        "acquisition_purchase_currency",
        "currency:EGP",
        "0.02",
        "2026-10-10T08:05:00.000Z"
      ),
    });

    expect(pair).toEqual(
      expect.objectContaining({
        origin: "action_observation",
        rateDate: "2026-10-10",
        metalUsdPerPureGramDecimal: "62.12",
        purchaseCurrencyUsdPerUnitDecimal: "0.02",
      })
    );
  });

  it.each([
    ["older metal", "2026-10-09T08:00:00.000Z", "2026-10-10T08:00:00.000Z"],
    ["later FX", "2026-10-10T08:00:00.000Z", "2026-10-11T08:00:00.000Z"],
  ])("rejects %s instead of relabeling a mixed-date pair", (_label, metalAt, fxAt) => {
    expect(
      qualifyTimestampedAcquisitionRatePair({
        purchaseDate: "2026-10-10",
        metal: "GOLD",
        purchaseCurrency: "EGP",
        metalReference: actionReference(
          "acquisition_metal",
          "metal:GOLD",
          "62.12",
          metalAt
        ),
        currencyReference: actionReference(
          "acquisition_purchase_currency",
          "currency:EGP",
          "0.02",
          fxAt
        ),
      })
    ).toBeNull();
  });

  it("rejects missing provider observation time even when capture day matches", () => {
    const metal = {
      ...actionReference(
        "acquisition_metal",
        "metal:GOLD",
        "62.12",
        "2026-10-10T08:00:00.000Z"
      ),
      providerObservedAt: null,
      capturedFreshness: "unknown",
    };
    expect(
      qualifyTimestampedAcquisitionRatePair({
        purchaseDate: "2026-10-10",
        metal: "GOLD",
        purchaseCurrency: "EGP",
        metalReference: metal,
        currencyReference: actionReference(
          "acquisition_purchase_currency",
          "currency:EGP",
          "0.02",
          "2026-10-10T08:05:00.000Z"
        ),
      })
    ).toBeNull();
  });

  it("converts troy-ounce tokens with exact Decimal arithmetic", () => {
    expect(
      normalizeHistoricalMetalTroyOunceToPureGramDecimal(
        "1932.1234567890123456789"
      )
    ).toBe(
      "62.119211598524970870102213139079036977628173066491"
    );
  });

  it("selects only the literal requested daily key and required FX", () => {
    const pair = selectHistoricalDailyRatePair({
      record: dailyRecord(),
      purchaseDate: "2026-10-10",
      metal: "SILVER",
      purchaseCurrency: "EGP",
    });
    expect(pair).toEqual(
      expect.objectContaining({
        origin: "daily_history",
        purchaseCurrency: "EGP",
        rateDate: "2026-10-10",
      })
    );
    expect(
      selectHistoricalDailyRatePair({
        record: dailyRecord(),
        purchaseDate: "2026-10-09",
        metal: "SILVER",
        purchaseCurrency: "EGP",
      })
    ).toBeNull();
    expect(
      selectHistoricalDailyRatePair({
        record: dailyRecord({ currenciesUsdPerUnit: { USD: "1" } }),
        purchaseDate: "2026-10-10",
        metal: "SILVER",
        purchaseCurrency: "EGP",
      })
    ).toBeNull();
  });

  it("keeps historical gold-999 on the stored 0.999 factor instead of the current-quote exception", () => {
    const pair = selectHistoricalDailyRatePair({
      record: dailyRecord({
        goldUsdPerTroyOunceDecimal: "3110.34768",
        goldUsdPerPureGramDecimal: "100",
        currenciesUsdPerUnit: { USD: "1" },
      }),
      purchaseDate: "2026-10-10",
      metal: "GOLD",
      purchaseCurrency: "USD",
    });
    expect(pair).not.toBeNull();
    if (!pair) return;

    expect(
      calculateHistoricalPurityGramPriceDecimal({
        purityFactorDecimal: "0.999",
        pair,
      })
    ).toBe("99.9");
    expect(
      calculateHistoricalPurchaseEstimateDecimal({
        weightGramsDecimal: "10",
        purityFactorDecimal: "0.999",
        pair,
      })
    ).toBe("999");
  });

  it("rejects tampered normalized gram values and non-identity USD", () => {
    expect(
      parseHistoricalDailyRateRecord(
        dailyRecord({ goldUsdPerPureGramDecimal: "999" })
      )
    ).toBeNull();
    expect(
      parseHistoricalDailyRateRecord(
        dailyRecord({ currenciesUsdPerUnit: { USD: "1.01" } })
      )
    ).toBeNull();
  });
});
