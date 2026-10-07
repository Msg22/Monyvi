/**
 * BaseMarketRateObservation - Abstract Base Model for WatermelonDB
 * AUTO-GENERATED - DO NOT EDIT MANUALLY
 * Run 'npm run db:sync' to regenerate
 *
 * Extend this class in ../MarketRateObservation.ts to add custom methods
 */

import { Model, type Relation } from "@nozbe/watermelondb";
import {
  date,
  field,
  readonly,
  relation,
} from "@nozbe/watermelondb/decorators";
import type { Associations } from "@nozbe/watermelondb/Model";
import type { BaseMarketRate } from "./base-market-rate";

export abstract class BaseMarketRateObservation extends Model {
  static table = "market_rate_observations";
  static associations: Associations = {
    market_rates: { type: "belongs_to", key: "batch_id" },
  };

  @field("batch_id") batchId!: string;
  @readonly @date("created_at") createdAt!: Date;
  @field("instrument_code") instrumentCode!: string;
  @field("orientation") orientation!: string;
  @date("provider_observed_at") providerObservedAt?: Date;
  @field("quality") quality!: string;
  @field("source") source?: string;
  @field("unit") unit!: string;
  @field("value_decimal") valueDecimal!: string;

  @relation("market_rates", "batch_id") batch!: Relation<BaseMarketRate>;
}
