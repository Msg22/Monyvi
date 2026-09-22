/**
 * Per-locale fallback contract for currency names.
 *
 * i18next is configured with `fallbackLng: "en"` app-wide. Currency names must
 * NOT use that cross-language fallback: a missing Arabic entry has to resolve
 * to the ISO code, never to the English name. These tests initialize a minimal
 * catalogue where Arabic deliberately omits a code that English provides.
 */

import i18next from "i18next";

import type { CurrencyType } from "@monyvi/db";
import { getCurrencyName } from "@/utils/currency-localization";

describe("currency localization per-locale fallback", () => {
  beforeAll(async () => {
    await i18next.init({
      resources: {
        en: { common: { currency_names: { USD: "US Dollar" } } },
        ar: { common: { currency_names: { EGP: "الجنيه المصري" } } },
      },
      lng: "ar",
      fallbackLng: "en",
      ns: "common",
      defaultNS: "common",
      interpolation: { escapeValue: false },
    });
  });

  it("returns the ISO code when the active locale lacks an entry, even if English has one", () => {
    expect(getCurrencyName("USD")).toBe("USD");
  });

  it("still returns the localized name when the active locale has the entry", () => {
    expect(getCurrencyName("EGP")).toBe("الجنيه المصري");
  });

  it("resolves the English name when English is explicitly requested", () => {
    expect(getCurrencyName("USD" as CurrencyType, "en")).toBe("US Dollar");
  });
});
