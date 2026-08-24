import arBudgets from "@/locales/ar/budgets.json";
import arOnboarding from "@/locales/ar/onboarding.json";
import enBudgets from "@/locales/en/budgets.json";
import enOnboarding from "@/locales/en/onboarding.json";
import enTransactions from "@/locales/en/transactions.json";
import { validateTranslationResources } from "@/i18n/translation-schemas";

const budgetDashboardKeys = [
  "filter_active",
  "filter_paused",
  "filter_expired",
  "select_period",
  "select_status",
  "reset_filters",
  "dashboard_result_count_active_other",
  "budget_expired",
  "deleted_category",
  "renew_budget",
  "resume_confirmation_title",
  "resume_confirmation_message",
  "resume_confirmation_confirm",
  "dashboard_load_error",
  "dashboard_action_error",
  "retry",
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
      expect(typeof translations.pitch_slide_sms_status_just_now).toBe(
        "string"
      );
    }
  );

  it.each([
    ["en", enBudgets],
    ["ar", arBudgets],
  ])(
    "includes every dashboard and lifecycle label in %s",
    (_language, resource) => {
      const translations: Record<string, unknown> = resource;

      for (const key of budgetDashboardKeys) {
        expect(typeof translations[key]).toBe("string");
      }
    }
  );

  it("rejects a missing recurring End date or Reactivate label", () => {
    const transactions = { ...enTransactions } as Record<string, unknown>;
    delete transactions.reactivate_after_saving;

    expect(() =>
      validateTranslationResources({
        en: { transactions },
        ar: { transactions: enTransactions },
      })
    ).toThrow('missing required key "reactivate_after_saving"');
  });
});
