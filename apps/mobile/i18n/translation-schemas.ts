/**
 * Zod schemas for runtime validation of translation JSON resources.
 *
 * Mirrors the TypeScript interfaces in `translation-schema.ts`. Run at
 * startup inside `initI18n()` so a missing/renamed key in either an EN or
 * AR JSON file produces a descriptive error before the UI tries to read it.
 *
 * Why Zod (not just TS): JSON files are external assets — TypeScript only
 * checks the import shape via `resolveJsonModule`, which uses inferred types
 * from the JSON's literal structure, not our `TranslationResources` contract.
 * A drift (e.g. removed key in AR) goes silently to fallbackLng at runtime
 * with no error. Zod catches it loudly at startup.
 */

import { z } from "zod";

const pluralKeysAllowAdditional = z
  .object({
    _zero: z.string().optional(),
    _one: z.string(),
    _two: z.string().optional(),
    _few: z.string().optional(),
    _many: z.string().optional(),
    _other: z.string(),
  })
  .partial({ _one: true })
  .passthrough();

/**
 * For plural-bearing keys we don't try to mirror the flattened
 * `<base>_one` / `<base>_few` JSON convention with a Zod object — that would
 * require knowing every base name. Instead the schemas below describe each
 * namespace at the field level and use `pluralStringFields` to enumerate
 * known plural bases. Validation walks the JSON dict and asserts that every
 * declared base has at least `_one` (when language ≠ "en" the requirement
 * widens — see `validateNamespacePlurals`).
 */
export const PluralKeysSchema = pluralKeysAllowAdditional;

/**
 * Generic JSON object schema — namespaces accept any string values.
 * Validation focuses on (a) required scalar keys and (b) declared plural
 * bases having the right CLDR forms for the locale.
 */
const StringDict = z.record(z.string(), z.string());

export const NamespaceSchema = StringDict;

/**
 * Required scalar (non-plural) keys per namespace. Keep this in sync with
 * `translation-schema.ts`. If any of these are missing in either locale,
 * `validateTranslationResources()` throws.
 */
const REQUIRED_SCALAR_KEYS: Record<string, readonly string[]> = {
  "qa-sms-pattern-intake": [
    "development_badge",
    "authorization_title",
    "authorization_description",
    "scope_selected_only",
    "scope_currencies",
    "scope_local_export",
    "authorization_acknowledgement",
    "authorize_action",
    "cancel",
    "step_capture",
    "selection_title",
    "verified_provider",
    "empty_title",
    "empty_description",
    "retry",
    "sanitize_selected",
    "export_title",
    "local_json_file",
    "export_privacy_note",
    "choose_folder_export",
    "back_to_review",
    "inspect_file_note",
    "classify_title",
    "classify_description",
    "currency_not_applicable",
    "currency_not_applicable_help",
    "save_classification",
    "screen_title",
    "step_coverage",
    "coverage_description",
    "coverage_update_title",
    "coverage_candidate_collected",
    "coverage_candidate_collected_help",
    "coverage_unavailable_in_qa_dataset",
    "coverage_unavailable_in_qa_dataset_help",
    "coverage_pending",
    "coverage_pending_help",
    "coverage_save",
    "continue_to_export",
  ],
  common: [
    "save",
    "cancel",
    "retry",
    "error",
    "language_change_error_title",
    "language_change_failed",
    // feature 026 — onboarding guide card
    "onboarding_step_bank_account",
    "onboarding_step_spending_budget",
    "new_badge",
    "setup_guide",
    "all_categories",
    "go",
    "next",
    "dismiss",
  ],
  settings: [
    "title",
    "language",
    "language_change_error_title",
    "language_change_failed",
  ],
  onboarding: [
    // Pitch chrome
    "pitch_skip",
    "pitch_continue",
    "pitch_get_started",
    "pitch_back",
    // Pitch slide 1 — Voice
    // (eyebrow key removed 2026-04-26 per user direction — slides no longer
    //  show the "01 · VOICE" / "02 · SMS" / "03 · LIVE MARKET" pre-title.)
    "pitch_slide_voice_headline",
    "pitch_slide_voice_subhead",
    "pitch_slide_voice_listening",
    "pitch_slide_voice_count",
    "pitch_slide_voice_transcript",
    "pitch_slide_voice_result_coffee_title",
    "pitch_slide_voice_result_coffee_category",
    "pitch_slide_voice_result_clothes_title",
    "pitch_slide_voice_result_clothes_category",
    "pitch_slide_voice_result_borrowed_title",
    "pitch_slide_voice_result_borrowed_category",
    "pitch_slide_voice_review_ready",
    "pitch_slide_voice_result_coffee_accessibility",
    "pitch_slide_voice_result_clothes_accessibility",
    "pitch_slide_voice_result_borrowed_accessibility",
    // Pitch slide 2A — SMS (Android)
    "pitch_slide_sms_headline",
    "pitch_slide_sms_subhead",
    "pitch_slide_sms_bank_label",
    "pitch_slide_sms_bank_body",
    "pitch_slide_sms_detected",
    "pitch_slide_sms_category_groceries",
    "pitch_slide_sms_status_imported",
    // Pitch slide 2B — Offline (iOS)
    "pitch_slide_offline_headline",
    "pitch_slide_offline_subhead",
    "pitch_slide_offline_status_offline",
    "pitch_slide_offline_status_instant",
    "pitch_slide_offline_recently_added",
    "pitch_slide_offline_all_saved",
    "pitch_slide_offline_pending",
    // Pitch slide 3 — Live market
    "pitch_slide_live_market_headline",
    "pitch_slide_live_market_subhead",
    "pitch_slide_live_market_net_worth_label",
    "pitch_slide_live_market_gold_label",
    "pitch_slide_live_market_silver_label",
    "pitch_slide_live_market_usd_label",
    "pitch_slide_live_market_live_caption",
    // Currency step
    "currency_step_title",
    "currency_step_subtitle",
    "currency_step_confirm",
    "currency_step_signout",
    "currency_step_error_generic",
    // Setup guide step labels (voice + SMS only live here; bank/budget live in common)
    "onboarding_step_voice_transaction",
    "onboarding_step_auto_track_bank_sms",
    // First-run tooltips
    "cash_account_tooltip_title",
    "cash_account_tooltip_body",
    "cash_account_tooltip_got_it",
    "mic_button_tooltip_title",
    "mic_button_tooltip_body",
    "mic_button_tooltip_try_it_now",
  ],
  auth: [
    "welcome_title",
    "welcome_headline",
    "welcome_support",
    "signing_in",
    "creating_account",
    "sending_reset",
    "resending_email",
    "continue_with_google",
    "opening_google",
    "private_by_design",
    "privacy",
    "terms",
    "dismiss",
    "welcome_tagline",
    "pill_voice",
    "pill_bank_sms",
    "pill_live_rates",
    "pill_gold_silver",
    "trust_encrypted",
    "trust_private",
  ],
};

