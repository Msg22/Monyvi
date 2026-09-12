import { Model } from "@nozbe/watermelondb";
import { date, field, readonly } from "@nozbe/watermelondb/decorators";

export class MetalHoldingState extends Model {
  static table = "metal_holding_states";

  @readonly @date("created_at") createdAt!: Date;
  @field("deleted") deleted!: boolean;
  @field("effective_action_id") effectiveActionId!: string | null;
  @field("effective_event_id") effectiveEventId!: string | null;
  @field("financial_revision") financialRevision!: string;
  @field("holding_id") holdingId!: string;
  @field("is_visible") isVisible!: boolean;
  @field("name_written_at") nameWrittenAt!: number | null;
  @field("name_writer_id") nameWriterId!: string | null;
  @field("notes_written_at") notesWrittenAt!: number | null;
  @field("notes_writer_id") notesWriterId!: string | null;
  @field("reconciliation_state") reconciliationState!: string;
  @field("status") status!: string;
  @date("updated_at") updatedAt!: Date;
  @field("user_id") userId!: string;
}
