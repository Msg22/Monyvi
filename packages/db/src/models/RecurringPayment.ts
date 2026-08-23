import { BaseRecurringPayment } from "./base/base-recurring-payment";

export class RecurringPayment extends BaseRecurringPayment {
  get isActive(): boolean {
    return this.status === "ACTIVE";
  }

  get isPaused(): boolean {
    return this.status === "PAUSED";
  }

  get isCompleted(): boolean {
    return this.status === "COMPLETED";
  }

  get isExpense(): boolean {
    return this.type === "EXPENSE";
  }

  get isIncome(): boolean {
    return this.type === "INCOME";
  }

  get shouldAutoCreate(): boolean {
    return this.action === "AUTO_CREATE";
  }
}
