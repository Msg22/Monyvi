import { BaseAccount } from "./base/base-account";
import { field } from "@nozbe/watermelondb/decorators";

export class Account extends BaseAccount {
  @field("financial_revision") financialRevision!: string;

  get isBank(): boolean {
    return this.type === "BANK";
  }

  get isCash(): boolean {
    return this.type === "CASH";
  }

  get isDigitalWallet(): boolean {
    return this.type === "DIGITAL_WALLET";
  }
}
