import type { SupportedLanguage } from "@/i18n/translation-schema";

/**
 * Formats a non-monetary integer using the app's active numeric locale.
 * Intended for counts, limits, quantities and similar presentation values.
 */
export function formatLocalizedCount(
  value: number,
  language: SupportedLanguage
): string {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new RangeError("Localized count must be a non-negative integer");
  }

  return new Intl.NumberFormat(language === "ar" ? "ar-EG" : "en-US", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    useGrouping: true,
  }).format(value);
}
