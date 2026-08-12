import arOnboarding from "@/locales/ar/onboarding.json";
import enOnboarding from "@/locales/en/onboarding.json";
import { validateTranslationResources } from "@/i18n/translation-schemas";

describe("translation resource runtime contract", () => {
  it("accepts the actual onboarding resources for every supported language", () => {
    expect(() =>
      validateTranslationResources({
        en: { onboarding: enOnboarding },
        ar: { onboarding: arOnboarding },
      })
    ).not.toThrow();
  });
});
