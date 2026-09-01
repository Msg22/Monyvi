import { Account, database, RecurringPayment, Transaction } from "@monyvi/db";

import { calculateNextDueDate } from "@/utils/dateHelpers";
import {
  productionAccountBalanceCommandService,
  productionFinancialActionHashProvider,
} from "./account-balance-command-production";
import {
  createRecurringPaymentFinancialActionService,
  type SubmitRecurringPaymentFinancialActionInput,
} from "./recurring-payment-financial-action-service";
import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
} from "./user-data-access";

const productionService = createRecurringPaymentFinancialActionService({
  accountsCollection: () => database.get<Account>("accounts"),
  assertExpectedCurrentUser,
  calculateNextDueDate,
  executeAccountBalanceCommand: productionAccountBalanceCommandService.execute,
  getCurrentUserDataScope,
  hashProvider: productionFinancialActionHashProvider,
  now: () => new Date(),
  recurringPaymentsCollection: () =>
    database.get<RecurringPayment>("recurring_payments"),
  transactionsCollection: () => database.get<Transaction>("transactions"),
});

export async function submitGuardedRecurringPayment(
  input: SubmitRecurringPaymentFinancialActionInput
): Promise<Transaction> {
  return productionService.submit(input);
}
