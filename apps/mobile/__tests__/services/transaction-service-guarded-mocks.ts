import { database } from "@monyvi/db";

import {
  batchDeleteGuardedTransactions,
  convertGuardedTransactionToTransfer,
  deleteGuardedTransaction,
  updateGuardedTransaction,
} from "../../services/transaction-core-writer-production";
import { createGuardedTransaction } from "../../services/transaction-financial-action-production";
import { prepareTransactionCreateWithBalance } from "../../services/transaction-service";
import {
  getCurrentUserDataScope,
  USER_DATA_ACCESS_ERROR_CODES,
} from "../../services/user-data-access";
import { commitPreparedBatch } from "../../services/watermelon-atomic-batch";

interface MockRecord {
  readonly id: string;
  [key: string]: unknown;
  update: jest.Mock;
}

interface MockDatabase {
  readonly batch: jest.Mock;
  readonly get: jest.Mock;
  readonly write: jest.Mock;
}

const mockDatabase = database as unknown as MockDatabase;

function signedAmount(record: MockRecord): number {
  return record.type === "EXPENSE"
    ? -(record.amount as number)
    : (record.amount as number);
}

async function findOwned(table: string, id: string): Promise<MockRecord> {
  const scope = await getCurrentUserDataScope();
  return scope.findOwned(
    mockDatabase.get(table) as never,
    id
  ) as unknown as Promise<MockRecord>;
}

function installCreateMock(): void {
  jest.mocked(createGuardedTransaction).mockReset();
  jest
    .mocked(createGuardedTransaction)
    .mockImplementation(async (data, expectedUserId) => {
      const scope = await getCurrentUserDataScope();
      if (expectedUserId !== undefined && scope.userId !== expectedUserId) {
        throw new Error(USER_DATA_ACCESS_ERROR_CODES.AUTH_SCOPE_CHANGED);
      }
      return mockDatabase.write(async () => {
        const prepared = await prepareTransactionCreateWithBalance(
          data,
          scope,
          expectedUserId
        );
        try {
          await commitPreparedBatch(prepared.operations as never);
          return prepared.transaction;
        } catch (error) {
          prepared.restoreCachedAccount();
          throw error;
        }
      }) as never;
    });
}

function installUpdateMock(): void {
  jest.mocked(updateGuardedTransaction).mockReset();
  jest
    .mocked(updateGuardedTransaction)
    .mockImplementation(async (transactionId, updates) => {
      const transaction = await findOwned("transactions", transactionId);
      const oldAccount = await findOwned(
        "accounts",
        transaction.accountId as string
      );
      const nextAccountId = updates.accountId ?? transaction.accountId;
      const newAccount =
        nextAccountId === transaction.accountId
          ? oldAccount
          : await findOwned("accounts", nextAccountId as string);
      const nextRecord: MockRecord = {
        ...transaction,
        ...updates,
        amount: updates.amount ?? transaction.amount,
        type: updates.type ?? transaction.type,
      };
      oldAccount.balance =
        (oldAccount.balance as number) - signedAmount(transaction);
      newAccount.balance =
        (newAccount.balance as number) + signedAmount(nextRecord);
      await transaction.update((record: Record<string, unknown>) =>
        Object.assign(record, updates)
      );
    });
}

function installDeleteAndConvertMocks(): void {
  jest.mocked(deleteGuardedTransaction).mockReset();
  jest
    .mocked(deleteGuardedTransaction)
    .mockImplementation(async (transactionId) => {
      const transaction = await findOwned("transactions", transactionId);
      const account = await findOwned(
        "accounts",
        transaction.accountId as string
      );
      account.balance = (account.balance as number) - signedAmount(transaction);
      transaction.deleted = true;
    });
  jest.mocked(convertGuardedTransactionToTransfer).mockReset();
  jest
    .mocked(convertGuardedTransactionToTransfer)
    .mockImplementation(async ({ transactionId, toAccountId }) => {
      const transaction = await findOwned("transactions", transactionId);
      const fromAccount = await findOwned(
        "accounts",
        transaction.accountId as string
      );
      const toAccount = await findOwned("accounts", toAccountId);
      fromAccount.balance =
        (fromAccount.balance as number) -
        signedAmount(transaction) -
        (transaction.amount as number);
      toAccount.balance =
        (toAccount.balance as number) + (transaction.amount as number);
      transaction.deleted = true;
    });
}

function installBatchMock(missingAccountErrorCode: string): void {
  jest.mocked(batchDeleteGuardedTransactions).mockReset();
  jest
    .mocked(batchDeleteGuardedTransactions)
    .mockImplementation(async (items) => {
      const scope = await getCurrentUserDataScope();
      const accounts = new Map<string, MockRecord>();
      const getAccount = async (id: string): Promise<MockRecord> => {
        const cached = accounts.get(id);
        if (cached) return cached;
        try {
          const found = await findOwned("accounts", id);
          accounts.set(id, found);
          return found;
        } catch {
          throw new Error(missingAccountErrorCode);
        }
      };
      items.forEach(({ record }) => scope.assertOwned(record));
      for (const item of items) {
        const record = item.record as unknown as MockRecord;
        if (item.kind === "transaction") {
          const account = await getAccount(record.accountId as string);
          const effect = record.isExpense
            ? -(record.amount as number)
            : (record.amount as number);
          account.balance = (account.balance as number) - effect;
        } else {
          const from = await getAccount(record.fromAccountId as string);
          const to = await getAccount(record.toAccountId as string);
          from.balance = (from.balance as number) + (record.amount as number);
          to.balance =
            (to.balance as number) -
            ((record.convertedAmount as number | undefined) ??
              (record.amount as number));
        }
        record.deleted = true;
      }
      await mockDatabase.batch(
        items.map(({ record }) => record as unknown as MockRecord)
      );
    });
}

export function installTransactionServiceGuardedMocks(
  missingAccountErrorCode: string
): void {
  installCreateMock();
  installUpdateMock();
  installDeleteAndConvertMocks();
  installBatchMock(missingAccountErrorCode);
}
