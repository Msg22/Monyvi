import i18next, { createInstance } from "i18next";

import arCommon from "@/locales/ar/common.json";
import ar from "@/locales/ar/transactions.json";
import enCommon from "@/locales/en/common.json";
import en from "@/locales/en/transactions.json";
import { formatSelectedSnapshotConversionPreview } from "@/services/transaction-conversion-preview-service";
import { selectMarketRateSnapshot } from "@/services/market-rate-snapshot-read-model-service";
import { completeFixtureA } from "../fixtures/market-rate-snapshot";

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

describe("selected snapshot conversion copy", () => {
  it.each(["en", "ar"])("uses %s copy and digits", async (language) => {
    const i18n = createInstance();
    await i18n.init({
      lng: language,
      resources: { en: { transactions: en }, ar: { transactions: ar } },
    });
    const t = i18n.getFixedT(language, "transactions");
    const fixture = completeFixtureA();
    const snapshot = selectMarketRateSnapshot(
      fixture.roots,
      fixture.observations,
      Date.parse("2026-09-09T11:00:00Z")
    );
    expect(snapshot).not.toBeNull();
    const preview = formatSelectedSnapshotConversionPreview(
      100,
      "USD",
      "EGP",
      snapshot,
      t,
      language
    );
    expect(preview).toContain(language === "ar" ? "١" : "1");
    expect(preview).toContain(language === "ar" ? "بسعر" : "at rate");
    expect(preview).not.toContain("{{");

    if (language === "ar") {
      expect(preview).toContain("جنيه مصري");
      expect(preview).toMatch(/[٠-٩]/u);
      expect(preview).not.toMatch(/EGP\s+[٠-٩]/u);
    } else {
      expect(preview).toMatch(/[0-9.,]+ EGP at rate/u);
      expect(preview).toMatch(/1 USD = [0-9.,]+ EGP/u);
    }
    expect(
      formatSelectedSnapshotConversionPreview(
        100,
        "USD",
        "EGP",
        null,
        t,
        language
      )
    ).toBe(
      language === "ar" ? ar.conversion_unavailable : en.conversion_unavailable
    );
  });
});
