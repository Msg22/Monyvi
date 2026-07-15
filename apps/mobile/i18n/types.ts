import type {
  TranslationResources,
  CommonTranslations,
  TransactionsTranslations,
  AccountsTranslations,
  BudgetsTranslations,
  SettingsTranslations,
  OnboardingTranslations,
  CategoriesTranslations,
  AuthTranslations,
  MetalsTranslations,
  QaSmsPatternIntakeTranslations,
} from "./translation-schema";

/**
 * TypeScript module augmentation for react-i18next.
 *
 * This enables type-safe translation keys when using the useTranslation() hook.
 *
 * Example usage:
 * ```ts
 * const { t } = useTranslation("common");
 * t("save"); // ✅ Type-safe
 * t("nonexistent_key"); // ❌ TypeScript error
 * ```
 */
declare module "react-i18next" {
  interface CustomTypeOptions {
    /**
     * Default namespace to use when no namespace is specified.
     * Set to 'common' since most strings are shared.
     */
    defaultNS: "common";

    /**
     * Available translation namespaces.
     * Maps to the folder structure in locales/ directory.
     */
    resources: TranslationResources;

    /**
     * Type-safe return type for the t() function when using namespaces.
     *
     * This allows TypeScript to validate translation keys at compile time:
     * ```ts
     * const { t } = useTranslation("transactions");
     * t("add_transaction"); // ✅ Valid
     * t("invalid_key"); // ❌ TypeScript error
     * ```
     */
    returnNull: false;
    returnEmptyString: false;
    keySeparator: ".";
    nsSeparator: ":";
  }
}

export type {
  TranslationResources,
  CommonTranslations,
  TransactionsTranslations,
  AccountsTranslations,
  BudgetsTranslations,
  SettingsTranslations,
  OnboardingTranslations,
  CategoriesTranslations,
  AuthTranslations,
  MetalsTranslations,
  QaSmsPatternIntakeTranslations,
};
