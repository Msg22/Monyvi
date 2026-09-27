/**
 * BaseAccount - Abstract Base Model for WatermelonDB
 * AUTO-GENERATED - DO NOT EDIT MANUALLY
 * Run 'npm run db:sync' to regenerate
 *
 * Extend this class in ../Account.ts to add custom methods
 */

import { Model, Query } from "@nozbe/watermelondb";
import {
  children,
  date,
  field,
  readonly,
} from "@nozbe/watermelondb/decorators";
import type { Associations } from "@nozbe/watermelondb/Model";
import type { CurrencyType, AccountType } from "../../types";

export abstract class BaseAccount extends Model {
  static table = "accounts";
  static associations: Associations = {
    account_sms_senders: { type: "has_many", foreignKey: "account_id" },
    bank_details: { type: "has_many", foreignKey: "account_id" },
    debts: { type: "has_many", foreignKey: "account_id" },
    recurring_payments: { type: "has_many", foreignKey: "account_id" },
    transactions: { type: "has_many", foreignKey: "account_id" },
    transfers: { type: "has_many", foreignKey: "from_account_id" },
    transfers_to_account: { type: "has_many", foreignKey: "to_account_id" },
  };

  @field("balance") balance!: number;
  @readonly @date("created_at") createdAt!: Date;
  @field("currency") currency!: CurrencyType;
  @field("deleted") deleted!: boolean;
  @field("financial_revision") financialRevision!: string;
  @field("institution_id") institutionId?: string;
  @field("is_default") isDefault!: boolean;
  @field("name") name!: string;
  @field("provider_display_name") providerDisplayName?: string;
  @field("type") type!: AccountType;
  @date("updated_at") updatedAt!: Date;
  @field("user_id") userId!: string;

  @children("account_sms_senders") accountSmsSenders!: Query<Model>;
  @children("bank_details") bankDetails!: Query<Model>;
  @children("debts") debts!: Query<Model>;
  @children("recurring_payments") recurringPayments!: Query<Model>;
  @children("transactions") transactions!: Query<Model>;
  @children("transfers") transfers!: Query<Model>;
  @children("transfers") transfersToAccount!: Query<Model>;
}
