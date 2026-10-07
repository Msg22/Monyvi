import { database, type Transaction } from "@monyvi/db";
import * as Crypto from "expo-crypto";

import {
  productionAccountBalanceCommandService,
  productionFinancialActionHashProvider,
} from "./account-balance-command-production";
import {
  createAccountCoreWriterService,
  type AccountCoreCreateInput,
  type AccountCoreEditInput,
} from "./account-core-writer-service";
import { createCoreAccountFinancialActionService } from "./core-account-financial-action-service";
import { assertExpectedCurrentUser } from "./user-data-access";

const coreFinancialActionService = createCoreAccountFinancialActionService({
  createEffectId: () => Crypto.randomUUID(),
  executeAccountBalanceCommand: productionAccountBalanceCommandService.execute,
  hashProvider: productionFinancialActionHashProvider,
});

const productionService = createAccountCoreWriterService({
  assertExpectedCurrentUser,
  createActionId: () => Crypto.randomUUID(),
  createTransactionId: () => Crypto.randomUUID(),
  executeCoreFinancialAction: coreFinancialActionService.execute,
  now: () => new Date(),
  transactionsCollection: () => database.get<Transaction>("transactions"),
});

export async function createGuardedAccount(
  input: AccountCoreCreateInput
): Promise<void> {
  await productionService.create(input);
}

export async function editGuardedAccount(
  input: AccountCoreEditInput
): Promise<void> {
  await productionService.edit(input);
}
