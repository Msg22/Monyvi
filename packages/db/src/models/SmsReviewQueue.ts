import { Model } from "@nozbe/watermelondb";
import { date, field, readonly } from "@nozbe/watermelondb/decorators";

export class SmsReviewQueue extends Model {
  public static table = "sms_review_queues";

  @field("user_id") public userId!: string;
  @readonly @date("created_at") public createdAt!: Date;
  @date("updated_at") public updatedAt!: Date;
}
