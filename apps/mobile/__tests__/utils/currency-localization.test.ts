import i18next from "i18next";

import type { CurrencyType } from "@monyvi/db";
import { CURRENCY_INFO_MAP, SUPPORTED_CURRENCIES } from "@monyvi/logic";

import arCommon from "@/locales/ar/common.json";
import enCommon from "@/locales/en/common.json";
import {
  currencyMatchesQuery,
  getCurrencyName,
} from "@/utils/currency-localization";

const SUPPORTED_CODES = SUPPORTED_CURRENCIES.map((c): CurrencyType => c.code);
const EN_CURRENCY_NAMES: Record<string, string> = enCommon.currency_names;
const AR_CURRENCY_NAMES: Record<string, string> = arCommon.currency_names;

async function initI18n(language: "en" | "ar"): Promise<void> {
  await i18next.init({
    resources: {
      en: { common: enCommon },
      ar: { common: arCommon },
    },
    lng: language,
    fallbackLng: "en",
    ns: "common",
    defaultNS: "common",
    interpolation: { escapeValue: false },
  });
}

describe("currency localization catalogue", () => {
  beforeAll(async () => {
    await initI18n("en");
  });

  afterEach(async () => {
    await i18next.changeLanguage("en");
  });

  it("covers every supported currency code in both languages with no extra keys", () => {
    const expected = [...SUPPORTED_CODES].sort();

    expect(Object.keys(EN_CURRENCY_NAMES).sort()).toEqual(expected);
    expect(Object.keys(AR_CURRENCY_NAMES).sort()).toEqual(expected);
  });

  it("keeps the English catalogue aligned with the canonical currency metadata", () => {
    for (const currency of SUPPORTED_CURRENCIES) {
      expect(EN_CURRENCY_NAMES[currency.code]).toBe(currency.name);
    }
  });

  it("leaves ISO codes, symbols, and flags for supported currencies unchanged", () => {
    for (const currency of SUPPORTED_CURRENCIES) {
      expect(CURRENCY_INFO_MAP[currency.code]?.code).toBe(currency.code);
      expect(CURRENCY_INFO_MAP[currency.code]?.symbol).toBe(currency.symbol);
      expect(CURRENCY_INFO_MAP[currency.code]?.flag).toBe(currency.flag);
    }
  });

  it.each([
    ["EGP", "Egyptian Pound", "الجنيه المصري"],
    ["USD", "US Dollar", "الدولار الأمريكي"],
    ["SAR", "Saudi Riyal", "الريال السعودي"],
    ["EUR", "Euro", "اليورو"],
    ["JPY", "Japanese Yen", "الين الياباني"],
    ["ZAR", "South African Rand", "الراند الجنوب أفريقي"],
  ])(
    "localizes %s in both languages",
    async (code, expectedEnglish, expectedArabic) => {
      await i18next.changeLanguage("en");
      expect(getCurrencyName(code as CurrencyType)).toBe(expectedEnglish);
      expect(getCurrencyName(code as CurrencyType, "ar")).toBe(expectedArabic);

      await i18next.changeLanguage("ar");
      expect(getCurrencyName(code as CurrencyType)).toBe(expectedArabic);
      expect(getCurrencyName(code as CurrencyType, "en")).toBe(expectedEnglish);
    }
  );

  it("falls back to the ISO code when no localized name exists", () => {
    expect(getCurrencyName("XYZ" as CurrencyType, "ar")).toBe("XYZ");
  });

  it("recomputes names after a locale change instead of caching the previous language", async () => {
    await i18next.changeLanguage("en");
    expect(getCurrencyName("USD")).toBe("US Dollar");

    await i18next.changeLanguage("ar");
    expect(getCurrencyName("USD")).toBe("الدولار الأمريكي");
  });

  describe("search", () => {
    beforeEach(async () => {
      await i18next.changeLanguage("ar");
    });

    it("finds a currency by ISO code", () => {
      expect(currencyMatchesQuery("EGP", "egp")).toBe(true);
    });

    it("finds a currency by its localized name", () => {
      expect(currencyMatchesQuery("EGP", "الجنيه المصري")).toBe(true);
    });

    it("finds a currency by its canonical English name while Arabic is active", () => {
      expect(currencyMatchesQuery("EGP", "  Egyptian Pound  ")).toBe(true);
    });

    it("does not match unrelated currencies", () => {
      expect(currencyMatchesQuery("EGP", "USD")).toBe(false);
    });

    it("includes every currency for an empty or whitespace query", () => {
      expect(currencyMatchesQuery("EGP", "")).toBe(true);
      expect(currencyMatchesQuery("EGP", "   ")).toBe(true);
    });
  });
});
