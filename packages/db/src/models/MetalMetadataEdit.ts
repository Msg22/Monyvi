import { Model } from "@nozbe/watermelondb";
import { date, field, readonly } from "@nozbe/watermelondb/decorators";

/**
 * Durable per-edit local request and eventual server-adjudicated outcome.
 * Registered by the additive Watermelon v31 migration after #355 v30.
 *
 * For server-only edits pulled on a second device localAppliedChangesJson is
 * "{}"; for offline edits it preserves the actual in-writer local deltas.
 */
export class MetalMetadataEdit extends Model {
  static table = "metal_metadata_edit_outcomes";

  @field("user_id") userId!: string;
  @field("holding_id") holdingId!: string;
  @field("action_id") actionId!: string | null;
  @field("payload_hash") payloadHash!: string;
  @field("request_json") requestJson!: string;
  @field("status") status!: "pending" | "applied" | "ignored" | "rejected";
  @field("local_applied_changes_json") localAppliedChangesJson!: string;
  @field("applied_changes_json") appliedChangesJson!: string | null;
  @field("canonical_metadata_json") canonicalMetadataJson!: string | null;
  @date("occurred_at") occurredAt!: Date;
  @readonly @date("created_at") createdAt!: Date;
  @date("updated_at") updatedAt!: Date;
  @field("deleted") deleted!: boolean;
}
