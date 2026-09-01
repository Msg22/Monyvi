import { Model } from "@nozbe/watermelondb";
import { date, field, readonly } from "@nozbe/watermelondb/decorators";

export class AccountFinancialEffect extends Model {
  static table = "account_financial_effects";

  @field("accepted_account_revision") acceptedAccountRevision!: string;
  @field("account_id") accountId!: string;
  @field("action_id") actionId!: string;
  @field("amount_minor_units") amountMinorUnits!: string;
  @date("compensated_at") compensatedAt!: Date | null;
  @readonly @date("created_at") createdAt!: Date;
  @field("currency") currency!: string;
  @field("deleted") deleted!: boolean;
  @field("domain") domain!: string;
  @field("is_effective") isEffective!: boolean;
  @field("kind") kind!: string;
  @field("reverses_effect_id") reversesEffectId!: string | null;
  @date("updated_at") updatedAt!: Date;
  @field("user_id") userId!: string;
}
