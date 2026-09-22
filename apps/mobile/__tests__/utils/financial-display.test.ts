import {
  formatAccountBalance,
  formatSignedTransactionAmount,
} from "@/utils/financial-display";
import i18next from "i18next";

import arCommon from "@/locales/ar/common.json";
import enCommon from "@/locales/en/common.json";

describe("financial display helpers", () => {
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

  afterEach(async () => {
    await i18next.changeLanguage("en");
  });
  it("formats an account balance without depending on DB model getters", () => {
    expect(
      formatAccountBalance({
        balance: 1234.5,
        currency: "EGP",
      })
    ).toBe("1,234.50 EGP");
  });

  it("does not force maximum fraction digits as a minimum", () => {
    expect(
      formatAccountBalance({
        balance: 1234,
        currency: "EGP",
        maximumFractionDigits: 4,
      })
    ).toBe("1,234 EGP");
  });

  it("formats expense transactions with a negative sign", () => {
    expect(
      formatSignedTransactionAmount({
        amount: 250,
        currency: "EGP",
        type: "EXPENSE",
      })
    ).toBe("-250 EGP");
  });

  it("formats income transactions with a positive sign", () => {
    expect(
      formatSignedTransactionAmount({
        amount: 250,
        currency: "USD",
        type: "INCOME",
      })
    ).toBe("+$250");
  });

  it("keeps signed Arabic amounts bidi-safe", async () => {
    await i18next.changeLanguage("ar");

    expect(
      formatSignedTransactionAmount({
        amount: 250,
        currency: "EGP",
        type: "EXPENSE",
      })
    ).toBe("\u061c-٢٥٠ جنيه مصري");

    expect(
      formatSignedTransactionAmount({
        amount: 250,
        currency: "EGP",
        type: "INCOME",
      })
    ).toBe("\u061c+٢٥٠ جنيه مصري");
  });
});
