/**
 * Translation Schema Contract
 *
 * Defines the expected shape of translation files for type-safe i18n.
 * Each namespace has its own interface. The root TranslationResources
 * interface maps namespace names to their shapes.
 *
 * This file serves as a contract — all JSON translation files must
 * conform to these interfaces.
 */

/** Supported languages */
type SupportedLanguage = "en" | "ar";

/**
 * Plural key suffixes covering full CLDR / i18next v4 categories.
 *
 * Arabic uses all six forms (zero/one/two/few/many/other), English uses only
 * one/other. With `compatibilityJSON: "v4"` enabled, i18next consults
 * `Intl.PluralRules` and looks for these suffixed keys at the JSON level
 * (e.g. `transaction_count_few`). Optional fields here let English JSON files
 * omit categories that don't apply to the language.
 *
 * In JSON, keys are flattened as `<base>_one`, `<base>_few`, etc. — never
 * nested objects.
 */
interface PluralKeys {
  readonly _zero?: string;
  readonly _one: string;
  readonly _two?: string;
  readonly _few?: string;
  readonly _many?: string;
  readonly _other: string;
}

/** Common namespace — shared across all screens */
interface CommonTranslations {
  // Buttons
  readonly save: string;
  readonly cancel: string;
  readonly delete: string;
  readonly edit: string;
  readonly add: string;
  readonly done: string;
  readonly skip: string;
  readonly next: string;
  readonly back: string;
  readonly confirm: string;
  readonly retry: string;
  readonly close: string;

  // Labels
  readonly loading: string;
  readonly error: string;
  readonly success: string;
  readonly empty_state: string;
  readonly search: string;
  readonly no_results: string;

  // Navigation
  readonly home: string;
  readonly accounts: string;
  readonly transactions: string;
  readonly metals: string;
  readonly stats: string;
  readonly settings: string;

  // Errors
  readonly error_generic: string;
  readonly error_network: string;

  // Currency
  readonly currency: string;
  readonly change_currency: string;

  // Dates (relative)
  readonly just_now: string;
  readonly minutes_ago: PluralKeys;
  readonly hours_ago: PluralKeys;
  readonly days_ago: PluralKeys;

  // Greetings
  readonly good_morning: string;
  readonly good_afternoon: string;
  readonly good_evening: string;

  // UI
  readonly open_menu: string;
  readonly notifications: string;
  readonly total_net_worth: string;
  readonly month: string;
  readonly info: string;
  readonly select_language: string;
  readonly select_language_description: string;
  readonly continue: string;
  readonly select: string;
  readonly coming_soon: string;
  readonly charts_subtitle: string;
  readonly all_categories: string;

  // Startup recovery screen (feature 024). Declared here — NOT in
  // SettingsTranslations — because StartupRecoveryScreen + profile-service use
  // `useTranslation("common")` and the keys live in `locales/*/common.json`.
  // Schema namespace must match the JSON namespace; a mismatch would fail
  // the i18n coverage check at build time.
  readonly profile_loading_failed_title: string;
  readonly profile_loading_failed_chip: string;
  readonly profile_loading_failed_description: string;
  readonly startup_loading_failed_title: string;
  readonly startup_loading_failed_chip: string;
  readonly startup_loading_failed_description: string;
  readonly market_rates_unavailable_title: string;
  readonly market_rates_unavailable_chip: string;
  readonly market_rates_unavailable_description: string;
  readonly retry_loading_profile: string;
  readonly retry_startup_loading: string;
  readonly retry_market_rates: string;
  readonly profile_loading_helper_text: string;
  readonly startup_loading_helper_text: string;
  readonly market_rates_unavailable_helper_text: string;
  readonly sign_out: string;
  readonly cash_account_creation_failed: string;
  readonly voice_microphone_permission_error: string;
  readonly voice_recording_start_failed: string;
  readonly voice_settings_open_failed: string;
}

/** Transactions namespace */
interface TransactionsTranslations {
  readonly partial_sms_title: string;
  readonly partial_sms_description: string;
  readonly partial_sms_retry: string;
  readonly partial_sms_retrying: string;
  readonly partial_sms_retry_error: string;
  readonly ai_consent_retry_error: string;
  readonly add_transaction: string;
  readonly edit_transaction: string;
  readonly edit_transfer: string;
  readonly transaction_count: PluralKeys;
  readonly delete_success_message: PluralKeys;
  readonly expense: string;
  readonly income: string;
  readonly transfer: string;
  readonly amount: string;
  readonly description: string;
  readonly category: string;
  readonly date: string;
  readonly account: string;
  readonly from_account: string;
  readonly to_account: string;
  readonly no_transactions: string;
  readonly start_tracking_spending: string;
  readonly confirm_delete: string;

