import { Model } from "@nozbe/watermelondb";
import { date, field, readonly } from "@nozbe/watermelondb/decorators";

export class MetalRateReference extends Model {
  static table = "metal_rate_references";

  @field("action_id") actionId!: string;
  @date("captured_at") capturedAt!: Date;
  @field("captured_freshness") capturedFreshness!: string;
  @readonly @date("created_at") createdAt!: Date;
  @field("deleted") deleted!: boolean;
  @field("holding_id") holdingId!: string;
  @field("instrument_code") instrumentCode!: string;
  @field("kind") kind!: string;
  @field("orientation") orientation!: string;
  @date("provider_observed_at") providerObservedAt!: Date | null;
  @field("quality") quality!: string;
  @field("role") role!: string;
  @field("source") source!: string | null;
  @field("unit") unit!: string;
  @date("updated_at") updatedAt!: Date;
  @field("user_id") userId!: string;
  @field("value_decimal") valueDecimal!: string;
}
