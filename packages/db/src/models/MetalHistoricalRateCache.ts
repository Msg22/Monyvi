import { Model } from "@nozbe/watermelondb";
import { date, field, readonly } from "@nozbe/watermelondb/decorators";

export class MetalHistoricalRateCache extends Model {
  public static table = "metal_historical_rate_cache";

  @field("user_id") public userId!: string;
  @field("provider_key") public providerKey!: string;
  @field("rate_date") public rateDate!: string;
  @field("resolution") public resolution!: string;
  @field("gold_usd_per_troy_ounce_decimal")
  public goldUsdPerTroyOunceDecimal!: string;
  @field("silver_usd_per_troy_ounce_decimal")
  public silverUsdPerTroyOunceDecimal!: string;
  @field("gold_usd_per_pure_gram_decimal")
  public goldUsdPerPureGramDecimal!: string;
  @field("silver_usd_per_pure_gram_decimal")
  public silverUsdPerPureGramDecimal!: string;
  @field("currencies_usd_per_unit_json")
  public currenciesUsdPerUnitJson!: string;
  @field("provider_response_timestamp")
  public providerResponseTimestamp!: string | null;
  @date("fetched_at") public fetchedAt!: Date;
  @field("response_digest") public responseDigest!: string;
  @field("source") public source!: string;
  @field("quality") public quality!: string;
  @field("contract_version") public contractVersion!: number;
  @readonly @date("created_at") public createdAt!: Date;
  @date("updated_at") public updatedAt!: Date;
}