  // Voice input
  readonly voice_prompt: string;
  readonly voice_listening: string;
  readonly voice_processing: string;
  readonly voice_error: string;
  readonly voice_review_title: string;
  readonly voice_what_i_heard: string;
  readonly voice_retry: string;

  // SMS scanning
  readonly sms_review_title: string;
  readonly sms_scan_title: string;
  readonly sms_scan_instructions: string;

  // Transfers
  readonly transfer_from: string;
  readonly transfer_to: string;

  // Update feedback
  readonly update_success: string;
  readonly update_success_message: string;
  readonly update_error: string;
  readonly update_error_message: string;

  // Delete feedback
  readonly delete_success: string;
  readonly delete_failed: string;
  readonly delete_error_message: string;
  readonly delete_transaction_title: string;
  readonly delete_transaction_message: string;
  readonly delete_transfer_title: string;
  readonly delete_transfer_message: string;

  // Form
  readonly edit_template_not_supported: string;
  readonly new_transaction: string;
  readonly save: string;
  readonly save_changes: string;
  readonly select: string;
  readonly select_category: string;
  readonly need_more_accounts: string;
  readonly need_more_accounts_description: string;
  readonly no_accounts_found: string;
  readonly tap_here_to_add_one: string;
  readonly warning_negative_balance: string;
  readonly transaction_created: string;
  readonly transaction_created_message: string;
  readonly transaction_creation_failed: string;
  readonly please_select_destination_account: string;
  readonly please_select_source_account: string;
  readonly please_select_an_account: string;
  readonly add_more_details: string;
  readonly optional_details: string;
  readonly invalid_amount: string;
  readonly accounts_must_be_different: string;
  readonly transaction_not_found: string;
  readonly transfer_not_found: string;

  // Discard / navigation
  readonly discard: string;
  readonly discard_changes_title: string;
  readonly discard_changes_message: string;
  readonly back_to_dashboard: string;
  readonly discard_all: string;
  readonly discard_all_confirm: string;
  readonly discard_voice_title: string;
  readonly discard_voice_message: string;
  readonly keep_reviewing: string;
  readonly no_transactions_to_review: string;

  // Convert to transfer
  readonly converted_to_transfer: string;
  readonly convert_anyway: string;
  readonly convert_to_transfer_error: string;
  readonly convert_error: string;

  // Linked data warnings
  readonly linked_data_warning_title: string;
  readonly linked_data_warning_converting: string;
  readonly linked_data_warning_preserved: string;
  readonly linked_data_asset: string;
  readonly linked_data_debt: string;
  readonly linked_data_recurring: string;

  // Save feedback
  readonly saved: string;
  readonly save_error: string;
  readonly save_partial: string;
  readonly saved_from_sms: string;
  readonly failed_to_save_transactions: string;

  // Recurring payments / bills
  readonly my_bills: string;
  readonly upcoming_expenses: string;
  readonly due_this_month: string;
  readonly next_7_days: string;
  readonly this_month: string;
  readonly overdue: string;
  readonly renews_next: string;
  readonly upcoming: string;
  readonly sort_by: string;
  readonly sort_payments: string;
  readonly sort_payments_description: string;
  readonly highest_amount: string;
  readonly lowest_amount: string;
  readonly name_a_z: string;
  readonly tap_to_add_recurring: string;
  readonly no_status_payments: string;
  readonly new_payment: string;
  readonly new_recurring_payment: string;
  readonly edit_payment: string;
  readonly add_recurring_payment: string;
  readonly payment_details: string;
  readonly payment_schedule: string;
  readonly payment_action: string;
  readonly payment_action_description: string;
  readonly notify_me: string;
  readonly notify_me_description: string;
  readonly auto_create: string;
  readonly auto_create_description: string;
  readonly pause_payment: string;
  readonly pause_payment_message: string;
  readonly resume_payment: string;
  readonly resume_payment_message: string;
  readonly delete_payment: string;
  readonly delete_payment_message: string;
  readonly schedule: string;
  readonly frequency: string;
  readonly linked_account: string;
  readonly name: string;
  readonly name_placeholder: string;
  readonly notes_optional: string;
  readonly add_notes_placeholder: string;
  readonly start_date: string;
  readonly failed_to_create_payment: string;
  readonly failed_to_update_payment: string;
  readonly failed_to_delete_payment: string;
  readonly recurring_payment_not_found: string;
  readonly account_not_found: string;
  readonly recurring_payment_account_unavailable: string;
  readonly recurring_payment_category_unavailable: string;
  readonly cancel: string;
  readonly received_currency: string;
  readonly pay_name: string;
  readonly amount_currency: string;
  readonly deduct_from: string;
  readonly select_account: string;
  readonly original_amount: string;
  readonly due_label: string;
  readonly next_due: string;
  readonly payment_confirmation_text: string;
  readonly payment_for_name: string;
  readonly payment_failed: string;
  readonly payment_failed_message: string;
  readonly balance_warning: string;
}

