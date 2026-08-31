/**
 * BaseFinancialActionGroup - Abstract Base Model for WatermelonDB
 * AUTO-GENERATED - DO NOT EDIT MANUALLY
 * Run 'npm run db:sync' to regenerate
 *
 * Extend this class in ../FinancialActionGroup.ts to add custom methods
 */

import { Model } from "@nozbe/watermelondb";
import { date, field, readonly } from "@nozbe/watermelondb/decorators";

export abstract class BaseFinancialActionGroup extends Model {
  static table = "financial_action_groups";

  @field("action_id") actionId!: string;
  @readonly @date("created_at") createdAt!: Date;
  @field("deleted") deleted!: boolean;
  @field("domain") domain!: string;
  @field("domain_reference_id") domainReferenceId!: string;
  @field("expected_account_revision") expectedAccountRevision!: string | null;
  @field("kind") kind!: string;
  @field("outcome_json") outcomeJson!: string | null;
  @field("payload_hash") payloadHash!: string;
  @field("payload_json") payloadJson!: string;
  @field("rejection_code") rejectionCode!: string | null;
  @field("server_outcome") serverOutcome!: string | null;
  @field("state") state!: string;
  @date("updated_at") updatedAt!: Date;
  @field("user_id") userId!: string;
}
