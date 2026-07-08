/**
 * BaseProfile - Abstract Base Model for WatermelonDB
 * AUTO-GENERATED - DO NOT EDIT MANUALLY
 * Run 'npm run db:sync' to regenerate
 *
 * Extend this class in ../Profile.ts to add custom methods
 */

import { Model } from "@nozbe/watermelondb";
import { date, field, readonly } from "@nozbe/watermelondb/decorators";
import type {
  CurrencyType,
  PreferredLanguageCode,
  ThemePreference,
} from "../../types";

export abstract class BaseProfile extends Model {
  static table = "profiles";

  @field("ai_processing_consent") aiProcessingConsentRaw?: string;
  @field("avatar_url") avatarUrl?: string;
  @readonly @date("created_at") createdAt!: Date;
  @field("deleted") deleted!: boolean;
  @field("display_name") displayName?: string;
  @field("first_name") firstName?: string;
  @field("last_name") lastName?: string;
  @field("notification_settings") notificationSettingsRaw?: string;
  @field("onboarding_completed") onboardingCompleted!: boolean;
  @field("onboarding_flags") onboardingFlagsRaw?: string;
  @field("preferred_currency") preferredCurrency!: CurrencyType;
  @field("preferred_language") preferredLanguage!: PreferredLanguageCode;
  @field("setup_guide_completed") setupGuideCompleted!: boolean;
  @field("sms_detection_enabled") smsDetectionEnabled!: boolean;
  @field("theme") theme!: ThemePreference;
  @date("updated_at") updatedAt!: Date;
  @field("user_id") userId!: string;
}