/** Accounts namespace */
interface AccountsTranslations {
  readonly add_account: string;
  readonly edit_account: string;
  readonly account_count: PluralKeys;
  readonly balance: string;
  readonly account_preview: string;
  readonly account_name: string;
  readonly account_name_placeholder_cash: string;
  readonly account_name_placeholder_bank: string;
  readonly account_name_placeholder_wallet: string;
  readonly account_type: string;
  readonly type_cash: string;
  readonly type_bank: string;
  readonly type_digital_wallet: string;
  readonly filter_all: string;
  readonly default_cash_account_name: string;
  readonly read_only_default_tooltip: string;
  readonly read_only_locked_label: string;
  readonly net_worth: string;
  readonly total_balance: string;
  readonly no_accounts: string;
  readonly initial_balance: string;
  readonly account_number: string;
  readonly bank_name: string;
  readonly sms_sender_names: string;
  readonly sms_sender_custom_names: string;
  readonly provider_reference_bank: string;
  readonly provider_reference_wallet: string;
  readonly sms_sender_help: string;
  readonly sms_sender_known_provider_help: string;
  readonly sms_sender_manual_provider_help: string;
  readonly sms_matching_optional: string;
  readonly sms_matching_help: string;
  readonly provider_details_section: string;
  readonly provider_details_help: string;
  readonly provider_details_info: string;
  readonly provider_details_info_dismiss: string;
  readonly institution_bank_label: string;
  readonly institution_wallet_label: string;
  readonly institution_bank_help: string;
  readonly institution_wallet_help: string;
  readonly institution_dropdown_placeholder: string;
  readonly institution_dropdown_accessibility: string;
  readonly institution_dropdown_close: string;
  readonly institution_bank_dropdown_placeholder: string;
  readonly institution_bank_dropdown_accessibility: string;
  readonly institution_bank_dropdown_close: string;
  readonly institution_wallet_dropdown_placeholder: string;
  readonly institution_wallet_dropdown_accessibility: string;
  readonly institution_wallet_dropdown_close: string;
  readonly institution_search_placeholder: string;
  readonly institution_other: string;
  readonly provider_name: string;
  readonly manual_bank_name: string;
  readonly manual_wallet_name: string;
  readonly provider_name_placeholder_bank: string;
  readonly provider_name_placeholder_wallet: string;
  readonly sender_add_placeholder: string;
  readonly sender_add_accessibility: string;
  readonly sender_add_action: string;
  readonly sender_remove_accessibility: string;
  readonly sender_duplicate_error: string;
  readonly sender_unverified: string;
  readonly add_new_account: string;
  readonly no_accounts_title: string;
  readonly no_accounts_message: string;
  readonly no_accounts_type_title: string;
  readonly no_accounts_type_message: string;
  readonly add_account_hero_title: string;
  readonly add_account_hero_subtitle: string;
  readonly creating: string;
  readonly currency: string;
  readonly account_not_found: string;
  readonly cannot_update_deleted_account: string;
  readonly save_changes: string;
  readonly saving: string;
  readonly danger_zone: string;
  readonly default_account: string;
  readonly default_account_description: string;
  readonly delete_account: string;
  readonly delete_account_warning: string;
  readonly pending_account_type_conflict: string;
  readonly account_type_bank: string;
  readonly account_type_digital_wallet: string;
  readonly account_type_cash: string;
}