/**
 * Plural base keys per namespace — every base must have `_one` and `_other`
 * in EN, and the full CLDR set (one/two/few/many/other; zero is optional)
 * in AR.
 */
const PLURAL_BASES: Record<string, readonly string[]> = {
  "qa-sms-pattern-intake": [
    "selected_count",
    "approved_candidates",
    "reviewed_families",
    "coverage_pending_warning",
  ],
  common: [
    "minutes_ago",
    "hours_ago",
    "days_ago",
    "due_overdue",
    "due_in_days",
  ],
  transactions: [
    "transaction_count",
    "delete_success_message",
    "save_selected_button_count",
    "review_items_count",
    "review_sms_source_summary",
    "review_needs_check_count",
    "review_filters_show_count",
  ],
  accounts: ["account_count"],
  budgets: ["budget_count", "days_remaining"],
  metals: ["holding"],
};

const REQUIRED_AR_PLURAL_FORMS = ["_one", "_two", "_few", "_many", "_other"];
const REQUIRED_EN_PLURAL_FORMS = ["_one", "_other"];

/**
 * Validate a single namespace JSON for one language.
 */
function validateNamespace(
  language: "en" | "ar",
  namespace: string,
  json: unknown
): void {
  const parsed = NamespaceSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `[i18n] ${language}/${namespace}: not a flat string dictionary — ${parsed.error.message}`
    );
  }
  const dict = parsed.data;

  for (const key of REQUIRED_SCALAR_KEYS[namespace] ?? []) {
    if (typeof dict[key] !== "string" || dict[key].length === 0) {
      throw new Error(
        `[i18n] ${language}/${namespace}: missing required key "${key}"`
      );
    }
  }

  const requiredForms =
    language === "ar" ? REQUIRED_AR_PLURAL_FORMS : REQUIRED_EN_PLURAL_FORMS;
  for (const base of PLURAL_BASES[namespace] ?? []) {
    for (const suffix of requiredForms) {
      const k = `${base}${suffix}`;
      if (typeof dict[k] !== "string") {
        throw new Error(
          `[i18n] ${language}/${namespace}: missing plural form "${k}" (required for ${language})`
        );
      }
    }
  }
}

/**
 * Validate the full resources object passed to i18next.init.
 * Throws on the first failure with a descriptive message.
 */
export function validateTranslationResources(resources: {
  en: Record<string, unknown>;
  ar: Record<string, unknown>;
}): void {
  for (const [ns, json] of Object.entries(resources.en)) {
    validateNamespace("en", ns, json);
  }
  for (const [ns, json] of Object.entries(resources.ar)) {
    validateNamespace("ar", ns, json);
  }
}
