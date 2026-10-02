/**
 * BaseMarketRate - Abstract Base Model for WatermelonDB
 * AUTO-GENERATED - DO NOT EDIT MANUALLY
 * Run 'npm run db:sync' to regenerate
 *
 * Extend this class in ../MarketRate.ts to add custom methods
 */

import { Model, Query } from "@nozbe/watermelondb";
import {
  children,
  date,
  field,
  readonly,
} from "@nozbe/watermelondb/decorators";
import type { Associations } from "@nozbe/watermelondb/Model";

export abstract class BaseMarketRate extends Model {
  static table = "market_rates";
  static associations: Associations = {
    market_rate_observations: { type: "has_many", foreignKey: "batch_id" },
  };

  @field("aed_usd") aedUsd!: number;
  @field("aud_usd") audUsd!: number;
  @field("bhd_usd") bhdUsd!: number;
  @field("btc_usd") btcUsd!: number;
  @field("cad_usd") cadUsd!: number;
  @field("chf_usd") chfUsd!: number;
  @field("cny_usd") cnyUsd!: number;
  @readonly @date("created_at") createdAt!: Date;
  @field("dkk_usd") dkkUsd!: number;
  @field("dzd_usd") dzdUsd!: number;
  @field("egp_usd") egpUsd!: number;
  @field("eur_usd") eurUsd!: number;
  @field("gbp_usd") gbpUsd!: number;
  @field("gold_usd_per_gram") goldUsdPerGram!: number;
  @field("hkd_usd") hkdUsd!: number;
  @field("inr_usd") inrUsd!: number;
  @field("iqd_usd") iqdUsd!: number;
  @field("isk_usd") iskUsd!: number;
  @field("jod_usd") jodUsd!: number;
  @field("jpy_usd") jpyUsd!: number;
  @field("kpw_usd") kpwUsd!: number;
  @field("krw_usd") krwUsd!: number;
  @field("kwd_usd") kwdUsd!: number;
  @field("lyd_usd") lydUsd!: number;
  @field("mad_usd") madUsd!: number;
  @field("myr_usd") myrUsd!: number;
  @field("nok_usd") nokUsd!: number;
  @field("nzd_usd") nzdUsd!: number;
  @field("omr_usd") omrUsd!: number;
  @field("palladium_usd_per_gram") palladiumUsdPerGram!: number;
  @field("platinum_usd_per_gram") platinumUsdPerGram!: number;
  @field("qar_usd") qarUsd!: number;
  @field("rub_usd") rubUsd!: number;
  @field("sar_usd") sarUsd!: number;
  @field("sek_usd") sekUsd!: number;
  @field("sgd_usd") sgdUsd!: number;
  @field("silver_usd_per_gram") silverUsdPerGram!: number;
  @field("timestamp_currency") timestampCurrency?: string;
  @field("timestamp_metal") timestampMetal?: string;
  @field("tnd_usd") tndUsd!: number;
  @field("try_usd") tryUsd!: number;
  @date("updated_at") updatedAt!: Date;
  @field("zar_usd") zarUsd!: number;

  @children("market_rate_observations") marketRateObservations!: Query<Model>;
}
