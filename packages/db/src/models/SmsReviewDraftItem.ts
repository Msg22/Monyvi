import { Model } from "@nozbe/watermelondb";
import { date, field, readonly } from "@nozbe/watermelondb/decorators";

export class SmsReviewDraftItem extends Model {
  public static table = "sms_review_draft_items";

  @field("queue_id") public queueId!: string;
  @field("user_id") public userId!: string;
  @field("sms_fingerprint") public smsFingerprint!: string;
  @field("payload_version") public payloadVersion!: number;
  @field("payload_json") public payloadJson!: string;
  @field("selection_override") public selectionOverride!: boolean | null;
  @field("position") public position!: number;
  @date("parsed_at") public parsedAt!: Date;
  @readonly @date("created_at") public createdAt!: Date;
  @date("updated_at") public updatedAt!: Date;
}