/** Settings namespace */
interface SettingsTranslations {
  readonly title: string;
  readonly language: string;
  readonly language_arabic: string;
  readonly language_english: string;
  readonly appearance: string;
  readonly dark_mode: string;
  readonly currency: string;
  readonly preferred_currency: string;
  readonly profile: string;
  readonly notifications: string;
  readonly logout: string;
  readonly sms_sync: string;
  readonly sync_new: string;
  readonly full_rescan: string;
  readonly live_detection: string;
  readonly auto_confirm: string;
  readonly account: string;
  readonly about: string;
  readonly version: string;
  readonly delete_account: string;
  readonly confirm_logout: string;
  readonly logout_failed: string;
  readonly logout_failed_message: string;
  readonly last_synced: string;
  readonly scan_inbox: string;
  readonly grant_sms_permission: string;
  readonly sms_android_only: string;
  readonly no_network_logout: string;
  readonly logout_error: string;
  readonly auto_detect_description: string;
  readonly notification_permission_required: string;
  readonly permission_open_settings: string;
  readonly permission_not_now: string;
  readonly sms_permission_allow: string;
  readonly sms_sync_permission_request_title: string;
  readonly sms_sync_permission_request_message: string;
  readonly sms_sync_permission_blocked_title: string;
  readonly sms_sync_permission_blocked_message: string;
  readonly sms_permission_request_title: string;
  readonly sms_permission_request_message: string;
  readonly sms_permission_blocked_title: string;
  readonly sms_permission_blocked_message: string;
  readonly notification_permission_allow: string;
  readonly notification_permission_request_title: string;
  readonly notification_permission_request_message: string;
  readonly notification_permission_blocked_title: string;
  readonly notification_permission_blocked_message: string;
  readonly auto_confirm_description: string;
  readonly rescan_title: string;
  readonly rescan_message: string;
  readonly rescan_confirm: string;
  // NOTE: profile-loading recovery keys/sign_out/cash_account_creation_failed
  // live in CommonTranslations (where the common.json keys actually live).
  // sync_failed_message and proceed_anyway below are used from settings.json by
  // AppDrawer/settings.tsx.
  readonly sync_failed_message: string;
  readonly proceed_anyway: string;
}

/** Onboarding namespace */
interface OnboardingTranslations {
  readonly select_language: string;
  readonly welcome: string;
  readonly slide_1_title: string;
  readonly slide_1_description: string;
  readonly slide_2_title: string;
  readonly slide_2_description: string;
  readonly slide_3_title: string;
  readonly slide_3_description: string;
  readonly get_started: string;
  readonly select_currency: string;
  readonly create_wallet: string;
  readonly skip: string;

  // Pre-auth pitch slides
  // (eyebrow keys removed 2026-04-26 per user direction — slides no longer
  //  show the "01 · VOICE" / "02 · SMS" / "03 · LIVE MARKET" pre-title.)
  readonly pitch_slide_voice_headline: string;
  readonly pitch_slide_voice_subhead: string;
  readonly pitch_slide_voice_listening: string;
  readonly pitch_slide_voice_transcript: string;
  readonly pitch_slide_voice_status_saved: string;
  readonly pitch_slide_voice_status_just_now: string;
  readonly pitch_slide_voice_category_food: string;
  readonly pitch_slide_voice_account: string;
  readonly pitch_slide_sms_headline: string;
  readonly pitch_slide_sms_subhead: string;
  readonly pitch_slide_sms_bank_label: string;
  readonly pitch_slide_sms_bank_body: string;
  readonly pitch_slide_sms_detected: string;
  readonly pitch_slide_sms_category_groceries: string;
  readonly pitch_slide_sms_status_imported: string;
  readonly pitch_slide_offline_headline: string;
  readonly pitch_slide_offline_subhead: string;
  readonly pitch_slide_offline_status_offline: string;
  readonly pitch_slide_offline_status_instant: string;
  readonly pitch_slide_offline_recently_added: string;
  readonly pitch_slide_offline_all_saved: string;
  readonly pitch_slide_offline_pending: string;
  readonly pitch_slide_live_market_headline: string;
  readonly pitch_slide_live_market_subhead: string;
  readonly pitch_slide_live_market_net_worth_label: string;
  readonly pitch_slide_live_market_gold_label: string;
  readonly pitch_slide_live_market_silver_label: string;
  readonly pitch_slide_live_market_usd_label: string;
  readonly pitch_slide_live_market_live_caption: string;
  readonly pitch_skip: string;
  readonly pitch_continue: string;
  readonly pitch_get_started: string;

