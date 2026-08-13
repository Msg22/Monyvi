import i18next, {
  init as initializeI18next,
  use as registerI18nextPlugin,
  type InitOptions,
  type Resource,
} from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";

import { validateTranslationResources } from "./translation-schemas";
import { readIntroLocaleOverride } from "@/services/intro-flag-service";

// Import translation files
import enCommon from "../locales/en/common.json";
import enTransactions from "../locales/en/transactions.json";
import enAccounts from "../locales/en/accounts.json";
import enBudgets from "../locales/en/budgets.json";
import enSettings from "../locales/en/settings.json";
import enOnboarding from "../locales/en/onboarding.json";
import enAuth from "../locales/en/auth.json";
import enMetals from "../locales/en/metals.json";
import enCategories from "../locales/en/categories.json";
import enDrawer from "../locales/en/drawer.json";
import enQaSmsPatternIntake from "../locales/en/qa-sms-pattern-intake.json";

import arCommon from "../locales/ar/common.json";
import arTransactions from "../locales/ar/transactions.json";
import arAccounts from "../locales/ar/accounts.json";
import arBudgets from "../locales/ar/budgets.json";
import arSettings from "../locales/ar/settings.json";
import arOnboarding from "../locales/ar/onboarding.json";
import arAuth from "../locales/ar/auth.json";
import arMetals from "../locales/ar/metals.json";
import arCategories from "../locales/ar/categories.json";
import arDrawer from "../locales/ar/drawer.json";
import arQaSmsPatternIntake from "../locales/ar/qa-sms-pattern-intake.json";

/**
 * Translation resources organized by language and namespace.
 *
 * This structure enables:
 * - Namespace-based translation loading (e.g., useTranslation('transactions'))
 * - Type-safe translation keys via TypeScript module augmentation
 * - Fallback to English for missing keys
 */
const resources: Resource = {
  en: {
    common: enCommon,
    transactions: enTransactions,
    accounts: enAccounts,
    budgets: enBudgets,
    settings: enSettings,
    onboarding: enOnboarding,
    auth: enAuth,
    metals: enMetals,
    categories: enCategories,
    drawer: enDrawer,
    "qa-sms-pattern-intake": enQaSmsPatternIntake,
  },
  ar: {
    common: arCommon,
    transactions: arTransactions,
    accounts: arAccounts,
    budgets: arBudgets,
    settings: arSettings,
    onboarding: arOnboarding,
    auth: arAuth,
    metals: arMetals,
    categories: arCategories,
    drawer: arDrawer,
    "qa-sms-pattern-intake": arQaSmsPatternIntake,
  },
};

/**
 * Detect the initial language for i18next.
 *
 * Priority:
 * 1. Device-scoped override (set by `LanguageSwitcherPill` on any pre-auth
 *    surface) — read via `readIntroLocaleOverride()` so error handling and
 *    the `"en" | "ar"` validation live in a single source of truth.
 * 2. Device locale from `expo-localization`.
 * 3. English fallback.
 *
 * A null override (absent or storage error) transparently falls through to
 * the device locale — the hook / service layer swallows and logs the error.
 */
async function detectInitialLanguage(): Promise<"en" | "ar"> {
  const override = await readIntroLocaleOverride();
  if (override !== null) return override;
  const deviceLanguage = Localization.getLocales()[0]?.languageCode ?? "en";
  return deviceLanguage === "ar" ? "ar" : "en";
}

/**
 * Initialize i18next with configuration and detected language.
 *
 * This must be called before rendering the app. Call this in _layout.tsx
 * before the root component renders.
 */
export async function initI18n(): Promise<void> {
  // Runtime contract check — fail loud on translation drift before i18next
  // silently falls back to English for missing keys.
  validateTranslationResources(
    resources as { en: Record<string, unknown>; ar: Record<string, unknown> }
  );

  const language = await detectInitialLanguage();

  await initializeI18n(language);
}

/**
 * Initialize the bundled English resources after primary startup fails before
 * i18next is ready. This intentionally skips runtime contract validation: the
 * validation failure has already been logged, and fallback must still create a
 * usable i18next instance instead of calling changeLanguage on an uninitialized
 * singleton.
 */
export async function initI18nFallback(): Promise<void> {
  await initializeI18n("en");
}

async function initializeI18n(language: "en" | "ar"): Promise<void> {
  registerI18nextPlugin(initReactI18next);

  const options: InitOptions = {
    resources,
    lng: language,
    fallbackLng: "en",
    compatibilityJSON: "v4",
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    react: {
      useSuspense: false, // Disable suspense (we await initI18n before rendering)
    },
  };

  await initializeI18next(options);
}

/**
 * Export i18next instance for direct access (e.g., language change, event listeners).
 * Most components should use useTranslation() hook instead.
 */
export default i18next;
