/**
 * BaseAsset - Abstract Base Model for WatermelonDB
 * AUTO-GENERATED - DO NOT EDIT MANUALLY
 * Run 'npm run db:sync' to regenerate
 *
 * Extend this class in ../Asset.ts to add custom methods
 */

import { Model, Query } from "@nozbe/watermelondb";
import {
  children,
  date,
  field,
  readonly,
} from "@nozbe/watermelondb/decorators";
import type { Associations } from "@nozbe/watermelondb/Model";
import type { CurrencyType, AssetType } from "../../types";

export abstract class BaseAsset extends Model {
  static table = "assets";
  static associations: Associations = {
    asset_metals: { type: "has_many", foreignKey: "asset_id" },
    transactions: { type: "has_many", foreignKey: "linked_asset_id" },
  };

  @field("acquisition_action_id") acquisitionActionId!: string | null;
  @readonly @date("created_at") createdAt!: Date;
  @field("currency") currency!: CurrencyType;
  @field("deleted") deleted!: boolean;
  @field("is_liquid") isLiquid!: boolean;
  @field("name") name!: string;
  @field("notes") notes?: string;
  @date("purchase_date") purchaseDate!: Date;
  @field("purchase_currency") purchaseCurrency!: string | null;
  @field("purchase_price_decimal") purchasePriceDecimal!: string | null;
  @field("purchase_price") purchasePrice!: number;
  @field("type") type!: AssetType;
  @date("updated_at") updatedAt!: Date;
  @field("user_id") userId!: string;

  @children("asset_metals") assetMetals!: Query<Model>;
  @children("transactions") transactions!: Query<Model>;
}
