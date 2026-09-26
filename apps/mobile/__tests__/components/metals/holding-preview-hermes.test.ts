import i18next from "i18next";
import en from "@/locales/en/common.json";
import ar from "@/locales/ar/common.json";
import { formatRateAge } from "@/components/metals/MetalHoldingLivePreview";

beforeAll(async (): Promise<void> => {
  await i18next.init({
    lng: "en",
    fallbackLng: "en",
    resources: { en: { common: en }, ar: { common: ar } },
  });
});
it("renders elapsed rate age in English and Arabic without Hermes RelativeTimeFormat", () => {
  const descriptor = Object.getOwnPropertyDescriptor(
    Intl,
    "RelativeTimeFormat"
  );
  Object.defineProperty(Intl, "RelativeTimeFormat", {
    configurable: true,
    value: undefined,
  });
  try {
    expect(formatRateAge(120_000, "en")).toBe("2 minutes ago");
    expect(formatRateAge(7_200_000, "en")).toBe("2 hours ago");
    expect(formatRateAge(120_000, "ar")).toBe("منذ دقيقتين");
    expect(formatRateAge(0, "en")).toBe("just now");
  } finally {
    if (descriptor)
      Object.defineProperty(Intl, "RelativeTimeFormat", descriptor);
  }
});
