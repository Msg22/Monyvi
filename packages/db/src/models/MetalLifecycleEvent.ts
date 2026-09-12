import { Model } from "@nozbe/watermelondb";
import { date, field, readonly } from "@nozbe/watermelondb/decorators";

export class MetalLifecycleEvent extends Model {
  static table = "metal_lifecycle_events";

  @field("action_id") actionId!: string;
  @readonly @date("created_at") createdAt!: Date;
  @field("deleted") deleted!: boolean;
  @field("holding_id") holdingId!: string;
  @field("is_effective") isEffective!: boolean;
  @field("is_history_visible") isHistoryVisible!: boolean;
  @field("kind") kind!: string;
  @date("occurred_at") occurredAt!: Date;
  @field("payload_json") payloadJson!: string;
  @field("predecessor_event_id") predecessorEventId!: string | null;
  @field("reverses_event_id") reversesEventId!: string | null;
  @date("updated_at") updatedAt!: Date;
  @field("user_id") userId!: string;
}
