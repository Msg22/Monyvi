import i18next from "i18next";

import type { CurrencyType } from "@monyvi/db";
import { formatCurrency, SUPPORTED_CURRENCIES } from "@monyvi/logic";

import arCommon from "@/locales/ar/common.json";
import enCommon from "@/locales/en/common.json";
import {
  formatLocalizedMoneyAmount,
  formatLocalizedMoneyNumber,
  getCurrencyAmountLabel,
} from "@/utils/localized-money-display";

const ALL_CURRENCY_CODES: readonly CurrencyType[] = [
  ...SUPPORTED_CURRENCIES.map((currency) => currency.code),
  "BTC",
];

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

describe("localized money display", () => {
  beforeAll(async () => {
    await initI18n("en");
  });

  afterEach(async () => {
    await i18next.changeLanguage("en");
  });

  it("covers every CurrencyType in both amount-label catalogues", () => {
    const expected = [...ALL_CURRENCY_CODES].sort();

    expect(Object.keys(enCommon.currency_amount_labels).sort()).toEqual(
      expected
    );
    expect(Object.keys(arCommon.currency_amount_labels).sort()).toEqual(
      expected
    );
  });

  it.each(ALL_CURRENCY_CODES)(
    "does not fall back to the ISO code for %s in Arabic",
    (currency) => {
      expect(getCurrencyAmountLabel(currency, "ar")).not.toBe(currency);
    }
  );

  it("formats the reported EGP regression with Arabic-Indic digits and label", () => {
    expect(
      formatLocalizedMoneyAmount({
        amount: 444956,
        currency: "EGP",
        language: "ar",
      })
    ).toBe("٤٤٤٬٩٥٦ جنيه مصري");
  });

  it("keeps BTC display precision and uses the Arabic Bitcoin label", () => {
    expect(
      formatLocalizedMoneyAmount({
        amount: "0.001",
        currency: "BTC",
        language: "ar",
        englishPresentation: "code-suffix",
      })
    ).toBe("٠٫٠٠١٠٠٠٠٠ بيتكوين");
  });

  it.each([
    ["USD", "1234.5", "١٬٢٣٤٫٥٠ دولار أمريكي"],
    ["KWD", "1234.5", "١٬٢٣٤٫٥٠٠ دينار كويتي"],
    ["JPY", "1234", "١٬٢٣٤ ين ياباني"],
  ] as const)(
    "uses currency precision and Arabic separators for %s",
    (currency, amount, expected) => {
      expect(
        formatLocalizedMoneyAmount({
          amount,
          currency,
          language: "ar",
          englishPresentation: "code-suffix",
        })
      ).toBe(expected);
    }
  );

  it("preserves locale bidi literals for negative Arabic values", () => {
    const formatted = formatLocalizedMoneyAmount({
      amount: "-1234.5",
      currency: "EGP",
      language: "ar",
      englishPresentation: "code-suffix",
    });

    expect(formatted).toBe(
      `${new Intl.NumberFormat("ar-EG", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(-1234.5)} جنيه مصري`
    );
    expect(formatted).toContain("\u061c-");
  });

  it("normalizes negative zero", () => {
    expect(
      formatLocalizedMoneyAmount({
        amount: -0,
        currency: "EGP",
        language: "ar",
      })
    ).toBe("٠ جنيه مصري");
  });

  it("preserves exact canonical decimal digits without number coercion", () => {
    expect(
      formatLocalizedMoneyAmount({
        amount: "9007199254740993.10",
        currency: "EGP",
        language: "ar",
        englishPresentation: "code-suffix",
      })
    ).toBe("٩٬٠٠٧٬١٩٩٬٢٥٤٬٧٤٠٬٩٩٣٫١٠ جنيه مصري");
  });

  it("preserves existing English standard currency output", () => {
    expect(
      formatLocalizedMoneyAmount({
        amount: 444956,
        currency: "EGP",
        language: "en",
      })
    ).toBe(formatCurrency({ amount: 444956, currency: "EGP" }));

    expect(
      formatLocalizedMoneyAmount({
        amount: 1234.5,
        currency: "USD",
        language: "en",
      })
    ).toBe(formatCurrency({ amount: 1234.5, currency: "USD" }));
  });

  it("preserves legacy English code-prefix and code-suffix placement", () => {
    expect(
      formatLocalizedMoneyAmount({
        amount: 1234.5,
        currency: "EGP",
        language: "en",
        englishPresentation: "code-prefix",
      })
    ).toBe("EGP 1,234.50");

    expect(
      formatLocalizedMoneyAmount({
        amount: "1234.5",
        currency: "EGP",
        language: "en",
        englishPresentation: "code-suffix",
      })
    ).toBe("1,234.50 EGP");
  });

  it("localizes number-only monetary rate output without adding a label", () => {
    expect(
      formatLocalizedMoneyNumber({
        amount: "49.7",
        currency: "EGP",
        language: "ar",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    ).toBe("٤٩٫٧٠");

    expect(
      formatLocalizedMoneyNumber({
        amount: "49.7",
        currency: "EGP",
        language: "en",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    ).toBe("49.70");
  });

  it("recomputes output after a runtime language change", async () => {
    await i18next.changeLanguage("en");
    const english = formatLocalizedMoneyAmount({
      amount: 444956,
      currency: "EGP",
    });

    await i18next.changeLanguage("ar");
    const arabic = formatLocalizedMoneyAmount({
      amount: 444956,
      currency: "EGP",
    });

    expect(english).toBe(formatCurrency({ amount: 444956, currency: "EGP" }));
    expect(arabic).toBe("٤٤٤٬٩٥٦ جنيه مصري");
  });
});
