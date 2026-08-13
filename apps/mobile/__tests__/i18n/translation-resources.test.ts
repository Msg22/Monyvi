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

  it.each([
    ["en", enOnboarding],
    ["ar", arOnboarding],
  ])(
    "includes every SMS transaction-card label in %s",
    (_language, resource) => {
      const translations: Record<string, unknown> = resource;

      expect(typeof translations.pitch_slide_sms_account).toBe("string");
      expect(typeof translations.pitch_slide_sms_status_just_now).toBe(
        "string"
      );
    }
  );
});
