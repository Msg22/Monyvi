import { Account, database, Transaction } from "@monyvi/db";

import {
  productionAccountBalanceCommandService,
  productionFinancialActionHashProvider,
  productionFinancialActionIdProvider,
} from "./account-balance-command-production";
import {
  createTransactionFinancialActionService,
  type GuardedTransactionCreateData,
} from "./transaction-financial-action-service";
import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
} from "./user-data-access";

const productionService = createTransactionFinancialActionService({
  accountsCollection: () => database.get<Account>("accounts"),
  assertExpectedCurrentUser,
  createId: productionFinancialActionIdProvider.createId,
  executeAccountBalanceCommand: productionAccountBalanceCommandService.execute,
  getCurrentUserDataScope,
  hashProvider: productionFinancialActionHashProvider,
  transactionsCollection: () => database.get<Transaction>("transactions"),
});

export async function createGuardedTransaction(
  data: GuardedTransactionCreateData,
  expectedUserId?: string
): Promise<Transaction> {
  return productionService.create(data, expectedUserId);
}
