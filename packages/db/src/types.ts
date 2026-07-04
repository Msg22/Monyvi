/**
 * Shared Types for WatermelonDB Models
 * AUTO-GENERATED - DO NOT EDIT MANUALLY
 * Run 'npm run db:sync' to regenerate
 */

// =============================================================================
// ENUM TYPES (from Supabase)
// =============================================================================

export type AccountType = "CASH" | "BANK" | "DIGITAL_WALLET";
export type AlertFiredLevel = "WARNING" | "DANGER";
export type AssetType = "METAL" | "CRYPTO" | "REAL_ESTATE";
export type BudgetPeriod = "WEEKLY" | "MONTHLY" | "CUSTOM";
export type BudgetStatus = "ACTIVE" | "PAUSED";
export type BudgetType = "CATEGORY" | "GLOBAL";
export type CategoryNature = "WANT" | "NEED" | "MUST";
export type CurrencyType =
  | "EGP"
  | "SAR"
  | "AED"
  | "KWD"
  | "QAR"
  | "BHD"
  | "OMR"
  | "JOD"
  | "IQD"
  | "LYD"
  | "TND"
  | "MAD"
  | "DZD"
  | "USD"
  | "EUR"
  | "GBP"
  | "JPY"
  | "CHF"
  | "CNY"
  | "INR"
  | "KRW"
  | "KPW"
  | "SGD"
  | "HKD"
  | "MYR"
  | "AUD"
  | "NZD"
  | "CAD"
  | "SEK"
  | "NOK"
  | "DKK"
  | "ISK"
  | "TRY"
  | "RUB"
  | "ZAR"
  | "BTC";
export type DebtStatus =
  | "ACTIVE"
  | "PARTIALLY_PAID"
  | "SETTLED"
  | "WRITTEN_OFF";
export type DebtType = "LENT" | "BORROWED";
export type GoldKaratEnum = "24" | "22" | "21" | "18" | "14" | "10";
export type MetalType = "GOLD" | "SILVER" | "PLATINUM" | "PALLADIUM";
export type PreferredLanguageCode = "en" | "ar";
export type RecurringAction = "AUTO_CREATE" | "NOTIFY";
export type RecurringFrequency =
  | "DAILY"
  | "WEEKLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "YEARLY"
  | "CUSTOM";
export type RecurringStatus = "ACTIVE" | "PAUSED" | "COMPLETED";
export type SilverFinenessEnum = "999" | "950" | "925" | "900" | "850" | "800";
export type ThemePreference = "LIGHT" | "DARK" | "SYSTEM";
export type TransactionSource = "MANUAL" | "VOICE" | "SMS" | "RECURRING";
export type TransactionType = "EXPENSE" | "INCOME";

// =============================================================================
// COMPLEX TYPES
// =============================================================================

export interface NotificationSettings {
  sms_transaction_confirmation: boolean;
  recurring_reminders: boolean;
  budget_alerts: boolean;
  low_balance_warnings: boolean;
}

export interface OnboardingFlags {
  readonly cash_account_tooltip_dismissed?: boolean;
  readonly voice_tooltip_seen?: boolean;
}

export interface AiProcessingConsent {
  readonly version: number;
  readonly consentedAt: string;
  readonly revokedAt: string | null;
}
