/**
 * BaseRecurringPayment - Abstract Base Model for WatermelonDB
 * AUTO-GENERATED - DO NOT EDIT MANUALLY
 * Run 'npm run db:sync' to regenerate
 *
 * Extend this class in ../RecurringPayment.ts to add custom methods
 */

import { Model, type Relation, Query } from "@nozbe/watermelondb";
import {
  children,
  date,
  field,
  readonly,
  relation,
} from "@nozbe/watermelondb/decorators";
import type { Associations } from "@nozbe/watermelondb/Model";
import type {
  RecurringAction,
  CurrencyType,
  RecurringFrequency,
  RecurringStatus,
  TransactionType,
} from "../../types";
import type { BaseAccount } from "./base-account";
import type { BaseCategory } from "./base-category";
import type { BaseDebt } from "./base-debt";

export abstract class BaseRecurringPayment extends Model {
  static table = "recurring_payments";
  static associations: Associations = {
    accounts: { type: "belongs_to", key: "account_id" },
    categories: { type: "belongs_to", key: "category_id" },
    debts: { type: "belongs_to", key: "linked_debt_id" },
    transactions: { type: "has_many", foreignKey: "linked_recurring_id" },
  };

  @field("account_id") accountId!: string;
  @field("action") action!: RecurringAction;
  @field("amount") amount!: number;
  @field("category_id") categoryId!: string;
  @readonly @date("created_at") createdAt!: Date;
  @field("currency") currency!: CurrencyType;
  @field("deleted") deleted!: boolean;
  @date("end_date") endDate?: Date;
  @field("financial_revision") financialRevision!: string;
  @field("frequency") frequency!: RecurringFrequency;
  @field("frequency_value") frequencyValue?: number;
  @field("linked_debt_id") linkedDebtId?: string;
  @field("name") name!: string;
  @date("next_due_date") nextDueDate!: Date;
  @field("notes") notes?: string;
  @date("start_date") startDate!: Date;
  @field("status") status!: RecurringStatus;
  @field("type") type!: TransactionType;
  @date("updated_at") updatedAt!: Date;
  @field("user_id") userId!: string;

  @relation("accounts", "account_id") account!: Relation<BaseAccount>;
  @relation("categories", "category_id") category!: Relation<BaseCategory>;
  @relation("debts", "linked_debt_id") linkedDebt!: Relation<BaseDebt>;
  @children("transactions") transactions!: Query<Model>;
}
