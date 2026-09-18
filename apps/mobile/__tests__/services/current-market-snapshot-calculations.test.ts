import type { CurrencyType } from "@monyvi/db";
import type { CurrentMarketInstrument } from "@monyvi/logic";

import {
  calculateSelectedCurrentAssetBreakdown,
  convertSelectedCurrentAmount,
  convertSelectedCurrentAmountDecimal,
  getSelectedCurrentMetalPrice,
  sumSelectedCurrentAmounts,
} from "@/services/current-market-snapshot-calculations";
import type {
  SelectedCurrentMarketRate,
  SelectedMarketRateSnapshot,
} from "@/services/market-rate-snapshot-read-model-service";

function snapshot(
  values: ReadonlyArray<readonly [CurrentMarketInstrument, string]>
): SelectedMarketRateSnapshot {
  const ratesByInstrument = new Map<
    CurrentMarketInstrument,
    SelectedCurrentMarketRate
  >();
  for (const [instrumentCode, valueDecimal] of values) {
    ratesByInstrument.set(instrumentCode, {
      instrumentCode,
      valueDecimal,
      normalizedUsdPerBaseDecimal: valueDecimal,
      unit: instrumentCode.startsWith("metal:")
        ? "usd_per_pure_gram"
        : "usd_per_currency_unit",
      orientation: "quote_per_base",
      providerObservedAt: new Date("2026-09-10T08:00:00.000Z"),
      source: "test",
      quality: "valid",
      freshness: "fresh",
      ageMs: 0,
    });
  }

  return {
    snapshotId: "snapshot-1",
    capturedAt: new Date("2026-09-10T08:00:00.000Z"),
    ratesByInstrument,
    trust: {
      gold: {
        state: "fresh",
        ageMs: 0,
        providerObservedAt: null,
        source: "test",
      },
      silver: {
        state: "fresh",
        ageMs: 0,
        providerObservedAt: null,
        source: "test",
      },
      currencies: new Map(),
    },
  };
}

const currentSnapshot = snapshot([
  ["currency:EGP", "0.0210523309"],
  ["currency:EUR", "1.171234567890123456789"],
  ["metal:GOLD", "3738.74000000"],
  ["metal:SILVER", "43.73874000"],
]);

describe("selected current market snapshot calculations", () => {
  it("keeps the exact decimal result until the display boundary", () => {
    expect(
      convertSelectedCurrentAmountDecimal({
        amountDecimal: "30000",
        fromCurrency: "EGP",
        toCurrency: "EUR",
        currentSnapshot,
      })
    ).toBe("539.23436373442933411415681171922182143935583334207");

    expect(
      convertSelectedCurrentAmount({
        amount: 30_000,
        fromCurrency: "EGP",
        toCurrency: "EUR",
        currentSnapshot,
      })
    ).toBeCloseTo(539.2343637344293, 10);
  });

  it("returns unavailable when the selected snapshot or a required rate is missing", () => {
    expect(
      convertSelectedCurrentAmount({
        amount: 100,
        fromCurrency: "EGP",
        toCurrency: "USD",
        currentSnapshot: null,
      })
    ).toBeNull();

    expect(
      convertSelectedCurrentAmount({
        amount: 100,
        fromCurrency: "KWD",
        toCurrency: "USD",
        currentSnapshot,
      })
    ).toBeNull();
  });

  it("sums converted amounts exactly before converting to a display number", () => {
    const entries: ReadonlyArray<{
      readonly amount: number;
      readonly currency: CurrencyType;
    }> = [
      { amount: 100, currency: "EGP" },
      { amount: 2, currency: "EUR" },
    ];

    expect(
      sumSelectedCurrentAmounts({
        entries,
        toCurrency: "USD",
        currentSnapshot,
      })
    ).toBeCloseTo(4.447702225780247, 12);
  });

  it("converts exact metal prices through the same selected snapshot", () => {
    expect(
      getSelectedCurrentMetalPrice({
        metal: "GOLD",
        toCurrency: "EGP",
        currentSnapshot,
      })
    ).toBeCloseTo(177592.68642314567, 8);
  });

  it("builds account and metal breakdown values from one exact snapshot", () => {
    const result = calculateSelectedCurrentAssetBreakdown({
      accounts: [
        { balance: 100, currency: "EGP", type: "BANK" },
        { balance: 2, currency: "EUR", type: "CASH" },
      ],
      metals: [
        {
          metalType: "GOLD",
          weightGramsDecimal: "1",
          purityFactorDecimal: "0.999",
        },
      ],
      currentSnapshot,
    });

    expect(result).not.toBeNull();
    expect(result?.bank).toBeCloseTo(2.10523309, 8);
    expect(result?.cash).toBeCloseTo(2.342469135780247, 12);
    expect(result?.metals).toBeCloseTo(3735.00126, 8);
    expect(result?.total).toBeCloseTo(Number("3739.4489622257804"), 8);
  });
});