  // Currency step
  readonly currency_step_title: string;
  readonly currency_step_subtitle: string;
  readonly currency_step_confirm: string;
  readonly currency_step_signout: string;
  readonly currency_step_error_generic: string;

  // Setup guide steps (feature 026)
  readonly onboarding_step_voice_transaction: string;
  readonly onboarding_step_auto_track_bank_sms: string;

  // First-run tooltips (feature 026)
  readonly cash_account_tooltip_title: string;
  readonly cash_account_tooltip_body: string;
  readonly cash_account_tooltip_got_it: string;
  readonly mic_button_tooltip_title: string;
  readonly mic_button_tooltip_body: string;
  readonly mic_button_tooltip_try_it_now: string;
}

/** Categories namespace — keyed by system_name */
interface CategoriesTranslations {
  // Food & Drinks
  readonly food_drinks: string;
  readonly groceries: string;
  readonly restaurant: string;
  readonly coffee_tea: string;
  readonly snacks: string;
  readonly drinks: string;
  readonly food_other: string;

  // Transportation
  readonly transportation: string;
  readonly public_transport: string;
  readonly private_transport: string;
  readonly transport_other: string;

  // Vehicle
  readonly vehicle: string;
  readonly fuel: string;
  readonly parking: string;
  readonly rental: string;
  readonly license_fees: string;
  readonly vehicle_tax: string;
  readonly traffic_fine: string;
  readonly vehicle_buy: string;
  readonly vehicle_sell: string;
  readonly vehicle_maintenance: string;
  readonly vehicle_other: string;

  // Shopping
  readonly shopping: string;
  readonly clothes: string;
  readonly electronics_appliances: string;
  readonly accessories: string;
  readonly footwear: string;
  readonly bags: string;
  readonly kids_baby: string;
  readonly beauty: string;
  readonly home_garden: string;
  readonly pets: string;
  readonly sports_fitness: string;
  readonly toys_games: string;
  readonly wedding: string;
  readonly detergents: string;
  readonly decorations: string;
  readonly personal_care: string;
  readonly shopping_other: string;

  // Health & Medical
  readonly health_medical: string;
  readonly doctor: string;
  readonly medicine: string;
  readonly surgery: string;
  readonly dental: string;
  readonly health_other: string;

  // Utilities & Bills
  readonly utilities_bills: string;
  readonly electricity: string;
  readonly water: string;
  readonly internet: string;
  readonly phone: string;
  readonly gas: string;
  readonly trash: string;
  readonly online_subscription: string;
  readonly streaming: string;
  readonly taxes: string;
  readonly utilities_other: string;

  // Entertainment
  readonly entertainment: string;
  readonly trips_holidays: string;
  readonly events: string;
  readonly tickets: string;
  readonly entertainment_other: string;

  // Charity
  readonly charity: string;
  readonly donations: string;
  readonly fundraising: string;
  readonly charity_gifts: string;
  readonly charity_other: string;

  // Education
  readonly education: string;
  readonly books: string;
  readonly tuition: string;
  readonly education_fees: string;
  readonly education_other: string;

  // Housing
  readonly housing: string;
  readonly rent: string;
  readonly housing_maintenance: string;
  readonly housing_tax: string;
  readonly housing_buy: string;
  readonly housing_sell: string;
  readonly housing_other: string;

  // Travel
  readonly travel: string;
  readonly vacation: string;
  readonly business_travel: string;
  readonly holiday: string;
  readonly travel_other: string;

  // Income
  readonly income: string;
  readonly salary: string;
  readonly bonus: string;
  readonly commission: string;
  readonly refund: string;
  readonly loan_income: string;
  readonly gift_income: string;
  readonly check: string;
  readonly rental_income: string;
  readonly income_other: string;

  // Debt & Loans
  readonly debt_loans: string;
  readonly lent_money: string;
  readonly borrowed_money: string;
  readonly debt_repayment_paid: string;
  readonly debt_repayment_received: string;
  readonly debt_other: string;

  // Assets & Other
  readonly asset_purchase: string;
  readonly asset_sale: string;
  readonly other: string;
  readonly uncategorized: string;

  // Allow custom categories added by users in future
  readonly [customCategory: string]: string;
}

