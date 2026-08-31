import { Model } from "@nozbe/watermelondb";
import { date, field, readonly } from "@nozbe/watermelondb/decorators";

export class MarketRateObservation extends Model {
  static table = "market_rate_observations";

  @field("batch_id") batchId!: string;
  @readonly @date("created_at") createdAt!: Date;
  @field("instrument_code") instrumentCode!: string;
  @field("orientation") orientation!: string;
  @date("provider_observed_at") providerObservedAt!: Date | null;
  @field("quality") quality!: string;
  @field("source") source!: string;
  @field("unit") unit!: string;
  @field("value_decimal") valueDecimal!: string;
}
