/**
 * BaseMetalActionEvidence - Abstract Base Model for WatermelonDB
 * AUTO-GENERATED - DO NOT EDIT MANUALLY
 * Run 'npm run db:sync' to regenerate
 *
 * Extend this class in ../MetalActionEvidence.ts to add custom methods
 */

import { Model } from "@nozbe/watermelondb";
import { date, field, readonly } from "@nozbe/watermelondb/decorators";

export abstract class BaseMetalActionEvidence extends Model {
  static table = "metal_action_evidence";

  @field("action_id") actionId!: string;
  @field("canonical_holding_revision") canonicalHoldingRevision?: string;
  @readonly @date("created_at") createdAt!: Date;
  @field("deleted") deleted!: boolean;
  @field("domain_payload_json") domainPayloadJson!: string;
  @field("expected_holding_revision") expectedHoldingRevision?: string;
  @field("holding_id") holdingId!: string;
  @field("kind") kind!: string;
  @date("updated_at") updatedAt!: Date;
  @field("user_id") userId!: string;
}
