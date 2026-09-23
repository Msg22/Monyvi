import i18next from "i18next";

import arCommon from "@/locales/ar/common.json";
import enCommon from "@/locales/en/common.json";
import { buildLiveRatesScreenReadModel } from "@/services/live-rates-screen-read-model-service";
import { selectMarketRateSnapshot } from "@/services/market-rate-snapshot-read-model-service";
import { completeFixtureA } from "../fixtures/market-rate-snapshot";

const NOW_MS = Date.parse("2026-09-09T11:00:00.000Z");

beforeAll(async () => {
  await i18next.init({
    resources: {
      en: { common: enCommon },
      ar: { common: arCommon },
    },
    lng: "en",
    fallbackLng: "en",
    ns: "common",
    defaultNS: "common",
    interpolation: { escapeValue: false },
  });
});

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

  it.each([
    {
      locale: "en-GB",
      expectedMetalPrefix: "EGP ",
      expectedCurrencySuffix: " EGP",
    },
    {
      locale: "ar-EG",
      expectedMetalSuffix: " جنيه مصري",
      expectedCurrencySuffix: " جنيه مصري",
    },
  ])(
    "localizes complete monetary values for $locale",
    ({
      locale,
      expectedMetalPrefix,
      expectedMetalSuffix,
      expectedCurrencySuffix,
    }): void => {
      const fixture = completeFixtureA();
      const selectedSnapshot = selectMarketRateSnapshot(
        fixture.roots,
        fixture.observations,
        NOW_MS
      );
      expect(selectedSnapshot).not.toBeNull();

      const result = buildLiveRatesScreenReadModel({
        locale,
        preferredCurrency: "EGP",
        previousDayRate: null,
        selectedSnapshot,
        translateRelativeTime: (key): string => key,
      });

      expect(result.metals).not.toHaveProperty("currencySymbol");
      expect(result.metals.price24k).toEqual(
        expect.stringMatching(
          expectedMetalPrefix
            ? new RegExp(`^${expectedMetalPrefix}`)
            : new RegExp(`${expectedMetalSuffix}$`)
        )
      );
      expect(result.currencies[0]?.rate).toEqual(
        expect.stringMatching(new RegExp(`${expectedCurrencySuffix}$`))
      );
      if (locale === "ar-EG") {
        expect(result.metals.price24k).toMatch(/[٠-٩]/u);
        expect(result.currencies[0]?.rate).toMatch(/[٠-٩]/u);
      }
    }
  );
});
