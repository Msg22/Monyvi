import arBudgets from "@/locales/ar/budgets.json";
import arOnboarding from "@/locales/ar/onboarding.json";
import enBudgets from "@/locales/en/budgets.json";
import enOnboarding from "@/locales/en/onboarding.json";
import { validateTranslationResources } from "@/i18n/translation-schemas";

const budgetDashboardKeys = [
  "overall_budgets",
  "needs_attention",
  "category_budgets",
  "budget_expired",
  "deleted_category",
  "renew_budget",
  "resume_confirmation_title",
  "resume_confirmation_message",
  "resume_confirmation_confirm",
  "dashboard_load_error",
  "dashboard_action_error",
  "retry",
  "carousel_page_announcement",
] as const;

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
      expect(typeof translations.pitch_slide_sms_status_just_now).toBe("string");
    }
  );

  it.each([
    ["en", enBudgets],
    ["ar", arBudgets],
  ])("includes every dashboard and lifecycle label in %s", (_language, resource) => {
    const translations: Record<string, unknown> = resource;

    for (const key of budgetDashboardKeys) {
      expect(typeof translations[key]).toBe("string");
    }
  });
});
