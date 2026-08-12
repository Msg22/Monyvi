import { Model } from "@nozbe/watermelondb";
import { date, field, readonly } from "@nozbe/watermelondb/decorators";

export class DismissedSmsFingerprint extends Model {
  public static table = "dismissed_sms_fingerprints";

  @field("user_id") public userId!: string;
  @field("sms_fingerprint") public smsFingerprint!: string;
  @readonly @date("created_at") public createdAt!: Date;
  @date("updated_at") public updatedAt!: Date;
}