/** Budgets namespace */
interface BudgetsTranslations {
  readonly create_budget: string;
  readonly edit_budget: string;
  readonly new_budget: string;
  readonly budgets: string;
  readonly budget_detail: string;
  readonly budget_count: PluralKeys;
  readonly budget_name: string;
  readonly budget_amount: string;
  readonly period: string;
  readonly daily: string;
  readonly weekly: string;
  readonly monthly: string;
  readonly quarterly: string;
  readonly yearly: string;
  readonly spent: string;
  readonly remaining: string;
  readonly over_budget: string;
  readonly no_budgets: string;
  readonly budget_alert: string;
  readonly budget_threshold: string;
  readonly categories: string;
  readonly budget_deleted: string;
  readonly budget_deleted_hint: string;
  readonly budget_not_found: string;
  readonly budget_paused: string;
  readonly budget_resumed: string;
  readonly paused: string;
  readonly resumed: string;
  readonly load_budget_error: string;
}

/** Auth namespace */
interface AuthTranslations {
  readonly sign_in: string;
  readonly sign_up: string;
  readonly email: string;
  readonly password: string;
  readonly forgot_password: string;
  readonly forgot_password_hint: string;
  readonly continue_as_guest: string;
  readonly magic_link_sent: string;
  readonly sign_in_title: string;
  readonly sign_in_subtitle: string;
  readonly sign_up_title: string;
  readonly sign_up_subtitle: string;
  readonly email_placeholder: string;
  readonly password_placeholder: string;
  readonly sign_in_button: string;
  readonly sign_up_button: string;
  readonly guest_button: string;
  readonly account_created: string;
  readonly verification_email_sent: string;
  readonly resend_verification_failed: string;
  readonly reset_email_failed: string;

  // Welcome screen
  readonly welcome_title: string;
  readonly welcome_tagline: string;
  readonly pill_voice: string;
  readonly pill_bank_sms: string;
  readonly pill_live_rates: string;
  readonly pill_gold_silver: string;
  readonly trust_encrypted: string;
  readonly trust_private: string;
}

/** Metals namespace */
interface MetalsTranslations {
  readonly live_rates: string;
  readonly gold: string;
  readonly silver: string;
  readonly platinum: string;
  readonly palladium: string;
  readonly purity: string;
  readonly weight: string;
  readonly value: string;
  readonly no_rates: string;
  readonly gram: string;
  readonly kilogram: string;
  readonly ounce: string;
  readonly price_per_gram: string;
  readonly total_value: string;
  readonly holdings: string;
  readonly my_metals: string;
  readonly add_gold: string;
  readonly add_silver: string;
  readonly no_gold_holdings: string;
  readonly no_silver_holdings: string;
  readonly add_new_holding: string;
  readonly name: string;
  readonly name_placeholder: string;
  readonly weight_grams: string;
  readonly weight_placeholder: string;
  readonly purchase_price_currency: string;
  readonly purchase_price_placeholder: string;
  readonly purchase_date: string;
  readonly form_optional: string;
  readonly form_coin: string;
  readonly form_bar: string;
  readonly form_jewelry: string;
  readonly error_save_failed: string;
  readonly add_to_savings: string;
  readonly holding: PluralKeys;
}

/** Root translation resources type */
interface TranslationResources {
  readonly common: CommonTranslations;
  readonly transactions: TransactionsTranslations;
  readonly accounts: AccountsTranslations;
  readonly settings: SettingsTranslations;
  readonly onboarding: OnboardingTranslations;
  readonly categories: CategoriesTranslations;
  readonly budgets: BudgetsTranslations;
  readonly auth: AuthTranslations;
  readonly metals: MetalsTranslations;
  readonly "qa-sms-pattern-intake": QaSmsPatternIntakeTranslations;
}

