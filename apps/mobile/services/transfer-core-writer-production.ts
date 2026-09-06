import { Account, database, Transaction, Transfer } from "@monyvi/db";
import * as Crypto from "expo-crypto";

import {
  productionAccountBalanceCommandService,
  productionFinancialActionHashProvider,
} from "./account-balance-command-production";
import { createCoreAccountFinancialActionService } from "./core-account-financial-action-service";
import {
  createTransferCoreWriterService,
  type TransferCoreConvertInput,
  type TransferCoreCreateInput,
  type TransferCoreUpdateInput,
} from "./transfer-core-writer-service";
import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
} from "./user-data-access";

const coreFinancialActionService = createCoreAccountFinancialActionService({
  executeAccountBalanceCommand: productionAccountBalanceCommandService.execute,
  hashProvider: productionFinancialActionHashProvider,
});

const productionService = createTransferCoreWriterService({
  accountsCollection: () => database.get<Account>("accounts"),
  assertExpectedCurrentUser,
  commitMetadataUpdate: async (transfer, updates, userId): Promise<void> => {
    await database.write(async (): Promise<void> => {
      await assertExpectedCurrentUser(userId);
      await transfer.update((record) => {
        if (updates.date !== undefined) record.date = updates.date;
        if (updates.notes !== undefined) record.notes = updates.notes;
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

export async function createGuardedTransfer(
  input: TransferCoreCreateInput,
  expectedUserId?: string
): Promise<void> {
  await productionService.create(input, expectedUserId);
}

export async function updateGuardedTransfer(
  transferId: string,
  updates: TransferCoreUpdateInput
): Promise<void> {
  await productionService.update(transferId, updates);
}

export async function deleteGuardedTransfer(transferId: string): Promise<void> {
  await productionService.delete(transferId);
}

export async function convertGuardedTransferToTransaction(
  input: TransferCoreConvertInput
): Promise<void> {
  await productionService.convertToTransaction(input);
}
