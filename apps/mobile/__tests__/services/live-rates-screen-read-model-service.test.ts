import { buildLiveRatesScreenReadModel } from "@/services/live-rates-screen-read-model-service";
import { selectMarketRateSnapshot } from "@/services/market-rate-snapshot-read-model-service";
import { completeFixtureA } from "../fixtures/market-rate-snapshot";

const NOW_MS = Date.parse("2026-09-09T11:00:00.000Z");

describe("live rates screen read model", () => {
  it("formats rate age when Hermes does not provide Intl.RelativeTimeFormat", () => {
    const originalRelativeTimeFormat = Intl.RelativeTimeFormat;
    Object.defineProperty(Intl, "RelativeTimeFormat", {
      configurable: true,
      value: undefined,
    });

    try {
      const fixture = completeFixtureA();
      const selectedSnapshot = selectMarketRateSnapshot(
        fixture.roots,
        fixture.observations,
        NOW_MS
      );
      expect(selectedSnapshot).not.toBeNull();

      const result = buildLiveRatesScreenReadModel({
        locale: "en-GB",
        preferredCurrency: "EGP",
        previousDayRate: null,
        selectedSnapshot,
        translateRelativeTime: (key, count): string =>
          key === "days_ago" ? `${count} day ago` : key,
      });

      expect(result.rateTrust.currencies.ageText).toBe("1 day ago");
    } finally {
      Object.defineProperty(Intl, "RelativeTimeFormat", {
        configurable: true,
        value: originalRelativeTimeFormat,
      });
    }
  });
});
