/**
 * BaseSmsAiNegativeOutcome - Abstract Base Model for WatermelonDB
 * AUTO-GENERATED - DO NOT EDIT MANUALLY
 * Run 'npm run db:sync' to regenerate
 *
 * Extend this class in ../SmsAiNegativeOutcome.ts to add custom methods
 */

import { Model } from "@nozbe/watermelondb";
import { date, field, readonly } from "@nozbe/watermelondb/decorators";

export abstract class BaseSmsAiNegativeOutcome extends Model {
  static table = "sms_ai_negative_outcomes";

  @readonly @date("created_at") createdAt!: Date;
  @field("deleted") deleted!: boolean;
  @field("is_terminal") isTerminal!: boolean;
  @field("last_classified_at") lastClassifiedAt!: string;
  @field("original_received_at") originalReceivedAt!: string;
  @field("sms_fingerprint") smsFingerprint!: string;
  @field("strike_count") strikeCount!: number;
  @field("terminal_at") terminalAt?: string;
  @date("updated_at") updatedAt!: Date;
  @field("user_id") userId!: string;
}