interface QaSmsPatternIntakeTranslations {
  readonly development_badge: string;
  readonly authorization_title: string;
  readonly authorization_description: string;
  readonly scope_selected_only: string;
  readonly scope_currencies: string;
  readonly scope_local_export: string;
  readonly authorization_acknowledgement: string;
  readonly authorize_action: string;
  readonly cancel: string;
  readonly step_capture: string;
  readonly selection_title: string;
  readonly verified_provider: string;
  readonly empty_title: string;
  readonly empty_description: string;
  readonly retry: string;
  readonly selected_count: PluralKeys;
  readonly message_selection_summary: string;
  readonly select_newest: string;
  readonly search_messages: string;
  readonly clear_search: string;
  readonly search_empty_title: string;
  readonly search_empty_description: string;
  readonly sanitize_selected: string;
  readonly export_title: string;
  readonly approved_candidates: PluralKeys;
  readonly reviewed_families: PluralKeys;
  readonly local_json_file: string;
  readonly export_privacy_note: string;
  readonly choose_folder_export: string;
  readonly back_to_review: string;
  readonly inspect_file_note: string;
  readonly classify_title: string;
  readonly classify_description: string;
  readonly family_card_purchase: string;
  readonly family_atm_withdrawal: string;
  readonly family_incoming_ipn_transfer: string;
  readonly family_outgoing_ipn_transfer: string;
  readonly family_refund_or_reversal: string;
  readonly family_failed_transaction: string;
  readonly family_otp: string;
  readonly family_informational: string;
  readonly family_promotional: string;
  readonly currency_not_applicable: string;
  readonly currency_not_applicable_help: string;
  readonly save_classification: string;
  readonly step_review: string;
  readonly classification_required: string;
  readonly family_label: string;
  readonly currency_label: string;
  readonly verified_sender: string;
  readonly sender_not_verified: string;
  readonly sanitized_template: string;
  readonly privacy_passed: string;
  readonly privacy_blocked: string;
  readonly finding_raw_numeric_value: string;
  readonly finding_raw_identifier_value: string;
  readonly finding_raw_counterparty_value: string;
  readonly finding_raw_email_value: string;
  readonly finding_raw_phone_value: string;
  readonly finding_raw_date_value: string;
  readonly finding_raw_time_value: string;
  readonly finding_unverified_sender: string;
  readonly finding_unknown_token: string;
  readonly finding_ambiguous_dynamic_value: string;
  readonly finding_unknown_dynamic_value: string;
  readonly finding_classification_required: string;
  readonly finding_expected_outcome_required: string;
  readonly finding_required_placeholder_missing: string;
  readonly edit_placeholders: string;
  readonly correction_title: string;
  readonly correction_description: string;
  readonly local_preview_label: string;
  readonly select_private_value_help: string;
  readonly placeholder_type: string;
  readonly placeholder_meaning: string;
  readonly add_placeholder: string;
  readonly sanitized_template_preview: string;
  readonly pending_changes: PluralKeys;
  readonly apply_changes: PluralKeys;
  readonly remove_pending_change: string;
  readonly correction_overlap: string;
  readonly placeholder_role_transaction_currency: string;
  readonly placeholder_role_transaction_amount: string;
  readonly placeholder_role_available_balance: string;
  readonly placeholder_role_card_last4: string;
  readonly placeholder_role_account_reference: string;
  readonly placeholder_role_source_account_suffix: string;
  readonly placeholder_role_transaction_reference: string;
  readonly placeholder_role_message_code: string;
  readonly placeholder_role_otp_code: string;
  readonly placeholder_role_merchant_name: string;
  readonly placeholder_role_atm_terminal: string;
  readonly placeholder_role_counterparty_person: string;
  readonly placeholder_role_phone_number: string;
  readonly placeholder_role_provider_hotline: string;
  readonly placeholder_role_transaction_date: string;
  readonly placeholder_role_transaction_time: string;
  readonly selection_start: string;
  readonly selection_end: string;
  readonly clear_selection: string;
  readonly revalidate_changes: string;
  readonly approve_candidate: string;
  readonly discard_candidate: string;
  readonly candidate_position: string;
  readonly permission_title: string;
  readonly permission_message: string;
  readonly permission_allow: string;
  readonly permission_settings: string;
  readonly not_now: string;
  readonly screen_title: string;
  readonly internal_use_only: string;
  readonly step_coverage: string;
  readonly coverage_description: string;
  readonly coverage_update_title: string;
  readonly coverage_candidate_collected: string;
  readonly coverage_candidate_collected_help: string;
  readonly coverage_unavailable_in_qa_dataset: string;
  readonly coverage_unavailable_in_qa_dataset_help: string;
  readonly coverage_pending: string;
  readonly coverage_pending_help: string;
  readonly coverage_save: string;
  readonly coverage_pending_warning: PluralKeys;
  readonly continue_to_export: string;
}

export type {
  SupportedLanguage,
  PluralKeys,
  TranslationResources,
  CommonTranslations,
  TransactionsTranslations,
  AccountsTranslations,
  SettingsTranslations,
  OnboardingTranslations,
  CategoriesTranslations,
  BudgetsTranslations,
  AuthTranslations,
  MetalsTranslations,
  QaSmsPatternIntakeTranslations,
};
