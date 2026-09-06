import { BaseAccount } from "./base/base-account";

export class Account extends BaseAccount {
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
