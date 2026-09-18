import { Account, database, Transaction, Transfer } from "@monyvi/db";
import * as Crypto from "expo-crypto";

import {
  productionAccountBalanceCommandService,
  productionFinancialActionHashProvider,
} from "./account-balance-command-production";
import { createCoreAccountFinancialActionService } from "./core-account-financial-action-service";
import {
  createTransactionCoreWriterService,
  type TransactionCoreBatchDeleteItem,
  type TransactionCoreConvertInput,
  type TransactionCoreUpdateInput,
} from "./transaction-core-writer-service";
import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
} from "./user-data-access";

const coreFinancialActionService = createCoreAccountFinancialActionService({
  executeAccountBalanceCommand: productionAccountBalanceCommandService.execute,
  hashProvider: productionFinancialActionHashProvider,
});

const productionService = createTransactionCoreWriterService({
  accountsCollection: () => database.get<Account>("accounts"),
  assertExpectedCurrentUser,
  commitMetadataUpdate: async (transaction, updates, userId): Promise<void> => {
    await database.write(async (): Promise<void> => {
      await assertExpectedCurrentUser(userId);
      await transaction.update((record) => {
        if (updates.categoryId !== undefined) {
          record.categoryId = updates.categoryId;
        }
        if (updates.counterparty !== undefined) {
          record.counterparty = updates.counterparty;
        }
        if (updates.date !== undefined) record.date = updates.date;
        if (updates.note !== undefined) record.note = updates.note;
      });
    });
  },
  createActionId: () => Crypto.randomUUID(),
  executeCoreFinancialAction: coreFinancialActionService.execute,
  getCurrentUserDataScope,
  now: () => new Date(),
  transactionsCollection: () => database.get<Transaction>("transactions"),
  transfersCollection: () => database.get<Transfer>("transfers"),
});

export async function updateGuardedTransaction(
  transactionId: string,
  updates: TransactionCoreUpdateInput
): Promise<void> {
  await productionService.update(transactionId, updates);
}

export async function deleteGuardedTransaction(
  transactionId: string
): Promise<void> {
  await productionService.delete(transactionId);
}

export async function convertGuardedTransactionToTransfer(
  input: TransactionCoreConvertInput
): Promise<void> {
  await productionService.convertToTransfer(input);
}

export async function batchDeleteGuardedTransactions(
  items: readonly TransactionCoreBatchDeleteItem[]
): Promise<void> {
  await productionService.batchDelete(items);
}
