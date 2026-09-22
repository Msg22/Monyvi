import i18next from "i18next";

import type { MarketRate } from "@monyvi/db";

import arCommon from "@/locales/ar/common.json";
import arTransactions from "@/locales/ar/transactions.json";
import enCommon from "@/locales/en/common.json";
import enTransactions from "@/locales/en/transactions.json";
import { formatLocalizedConversionPreview } from "@/utils/localized-conversion-preview";

function createStandardRates(): MarketRate {
  return {
    egpUsd: 1 / 49.7,
    eurUsd: 1 / 0.92,
  } as unknown as MarketRate;
}

const STANDARD_RATES = createStandardRates();

async function initI18n(language: "en" | "ar"): Promise<void> {
  await i18next.init({
    resources: {
      en: { common: enCommon, transactions: enTransactions },
      ar: { common: arCommon, transactions: arTransactions },
    },
    lng: language,
    fallbackLng: "en",
    ns: ["common", "transactions"],
    defaultNS: "transactions",
    interpolation: { escapeValue: false },
  });
}

describe("localized conversion preview", () => {
  beforeAll(async () => {
    await initI18n("en");
  });

  afterEach(async () => {
    await i18next.changeLanguage("en");
  });

  it("preserves the existing English preview", () => {
    expect(
      formatLocalizedConversionPreview({
        amount: 100,
        fromCurrency: "USD",
        toCurrency: "EGP",
        rates: STANDARD_RATES,
        language: "en",
      })
    ).toBe("≈ 4,970.00 EGP at rate 1 USD = 49.70 EGP");
  });

  it("localizes both converted amount and rate in Arabic", () => {
    const preview = formatLocalizedConversionPreview({
      amount: 100,
      fromCurrency: "USD",
      toCurrency: "EGP",
      rates: STANDARD_RATES,
      language: "ar",
    });

    expect(preview).toBe(
      "≈ ٤٬٩٧٠٫٠٠ جنيه مصري بسعر ١ دولار أمريكي = ٤٩٫٧٠ جنيه مصري"
    );
    expect(preview).not.toMatch(/USD|EGP|[0-9]/u);
  });

  it("localizes same-currency and unavailable states", () => {
    expect(
      formatLocalizedConversionPreview({
        amount: 100,
        fromCurrency: "EGP",
        toCurrency: "EGP",
        rates: STANDARD_RATES,
        language: "ar",
      })
    ).toBe("١٠٠٫٠٠ جنيه مصري");

    expect(
      formatLocalizedConversionPreview({
        amount: 100,
        fromCurrency: "USD",
        toCurrency: "EGP",
        rates: null,
        language: "ar",
      })
    ).toBe("سعر الصرف غير متاح");
  });

  it("recomputes from the active runtime language", async () => {
    await i18next.changeLanguage("en");
    const english = formatLocalizedConversionPreview({
      amount: 1,
      fromCurrency: "USD",
      toCurrency: "EGP",
      rates: STANDARD_RATES,
    });

    await i18next.changeLanguage("ar");
    const arabic = formatLocalizedConversionPreview({
      amount: 1,
      fromCurrency: "USD",
      toCurrency: "EGP",
      rates: STANDARD_RATES,
    });

    expect(english).toBe("≈ 49.70 EGP at rate 1 USD = 49.70 EGP");
    expect(arabic).toBe(
      "≈ ٤٩٫٧٠ جنيه مصري بسعر ١ دولار أمريكي = ٤٩٫٧٠ جنيه مصري"
    );
  });
});
