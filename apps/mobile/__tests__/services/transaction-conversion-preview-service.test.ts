import { createInstance } from "i18next";
import { formatSelectedSnapshotConversionPreview } from "@/services/transaction-conversion-preview-service";
import { selectMarketRateSnapshot } from "@/services/market-rate-snapshot-read-model-service";
import ar from "@/locales/ar/transactions.json";
import en from "@/locales/en/transactions.json";
import { completeFixtureA } from "../fixtures/market-rate-snapshot";

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
    expect(preview).toContain(new Intl.NumberFormat(language).format(1));
    expect(preview).toContain(language === "ar" ? "بسعر" : "at rate");
    expect(preview).not.toContain("{{");
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
